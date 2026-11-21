"""
Kullanıcı yönetimi – Bölüm 3 (API.md bölüm 4)

GET    /api/users       Admin         Kullanıcıları listeler (?rol, ?aktif, ?arama)
POST   /api/users       Admin         Yeni görevli / yönetici oluşturur
PUT    /api/users/<id>  Admin         Rol değiştirir, bilgi günceller veya pasifleştirir
DELETE /api/users/me    Giriş yapmış  KVKK kapsamında kendi hesabını siler
"""

from flask import Blueprint, request

from app.schemas.ortak import dogrula, sorgu_parametreleri
from app.schemas.user import (
    KullaniciFiltreSemasi,
    KullaniciGuncelleSemasi,
    KullaniciOlusturSemasi,
)
from app.services import kullanici_servisi
from app.utils.decorators import admin_gerekli, giris_gerekli
from app.utils.responses import basarili_yanit

users_bp = Blueprint("users", __name__, url_prefix="/api/users")


@users_bp.get("")
@admin_gerekli
def kullanici_listele():
    filtre = dogrula(KullaniciFiltreSemasi, sorgu_parametreleri(request.args))
    kullanicilar = kullanici_servisi.kullanici_listesi(filtre)
    return basarili_yanit([k.to_dict(iletisim=True) for k in kullanicilar])


@users_bp.post("")
@admin_gerekli
def kullanici_ekle():
    veri = dogrula(KullaniciOlusturSemasi, request.get_json(silent=True))
    kullanici = kullanici_servisi.kullanici_olustur(veri)
    return basarili_yanit(kullanici.to_dict(iletisim=True), 201)


@users_bp.put("/<int:kullanici_id>")
@admin_gerekli
def kullanici_guncelle(kullanici_id):
    degisiklikler = dogrula(
        KullaniciGuncelleSemasi, request.get_json(silent=True), kismi=True
    )
    kullanici = kullanici_servisi.kullanici_guncelle(kullanici_id, degisiklikler)
    return basarili_yanit(kullanici.to_dict(iletisim=True))


@users_bp.delete("/me")
@giris_gerekli
def hesabimi_sil():
    kullanici_servisi.hesabimi_sil()
    return basarili_yanit(
        {"mesaj": "Hesabınız ve kişisel verileriniz KVKK kapsamında silindi."}
    )