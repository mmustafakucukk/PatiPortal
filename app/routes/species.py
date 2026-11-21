"""
Hayvan türleri ve zorunlu aşılar – Bölüm 4 (API.md 8.5)

GET  /api/hayvan-turleri                          Herkes  Türler + her türün zorunlu aşıları
POST /api/hayvan-turleri                          Admin   Yeni tür
PUT  /api/hayvan-turleri/<id>/zorunlu-asilar      Admin   Türün zorunlu aşı listesini belirler
                                                          {"asi_turu_idleri": [1, 2, 3]}
"""

from flask import Blueprint, request

from app.schemas.animal import HayvanTuruSemasi, ZorunluAsilarSemasi
from app.schemas.ortak import dogrula
from app.services import tur_servisi
from app.utils.decorators import admin_gerekli
from app.utils.responses import basarili_yanit

species_bp = Blueprint("species", __name__, url_prefix="/api/hayvan-turleri")


@species_bp.get("")
def hayvan_turleri():
    return basarili_yanit(tur_servisi.hayvan_turleri())


@species_bp.post("")
@admin_gerekli
def hayvan_turu_ekle():
    veri = dogrula(HayvanTuruSemasi, request.get_json(silent=True))
    return basarili_yanit(tur_servisi.hayvan_turu_ekle(veri).to_dict(), 201)


@species_bp.put("/<int:tur_id>/zorunlu-asilar")
@admin_gerekli
def zorunlu_asilari_belirle(tur_id):
    tur = tur_servisi.hayvan_turunu_yukle(tur_id)
    veri = dogrula(ZorunluAsilarSemasi, request.get_json(silent=True))
    tur = tur_servisi.zorunlu_asilari_belirle(tur, veri["asi_turu_idleri"])
    return basarili_yanit(tur.to_dict())
