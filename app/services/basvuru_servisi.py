"""
Sahiplendirme başvuruları iş kuralları – Bölüm 3 (API.md bölüm 5).
"""

from flask_login import current_user
from sqlalchemy import exists
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models import (
    Hayvan,
    SahiplendirmeBasvurusu,
    SahiplendirmeKaydi,
    TeslimRandevusu,
    simdi,
)
from app.sabitler import BasvuruDurumu, HayvanDurumu, Islem, RandevuDurumu
from app.services.hayvan_servisi import hayvan_durumunu_degistir
from app.services.kurum_yetkisi import kurum_filtresi, kurum_yetkisi_kontrol
from app.services.ortak import bul_veya_404, logla
from app.utils.hatalar import ApiHatasi

OTOMATIK_RED_NOTU = "Hayvan başka bir aileye sahiplendirildi"

YUKLEME = (
    joinedload(SahiplendirmeBasvurusu.hayvan).joinedload(Hayvan.tur),
    joinedload(SahiplendirmeBasvurusu.hayvan).joinedload(Hayvan.kurum),
    joinedload(SahiplendirmeBasvurusu.hayvan).selectinload(Hayvan.fotograflar),
    joinedload(SahiplendirmeBasvurusu.kullanici),
    joinedload(SahiplendirmeBasvurusu.randevu).joinedload(TeslimRandevusu.teslim_saati),
)


def _randevu_ozeti(randevu):
    if randevu is None:
        return None
    saat = randevu.teslim_saati
    return {
        "id": randevu.id,
        "teslim_saati_id": randevu.teslim_saati_id,
        "durum": randevu.durum,
        "not_metni": randevu.not_metni,
        "olusturma_tarihi": (
            randevu.olusturma_tarihi.isoformat() if randevu.olusturma_tarihi else None
        ),
        "tarih": saat.tarih.isoformat() if saat else None,
        "baslangic_saati": saat.baslangic_saati.strftime("%H:%M") if saat else None,
        "bitis_saati": saat.bitis_saati.strftime("%H:%M") if saat else None,
    }


def basvuru_sozluge_cevir(basvuru, iletisim=False):
    basvuran = {
        "id": basvuru.kullanici.id,
        "ad_soyad": basvuru.kullanici.ad_soyad,
        "email": basvuru.kullanici.email,
    }
    if iletisim:
        basvuran["telefon"] = basvuru.kullanici.telefon

    hayvan_ozet = basvuru.hayvan.ozet()
    hayvan_ozet["kurum"] = basvuru.hayvan.kurum.ozet()

    return {
        "id": basvuru.id,
        "hayvan_id": basvuru.hayvan_id,
        "kullanici_id": basvuru.kullanici_id,
        "ev_tipi": basvuru.ev_tipi,
        "onceki_deneyim": basvuru.onceki_deneyim,
        "aciklama": basvuru.aciklama,
        "durum": basvuru.durum,
        "degerlendirme_notu": basvuru.degerlendirme_notu,
        "basvuru_tarihi": basvuru.basvuru_tarihi.isoformat() if basvuru.basvuru_tarihi else None,
        "degerlendirme_tarihi": (
            basvuru.degerlendirme_tarihi.isoformat() if basvuru.degerlendirme_tarihi else None
        ),
        "hayvan": hayvan_ozet,
        "basvuran": basvuran,
        "randevu": _randevu_ozeti(basvuru.randevu),
    }


def basvuru_olustur(veri):
    hayvan = bul_veya_404(Hayvan, veri["animal_id"], "Hayvan bulunamadı.")

    if hayvan.durum != HayvanDurumu.BARINAKTA:
        raise ApiHatasi(
            "Bu hayvan şu an sahiplendirme başvurusuna uygun değil.",
            409,
        )

    mevcut = db.session.scalar(
        db.select(SahiplendirmeBasvurusu.id).where(
            SahiplendirmeBasvurusu.hayvan_id == hayvan.id,
            SahiplendirmeBasvurusu.kullanici_id == current_user.id,
            SahiplendirmeBasvurusu.durum == BasvuruDurumu.BEKLEMEDE,
        )
    )
    if mevcut is not None:
        raise ApiHatasi(
            "Bu hayvan için zaten beklemede olan bir başvurunuz var.",
            409,
        )

    basvuru = SahiplendirmeBasvurusu(
        hayvan_id=hayvan.id,
        kullanici_id=current_user.id,
        ev_tipi=veri["ev_tipi"].strip(),
        onceki_deneyim=(veri.get("onceki_deneyim") or "").strip() or None,
        aciklama=veri["aciklama"].strip(),
        kvkk_onay_tarihi=simdi(),
        durum=BasvuruDurumu.BEKLEMEDE,
    )
    db.session.add(basvuru)
    logla(
        Islem.BASVURU_OLUSTURULDU,
        basvuru,
        f"Kullanıcı #{current_user.id} → Hayvan #{hayvan.id} ({hayvan.ad}) başvurusu",
    )
    db.session.commit()

    return bul_veya_404(
        SahiplendirmeBasvurusu, basvuru.id, secenekler=list(YUKLEME)
    )


def benim_basvurularim():
    sorgu = (
        db.select(SahiplendirmeBasvurusu)
        .options(*YUKLEME)
        .where(SahiplendirmeBasvurusu.kullanici_id == current_user.id)
        .order_by(SahiplendirmeBasvurusu.basvuru_tarihi.desc(), SahiplendirmeBasvurusu.id.desc())
    )
    return db.session.scalars(sorgu).all()


