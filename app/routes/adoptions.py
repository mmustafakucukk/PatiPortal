"""
Teslim alma saatleri, randevular ve sahiplendirme kayıtları – Bölüm 3 (API.md bölüm 6)

GET    /api/institutions/<id>/pickup-slots  Herkes         Kurumun müsait teslim saatleri
POST   /api/institutions/<id>/pickup-slots  Görevli        Yeni teslim saati ekler
DELETE /api/pickup-slots/<slot_id>          Görevli        Teslim saatini kaldırır
POST   /api/appointments                    Giriş yapmış   Teslim randevusu oluşturur
GET    /api/appointments/me                 Giriş yapmış   Kullanıcının randevuları
GET    /api/appointments                    Görevli        Kurumun randevuları (?durum)
PUT    /api/appointments/<id>/iptal         Giriş/Görevli  Randevuyu iptal eder
POST   /api/adoptions/complete              Görevli        Hayvan teslimini kaydeder
GET    /api/adoptions/me                    Giriş yapmış   Kullanıcının sahiplendiği hayvanlar
"""

from flask import Blueprint, request

from app.schemas.application import (
    RandevuFiltreSemasi,
    RandevuOlusturSemasi,
    SahiplendirmeTamamlaSemasi,
    TeslimSaatiOlusturSemasi,
)
from app.schemas.ortak import dogrula, sorgu_parametreleri
from app.services import teslimat_servisi
from app.utils.decorators import giris_gerekli, gorevli_gerekli
from app.utils.responses import basarili_yanit

adoptions_bp = Blueprint("adoptions", __name__, url_prefix="/api")


# ------------------------------------------------------------------ Teslim alma saatleri
@adoptions_bp.get("/institutions/<int:kurum_id>/pickup-slots")
def teslim_saatleri(kurum_id):
    saatler = teslimat_servisi.teslim_saatleri_listele(kurum_id)
    return basarili_yanit(
        [teslimat_servisi.teslim_saati_sozluge_cevir(s) for s in saatler]
    )


@adoptions_bp.post("/institutions/<int:kurum_id>/pickup-slots")
@gorevli_gerekli
def teslim_saati_ekle(kurum_id):
    veri = dogrula(TeslimSaatiOlusturSemasi, request.get_json(silent=True))
    saat = teslimat_servisi.teslim_saati_ekle(kurum_id, veri)
    return basarili_yanit(teslimat_servisi.teslim_saati_sozluge_cevir(saat), 201)


@adoptions_bp.delete("/pickup-slots/<int:slot_id>")
@gorevli_gerekli
def teslim_saati_sil(slot_id):
    teslimat_servisi.teslim_saati_sil(slot_id)
    return basarili_yanit({"mesaj": "Teslim alma saati kaldırıldı."})


# ------------------------------------------------------------------ Randevular
@adoptions_bp.post("/appointments")
@giris_gerekli
def randevu_olustur():
    veri = dogrula(RandevuOlusturSemasi, request.get_json(silent=True))
    randevu = teslimat_servisi.randevu_olustur(veri)
    return basarili_yanit(teslimat_servisi.randevu_sozluge_cevir(randevu), 201)


@adoptions_bp.get("/appointments/me")
@giris_gerekli
def benim_randevularim():
    randevular = teslimat_servisi.benim_randevularim()
    return basarili_yanit(
        [teslimat_servisi.randevu_sozluge_cevir(r) for r in randevular]
    )


@adoptions_bp.get("/appointments")
@gorevli_gerekli
def kurum_randevulari():
    filtre = dogrula(RandevuFiltreSemasi, sorgu_parametreleri(request.args))
    randevular = teslimat_servisi.kurum_randevulari(filtre)
    return basarili_yanit(
        [teslimat_servisi.randevu_sozluge_cevir(r, iletisim=True) for r in randevular]
    )


@adoptions_bp.put("/appointments/<int:randevu_id>/iptal")
@giris_gerekli
def randevu_iptal(randevu_id):
    randevu = teslimat_servisi.randevu_iptal(randevu_id)
    return basarili_yanit(teslimat_servisi.randevu_sozluge_cevir(randevu))


# ------------------------------------------------------------------ Sahiplendirme kayıtları
@adoptions_bp.post("/adoptions/complete")
@gorevli_gerekli
def sahiplendirme_tamamla():
    veri = dogrula(SahiplendirmeTamamlaSemasi, request.get_json(silent=True))
    kayit = teslimat_servisi.sahiplendirme_tamamla(veri)
    return basarili_yanit(teslimat_servisi.sahiplendirme_sozluge_cevir(kayit), 201)


@adoptions_bp.get("/adoptions/me")
@giris_gerekli
def benim_sahiplendiklerim():
    kayitlar = teslimat_servisi.benim_sahiplendiklerim()
    return basarili_yanit(
        [teslimat_servisi.sahiplendirme_sozluge_cevir(k) for k in kayitlar]
    )