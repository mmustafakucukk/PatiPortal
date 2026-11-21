"""
Hayvanlar – Bölüm 4 (API.md 8.1)

GET    /api/animals               Herkes   Liste (filtre + sayfalama)
GET    /api/animals/<id>          Herkes   Detay (fotoğraflarla)
POST   /api/animals               Görevli  Ekleme (hızlı ekleme: ad, tur_id, cinsiyet)
PUT    /api/animals/<id>          Görevli  Güncelleme (sadece gönderilen alanlar)
PATCH  /api/animals/<id>/durum    Görevli  Sadece durumu değiştirir
DELETE /api/animals/<id>          Görevli  Silme (fotoğraf dosyaları da silinir)
"""

from flask import Blueprint, request
from flask_login import current_user

from app.schemas.animal import DurumSemasi, HayvanFiltreSemasi, HayvanSemasi
from app.schemas.ortak import dogrula, sorgu_parametreleri
from app.services import hayvan_servisi
from app.utils.decorators import ROL_ADMIN, ROL_GOREVLI, gorevli_gerekli
from app.utils.responses import basarili_yanit

animals_bp = Blueprint("animals", __name__, url_prefix="/api/animals")


def _gorevli_mi():
    return current_user.is_authenticated and current_user.rol in (ROL_GOREVLI, ROL_ADMIN)


@animals_bp.get("")
def hayvan_listesi():
    filtre = dogrula(HayvanFiltreSemasi, sorgu_parametreleri(request.args))
    return basarili_yanit(hayvan_servisi.hayvan_listesi(filtre, gorevli=_gorevli_mi()))


@animals_bp.get("/<int:hayvan_id>")
def hayvan_detayi(hayvan_id):
    hayvan = hayvan_servisi.hayvani_yukle(hayvan_id)
    return basarili_yanit(hayvan_servisi.hayvan_detayi(hayvan))


@animals_bp.post("")
@gorevli_gerekli
def hayvan_ekle():
    veri = dogrula(HayvanSemasi, request.get_json(silent=True))
    hayvan = hayvan_servisi.hayvan_ekle(veri)
    return basarili_yanit(hayvan_servisi.hayvan_detayi(hayvan), 201)


@animals_bp.put("/<int:hayvan_id>")
@gorevli_gerekli
def hayvan_guncelle(hayvan_id):
    hayvan = hayvan_servisi.hayvani_yukle(hayvan_id)
    degisiklikler = dogrula(HayvanSemasi, request.get_json(silent=True), kismi=True)
    hayvan = hayvan_servisi.hayvan_guncelle(hayvan, degisiklikler)
    return basarili_yanit(hayvan_servisi.hayvan_detayi(hayvan))


@animals_bp.patch("/<int:hayvan_id>/durum")
@gorevli_gerekli
def durum_degistir(hayvan_id):
    hayvan = hayvan_servisi.hayvani_yukle(hayvan_id)
    veri = dogrula(DurumSemasi, request.get_json(silent=True))
    hayvan = hayvan_servisi.durum_guncelle(hayvan, veri["durum"])
    return basarili_yanit({"id": hayvan.id, "durum": hayvan.durum})


@animals_bp.delete("/<int:hayvan_id>")
@gorevli_gerekli
def hayvan_sil(hayvan_id):
    hayvan_servisi.hayvan_sil(hayvan_servisi.hayvani_yukle(hayvan_id))
    return basarili_yanit()
