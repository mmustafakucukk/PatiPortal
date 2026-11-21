"""
Hayvan iş kuralları: listeleme/filtreleme, ekleme, güncelleme, durum değiştirme, silme.
"""

import calendar
from datetime import date

from flask_login import current_user
from sqlalchemy import exists, not_, or_
from sqlalchemy.orm import joinedload, selectinload

from app.extensions import db
from app.models import Hayvan, HayvanTuru, SahiplendirmeBasvurusu, SahiplendirmeKaydi
from app.sabitler import HayvanDurumu, Islem
from app.services import dosyalar
from app.services.asi_servisi import asilari_tam_haritasi, asilari_tam_ifadesi
from app.services.kurum_yetkisi import kayit_icin_kurum_sec, kurum_yetkisi_kontrol
from app.services.ortak import bul_veya_404, logla, sayfala
from app.utils.hatalar import ApiHatasi

# Listede her hayvan için ayrı sorgu atılmasın diye ilişkiler toplu yüklenir.
YUKLEME_SECENEKLERI = (
    joinedload(Hayvan.tur),
    joinedload(Hayvan.kurum),
    selectinload(Hayvan.fotograflar),
)


# ------------------------------------------------------------------ Tarih yardımcıları
def yil_once(tarih, yil):
    try:
        return tarih.replace(year=tarih.year - yil)
    except ValueError:  # 29 Şubat
        return tarih.replace(year=tarih.year - yil, day=28)


def ay_once(tarih, ay):
    toplam_ay = tarih.year * 12 + (tarih.month - 1) - ay
    yil, ay_indeksi = divmod(toplam_ay, 12)
    gun = min(tarih.day, calendar.monthrange(yil, ay_indeksi + 1)[1])
    return date(yil, ay_indeksi + 1, gun)


# ------------------------------------------------------------------ Okuma
def hayvani_yukle(hayvan_id):
    return bul_veya_404(Hayvan, hayvan_id, "Hayvan bulunamadı.", secenekler=list(YUKLEME_SECENEKLERI))


def hayvan_listesi(filtre, gorevli):
    """
    Ziyaretçi ve kayıtlı kullanıcılar sadece barınakta olan hayvanları görür.
    Görevli/admin `durum` filtresiyle istediğini görebilir (vermezse hepsi).
    """
    sorgu = db.select(Hayvan)

    if not gorevli:
        sorgu = sorgu.where(Hayvan.durum == HayvanDurumu.BARINAKTA)
    elif filtre.get("durum"):
        sorgu = sorgu.where(Hayvan.durum == filtre["durum"])

    if filtre.get("tur_id"):
        sorgu = sorgu.where(Hayvan.tur_id == filtre["tur_id"])
    if filtre.get("cinsiyet"):
        sorgu = sorgu.where(Hayvan.cinsiyet == filtre["cinsiyet"])
    if filtre.get("kurum_id"):
        sorgu = sorgu.where(Hayvan.kurum_id == filtre["kurum_id"])
    if filtre.get("kisir") is not None:
        sorgu = sorgu.where(Hayvan.kisirlastirildi == filtre["kisir"])
    if filtre.get("arama"):
        aranan = f"%{filtre['arama']}%"
        sorgu = sorgu.where(or_(Hayvan.ad.ilike(aranan), Hayvan.cins.ilike(aranan)))

    # Yaş filtresi: doğum tarihi bilinmeyen hayvanlar yaş filtresine girmez.
    bugun = date.today()
    if filtre.get("yas_min") is not None:
        sorgu = sorgu.where(Hayvan.dogum_tarihi <= yil_once(bugun, filtre["yas_min"]))
    if filtre.get("yas_max") is not None:
        sorgu = sorgu.where(Hayvan.dogum_tarihi > yil_once(bugun, filtre["yas_max"] + 1))

    if filtre.get("asilar_tam") is not None:
        tam = asilari_tam_ifadesi()
        sorgu = sorgu.where(tam if filtre["asilar_tam"] else not_(tam))

    sorgu = sorgu.order_by(Hayvan.olusturma_tarihi.desc(), Hayvan.id.desc())
    hayvanlar, sayfalama = sayfala(sorgu, filtre["sayfa"], filtre["limit"], YUKLEME_SECENEKLERI)
    return {"kayitlar": hayvanlari_sozluge_cevir(hayvanlar), "sayfalama": sayfalama}


def hayvanlari_sozluge_cevir(hayvanlar, detay=False):
    tamlik = asilari_tam_haritasi([h.id for h in hayvanlar])
    return [h.to_dict(detay=detay, asilari_tam=tamlik.get(h.id, False)) for h in hayvanlar]


def hayvan_detayi(hayvan):
    return hayvanlari_sozluge_cevir([hayvan], detay=True)[0]


