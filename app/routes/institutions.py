"""
Kurumlar ve görevli atama – Bölüm 3 (API.md bölüm 4)

GET    /api/institutions                         Herkes  Kurumları listeler (?tur)
GET    /api/institutions/<id>                    Herkes  Kurum detayı
POST   /api/institutions                         Admin   Yeni barınak / klinik ekler
PUT    /api/institutions/<id>                    Admin   Kurum bilgilerini günceller
GET    /api/institutions/<id>/staff              Admin   Kurumun görevlilerini listeler
POST   /api/institutions/<id>/staff              Admin   Kuruma görevli atar
DELETE /api/institutions/<id>/staff/<user_id>    Admin   Görevlinin yetkisini kaldırır
"""

from flask import Blueprint, request
from flask_login import current_user

from app.schemas.ortak import dogrula, sorgu_parametreleri
from app.schemas.user import (
    KurumFiltreSemasi,
    KurumGorevliAtaSemasi,
    KurumGuncelleSemasi,
    KurumOlusturSemasi,
)
from app.services import kurum_servisi
from app.utils.decorators import ROL_ADMIN, admin_gerekli
from app.utils.responses import basarili_yanit

institutions_bp = Blueprint("institutions", __name__, url_prefix="/api/institutions")


def _admin_mi():
    return current_user.is_authenticated and current_user.rol == ROL_ADMIN


@institutions_bp.get("")
def kurum_listele():
    filtre = dogrula(KurumFiltreSemasi, sorgu_parametreleri(request.args))
    kurumlar = kurum_servisi.kurum_listesi(filtre, admin_mi=_admin_mi())
    return basarili_yanit([k.to_dict() for k in kurumlar])


@institutions_bp.get("/<int:kurum_id>")
def kurum_detay(kurum_id):
    kurum = kurum_servisi.kurum_getir(kurum_id, admin_mi=_admin_mi())
    return basarili_yanit(kurum.to_dict())


@institutions_bp.post("")
@admin_gerekli
def kurum_ekle():
    veri = dogrula(KurumOlusturSemasi, request.get_json(silent=True))
    kurum = kurum_servisi.kurum_ekle(veri)
    return basarili_yanit(kurum.to_dict(), 201)


@institutions_bp.put("/<int:kurum_id>")
@admin_gerekli
def kurum_guncelle(kurum_id):
    degisiklikler = dogrula(
        KurumGuncelleSemasi, request.get_json(silent=True), kismi=True
    )
    kurum = kurum_servisi.kurum_guncelle(kurum_id, degisiklikler)
    return basarili_yanit(kurum.to_dict())


@institutions_bp.get("/<int:kurum_id>/staff")
@admin_gerekli
def gorevli_listele(kurum_id):
    return basarili_yanit(kurum_servisi.kurum_gorevlileri(kurum_id))


@institutions_bp.post("/<int:kurum_id>/staff")
@admin_gerekli
def gorevli_ata(kurum_id):
    veri = dogrula(KurumGorevliAtaSemasi, request.get_json(silent=True))
    atama = kurum_servisi.gorevli_ata(kurum_id, veri)
    return basarili_yanit(atama, 201)


@institutions_bp.delete("/<int:kurum_id>/staff/<int:kullanici_id>")
@admin_gerekli
def gorevli_cikar(kurum_id, kullanici_id):
    kurum_servisi.gorevli_cikar(kurum_id, kullanici_id)
    return basarili_yanit({"mesaj": "Görevlinin kurum yetkisi kaldırıldı."})