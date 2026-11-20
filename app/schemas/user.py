from marshmallow import fields, validate
from app.schemas.base import TemelSema, telefon_dogrula

GECERLI_ROLLER = ("admin", "gorevli", "ziyaretci")


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
        load_default="gorevli",
        validate=validate.OneOf(GECERLI_ROLLER, error="Geçersiz rol seçimi."),
    )


class KullaniciGuncelleSemasi(TemelSema):
    ad_soyad = fields.String(
        validate=validate.Length(min=2, max=100, error="Ad soyad 2 ile 100 karakter arasında olmalıdır.")
    )
    telefon = fields.String(validate=telefon_dogrula)
    rol = fields.String(validate=validate.OneOf(GECERLI_ROLLER, error="Geçersiz rol seçimi."))
    aktif = fields.Boolean(error_messages={"invalid": "Aktif alanı true veya false olmalıdır."})


class KurumOlusturSemasi(TemelSema):
    ad = fields.String(
        required=True,
        validate=validate.Length(min=2, max=150, error="Kurum adı 2 ile 150 karakter arasında olmalıdır."),
        error_messages={"required": "Kurum adı zorunludur."},
    )
    adres = fields.String(
        required=True,
        validate=validate.Length(min=5, max=500, error="Adres en az 5 karakter olmalıdır."),
        error_messages={"required": "Adres zorunludur."},
    )
    telefon = fields.String(
        required=True,
        validate=telefon_dogrula,
        error_messages={"required": "Telefon numarası zorunludur."},
    )
    email = fields.Email(
        load_default=None,
        allow_none=True,
        error_messages={"invalid": "Geçerli bir e-posta adresi giriniz."},
    )


class KurumGuncelleSemasi(TemelSema):
    ad = fields.String(validate=validate.Length(min=2, max=150))
    adres = fields.String(validate=validate.Length(min=5, max=500))
    telefon = fields.String(validate=telefon_dogrula)
    email = fields.Email(allow_none=True, error_messages={"invalid": "Geçerli bir e-posta adresi giriniz."})


class KurumGorevliAtaSemasi(TemelSema):
    user_id = fields.Integer(
        required=True,
        strict=True,
        validate=validate.Range(min=1, error="Geçerli bir kullanıcı ID giriniz."),
        error_messages={"required": "Kullanıcı ID zorunludur.", "invalid": "Kullanıcı ID tam sayı olmalıdır."},
    )
    gorev_tanimi = fields.String(
        load_default="gorevli",
        validate=validate.Length(max=50),
    )