"""
Acil ihtiyaçlar ve destek sözleri – Bölüm 4 (API.md 8.4)

GET    /api/needs?durum=acik            Herkes         Liste (aciliyete göre sıralı, toplam söz ile)
GET    /api/needs/<id>                  Herkes         Detay
POST   /api/needs                       Görevli        İhtiyaç ekler
PUT    /api/needs/<id>                  Görevli        Günceller
PATCH  /api/needs/<id>/karsilandi       Görevli        Kapatır
DELETE /api/needs/<id>                  Görevli        Siler (destek sözü yoksa)
POST   /api/needs/<id>/pledges          Herkes         Destek sözü verir (dakikada en fazla 10)
GET    /api/needs/<id>/pledges          Görevli        Gelen sözler ve iletişim bilgileri
PATCH  /api/pledges/<id>/durum          Görevli        Sözün durumu (teslim_edildi / iptal)
GET    /api/pledges/me                  Giriş yapmış   Kullanıcının kendi destek sözleri
"""

from flask import Blueprint, request
from flask_login import current_user
from sqlalchemy.orm import joinedload

from app.extensions import limiter
from app.models import AcilIhtiyac, DestekTalebi
from app.schemas.need import DestekDurumSemasi, DestekSemasi, IhtiyacFiltreSemasi, IhtiyacSemasi
from app.schemas.ortak import dogrula, sorgu_parametreleri
from app.services import ihtiyac_servisi
from app.services.ortak import bul_veya_404
from app.utils.decorators import giris_gerekli, gorevli_gerekli
from app.utils.responses import basarili_yanit

needs_bp = Blueprint("needs", __name__, url_prefix="/api")


def _ihtiyac(ihtiyac_id):
    return bul_veya_404(AcilIhtiyac, ihtiyac_id, "İhtiyaç bulunamadı.")


@needs_bp.get("/needs")
def ihtiyac_listesi():
    filtre = dogrula(IhtiyacFiltreSemasi, sorgu_parametreleri(request.args))
    return basarili_yanit(ihtiyac_servisi.ihtiyac_listesi(filtre))


@needs_bp.get("/needs/<int:ihtiyac_id>")
def ihtiyac_detayi(ihtiyac_id):
    return basarili_yanit(ihtiyac_servisi.ihtiyac_detayi(ihtiyac_id))


@needs_bp.post("/needs")
@gorevli_gerekli
def ihtiyac_ekle():
    veri = dogrula(IhtiyacSemasi, request.get_json(silent=True))
    ihtiyac = ihtiyac_servisi.ihtiyac_ekle(veri)
    return basarili_yanit(ihtiyac_servisi.ihtiyac_detayi(ihtiyac.id), 201)


@needs_bp.put("/needs/<int:ihtiyac_id>")
@gorevli_gerekli
def ihtiyac_guncelle(ihtiyac_id):
    ihtiyac = _ihtiyac(ihtiyac_id)
    degisiklikler = dogrula(IhtiyacSemasi, request.get_json(silent=True), kismi=True)
    ihtiyac_servisi.ihtiyac_guncelle(ihtiyac, degisiklikler)
    return basarili_yanit(ihtiyac_servisi.ihtiyac_detayi(ihtiyac_id))


@needs_bp.patch("/needs/<int:ihtiyac_id>/karsilandi")
@gorevli_gerekli
def ihtiyac_karsilandi(ihtiyac_id):
    ihtiyac_servisi.ihtiyac_karsilandi(_ihtiyac(ihtiyac_id))
    return basarili_yanit(ihtiyac_servisi.ihtiyac_detayi(ihtiyac_id))


@needs_bp.delete("/needs/<int:ihtiyac_id>")
@gorevli_gerekli
def ihtiyac_sil(ihtiyac_id):
    ihtiyac_servisi.ihtiyac_sil(_ihtiyac(ihtiyac_id))
    return basarili_yanit()


@needs_bp.post("/needs/<int:ihtiyac_id>/pledges")
@limiter.limit("10 per minute")
def destek_ver(ihtiyac_id):
    ihtiyac = _ihtiyac(ihtiyac_id)
    ham_veri = request.get_json(silent=True) or {}
    if isinstance(ham_veri, dict) and current_user.is_authenticated:
        # Giriş yapmış kullanıcı adını/telefonunu boş bırakırsa hesabındaki bilgiler kullanılır.
        ham_veri.setdefault("ad_soyad", current_user.ad_soyad)
        if current_user.telefon:
            ham_veri.setdefault("telefon", current_user.telefon)
    talep = ihtiyac_servisi.destek_ver(ihtiyac, dogrula(DestekSemasi, ham_veri))
    return basarili_yanit(talep.to_dict(), 201)


@needs_bp.get("/needs/<int:ihtiyac_id>/pledges")
@gorevli_gerekli
def destek_talepleri(ihtiyac_id):
    return basarili_yanit(ihtiyac_servisi.destek_talepleri(_ihtiyac(ihtiyac_id)))


@needs_bp.patch("/pledges/<int:talep_id>/durum")
@gorevli_gerekli
def destek_durumu(talep_id):
    talep = bul_veya_404(DestekTalebi, talep_id, "Destek talebi bulunamadı.",
                         secenekler=[joinedload(DestekTalebi.ihtiyac)])
    veri = dogrula(DestekDurumSemasi, request.get_json(silent=True))
    return basarili_yanit(ihtiyac_servisi.destek_durumu_degistir(talep, veri["durum"]).to_dict(iletisim=True))


@needs_bp.get("/pledges/me")
@giris_gerekli
def destek_sozlerim():
    return basarili_yanit(ihtiyac_servisi.kullanicinin_destekleri())
