"""
İstatistikler – Bölüm 3 (API.md bölüm 7)

GET /api/stats/public  Herkes   Anasayfa sayaçları
GET /api/stats         Görevli  Barınak/panel özet istatistikleri
"""

from flask import Blueprint

from app.services import istatistik_servisi
from app.utils.decorators import gorevli_gerekli
from app.utils.responses import basarili_yanit

stats_bp = Blueprint("stats", __name__, url_prefix="/api/stats")


@stats_bp.get("/public")
def kamu_istatistikleri():
    return basarili_yanit(istatistik_servisi.kamu_istatistikleri())


@stats_bp.get("")
@gorevli_gerekli
def panel_istatistikleri():
    return basarili_yanit(istatistik_servisi.panel_istatistikleri())