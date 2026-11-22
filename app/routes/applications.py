"""
Sahiplendirme başvuruları – Bölüm 3 (API.md bölüm 5)

POST /api/applications                Giriş yapmış    Yeni sahiplenme başvurusu
GET  /api/applications/me             Giriş yapmış    Kullanıcının kendi başvuruları (randevu özeti dahil)
GET  /api/applications                Görevli (kurum) Kurumun başvurularını listeler (?durum, ?animal_id, ?kurum_id)
GET  /api/applications/<id>           Görevli (kurum) Başvuru detayı (iletişim/telefon dahil)
PUT  /api/applications/<id>/onayla    Görevli (kurum) Başvuruyu onaylar, hayvanı rezerve yapar, diğerlerini reddeder
PUT  /api/applications/<id>/reddet    Görevli (kurum) Başvuruyu opsiyonel notla reddeder
PUT  /api/applications/<id>/iptal     Giriş yapmış    Kullanıcı kendi başvurusunu iptal eder
"""

from flask import Blueprint, request

from app.schemas.application import (
    BasvuruFiltreSemasi,
    BasvuruOlusturSemasi,
    BasvuruReddetSemasi,
)
from app.schemas.ortak import dogrula, sorgu_parametreleri
from app.services import basvuru_servisi
from app.utils.decorators import giris_gerekli, gorevli_gerekli
from app.utils.responses import basarili_yanit

applications_bp = Blueprint("applications", __name__, url_prefix="/api/applications")


@applications_bp.post("")
@giris_gerekli
def basvuru_olustur():
    veri = dogrula(BasvuruOlusturSemasi, request.get_json(silent=True))
    basvuru = basvuru_servisi.basvuru_olustur(veri)
    return basarili_yanit(basvuru_servisi.basvuru_sozluge_cevir(basvuru), 201)


@applications_bp.get("/me")
@giris_gerekli
def benim_basvurularim():
    basvurular = basvuru_servisi.benim_basvurularim()
    return basarili_yanit(
        [basvuru_servisi.basvuru_sozluge_cevir(b) for b in basvurular]
    )


@applications_bp.get("")
@gorevli_gerekli
def basvuru_listele():
    filtre = dogrula(BasvuruFiltreSemasi, sorgu_parametreleri(request.args))
    basvurular = basvuru_servisi.basvuru_listesi(filtre)
    return basarili_yanit(
        [basvuru_servisi.basvuru_sozluge_cevir(b, iletisim=False) for b in basvurular]
    )


@applications_bp.get("/<int:basvuru_id>")
@gorevli_gerekli
def basvuru_detay(basvuru_id):
    basvuru = basvuru_servisi.basvuru_detay(basvuru_id)
    return basarili_yanit(basvuru_servisi.basvuru_sozluge_cevir(basvuru, iletisim=True))


@applications_bp.put("/<int:basvuru_id>/onayla")
@gorevli_gerekli
def basvuru_onayla(basvuru_id):
    basvuru = basvuru_servisi.basvuru_onayla(basvuru_id)
    return basarili_yanit(basvuru_servisi.basvuru_sozluge_cevir(basvuru, iletisim=True))


@applications_bp.put("/<int:basvuru_id>/reddet")
@gorevli_gerekli
def basvuru_reddet(basvuru_id):
    veri = dogrula(BasvuruReddetSemasi, request.get_json(silent=True) or {})
    basvuru = basvuru_servisi.basvuru_reddet(basvuru_id, veri)
    return basarili_yanit(basvuru_servisi.basvuru_sozluge_cevir(basvuru, iletisim=True))


@applications_bp.put("/<int:basvuru_id>/iptal")
@giris_gerekli
def basvuru_iptal(basvuru_id):
    basvuru = basvuru_servisi.basvuru_iptal(basvuru_id)
    return basarili_yanit(basvuru_servisi.basvuru_sozluge_cevir(basvuru))