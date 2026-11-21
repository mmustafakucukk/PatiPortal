"""
Aşı karnesi – Bölüm 4 (API.md 8.3)

GET    /api/animals/<id>/vaccinations   Herkes   Hayvanın aşı karnesi
POST   /api/animals/<id>/vaccinations   Görevli  Aşı ekler
PUT    /api/vaccinations/<id>           Görevli  Düzeltir (sadece gönderilen alanlar)
DELETE /api/vaccinations/<id>           Görevli  Siler
POST   /api/vaccinations/<id>/belge     Görevli  Belge yükler (multipart, alan adı: "belge")
GET    /api/vaccinations/<id>/belge     Herkes   Belgeyi indirir
GET    /api/vaccinations/yaklasan?gun=7 Görevli  Önümüzdeki N günde aşısı gelenler (?kurum_id=)
GET    /api/vaccinations/gecikmis       Görevli  Tarihi geçmiş ama yapılmamış aşılar (?kurum_id=)
GET    /api/vaccinations/turler         Herkes   Aşı türleri (?hayvan_turu_id= ile zorunlu + tekrar aralığı)
POST   /api/vaccinations/turler         Admin    Yeni aşı türü
PUT    /api/vaccinations/turler/<id>    Admin    Aşı türünü düzenler (ad, aciklama)
DELETE /api/vaccinations/turler/<id>    Admin    Siler (hiç uygulanmadıysa)
"""

from flask import Blueprint, request, send_from_directory
from sqlalchemy.orm import joinedload

from app.models import Hayvan, HayvanAsisi
from app.schemas.ortak import dogrula, sorgu_parametreleri
from app.schemas.vaccination import (
    AsiSemasi, AsiTuruFiltreSemasi, AsiTuruSemasi, GecikmisAsiFiltreSemasi, YaklasanAsiFiltreSemasi,
)
from app.services import asi_servisi, dosyalar, tur_servisi
from app.services.ortak import bul_veya_404
from app.utils.decorators import admin_gerekli, gorevli_gerekli
from app.utils.hatalar import ApiHatasi
from app.utils.responses import basarili_yanit

vaccinations_bp = Blueprint("vaccinations", __name__, url_prefix="/api")


def _asi(asi_id):
    return bul_veya_404(
        HayvanAsisi, asi_id, "Aşı kaydı bulunamadı.",
        secenekler=[joinedload(HayvanAsisi.hayvan), joinedload(HayvanAsisi.asi_turu)],
    )


@vaccinations_bp.get("/animals/<int:hayvan_id>/vaccinations")
def asi_karnesi(hayvan_id):
    hayvan = asi_servisi.hayvanin_asilarini_yukle(hayvan_id)
    return basarili_yanit(asi_servisi.asi_karnesi(hayvan))


@vaccinations_bp.post("/animals/<int:hayvan_id>/vaccinations")
@gorevli_gerekli
def asi_ekle(hayvan_id):
    hayvan = bul_veya_404(Hayvan, hayvan_id, "Hayvan bulunamadı.")
    veri = dogrula(AsiSemasi, request.get_json(silent=True))
    asi = asi_servisi.asi_ekle(hayvan, veri)
    return basarili_yanit(asi.to_dict(), 201)


@vaccinations_bp.put("/vaccinations/<int:asi_id>")
@gorevli_gerekli
def asi_guncelle(asi_id):
    asi = _asi(asi_id)
    degisiklikler = dogrula(AsiSemasi, request.get_json(silent=True), kismi=True)
    return basarili_yanit(asi_servisi.asi_guncelle(asi, degisiklikler).to_dict())


@vaccinations_bp.delete("/vaccinations/<int:asi_id>")
@gorevli_gerekli
def asi_sil(asi_id):
    asi_servisi.asi_sil(_asi(asi_id))
    return basarili_yanit()


@vaccinations_bp.post("/vaccinations/<int:asi_id>/belge")
@gorevli_gerekli
def belge_yukle(asi_id):
    asi = asi_servisi.belge_yukle(_asi(asi_id), request.files.get("belge"))
    return basarili_yanit(asi.to_dict())


@vaccinations_bp.get("/vaccinations/<int:asi_id>/belge")
def belge_indir(asi_id):
    asi = _asi(asi_id)
    if not asi.belge_dosyasi:
        raise ApiHatasi("Bu aşı kaydına belge yüklenmemiş.", 404)
    return send_from_directory(dosyalar.klasor("belgeler"), asi.belge_dosyasi)


@vaccinations_bp.get("/vaccinations/yaklasan")
@gorevli_gerekli
def yaklasan_asilar():
    filtre = dogrula(YaklasanAsiFiltreSemasi, sorgu_parametreleri(request.args))
    return basarili_yanit(asi_servisi.yaklasan_asilar(filtre["gun"], filtre.get("kurum_id")))


@vaccinations_bp.get("/vaccinations/gecikmis")
@gorevli_gerekli
def gecikmis_asilar():
    filtre = dogrula(GecikmisAsiFiltreSemasi, sorgu_parametreleri(request.args))
    return basarili_yanit(asi_servisi.gecikmis_asilar(filtre.get("kurum_id")))


@vaccinations_bp.get("/vaccinations/turler")
def asi_turleri():
    filtre = dogrula(AsiTuruFiltreSemasi, sorgu_parametreleri(request.args))
    return basarili_yanit(tur_servisi.asi_turleri(filtre.get("hayvan_turu_id")))


@vaccinations_bp.post("/vaccinations/turler")
@admin_gerekli
def asi_turu_ekle():
    veri = dogrula(AsiTuruSemasi, request.get_json(silent=True))
    return basarili_yanit(tur_servisi.asi_turu_ekle(veri).to_dict(), 201)


@vaccinations_bp.put("/vaccinations/turler/<int:asi_turu_id>")
@admin_gerekli
def asi_turu_guncelle(asi_turu_id):
    asi_turu = tur_servisi.asi_turunu_yukle(asi_turu_id)
    degisiklikler = dogrula(AsiTuruSemasi, request.get_json(silent=True), kismi=True)
    return basarili_yanit(tur_servisi.asi_turu_guncelle(asi_turu, degisiklikler).to_dict())


@vaccinations_bp.delete("/vaccinations/turler/<int:asi_turu_id>")
@admin_gerekli
def asi_turu_sil(asi_turu_id):
    tur_servisi.asi_turu_sil(tur_servisi.asi_turunu_yukle(asi_turu_id))
    return basarili_yanit()
