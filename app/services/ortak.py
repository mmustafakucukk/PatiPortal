"""Servislerin ortak kullandığı küçük yardımcılar."""

import math

from sqlalchemy import func

from app.extensions import db
from app.utils.audit import islem_kaydet
from app.utils.hatalar import ApiHatasi


def bul_veya_404(model, kayit_id, mesaj="Kayıt bulunamadı.", secenekler=None):
    kayit = db.session.get(model, kayit_id, options=secenekler)
    if kayit is None:
        raise ApiHatasi(mesaj, 404)
    return kayit


def sayfala(sorgu, sayfa, limit, secenekler=()):
    """
    Bir select sorgusunu sayfalar.
    Dönüş: (kayıtlar, {"sayfa", "limit", "toplam", "sayfa_sayisi"})
    `secenekler` (selectinload vb.) sadece kayıtları çeken sorguya eklenir, sayım sorgusuna eklenmez.
    """
    toplam = db.session.scalar(
        db.select(func.count()).select_from(sorgu.order_by(None).subquery())
    )
    kayitlar = db.session.scalars(
        sorgu.options(*secenekler).limit(limit).offset((sayfa - 1) * limit)
    ).all()
    bilgi = {
        "sayfa": sayfa,
        "limit": limit,
        "toplam": toplam,
        "sayfa_sayisi": math.ceil(toplam / limit) if toplam else 0,
    }
    return kayitlar, bilgi


def logla(islem, kayit, detay=None):
    """
    audit.islem_kaydet()'i bir model kaydı için çağırır. Yeni eklenmiş kaydın
    id'si henüz yoksa önce flush eder. Commit etmez.
    """
    if kayit.id is None:
        db.session.flush()
    islem_kaydet(str(islem), kayit.__tablename__, kayit.id, detay)
