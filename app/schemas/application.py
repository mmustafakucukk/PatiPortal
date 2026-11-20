from marshmallow import fields, validate, validates_schema, ValidationError
from app.schemas.base import TemelSema, kvkk_onay_dogrula


class BasvuruOlusturSemasi(TemelSema):
    animal_id = fields.Integer(
        required=True,
        strict=True,
        validate=validate.Range(min=1, error="Geçerli bir hayvan ID giriniz."),
        error_messages={"required": "Hayvan seçimi zorunludur."},
    )
    ev_tipi = fields.String(
        required=True,
        validate=validate.Length(min=2, max=100, error="Ev tipi bilgisi 2 ile 100 karakter arasında olmalıdır."),
        error_messages={"required": "Ev tipi zorunludur."},
    )
    onceki_deneyim = fields.String(
        load_default="",
        validate=validate.Length(max=1000, error="Önceki deneyim en fazla 1000 karakter olabilir."),
    )
    aciklama = fields.String(
        required=True,
        validate=validate.Length(min=10, max=2000, error="Sahiplenme nedeni en az 10 karakter olmalıdır."),
        error_messages={"required": "Sahiplenme nedeni zorunludur."},
    )
    kvkk_onay = fields.Boolean(
        required=True,
        validate=kvkk_onay_dogrula,
        error_messages={"required": "KVKK onayı zorunludur."},
    )


class BasvuruReddetSemasi(TemelSema):
    degerlendirme_notu = fields.String(
        load_default="",
        validate=validate.Length(max=1000, error="Değerlendirme notu en fazla 1000 karakter olabilir."),
    )


class TeslimSaatiOlusturSemasi(TemelSema):
    tarih = fields.Date(
        required=True,
        error_messages={"required": "Tarih zorunludur.", "invalid": "Tarih YYYY-AA-GG formatında olmalıdır."},
    )
    baslangic_saati = fields.Time(
        required=True,
        error_messages={"required": "Başlangıç saati zorunludur.", "invalid": "Saat SS:DD formatında olmalıdır."},
    )
    bitis_saati = fields.Time(
        required=True,
        error_messages={"required": "Bitiş saati zorunludur.", "invalid": "Saat SS:DD formatında olmalıdır."},
    )

    @validates_schema
    def saat_araligi_dogrula(self, data, **kwargs):
        if data["bitis_saati"] <= data["baslangic_saati"]:
            raise ValidationError(
                {"bitis_saati": ["Bitiş saati başlangıç saatinden sonra olmalıdır."]}
            )


class RandevuOlusturSemasi(TemelSema):
    application_id = fields.Integer(
        required=True,
        strict=True,
        validate=validate.Range(min=1),
        error_messages={"required": "Başvuru ID zorunludur."},
    )
    slot_id = fields.Integer(
        required=True,
        strict=True,
        validate=validate.Range(min=1),
        error_messages={"required": "Teslim alma saati seçimi zorunludur."},
    )
    not_metni = fields.String(
        load_default="",
        validate=validate.Length(max=500),
    )


class SahiplendirmeTamamlaSemasi(TemelSema):
    application_id = fields.Integer(
        required=True,
        strict=True,
        validate=validate.Range(min=1),
        error_messages={"required": "Başvuru ID zorunludur."},
    )
    teslim_notu = fields.String(
        load_default="",
        validate=validate.Length(max=1000),
    )