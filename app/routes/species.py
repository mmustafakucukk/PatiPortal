"""
Hayvan türleri ve zorunlu aşılar – Bölüm 4 (API.md 8.5)

GET    /api/hayvan-turleri                        Herkes  Türler + her türün zorunlu aşıları (tekrar aralığıyla)
POST   /api/hayvan-turleri                        Admin   Yeni tür
PUT    /api/hayvan-turleri/<id>                   Admin   Türün adını değiştirir
DELETE /api/hayvan-turleri/<id>                   Admin   Siler (o türde hayvan yoksa)
PUT    /api/hayvan-turleri/<id>/zorunlu-asilar    Admin   Türün zorunlu aşı listesini belirler
         {"asi_turu_idleri": [1, 2]}  veya  {"asilar": [{"asi_turu_id": 1, "tekrar_araligi_gun": 365}]}
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


@species_bp.put("/<int:tur_id>")
@admin_gerekli
def hayvan_turu_guncelle(tur_id):
    tur = tur_servisi.hayvan_turunu_yukle(tur_id)
    veri = dogrula(HayvanTuruSemasi, request.get_json(silent=True))
    return basarili_yanit(tur_servisi.hayvan_turu_guncelle(tur, veri).to_dict())


@species_bp.delete("/<int:tur_id>")
@admin_gerekli
def hayvan_turu_sil(tur_id):
    tur_servisi.hayvan_turu_sil(tur_servisi.hayvan_turunu_yukle(tur_id))
    return basarili_yanit()


@species_bp.put("/<int:tur_id>/zorunlu-asilar")
@admin_gerekli
def zorunlu_asilari_belirle(tur_id):
    tur = tur_servisi.hayvan_turunu_yukle(tur_id)
    veri = dogrula(ZorunluAsilarSemasi, request.get_json(silent=True))
    tur = tur_servisi.zorunlu_asilari_belirle(tur, veri)
    return basarili_yanit(tur.to_dict())
