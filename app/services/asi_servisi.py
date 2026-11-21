"""
Aşı karnesi iş kuralları.

"Açık doz": sonraki_tarih'i olan ve aynı aşının daha yeni bir dozu henüz girilmemiş kayıt.
  - Yaklaşan aşılar  = açık dozlardan sonraki_tarih'i önümüzdeki N gün içinde olanlar
  - Gecikmiş aşılar  = açık dozlardan sonraki_tarih'i geçmiş olanlar

"Aşıları tam": Hayvanın türü için zorunlu olan aşıların hepsi en az bir kez yapılmış
VE gecikmiş açık dozu yok. (Zorunlu aşılar "Aşı Gereklilikleri" tablosundan gelir.)

Bu kural iki yerde hesaplanır ve ikisi aynı sonucu verir (testler bunu kontrol eder):
  - asilari_tam_ifadesi(): SQL'de (liste filtresi ve kartlardaki rozet için, toplu)
  - asi_karnesi():         Python'da (detay sayfasındaki karne için)
"""

from datetime import date, timedelta

from flask import current_app
from flask_login import current_user
from sqlalchemy import and_, exists, or_
from sqlalchemy.orm import aliased, contains_eager, joinedload, selectinload

from app.extensions import db
from app.models import AsiGerekliligi, AsiTuru, Hayvan, HayvanAsisi, Kurum
from app.sabitler import AsiDurumu, HayvanDurumu, Islem
from app.services import dosyalar
from app.services.kurum_yetkisi import kurum_filtresi, kurum_yetkisi_kontrol
from app.services.ortak import bul_veya_404, logla
from app.utils.hatalar import ApiHatasi


# ------------------------------------------------------------------ SQL ifadeleri
def acik_doz_kosulu(asi=HayvanAsisi):
    """`asi` kaydının sonraki dozu var ve aynı aşının daha yeni bir dozu girilmemiş."""
    daha_yeni = aliased(HayvanAsisi)
    daha_yeni_doz_var = exists().where(
        daha_yeni.hayvan_id == asi.hayvan_id,
        daha_yeni.asi_turu_id == asi.asi_turu_id,
        or_(
            daha_yeni.uygulama_tarihi > asi.uygulama_tarihi,
            and_(daha_yeni.uygulama_tarihi == asi.uygulama_tarihi, daha_yeni.id > asi.id),
        ),
    )
    return and_(asi.sonraki_tarih.is_not(None), ~daha_yeni_doz_var)


def asilari_tam_ifadesi():
    """Hayvan sorgularında kullanılan, hayvanın aşılarının tam olup olmadığını veren SQL koşulu."""
    # Türün zorunlu aşılarını, bu hayvanın yapılmış aşılarıyla LEFT JOIN yap;
    # eşleşmeyen (yapılmamış) bir zorunlu aşı varsa eksik vardır.
    # Not: Hayvan'a sadece bir seviye içeride başvuruluyor; iki seviye iç içe EXISTS'te
    # SQLAlchemy Hayvan'ı dış sorguya bağlamıyor ve sonuç yanlış çıkıyordu.
    yapilan = aliased(HayvanAsisi)
    eksik_zorunlu_asi_var = (
        db.select(AsiGerekliligi.id)
        .join_from(
            AsiGerekliligi, yapilan,
            and_(yapilan.asi_turu_id == AsiGerekliligi.asi_turu_id, yapilan.hayvan_id == Hayvan.id),
            isouter=True,
        )
        .where(AsiGerekliligi.hayvan_turu_id == Hayvan.tur_id, yapilan.id.is_(None))
        .exists()
    )
    geciken = aliased(HayvanAsisi)
    gecikmis_doz_var = exists().where(
        geciken.hayvan_id == Hayvan.id,
        geciken.sonraki_tarih < date.today(),
        acik_doz_kosulu(geciken),
    )
    return and_(~eksik_zorunlu_asi_var, ~gecikmis_doz_var)


