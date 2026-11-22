from marshmallow import fields, validate
from app.schemas.base import TemelSema, telefon_dogrula, kvkk_onay_dogrula


class KayitSemasi(TemelSema):
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
            "invalid": "Geçerli bir e-posta adresi giriniz.",
            "null": "E-posta boş bırakılamaz.",
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
    kvkk_onay = fields.Boolean(
        required=True,
        validate=kvkk_onay_dogrula,
        error_messages={
            "required": "KVKK onayı zorunludur.",
            "null": "KVKK onayı zorunludur.",
            "invalid": "Geçersiz onay değeri.",
        },
    )


class GirisSemasi(TemelSema):
    email = fields.Email(
        required=True,
        error_messages={
            "required": "E-posta zorunludur.",
            "null": "E-posta boş bırakılamaz.",
            "invalid": "Geçerli bir e-posta adresi giriniz.",
        },
    )
    sifre = fields.String(
        required=True,
        validate=validate.Length(min=1, error="Şifre boş bırakılamaz."),
        error_messages={"required": "Şifre zorunludur.", "null": "Şifre boş bırakılamaz."},
    )


class SifreDegistirSemasi(TemelSema):
    mevcut_sifre = fields.String(
        required=True,
        validate=validate.Length(min=1, error="Mevcut şifre boş bırakılamaz."),
        error_messages={"required": "Mevcut şifre zorunludur.", "null": "Mevcut şifre boş bırakılamaz."},
    )
    yeni_sifre = fields.String(
        required=True,
        validate=validate.Length(min=8, max=128, error="Yeni şifre en az 8 karakter olmalıdır."),
        error_messages={"required": "Yeni şifre zorunludur.", "null": "Yeni şifre boş bırakılamaz."},
    )