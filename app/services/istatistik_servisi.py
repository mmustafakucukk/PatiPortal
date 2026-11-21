"""
Kamu ve görevli paneli istatistikleri – Bölüm 3 (API.md bölüm 7).
"""

from datetime import date, datetime, timedelta

from flask import current_app
from sqlalchemy import and_, exists, func, not_, or_
from sqlalchemy.orm import aliased

from app.extensions import db
from app.models import (
    AcilIhtiyac,
    Hayvan,
    HayvanAsisi,
    Kurum,
    SahiplendirmeBasvurusu,
    SahiplendirmeKaydi,
)
from app.sabitler import BasvuruDurumu, HayvanDurumu, IhtiyacDurumu
from app.services.kurum_yetkisi import kurum_filtresi


def _say(sorgu):
    return int(db.session.scalar(sorgu) or 0)


def kamu_istatistikleri():
    barinaktaki = _say(
        db.select(func.count(Hayvan.id)).where(Hayvan.durum == HayvanDurumu.BARINAKTA)
    )
    sahiplendirilen = _say(
        db.select(func.count(Hayvan.id)).where(
            Hayvan.durum == HayvanDurumu.SAHIPLENDIRILDI
        )
    )
    aktif_kurum = _say(db.select(func.count(Kurum.id)).where(Kurum.aktif.is_(True)))
    return {
        "barinaktaki_hayvan": barinaktaki,
        "sahiplendirilen_hayvan": sahiplendirilen,
        "aktif_kurum": aktif_kurum,
    }


def panel_istatistikleri():
    kurum_kosulu_hayvan = kurum_filtresi(Hayvan.kurum_id)
    kurum_kosulu_ihtiyac = kurum_filtresi(AcilIhtiyac.kurum_id)

    def _hayvan_sayisi(durum=None):
        sorgu = db.select(func.count(Hayvan.id))
        if kurum_kosulu_hayvan is not None:
            sorgu = sorgu.where(kurum_kosulu_hayvan)
        if durum is not None:
            sorgu = sorgu.where(Hayvan.durum == durum)
        return _say(sorgu)

    # Bekleyen başvurular
    bekleyen_sorgu = (
        db.select(func.count(SahiplendirmeBasvurusu.id))
        .join(SahiplendirmeBasvurusu.hayvan)
        .where(SahiplendirmeBasvurusu.durum == BasvuruDurumu.BEKLEMEDE)
    )
    if kurum_kosulu_hayvan is not None:
        bekleyen_sorgu = bekleyen_sorgu.where(kurum_kosulu_hayvan)

    # Açık ihtiyaçlar
    acik_ihtiyac_sorgu = db.select(func.count(AcilIhtiyac.id)).where(
        AcilIhtiyac.durum == IhtiyacDurumu.ACIK
    )
    if kurum_kosulu_ihtiyac is not None:
        acik_ihtiyac_sorgu = acik_ihtiyac_sorgu.where(kurum_kosulu_ihtiyac)

    # Aşı takibi: daha yeni dozu yapılmamış kayıtlar üzerinden yaklaşan ve gecikenler
    bugun = date.today()
    gun = current_app.config.get("ASI_YAKLASIYOR_GUN", 7)
    bitis = bugun + timedelta(days=gun)

    yeni_doz = aliased(HayvanAsisi)
    daha_yeni_doz_var = exists().where(
        yeni_doz.hayvan_id == HayvanAsisi.hayvan_id,
        yeni_doz.asi_turu_id == HayvanAsisi.asi_turu_id,
        or_(
            yeni_doz.uygulama_tarihi > HayvanAsisi.uygulama_tarihi,
            and_(
                yeni_doz.uygulama_tarihi == HayvanAsisi.uygulama_tarihi,
                yeni_doz.id > HayvanAsisi.id,
            ),
        ),
    )

    asi_taban = (
        db.select(func.count(HayvanAsisi.id))
        .join(HayvanAsisi.hayvan)
        .where(
            Hayvan.durum != HayvanDurumu.SAHIPLENDIRILDI,
            HayvanAsisi.sonraki_tarih.is_not(None),
            not_(daha_yeni_doz_var),
        )
    )
    if kurum_kosulu_hayvan is not None:
        asi_taban = asi_taban.where(kurum_kosulu_hayvan)

    bu_hafta_asi = _say(
        asi_taban.where(
            HayvanAsisi.sonraki_tarih >= bugun,
            HayvanAsisi.sonraki_tarih <= bitis,
        )
    )
    geciken_asi = _say(asi_taban.where(HayvanAsisi.sonraki_tarih < bugun))

    # Aylık başvuru ve sahiplendirme (içinde bulunulan takvim ayı)
    ay_basi = datetime(bugun.year, bugun.month, 1)

    aylik_basvuru_sorgu = (
        db.select(func.count(SahiplendirmeBasvurusu.id))
        .join(SahiplendirmeBasvurusu.hayvan)
        .where(SahiplendirmeBasvurusu.basvuru_tarihi >= ay_basi)
    )
    if kurum_kosulu_hayvan is not None:
        aylik_basvuru_sorgu = aylik_basvuru_sorgu.where(kurum_kosulu_hayvan)

    aylik_sahiplendirme_sorgu = (
        db.select(func.count(SahiplendirmeKaydi.id))
        .join(SahiplendirmeKaydi.hayvan)
        .where(SahiplendirmeKaydi.teslim_tarihi >= ay_basi)
    )
    if kurum_kosulu_hayvan is not None:
        aylik_sahiplendirme_sorgu = aylik_sahiplendirme_sorgu.where(kurum_kosulu_hayvan)

    return {
        "toplam_hayvan": _hayvan_sayisi(),
        "barinaktaki_hayvan": _hayvan_sayisi(HayvanDurumu.BARINAKTA),
        "tedavideki_hayvan": _hayvan_sayisi(HayvanDurumu.TEDAVIDE),
        "sahiplendirilen_hayvan": _hayvan_sayisi(HayvanDurumu.SAHIPLENDIRILDI),
        "bekleyen_basvuru": _say(bekleyen_sorgu),
        "acik_ihtiyac": _say(acik_ihtiyac_sorgu),
        "bu_hafta_asisi_gelen": bu_hafta_asi,
        "geciken_asi": geciken_asi,
        "aylik_basvuru": _say(aylik_basvuru_sorgu),
        "aylik_sahiplendirme": _say(aylik_sahiplendirme_sorgu),
    }