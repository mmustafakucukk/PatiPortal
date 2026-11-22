"""
İşlem kayıtları (audit log) okuma ve filtreleme – Bölüm 3.
"""

from datetime import datetime, time, timedelta

from sqlalchemy import and_, or_
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models import AcilIhtiyac, Hayvan, IslemKaydi, KurumGorevlisi, TeslimSaati
from app.services.ortak import sayfala


def islem_kayitlari_listesi(filtre):
    sorgu = db.select(IslemKaydi)

    if filtre.get("baslangic"):
        sorgu = sorgu.where(
            IslemKaydi.tarih >= datetime.combine(filtre["baslangic"], time.min)
        )
    if filtre.get("bitis"):
        bitis_sonu = datetime.combine(filtre["bitis"] + timedelta(days=1), time.min)
        sorgu = sorgu.where(IslemKaydi.tarih < bitis_sonu)
    if filtre.get("kullanici_id"):
        sorgu = sorgu.where(IslemKaydi.kullanici_id == filtre["kullanici_id"])
    if filtre.get("islem_turu"):
        sorgu = sorgu.where(IslemKaydi.islem_turu == filtre["islem_turu"])
    if filtre.get("hedef_tablo"):
        sorgu = sorgu.where(IslemKaydi.hedef_tablo == filtre["hedef_tablo"])
    if filtre.get("kurum_id"):
        kid = filtre["kurum_id"]
        kurum_gorevli_idleri = db.select(KurumGorevlisi.kullanici_id).where(
            KurumGorevlisi.kurum_id == kid
        )
        kurum_hayvan_idleri = db.select(Hayvan.id).where(Hayvan.kurum_id == kid)
        kurum_ihtiyac_idleri = db.select(AcilIhtiyac.id).where(AcilIhtiyac.kurum_id == kid)
        kurum_slot_idleri = db.select(TeslimSaati.id).where(TeslimSaati.kurum_id == kid)

        sorgu = sorgu.where(
            or_(
                and_(IslemKaydi.hedef_tablo == "kurumlar", IslemKaydi.hedef_id == kid),
                and_(
                    IslemKaydi.hedef_tablo == "hayvanlar",
                    IslemKaydi.hedef_id.in_(kurum_hayvan_idleri),
                ),
                and_(
                    IslemKaydi.hedef_tablo == "acil_ihtiyaclar",
                    IslemKaydi.hedef_id.in_(kurum_ihtiyac_idleri),
                ),
                and_(
                    IslemKaydi.hedef_tablo == "teslim_saatleri",
                    IslemKaydi.hedef_id.in_(kurum_slot_idleri),
                ),
                IslemKaydi.kullanici_id.in_(kurum_gorevli_idleri),
            )
        )

    sorgu = sorgu.order_by(IslemKaydi.tarih.desc(), IslemKaydi.id.desc())
    kayitlar, sayfalama = sayfala(
        sorgu,
        filtre["sayfa"],
        filtre["limit"],
        secenekler=(joinedload(IslemKaydi.kullanici),),
    )
    return {
        "kayitlar": [k.to_dict() for k in kayitlar],
        "sayfalama": sayfalama,
    }