import logging
from flask import request
from flask_login import current_user

logger = logging.getLogger("patiportal.audit")


def islem_kaydet(islem_turu, hedef_tablo, hedef_id=None, detay=None, kullanici_id=None):
    """
    Sistemdeki kritik işlemleri (başvuru oluşturma/onaylama/reddetme,
    kullanıcı rol değişikliği, hayvan güncelleme vb.) İşlem Kayıtları (Tablo 16) tablosuna yazar.

    Commit ETMEZ: kayıt, çağıran fonksiyonun işlemiyle (transaction) birlikte kaydedilir.
    Böylece asıl işlem başarısız olursa log da yazılmaz.
    """
    from app.extensions import db
    from app.models import IslemKaydi

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

    db.session.add(IslemKaydi(
        kullanici_id=kullanici_id,
        islem_turu=str(islem_turu),
        hedef_tablo=hedef_tablo,
        hedef_id=hedef_id,
        detay=detay,
        ip_adresi=ip_adresi,
    ))