# ------------------------------------------------------------------ Ekleme / güncelleme
def _tur_kontrol(tur_id):
    if db.session.get(HayvanTuru, tur_id) is None:
        raise ApiHatasi.alan("tur_id", "Böyle bir hayvan türü yok.")


def hayvan_ekle(veri):
    veri = dict(veri)
    kurum = kayit_icin_kurum_sec(veri.pop("kurum_id", None))
    _tur_kontrol(veri["tur_id"])

    yas_ay = veri.pop("yaklasik_yas_ay", None)
    if yas_ay is not None:
        veri["dogum_tarihi"] = ay_once(date.today(), yas_ay)

    hayvan = Hayvan(**veri, kurum=kurum, ekleyen_id=current_user.id)
    db.session.add(hayvan)
    logla(Islem.HAYVAN_EKLENDI, hayvan, f"{hayvan.ad} eklendi")
    db.session.commit()
    return hayvan


def hayvan_guncelle(hayvan, degisiklikler):
    kurum_yetkisi_kontrol(hayvan.kurum_id)
    degisiklikler = dict(degisiklikler)

    if degisiklikler.get("kurum_id") is None:
        degisiklikler.pop("kurum_id", None)
    else:  # başka kuruma taşıma: hedef kurumda da yetki gerekir
        kayit_icin_kurum_sec(degisiklikler["kurum_id"])
    if "tur_id" in degisiklikler:
        _tur_kontrol(degisiklikler["tur_id"])

    yas_ay = degisiklikler.pop("yaklasik_yas_ay", None)
    if yas_ay is not None:
        degisiklikler["dogum_tarihi"] = ay_once(date.today(), yas_ay)

    yeni_durum = degisiklikler.pop("durum", None)
    for alan, deger in degisiklikler.items():
        setattr(hayvan, alan, deger)
    if yeni_durum is not None:
        hayvan_durumunu_degistir(hayvan, yeni_durum)

    if degisiklikler:
        logla(Islem.HAYVAN_GUNCELLENDI, hayvan, f"Değişen alanlar: {', '.join(degisiklikler)}")
    db.session.commit()
    return hayvan


def hayvan_durumunu_degistir(hayvan, yeni_durum):
    """
    Hayvanın durumunu değiştirir ve loglar. COMMIT ETMEZ.

    Bölüm 3 (başvuru onayı / teslim) de bunu kullanır:
        from app.services.hayvan_servisi import hayvan_durumunu_degistir
        hayvan_durumunu_degistir(hayvan, HayvanDurumu.SAHIPLENDIRILDI)
        ... diğer başvuruları reddet, sahiplendirme kaydı oluştur ...
        db.session.commit()

    Durum zaten aynıysa hiçbir şey yapmaz ve False döner.
    """
    if hayvan.durum == yeni_durum:
        return False
    eski_durum = hayvan.durum
    hayvan.durum = yeni_durum
    logla(Islem.HAYVAN_DURUMU_DEGISTI, hayvan, f"{hayvan.ad}: {eski_durum} → {yeni_durum}")
    return True


def durum_guncelle(hayvan, yeni_durum):
    kurum_yetkisi_kontrol(hayvan.kurum_id)
    hayvan_durumunu_degistir(hayvan, yeni_durum)
    db.session.commit()
    return hayvan


# ------------------------------------------------------------------ Silme
def hayvan_sil(hayvan):
    """
    Başvurusu veya sahiplendirme kaydı olan hayvan silinmez (geçmiş kaybolmasın);
    onun yerine durumu değiştirilmelidir. Diğer hayvanlar fotoğraf ve aşılarıyla silinir.
    """
    kurum_yetkisi_kontrol(hayvan.kurum_id)

    bagli_kayit_var = db.session.scalar(db.select(or_(
        exists().where(SahiplendirmeBasvurusu.hayvan_id == hayvan.id),
        exists().where(SahiplendirmeKaydi.hayvan_id == hayvan.id),
    )))
    if bagli_kayit_var:
        raise ApiHatasi(
            "Bu hayvana ait başvuru veya sahiplendirme kaydı olduğu için silinemez. "
            "Silmek yerine durumunu değiştirin.", 409,
        )

    fotograflar = [f.dosya_adi for f in hayvan.fotograflar]
    belgeler = [a.belge_dosyasi for a in hayvan.asilar if a.belge_dosyasi]

    logla(Islem.HAYVAN_SILINDI, hayvan, f"{hayvan.ad} (#{hayvan.id}) silindi")
    db.session.delete(hayvan)  # fotoğraf ve aşı kayıtları da silinir (cascade)
    db.session.commit()

    # Dosyalar, veritabanı işlemi başarıyla bittikten sonra silinir.
    for kok in fotograflar:
        dosyalar.hayvan_fotografi_dosyalarini_sil(kok)
    for belge in belgeler:
        dosyalar.belge_sil(belge)