def basvuru_listesi(filtre):
    sorgu = (
        db.select(SahiplendirmeBasvurusu)
        .join(SahiplendirmeBasvurusu.hayvan)
        .options(*YUKLEME)
    )

    kurum_kosulu = kurum_filtresi(Hayvan.kurum_id)
    if kurum_kosulu is not None:
        sorgu = sorgu.where(kurum_kosulu)

    if filtre.get("durum"):
        sorgu = sorgu.where(SahiplendirmeBasvurusu.durum == BasvuruDurumu(filtre["durum"]))
    if filtre.get("animal_id"):
        sorgu = sorgu.where(SahiplendirmeBasvurusu.hayvan_id == filtre["animal_id"])
    if filtre.get("kurum_id"):
        kurum_yetkisi_kontrol(filtre["kurum_id"])
        sorgu = sorgu.where(Hayvan.kurum_id == filtre["kurum_id"])

    sorgu = sorgu.order_by(
        SahiplendirmeBasvurusu.basvuru_tarihi.desc(), SahiplendirmeBasvurusu.id.desc()
    )
    return db.session.scalars(sorgu).all()


def basvuru_detay(basvuru_id):
    basvuru = bul_veya_404(
        SahiplendirmeBasvurusu,
        basvuru_id,
        "Başvuru bulunamadı.",
        secenekler=list(YUKLEME),
    )
    kurum_yetkisi_kontrol(basvuru.hayvan.kurum_id)
    return basvuru


def basvuru_onayla(basvuru_id):
    basvuru = basvuru_detay(basvuru_id)

    if basvuru.durum != BasvuruDurumu.BEKLEMEDE:
        raise ApiHatasi("Sadece beklemedeki başvurular onaylanabilir.", 409)

    hayvan = basvuru.hayvan
    if hayvan.durum != HayvanDurumu.BARINAKTA:
        raise ApiHatasi("Bu hayvan şu an sahiplendirmeye uygun değil.", 409)

    zaman = simdi()
    basvuru.durum = BasvuruDurumu.ONAYLANDI
    basvuru.degerlendiren_id = current_user.id
    basvuru.degerlendirme_tarihi = zaman

    # Onaylanan hayvan fiziksel teslime kadar 'rezerve' durumuna geçer
    hayvan_durumunu_degistir(hayvan, HayvanDurumu.REZERVE)
    logla(
        Islem.BASVURU_ONAYLANDI,
        basvuru,
        f"Başvuru #{basvuru.id} onaylandı (Hayvan #{hayvan.id} - {hayvan.ad})",
    )

    diger_basvurular = db.session.scalars(
        db.select(SahiplendirmeBasvurusu).where(
            SahiplendirmeBasvurusu.hayvan_id == hayvan.id,
            SahiplendirmeBasvurusu.id != basvuru.id,
            SahiplendirmeBasvurusu.durum == BasvuruDurumu.BEKLEMEDE,
        )
    ).all()

    for diger in diger_basvurular:
        diger.durum = BasvuruDurumu.REDDEDILDI
        diger.degerlendirme_notu = OTOMATIK_RED_NOTU
        diger.degerlendiren_id = current_user.id
        diger.degerlendirme_tarihi = zaman
        logla(
            Islem.BASVURU_REDDEDILDI,
            diger,
            f"Otomatik red: {OTOMATIK_RED_NOTU}",
        )

    db.session.commit()
    return basvuru


def basvuru_reddet(basvuru_id, veri):
    basvuru = basvuru_detay(basvuru_id)

    if basvuru.durum != BasvuruDurumu.BEKLEMEDE:
        raise ApiHatasi("Sadece beklemedeki başvurular reddedilebilir.", 409)

    not_metni = (veri.get("degerlendirme_notu") or "").strip() or None
    basvuru.durum = BasvuruDurumu.REDDEDILDI
    basvuru.degerlendirme_notu = not_metni
    basvuru.degerlendiren_id = current_user.id
    basvuru.degerlendirme_tarihi = simdi()

    logla(
        Islem.BASVURU_REDDEDILDI,
        basvuru,
        f"Başvuru #{basvuru.id} reddedildi" + (f" ({not_metni})" if not_metni else ""),
    )
    db.session.commit()
    return basvuru


def basvuru_iptal(basvuru_id):
    basvuru = bul_veya_404(
        SahiplendirmeBasvurusu,
        basvuru_id,
        "Başvuru bulunamadı.",
        secenekler=list(YUKLEME),
    )

    if basvuru.kullanici_id != current_user.id:
        raise ApiHatasi("Sadece kendi başvurunuzu iptal edebilirsiniz.", 403)

    if basvuru.durum not in (BasvuruDurumu.BEKLEMEDE, BasvuruDurumu.ONAYLANDI):
        raise ApiHatasi("Sadece beklemedeki veya teslim edilmemiş onaylı başvurular iptal edilebilir.", 409)

    if basvuru.durum == BasvuruDurumu.ONAYLANDI:
        teslim_edilmis = db.session.scalar(
            db.select(exists().where(SahiplendirmeKaydi.basvuru_id == basvuru.id))
        )
        if teslim_edilmis:
            raise ApiHatasi("Teslimatı tamamlanmış bir başvuru iptal edilemez.", 409)

        if basvuru.randevu is not None and basvuru.randevu.durum == RandevuDurumu.PLANLANDI:
            basvuru.randevu.durum = RandevuDurumu.IPTAL

        if basvuru.hayvan.durum == HayvanDurumu.REZERVE:
            hayvan_durumunu_degistir(basvuru.hayvan, HayvanDurumu.BARINAKTA)

    basvuru.durum = BasvuruDurumu.IPTAL
    logla(
        Islem.BASVURU_IPTAL_EDILDI,
        basvuru,
        f"Başvuru #{basvuru.id} kullanıcı tarafından iptal edildi",
    )
    db.session.commit()
    return basvuru