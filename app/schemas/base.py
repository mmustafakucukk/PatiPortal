import re
from marshmallow import Schema, EXCLUDE, ValidationError, validate
from app.utils.responses import hata_yaniti

# Türkiye telefon numarası için temel kontrol (ör. 05551234567 veya +905551234567)
TELEFON_REGEX = re.compile(r"^(\+90|0)?5\d{9}$")


def telefon_dogrula(deger):
    temiz = re.sub(r"[\s\-()]", "", deger or "")
    if not TELEFON_REGEX.match(temiz):
        raise ValidationError("Geçerli bir cep telefonu numarası giriniz (ör. 05551234567).")


def kvkk_onay_dogrula(deger):
    if deger is not True:
        raise ValidationError("Devam etmek için KVKK aydınlatma metnini onaylamanız gerekiyor.")


class TemelSema(Schema):
    class Meta:
        unknown = EXCLUDE


def veriyi_dogrula(sema_sinifi, ham_veri):
    """
    Gelen JSON verisini verilen Marshmallow şemasıyla doğrular.
    Dönüş: (temiz_veri, hata_yaniti_tuple)
    """
    if not isinstance(ham_veri, dict):
        return None, hata_yaniti("Geçerli bir JSON nesnesi gönderilmelidir.", 400)

    sema = sema_sinifi()
    try:
        temiz_veri = sema.load(ham_veri)
        return temiz_veri, None
    except ValidationError as err:
        return None, hata_yaniti(
            "Girilen bilgilerde doğrulama hatası var.",
            400,
            alanlar=err.messages,
        )