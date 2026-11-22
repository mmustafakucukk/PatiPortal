"""
Teslim alma saatleri, randevular ve sahiplendirme kayıtları – Bölüm 3 (API.md bölüm 6)

GET    /api/institutions/<id>/pickup-slots       Herkes         Kurumun müsait teslim saatleri (kapasite/doluluk dahil)
POST   /api/institutions/<id>/pickup-slots       Görevli        Yeni teslim saati ekler
POST   /api/institutions/<id>/pickup-slots/bulk  Görevli        Toplu teslim saati ekler
DELETE /api/pickup-slots/<slot_id>               Görevli        Teslim saatini kaldırır
POST   /api/appointments                         Giriş yapmış   Teslim randevusu oluşturur
GET    /api/appointments/me                      Giriş yapmış   Kullanıcının randevuları
GET    /api/appointments                         Görevli        Kurumun randevuları (?kurum_id, ?tarih, ?durum)
PUT    /api/appointments/<id>/iptal              Giriş/Görevli  Randevuyu iptal eder
PUT    /api/appointments/<id>/gelmedi            Görevli        Randevuyu 'gelmedi' olarak işaretler
POST   /api/adoptions/complete                   Görevli        Hayvan teslimini kaydeder
GET    /api/adoptions                            Görevli        Kurumun sahiplendirme kayıtları (?kurum_id)
GET    /api/adoptions/me                         Giriş yapmış   Kullanıcının sahiplendiği hayvanlar (aşı karnesi dahil)
"""

from flask import Blueprint, request

from app.schemas.application import (
    RandevuFiltreSemasi,
    RandevuOlusturSemasi,
    SahiplendirmeFiltreSemasi,
    SahiplendirmeTamamlaSemasi,
    TeslimSaatiOlusturSemasi,
    TopluTeslimSaatiSemasi,
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
    return basarili_yanit(teslimat_servisi.teslim_saatlerini_sozluge_cevir(saatler))


@adoptions_bp.post("/institutions/<int:kurum_id>/pickup-slots")
@gorevli_gerekli
def teslim_saati_ekle(kurum_id):
    veri = dogrula(TeslimSaatiOlusturSemasi, request.get_json(silent=True))
    saat = teslimat_servisi.teslim_saati_ekle(kurum_id, veri)
    return basarili_yanit(teslimat_servisi.teslim_saati_sozluge_cevir(saat), 201)


@adoptions_bp.post("/institutions/<int:kurum_id>/pickup-slots/bulk")
@gorevli_gerekli
def teslim_saati_toplu_ekle(kurum_id):
    veri = dogrula(TopluTeslimSaatiSemasi, request.get_json(silent=True))
    eklenenler, atlanan = teslimat_servisi.teslim_saati_toplu_ekle(kurum_id, veri)
    return basarili_yanit(
        {
            "eklenenler": teslimat_servisi.teslim_saatlerini_sozluge_cevir(eklenenler),
            "eklenen_sayisi": len(eklenenler),
            "atlanan_sayisi": atlanan,
        },
        201,
    )


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
    return basarili_yanit(teslimat_servisi.randevulari_sozluge_cevir([randevu])[0], 201)


@adoptions_bp.get("/appointments/me")
@giris_gerekli
def benim_randevularim():
    randevular = teslimat_servisi.benim_randevularim()
    return basarili_yanit(teslimat_servisi.randevulari_sozluge_cevir(randevular))


@adoptions_bp.get("/appointments")
@gorevli_gerekli
def kurum_randevulari():
    filtre = dogrula(RandevuFiltreSemasi, sorgu_parametreleri(request.args))
    randevular = teslimat_servisi.kurum_randevulari(filtre)
    return basarili_yanit(
        teslimat_servisi.randevulari_sozluge_cevir(randevular, iletisim=True)
    )


@adoptions_bp.put("/appointments/<int:randevu_id>/iptal")
@giris_gerekli
def randevu_iptal(randevu_id):
    randevu = teslimat_servisi.randevu_iptal(randevu_id)
    return basarili_yanit(teslimat_servisi.randevulari_sozluge_cevir([randevu])[0])


@adoptions_bp.put("/appointments/<int:randevu_id>/gelmedi")
@gorevli_gerekli
def randevu_gelmedi(randevu_id):
    randevu = teslimat_servisi.randevu_gelmedi(randevu_id)
    return basarili_yanit(
        teslimat_servisi.randevulari_sozluge_cevir([randevu], iletisim=True)[0]
    )


# ------------------------------------------------------------------ Sahiplendirme kayıtları
@adoptions_bp.post("/adoptions/complete")
@gorevli_gerekli
def sahiplendirme_tamamla():
    veri = dogrula(SahiplendirmeTamamlaSemasi, request.get_json(silent=True))
    kayit = teslimat_servisi.sahiplendirme_tamamla(veri)
    return basarili_yanit(teslimat_servisi.sahiplendirme_sozluge_cevir(kayit), 201)


@adoptions_bp.get("/adoptions")
@gorevli_gerekli
def kurum_sahiplendirmeleri():
    filtre = dogrula(SahiplendirmeFiltreSemasi, sorgu_parametreleri(request.args))
    kayitlar = teslimat_servisi.kurum_sahiplendirmeleri(filtre)
    return basarili_yanit(
        [teslimat_servisi.sahiplendirme_sozluge_cevir(k, iletisim=True) for k in kayitlar]
    )


@adoptions_bp.get("/adoptions/me")
@giris_gerekli
def benim_sahiplendiklerim():
    kayitlar = teslimat_servisi.benim_sahiplendiklerim()
    return basarili_yanit(
        [teslimat_servisi.sahiplendirme_sozluge_cevir(k, karne=True) for k in kayitlar]
    )