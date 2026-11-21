"""
Hayvan fotoğrafları – Bölüm 4 (API.md 8.2)

POST   /api/animals/<id>/photos   Görevli  Yükleme (multipart, alan adı: "fotograflar", birden çok dosya)
PUT    /api/photos/<id>/kapak     Görevli  Kapak fotoğrafı yapar
DELETE /api/photos/<id>           Görevli  Siler

GET    /uploads/hayvanlar/<dosya> Herkes   Fotoğraf dosyasının kendisi
"""

from flask import Blueprint, request, send_from_directory

from app.models import Hayvan, HayvanFotografi
from app.services import dosyalar, fotograf_servisi
from app.services.ortak import bul_veya_404
from app.utils.decorators import gorevli_gerekli
from app.utils.responses import basarili_yanit

photos_bp = Blueprint("photos", __name__, url_prefix="/api")
uploads_bp = Blueprint("uploads", __name__)

BIR_AY = 60 * 60 * 24 * 30


@photos_bp.post("/animals/<int:hayvan_id>/photos")
@gorevli_gerekli
def fotograf_yukle(hayvan_id):
    hayvan = bul_veya_404(Hayvan, hayvan_id, "Hayvan bulunamadı.")
    yuklenenler = [d for d in request.files.getlist("fotograflar") if d and d.filename]
    yeni_fotograflar = fotograf_servisi.fotograflari_ekle(hayvan, yuklenenler)
    return basarili_yanit([f.to_dict() for f in yeni_fotograflar], 201)


@photos_bp.put("/photos/<int:foto_id>/kapak")
@gorevli_gerekli
def kapak_yap(foto_id):
    foto = bul_veya_404(HayvanFotografi, foto_id, "Fotoğraf bulunamadı.")
    return basarili_yanit(fotograf_servisi.kapak_yap(foto).to_dict())


@photos_bp.delete("/photos/<int:foto_id>")
@gorevli_gerekli
def fotograf_sil(foto_id):
    foto = bul_veya_404(HayvanFotografi, foto_id, "Fotoğraf bulunamadı.")
    fotograf_servisi.fotograf_sil(foto)
    return basarili_yanit()


@uploads_bp.get("/uploads/hayvanlar/<path:dosya_adi>")
def fotograf_dosyasi(dosya_adi):
    # send_from_directory "../" gibi klasör dışına çıkma denemelerini engeller.
    return send_from_directory(dosyalar.klasor("hayvanlar"), dosya_adi, max_age=BIR_AY)