def asilari_tam_haritasi(hayvan_idleri):
    """{hayvan_id: True/False} – bir sayfadaki tüm hayvanlar için TEK sorgu."""
    if not hayvan_idleri:
        return {}
    satirlar = db.session.execute(
        db.select(Hayvan.id, asilari_tam_ifadesi().label("tam")).where(Hayvan.id.in_(hayvan_idleri))
    )
    return {satir.id: bool(satir.tam) for satir in satirlar}


# ------------------------------------------------------------------ Durum hesabı
def asi_durumu(asi, acik_doz_mu):
    if not acik_doz_mu or asi.sonraki_tarih is None:
        return AsiDurumu.TAMAMLANDI
    kalan_gun = (asi.sonraki_tarih - date.today()).days
    if kalan_gun < 0:
        return AsiDurumu.GECIKTI
    if kalan_gun <= current_app.config["ASI_YAKLASIYOR_GUN"]:
        return AsiDurumu.YAKLASIYOR
    return AsiDurumu.ZAMANINDA


def zorunlu_asi_turleri(hayvan_turu_id):
    return db.session.scalars(
        db.select(AsiTuru)
        .join(AsiGerekliligi, AsiGerekliligi.asi_turu_id == AsiTuru.id)
        .where(AsiGerekliligi.hayvan_turu_id == hayvan_turu_id)
        .order_by(AsiTuru.ad)
    ).all()


def hayvanin_asilarini_yukle(hayvan_id):
    """Karne için hayvanı aşıları ve ilişkileriyle birlikte tek seferde çeker."""
    return bul_veya_404(
        Hayvan, hayvan_id, "Hayvan bulunamadı.",
        secenekler=[
            selectinload(Hayvan.asilar).joinedload(HayvanAsisi.asi_turu),
            selectinload(Hayvan.asilar).joinedload(HayvanAsisi.uygulayan_kurum),
            selectinload(Hayvan.fotograflar),
            joinedload(Hayvan.tur),
        ],
    )


def asi_karnesi(hayvan):
    asilar = sorted(hayvan.asilar, key=lambda a: (a.uygulama_tarihi, a.id), reverse=True)

    # Her aşı türünün en yeni dozu "açık"tır; eskilerin sonraki dozu zaten yapılmıştır.
    en_yeni_doz = {}
    for asi in asilar:
        en_yeni_doz.setdefault(asi.asi_turu_id, asi.id)

    kayitlar = [
        asi.to_dict(durum=asi_durumu(asi, en_yeni_doz[asi.asi_turu_id] == asi.id)) for asi in asilar
    ]
    eksikler = [t.ozet() for t in zorunlu_asi_turleri(hayvan.tur_id) if t.id not in en_yeni_doz]
    gecikmis_var = any(k["durum"] == AsiDurumu.GECIKTI for k in kayitlar)

    return {
        "hayvan": hayvan.ozet(),
        "asilari_tam": not eksikler and not gecikmis_var,
        "eksik_zorunlu_asilar": eksikler,
        "asilar": kayitlar,
    }


# ------------------------------------------------------------------ Panel listeleri
def _panel_asi_sorgusu():
    """Sahiplendirilmemiş hayvanların açık dozları (görevli sadece kendi kurumlarını görür)."""
    sorgu = (
        db.select(HayvanAsisi)
        .join(HayvanAsisi.hayvan)
        .where(acik_doz_kosulu(), Hayvan.durum != HayvanDurumu.SAHIPLENDIRILDI)
        .options(
            contains_eager(HayvanAsisi.hayvan).selectinload(Hayvan.fotograflar),
            contains_eager(HayvanAsisi.hayvan).joinedload(Hayvan.tur),
            joinedload(HayvanAsisi.asi_turu),
            joinedload(HayvanAsisi.uygulayan_kurum),
        )
        .order_by(HayvanAsisi.sonraki_tarih, Hayvan.ad)
    )
    kosul = kurum_filtresi(Hayvan.kurum_id)
    return sorgu if kosul is None else sorgu.where(kosul)


