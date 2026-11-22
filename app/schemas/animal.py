"""Bölüm 4 – hayvan ve hayvan türü şemaları."""

from marshmallow import ValidationError, fields, validate, validates_schema

from app.sabitler import Cinsiyet, HayvanDurumu, HayvanSiralama
from app.schemas.ortak import Sema, ZORUNLU, mantiksal, metin, secim, tam_sayi, tarih


class HayvanFiltreSemasi(Sema):
    """GET /api/animals sorgu parametreleri."""
    tur_id = tam_sayi(en_az=1)
    cinsiyet = secim(Cinsiyet)
    yas_min = tam_sayi(en_az=0, en_fazla=30)
    yas_max = tam_sayi(en_az=0, en_fazla=30)
    asilar_tam = mantiksal()
    kisir = mantiksal()
    durum = secim(HayvanDurumu)  # sadece görevli için geçerli
    kurum_id = tam_sayi(en_az=1)
    il = metin(50)  # kurum adresinde aranır (kurumda ayrı il alanı yok)
    arama = metin(50)
    siralama = secim(HayvanSiralama, varsayilan=HayvanSiralama.YENI)
    sayfa = tam_sayi(en_az=1, varsayilan=1)
    limit = tam_sayi(en_az=1, en_fazla=50, varsayilan=12)

    @validates_schema
    def _yas_araligi(self, veri, **kwargs):
        yas_min, yas_max = veri.get("yas_min"), veri.get("yas_max")
        if yas_min is not None and yas_max is not None and yas_min > yas_max:
            raise ValidationError("En büyük yaş, en küçük yaştan küçük olamaz.", "yas_max")


class HayvanSemasi(Sema):
    """
    POST /api/animals  → hızlı ekleme için sadece ad, tur_id, cinsiyet zorunlu.
    PUT  /api/animals/<id> → aynı şema kismi=True ile.
    """
    ad = metin(50, zorunlu=True)
    tur_id = tam_sayi(zorunlu=True, en_az=1)
    cinsiyet = secim(Cinsiyet, zorunlu=True)
    kurum_id = tam_sayi(en_az=1)  # görevlinin tek kurumu varsa gönderilmeyebilir
    cins = metin(50)
    dogum_tarihi = tarih(gelecek_olabilir=False)
    yaklasik_yas_ay = tam_sayi(en_az=0, en_fazla=360)  # doğum tarihi bilinmiyorsa
    kisirlastirildi = mantiksal(varsayilan=False)
    saglik_durumu = metin(2000)
    karakter_notu = metin(1000)
    durum = secim(HayvanDurumu, varsayilan=HayvanDurumu.BARINAKTA)

    @validates_schema
    def _dogum_tarihi_veya_yas(self, veri, **kwargs):
        if veri.get("dogum_tarihi") is not None and veri.get("yaklasik_yas_ay") is not None:
            raise ValidationError("Doğum tarihi ve yaklaşık yaştan sadece birini gönderin.", "yaklasik_yas_ay")


class DurumSemasi(Sema):
    durum = secim(HayvanDurumu, zorunlu=True)


class HayvanTuruSemasi(Sema):
    ad = metin(30, zorunlu=True)


_EN_FAZLA_30 = validate.Length(max=30, error="En fazla 30 aşı seçilebilir.")
_LISTE_MESAJLARI = {"required": ZORUNLU, "null": ZORUNLU, "invalid": "Liste olmalıdır."}


class ZorunluAsiSemasi(Sema):
    asi_turu_id = tam_sayi(zorunlu=True, en_az=1)
    tekrar_araligi_gun = tam_sayi(en_az=1, en_fazla=3650)


class ZorunluAsilarSemasi(Sema):
    """
    PUT /api/hayvan-turleri/<id>/zorunlu-asilar – iki biçimden biri gönderilir:
      {"asi_turu_idleri": [1, 2]}                                → sadece liste (aralıklar korunur)
      {"asilar": [{"asi_turu_id": 1, "tekrar_araligi_gun": 365}]} → aralıklarla birlikte
    """
    asi_turu_idleri = fields.List(
        fields.Integer(strict=True, validate=validate.Range(min=1, error="Geçerli bir aşı türü ID giriniz."),
                       error_messages={"invalid": "Tam sayı olmalıdır."}),
        validate=_EN_FAZLA_30,
        error_messages=_LISTE_MESAJLARI,
    )
    asilar = fields.List(fields.Nested(ZorunluAsiSemasi), validate=_EN_FAZLA_30, error_messages=_LISTE_MESAJLARI)

    @validates_schema
    def _bir_bicim_secilmeli(self, veri, **kwargs):
        if ("asi_turu_idleri" in veri) == ("asilar" in veri):
            raise ValidationError("asi_turu_idleri veya asilar alanlarından birini gönderin.", "asilar")
