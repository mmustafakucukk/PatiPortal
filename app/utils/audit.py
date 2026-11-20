import logging
from flask import request
from flask_login import current_user

logger = logging.getLogger("patiportal.audit")


def islem_kaydet(islem_turu, hedef_tablo, hedef_id=None, detay=None, kullanici_id=None):
    """
    Sistemdeki kritik işlemleri (başvuru oluşturma/onaylama/reddetme,
    kullanıcı rol değişikliği, hayvan güncelleme vb.) kaydeder.

    Not: Hazım 'IslemKaydi' (Tablo 16) modelini models.py'ye eklediğinde
    veritabanı ekleme satırı burada tek yerden aktif edilecek.
    """
    if kullanici_id is None and current_user.is_authenticated:
        kullanici_id = getattr(current_user, "id", None)

    ip_adresi = request.remote_addr if request else None

    logger.info(
        "ISLEM=%s | TABLO=%s | HEDEF_ID=%s | KULLANICI_ID=%s | IP=%s | DETAY=%s",
        islem_turu,
        hedef_tablo,
        hedef_id,
        kullanici_id,
        ip_adresi,
        detay,
    )

    # Hazım Tablo 16 (IslemKaydi) modelini eklediğinde açılacak kısım:
    # from app.extensions import db
    # from app.models import IslemKaydi
    # kayit = IslemKaydi(
    #     kullanici_id=kullanici_id,
    #     islem_turu=islem_turu,
    #     hedef_tablo=hedef_tablo,
    #     hedef_id=hedef_id,
    #     detay=detay,
    # )
    # db.session.add(kayit)