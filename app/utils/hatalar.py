"""
Servis katmanından fırlatılan hata.

Servisler (app/services/*) iş kuralı bozulduğunda yanıt döndürmek yerine hata fırlatır:

    raise ApiHatasi("Hayvan bulunamadı.", 404)
    raise ApiHatasi.alan("tur_id", "Böyle bir hayvan türü yok.")

create_app() içinde hata_yakalayicilarini_kaydet(app) çağrılınca bu hatalar
app/utils/responses.py → hata_yaniti() formatında JSON'a çevrilir.
"""

from app.extensions import db
from app.utils.responses import hata_yaniti

DOGRULAMA_HATASI = "Girilen bilgilerde doğrulama hatası var."


class ApiHatasi(Exception):
    def __init__(self, mesaj, durum_kodu=400, alanlar=None):
        super().__init__(mesaj)
        self.mesaj = mesaj
        self.durum_kodu = durum_kodu
        self.alanlar = alanlar

    @classmethod
    def alan(cls, alan_adi, mesaj):
        """Tek bir form alanıyla ilgili 400 hatası (marshmallow ile aynı biçim: mesaj listesi)."""
        return cls(DOGRULAMA_HATASI, 400, {alan_adi: [mesaj]})


def hata_yakalayicilarini_kaydet(app):
    @app.errorhandler(ApiHatasi)
    def api_hatasi(hata):
        db.session.rollback()
        return hata_yaniti(hata.mesaj, hata.durum_kodu, hata.alanlar)

    @app.errorhandler(413)
    def dosya_cok_buyuk(_):
        return hata_yaniti("Gönderilen dosyalar çok büyük.", 413)
