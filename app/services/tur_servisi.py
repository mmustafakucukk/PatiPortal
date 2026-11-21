"""
Hayvan türleri, aşı türleri ve aşı gereklilikleri (hangi türe hangi aşı zorunlu).
Bunları sadece admin değiştirir; listeler herkese açıktır (formlardaki açılır listeler için).
"""

from sqlalchemy import func
from sqlalchemy.orm import selectinload

from app.extensions import db
from app.models import AsiGerekliligi, AsiTuru, HayvanTuru
from app.sabitler import Islem
from app.services.ortak import logla
from app.utils.hatalar import ApiHatasi


def _ayni_ad_var_mi(model, ad):
    return db.session.scalar(
        db.select(model.id).where(func.lower(model.ad) == ad.lower())
    ) is not None


# ------------------------------------------------------------------ Hayvan türleri
def hayvan_turleri():
    turler = db.session.scalars(
        db.select(HayvanTuru)
        .options(selectinload(HayvanTuru.asi_gereklilikleri).joinedload(AsiGerekliligi.asi_turu))
        .order_by(HayvanTuru.ad)
    ).all()
    return [t.to_dict() for t in turler]


def hayvan_turu_ekle(veri):
    if _ayni_ad_var_mi(HayvanTuru, veri["ad"]):
        raise ApiHatasi("Bu hayvan türü zaten var.", 409)
    tur = HayvanTuru(ad=veri["ad"])
    db.session.add(tur)
    logla(Islem.TUR_EKLENDI, tur, f"Hayvan türü: {tur.ad}")
    db.session.commit()
    return tur


def zorunlu_asilari_belirle(tur, asi_turu_idleri):
    """Türün zorunlu aşı listesini gönderilen liste ile DEĞİŞTİRİR (eklenen eklenir, çıkarılan silinir)."""
    istenen = set(asi_turu_idleri)
    mevcut_asi_idleri = set(db.session.scalars(db.select(AsiTuru.id).where(AsiTuru.id.in_(istenen))))
    bilinmeyenler = istenen - mevcut_asi_idleri
    if bilinmeyenler:
        raise ApiHatasi.alan("asi_turu_idleri", f"Bu aşı türleri bulunamadı: {sorted(bilinmeyenler)}")

    tur.asi_gereklilikleri = [g for g in tur.asi_gereklilikleri if g.asi_turu_id in istenen]
    eklenecekler = istenen - {g.asi_turu_id for g in tur.asi_gereklilikleri}
    for asi_turu_id in sorted(eklenecekler):
        tur.asi_gereklilikleri.append(AsiGerekliligi(asi_turu_id=asi_turu_id))
    logla(Islem.ZORUNLU_ASILAR_DEGISTI, tur, f"{tur.ad} zorunlu aşıları: {sorted(istenen)}")
    db.session.commit()
    return tur


# ------------------------------------------------------------------ Aşı türleri
def asi_turleri(hayvan_turu_id=None):
    """hayvan_turu_id verilirse her aşı için o türde zorunlu olup olmadığı da döner."""
    turler = db.session.scalars(db.select(AsiTuru).order_by(AsiTuru.ad)).all()
    if hayvan_turu_id is None:
        return [t.to_dict() for t in turler]
    zorunlular = set(db.session.scalars(
        db.select(AsiGerekliligi.asi_turu_id).where(AsiGerekliligi.hayvan_turu_id == hayvan_turu_id)
    ))
    return [{**t.to_dict(), "zorunlu": t.id in zorunlular} for t in turler]


def asi_turu_ekle(veri):
    if _ayni_ad_var_mi(AsiTuru, veri["ad"]):
        raise ApiHatasi("Bu aşı türü zaten var.", 409)
    asi_turu = AsiTuru(ad=veri["ad"], aciklama=veri.get("aciklama"))
    db.session.add(asi_turu)
    logla(Islem.TUR_EKLENDI, asi_turu, f"Aşı türü: {asi_turu.ad}")
    db.session.commit()
    return asi_turu


def hayvan_turunu_yukle(tur_id):
    tur = db.session.get(
        HayvanTuru, tur_id,
        options=[selectinload(HayvanTuru.asi_gereklilikleri).joinedload(AsiGerekliligi.asi_turu)],
    )
    if tur is None:
        raise ApiHatasi("Hayvan türü bulunamadı.", 404)
    return tur
