from marshmallow import ValidationError, fields, validate, validates_schema

from app.sabitler import BasvuruDurumu, RandevuDurumu
from app.schemas.base import kvkk_onay_dogrula
from app.schemas.ortak import Sema, metin, secim, tam_sayi, tarih

_SAAT_MESAJLARI = {
    "required": "Bu alan zorunludur.",
    "null": "Bu alan boş bırakılamaz.",
    "invalid": "Saat SS:DD biçiminde olmalıdır.",
}


class BasvuruOlusturSemasi(Sema):
    animal_id = tam_sayi(zorunlu=True, en_az=1)
    ev_tipi = metin(100, zorunlu=True, en_az=2)
    onceki_deneyim = metin(1000)
    aciklama = metin(2000, zorunlu=True, en_az=10)
    kvkk_onay = fields.Boolean(
        required=True,
        validate=kvkk_onay_dogrula,
        error_messages={
            "required": "KVKK onayı zorunludur.",
            "null": "KVKK onayı zorunludur.",
            "invalid": "Geçersiz onay değeri.",
        },
    )


class BasvuruReddetSemasi(Sema):
    degerlendirme_notu = metin(1000)


class TeslimSaatiOlusturSemasi(Sema):
    tarih = tarih(zorunlu=True)
    baslangic_saati = fields.Time(required=True, error_messages=_SAAT_MESAJLARI)
    bitis_saati = fields.Time(required=True, error_messages=_SAAT_MESAJLARI)
    kapasite = tam_sayi(en_az=1, en_fazla=50, varsayilan=1)

    @validates_schema
    def saat_araligi_dogrula(self, data, **kwargs):
        if data["bitis_saati"] <= data["baslangic_saati"]:
            raise ValidationError(
                {"bitis_saati": ["Bitiş saati başlangıç saatinden sonra olmalıdır."]}
            )


class TopluTeslimSaatiSemasi(Sema):
    """
    İki biçimden biri kabul edilir:
      1) {"saatler": [{"tarih": "...", "baslangic_saati": "10:00", "bitis_saati": "10:30", "kapasite": 1}, ...]}
      2) {"baslangic_tarihi": "...", "bitis_tarihi": "...", "gunler": [1,2,3,4,5],
          "baslangic_saati": "10:00", "bitis_saati": "16:00", "sure": 30, "kapasite": 1}
         (gunler: 0=Pazar, 1=Pazartesi ... 6=Cumartesi)
    """
    saatler = fields.List(
        fields.Nested(TeslimSaatiOlusturSemasi),
        validate=validate.Length(min=1, max=200, error="1 ile 200 arasında teslim saati gönderilebilir."),
        error_messages={"invalid": "Liste olmalıdır.", "null": "Liste boş bırakılamaz."},
    )
    baslangic_tarihi = tarih()
    bitis_tarihi = tarih()
    gunler = fields.List(
        fields.Integer(
            validate=validate.Range(min=0, max=6, error="Gün değeri 0 (Pazar) ile 6 (Cumartesi) arasında olmalıdır."),
            error_messages={"invalid": "Tam sayı olmalıdır."},
        ),
        validate=validate.Length(min=1, max=7, error="En az bir gün seçilmelidir."),
        error_messages={"invalid": "Liste olmalıdır."},
    )
    baslangic_saati = fields.Time(allow_none=True, error_messages=_SAAT_MESAJLARI)
    bitis_saati = fields.Time(allow_none=True, error_messages=_SAAT_MESAJLARI)
    sure = tam_sayi(en_az=15, en_fazla=240, varsayilan=30)
    kapasite = tam_sayi(en_az=1, en_fazla=50, varsayilan=1)

    @validates_schema
    def bicim_dogrula(self, data, **kwargs):
        if "saatler" in data:
            return

        eksikler = {}
        for alan in ("baslangic_tarihi", "bitis_tarihi", "gunler", "baslangic_saati", "bitis_saati"):
            if not data.get(alan):
                eksikler[alan] = ["Bu alan zorunludur."]
        if eksikler:
            raise ValidationError(eksikler)

        if data["bitis_tarihi"] < data["baslangic_tarihi"]:
            raise ValidationError({"bitis_tarihi": ["Bitiş tarihi başlangıç tarihinden önce olamaz."]})
        if (data["bitis_tarihi"] - data["baslangic_tarihi"]).days > 90:
            raise ValidationError({"bitis_tarihi": ["Tarih aralığı en fazla 90 gün olabilir."]})
        if data["bitis_saati"] <= data["baslangic_saati"]:
            raise ValidationError({"bitis_saati": ["Bitiş saati başlangıç saatinden sonra olmalıdır."]})


class RandevuOlusturSemasi(Sema):
    application_id = tam_sayi(zorunlu=True, en_az=1)
    slot_id = tam_sayi(zorunlu=True, en_az=1)
    not_metni = metin(500)


class SahiplendirmeTamamlaSemasi(Sema):
    application_id = tam_sayi(zorunlu=True, en_az=1)
    teslim_notu = metin(1000)


class BasvuruFiltreSemasi(Sema):
    durum = secim(BasvuruDurumu)
    animal_id = tam_sayi(en_az=1)
    kurum_id = tam_sayi(en_az=1)


class RandevuFiltreSemasi(Sema):
    durum = secim(RandevuDurumu)
    kurum_id = tam_sayi(en_az=1)
    tarih = tarih()


class SahiplendirmeFiltreSemasi(Sema):
    kurum_id = tam_sayi(en_az=1)


class IstatistikFiltreSemasi(Sema):
    kurum_id = tam_sayi(en_az=1)


class IslemKaydiFiltreSemasi(Sema):
    baslangic = tarih()
    bitis = tarih()
    kullanici_id = tam_sayi(en_az=1)
    kurum_id = tam_sayi(en_az=1)
    islem_turu = metin(50)
    hedef_tablo = metin(50)
    sayfa = tam_sayi(en_az=1, varsayilan=1)
    limit = tam_sayi(en_az=1, en_fazla=100, varsayilan=20)