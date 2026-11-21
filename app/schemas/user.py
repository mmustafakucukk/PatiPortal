import re
from marshmallow import ValidationError, fields, validate

from app.sabitler import KurumTuru, Rol
from app.schemas.base import TemelSema, telefon_dogrula
from app.schemas.ortak import Sema, mantiksal, metin, secim

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
        error_messages={"required": "Ad soyad zorunludur."},
    )
    email = fields.Email(
        required=True,
        validate=validate.Length(max=120),
        error_messages={"required": "E-posta zorunludur.", "invalid": "Geçerli bir e-posta adresi giriniz."},
    )
    telefon = fields.String(
        required=True,
        validate=telefon_dogrula,
        error_messages={"required": "Telefon numarası zorunludur."},
    )
    sifre = fields.String(
        required=True,
        validate=validate.Length(min=8, max=128, error="Şifre en az 8 karakter olmalıdır."),
        error_messages={"required": "Şifre zorunludur."},
    )
    rol = fields.String(
        load_default=Rol.GOREVLI.value,
        validate=validate.OneOf(GECERLI_ROLLER, error="Geçersiz rol seçimi."),
    )


class KullaniciGuncelleSemasi(Sema):
    ad_soyad = metin(100, en_az=2)
    telefon = fields.String(validate=telefon_dogrula)
    rol = secim(Rol)
    aktif = mantiksal()


class KurumFiltreSemasi(Sema):
    tur = secim(KurumTuru)
    aktif = mantiksal()


class KurumOlusturSemasi(Sema):
    ad = metin(150, zorunlu=True, en_az=2)
    tur = secim(KurumTuru, varsayilan=KurumTuru.BARINAK)
    adres = metin(500, en_az=5)
    telefon = fields.String(
        load_default=None,
        allow_none=True,
        validate=[validate.Length(max=20), kurum_telefon_dogrula],
    )
    email = fields.Email(
        load_default=None,
        allow_none=True,
        validate=validate.Length(max=120),
        error_messages={"invalid": "Geçerli bir e-posta adresi giriniz."},
    )


class KurumGuncelleSemasi(Sema):
    ad = metin(150, en_az=2)
    tur = secim(KurumTuru)
    adres = metin(500, en_az=5)
    telefon = fields.String(
        allow_none=True,
        validate=[validate.Length(max=20), kurum_telefon_dogrula],
    )
    email = fields.Email(
        allow_none=True,
        validate=validate.Length(max=120),
        error_messages={"invalid": "Geçerli bir e-posta adresi giriniz."},
    )
    aktif = mantiksal()


class KurumGorevliAtaSemasi(Sema):
    user_id = fields.Integer(
        required=True,
        strict=True,
        validate=validate.Range(min=1, error="Geçerli bir kullanıcı ID giriniz."),
        error_messages={"required": "Kullanıcı ID zorunludur.", "invalid": "Kullanıcı ID tam sayı olmalıdır."},
    )
    gorev_tanimi = metin(50, varsayilan="gorevli")