def _panel_listesi(sorgu):
    return [
        {**asi.to_dict(durum=asi_durumu(asi, acik_doz_mu=True)), "hayvan": asi.hayvan.ozet()}
        for asi in db.session.scalars(sorgu)
    ]


def yaklasan_asilar(gun):
    bugun = date.today()
    sorgu = _panel_asi_sorgusu().where(
        HayvanAsisi.sonraki_tarih.between(bugun, bugun + timedelta(days=gun))
    )
    return _panel_listesi(sorgu)


def gecikmis_asilar():
    sorgu = _panel_asi_sorgusu().where(HayvanAsisi.sonraki_tarih < date.today())
    return _panel_listesi(sorgu)


# ------------------------------------------------------------------ Ekleme / güncelleme / silme
def _iliskileri_kontrol(asi_turu_id=None, uygulayan_kurum_id=None):
    if asi_turu_id is not None and db.session.get(AsiTuru, asi_turu_id) is None:
        raise ApiHatasi.alan("asi_turu_id", "Böyle bir aşı türü yok.")
    if uygulayan_kurum_id is not None and db.session.get(Kurum, uygulayan_kurum_id) is None:
        raise ApiHatasi.alan("uygulayan_kurum_id", "Böyle bir kurum yok.")


def _tarihleri_kontrol(asi):
    if asi.sonraki_tarih is not None and asi.sonraki_tarih <= asi.uygulama_tarihi:
        raise ApiHatasi.alan("sonraki_tarih", "Sonraki doz tarihi, uygulama tarihinden sonra olmalıdır.")


def asi_ekle(hayvan, veri):
    kurum_yetkisi_kontrol(hayvan.kurum_id)
    _iliskileri_kontrol(veri["asi_turu_id"], veri.get("uygulayan_kurum_id"))

    asi = HayvanAsisi(hayvan=hayvan, giren_id=current_user.id, **veri)
    _tarihleri_kontrol(asi)
    db.session.add(asi)
    logla(Islem.ASI_EKLENDI, asi, f"{hayvan.ad}: aşı türü #{veri['asi_turu_id']} eklendi")
    db.session.commit()
    return asi


def asi_guncelle(asi, degisiklikler):
    kurum_yetkisi_kontrol(asi.hayvan.kurum_id)
    _iliskileri_kontrol(degisiklikler.get("asi_turu_id"), degisiklikler.get("uygulayan_kurum_id"))

    for alan, deger in degisiklikler.items():
        setattr(asi, alan, deger)
    _tarihleri_kontrol(asi)
    logla(Islem.ASI_GUNCELLENDI, asi, f"Değişen alanlar: {', '.join(degisiklikler) or '-'}")
    db.session.commit()
    return asi


def asi_sil(asi):
    kurum_yetkisi_kontrol(asi.hayvan.kurum_id)
    belge = asi.belge_dosyasi
    logla(Islem.ASI_SILINDI, asi, f"{asi.hayvan.ad}: {asi.asi_turu.ad} ({asi.uygulama_tarihi}) silindi")
    db.session.delete(asi)
    db.session.commit()
    dosyalar.belge_sil(belge)  # dosya, kayıt silindikten sonra silinir


def belge_yukle(asi, dosya):
    kurum_yetkisi_kontrol(asi.hayvan.kurum_id)
    if dosya is None or not dosya.filename:
        raise ApiHatasi.alan("belge", "Bir dosya seçin.")

    eski_belge = asi.belge_dosyasi
    yeni_belge = dosyalar.belge_kaydet(dosya)
    try:
        asi.belge_dosyasi = yeni_belge
        logla(Islem.ASI_GUNCELLENDI, asi, "Aşı belgesi yüklendi")
        db.session.commit()
    except Exception:
        db.session.rollback()
        dosyalar.belge_sil(yeni_belge)
        raise
    dosyalar.belge_sil(eski_belge)
    return asi
