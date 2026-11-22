"""
Kimlik doğrulama – Bölüm 3 (API.md bölüm 3)

POST /api/auth/register     Herkes        Kayıt (KVKK zorunlu, rol=ziyaretci, otomatik giriş)
POST /api/auth/login        Herkes        Giriş (dakikada en fazla 5 deneme)
POST /api/auth/logout       Giriş yapmış  Çıkış
GET  /api/auth/me           Giriş yapmış  Aktif kullanıcı profili, rolü ve yetkili kurumları
PUT  /api/auth/password     Giriş yapmış  Mevcut şifreyi doğrulayarak şifre değiştirir
GET  /api/auth/csrf-token   Herkes        Frontend fetch istekleri için X-CSRFToken değeri
"""

from flask import Blueprint, request
from flask_login import current_user
from flask_wtf.csrf import generate_csrf

from app.extensions import limiter
from app.schemas.auth import GirisSemasi, KayitSemasi, SifreDegistirSemasi
from app.schemas.ortak import dogrula
from app.services import auth_servisi
from app.utils.decorators import giris_gerekli
from app.utils.responses import basarili_yanit

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/register")
@limiter.limit("10 per minute")
def kayit_ol():
    veri = dogrula(KayitSemasi, request.get_json(silent=True))
    kullanici = auth_servisi.kullanici_kayit(veri)
    return basarili_yanit(kullanici.to_dict(iletisim=True), 201)


@auth_bp.post("/login")
@limiter.limit("5 per minute")
def giris_yap():
    veri = dogrula(GirisSemasi, request.get_json(silent=True))
    kullanici = auth_servisi.kullanici_giris(veri)
    return basarili_yanit(kullanici.to_dict(iletisim=True))


@auth_bp.post("/logout")
@giris_gerekli
def cikis_yap():
    auth_servisi.kullanici_cikis()
    return basarili_yanit({"mesaj": "Çıkış yapıldı."})


@auth_bp.get("/me")
@giris_gerekli
def profilim():
    return basarili_yanit(current_user.to_dict(iletisim=True))


@auth_bp.put("/password")
@giris_gerekli
def sifre_degistir():
    veri = dogrula(SifreDegistirSemasi, request.get_json(silent=True))
    auth_servisi.sifre_degistir(veri)
    return basarili_yanit({"mesaj": "Şifreniz güncellendi."})


@auth_bp.get("/csrf-token")
def csrf_token_al():
    return basarili_yanit({"csrf_token": generate_csrf()})