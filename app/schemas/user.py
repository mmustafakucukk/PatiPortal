import re
from marshmallow import ValidationError, fields, validate, validates_schema

from app.sabitler import KurumTuru, Rol
from app.schemas.base import TemelSema, telefon_dogrula
from app.schemas.ortak import Sema, mantiksal, metin, secim, tam_sayi

GECERLI_ROLLER = [uye.value for uye in Rol]


def kurum_telefon_dogrula(deger):
    if not deger:
        return
    rakamlar = re.sub(r"\D", "", deger)
    if not (7 <= len(rakamlar) <= 15) or not re.fullmatch(r"[\d\s+\-()]+", deger):
        raise ValidationError("Geçerli bir telefon numarası giriniz.")


class KullaniciFiltreSemasi(Sema):
    rol = secim(Rol)
    aktif = mantiksal()
    arama = metin(100)


class KullaniciOlusturSemasi(TemelSema):
    ad_soyad = fields.String(
        required=True,
        validate=validate.Length(min=2, max=100, error="Ad soyad 2 ile 100 karakter arasında olmalıdır."),
        error_messages={"required": "Ad soyad zorunludur.", "null": "Ad soyad boş bırakılamaz."},
    )
    email = fields.Email(
        required=True,
        validate=validate.Length(max=120, error="E-posta en fazla 120 karakter olabilir."),
        error_messages={
            "required": "E-posta zorunludur.",
            "null": "E-posta boş bırakılamaz.",
            "invalid": "Geçerli bir e-posta adresi giriniz.",
        },
    )
    telefon = fields.String(
        required=True,
        validate=telefon_dogrula,
        error_messages={"required": "Telefon numarası zorunludur.", "null": "Telefon boş bırakılamaz."},
    )
    sifre = fields.String(
        required=True,
        validate=validate.Length(min=8, max=128, error="Şifre en az 8 karakter olmalıdır."),
        error_messages={"required": "Şifre zorunludur.", "null": "Şifre boş bırakılamaz."},
    )
    rol = fields.String(
        load_default=Rol.GOREVLI.value,
        validate=validate.OneOf(GECERLI_ROLLER, error="Geçersiz rol seçimi."),
        error_messages={"null": "Rol boş bırakılamaz."},
    )


class KullaniciGuncelleSemasi(Sema):
    ad_soyad = metin(100, en_az=2)
    telefon = fields.String(
        validate=telefon_dogrula,
        error_messages={"null": "Telefon boş bırakılamaz.", "invalid": "Metin olmalıdır."},
    )
    rol = secim(Rol)
    aktif = mantiksal()


class ProfilGuncelleSemasi(Sema):
    ad_soyad = metin(100, en_az=2)
    telefon = fields.String(
        validate=telefon_dogrula,
        error_messages={"null": "Telefon boş bırakılamaz.", "invalid": "Metin olmalıdır."},
    )


class KurumFiltreSemasi(Sema):
    tur = secim(KurumTuru)
    aktif = mantiksal()
    il = metin(50)
    ilce = metin(50)


class KurumOlusturSemasi(Sema):
    ad = metin(150, zorunlu=True, en_az=2)
    tur = secim(KurumTuru, varsayilan=KurumTuru.BARINAK)
    il = metin(50)
    ilce = metin(50)
    adres = metin(500, en_az=5)
    telefon = fields.String(
        load_default=None,
        allow_none=True,
        validate=[validate.Length(max=20, error="Telefon en fazla 20 karakter olabilir."), kurum_telefon_dogrula],
        error_messages={"invalid": "Metin olmalıdır."},
    )
    email = fields.Email(
        load_default=None,
        allow_none=True,
        validate=validate.Length(max=120, error="E-posta en fazla 120 karakter olabilir."),
        error_messages={"invalid": "Geçerli bir e-posta adresi giriniz."},
    )


class KurumGuncelleSemasi(Sema):
    ad = metin(150, en_az=2)
    tur = secim(KurumTuru)
    il = metin(50)
    ilce = metin(50)
    adres = metin(500, en_az=5)
    telefon = fields.String(
        allow_none=True,
        validate=[validate.Length(max=20, error="Telefon en fazla 20 karakter olabilir."), kurum_telefon_dogrula],
        error_messages={"invalid": "Metin olmalıdır."},
    )
    email = fields.Email(
        allow_none=True,
        validate=validate.Length(max=120, error="E-posta en fazla 120 karakter olabilir."),
        error_messages={"invalid": "Geçerli bir e-posta adresi giriniz."},
    )
    aktif = mantiksal()


class KurumGorevliAtaSemasi(Sema):
    user_id = tam_sayi(en_az=1)
    email = fields.Email(
        allow_none=True,
        validate=validate.Length(max=120, error="E-posta en fazla 120 karakter olabilir."),
        error_messages={"invalid": "Geçerli bir e-posta adresi giriniz."},
    )
    gorev_tanimi = metin(50, varsayilan="gorevli")

    @validates_schema
    def kullanici_secimi_dogrula(self, data, **kwargs):
        if not data.get("user_id") and not data.get("email"):
            raise ValidationError(
                {"email": ["Kullanıcı ID veya e-posta adresinden biri zorunludur."]}
            )