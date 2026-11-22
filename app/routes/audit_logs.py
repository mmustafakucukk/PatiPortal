"""
İşlem kayıtları (audit log) – Bölüm 3

GET /api/audit-logs  Admin  Sistem işlem kayıtlarını sayfalı ve filtreli listeler
                            (?baslangic, ?bitis, ?kullanici_id, ?kurum_id, ?islem_turu, ?hedef_tablo, ?sayfa, ?limit)
"""

from flask import Blueprint, request

from app.schemas.application import IslemKaydiFiltreSemasi
from app.schemas.ortak import dogrula, sorgu_parametreleri
from app.services import islem_kaydi_servisi
from app.utils.decorators import admin_gerekli
from app.utils.responses import basarili_yanit

audit_logs_bp = Blueprint("audit_logs", __name__, url_prefix="/api/audit-logs")


@audit_logs_bp.get("")
@admin_gerekli
def islem_kayitlari():
    filtre = dogrula(IslemKaydiFiltreSemasi, sorgu_parametreleri(request.args))
    return basarili_yanit(islem_kaydi_servisi.islem_kayitlari_listesi(filtre))