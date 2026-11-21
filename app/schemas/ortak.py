"""
Bölüm 4 şemalarının ortak parçaları.

- Sema: TemelSema'yı genişletir; metinlerin baş/son boşluklarını siler, boş metni null sayar.
- Alan fabrikaları (metin, tam_sayi, ...): Türkçe hata mesajlarıyla hazır alanlar.
  Zorunlu olmayan alanlar null kabul eder (değeri silmek için).
- dogrula(): veriyi şemayla doğrular, hata varsa ApiHatasi fırlatır.

Güncelleme (PUT) için ayrı şema yazılmaz; aynı şema kismi=True ile kullanılır:
zorunlu alanlar gönderilmeyebilir ama null yapılamaz, varsayılan değerler uygulanmaz.
"""

from datetime import date

from marshmallow import ValidationError, fields, pre_load, validate

from app.schemas.base import TemelSema
from app.utils.hatalar import DOGRULAMA_HATASI, ApiHatasi

ZORUNLU = "Bu alan zorunludur."
BOS_OLAMAZ = "Bu alan boş bırakılamaz."


class Sema(TemelSema):
    @pre_load
    def _bosluklari_temizle(self, veri, **kwargs):
        if not isinstance(veri, dict):
            return veri
        return {
            anahtar: (deger.strip() or None) if isinstance(deger, str) else deger
            for anahtar, deger in veri.items()
        }


def _mesajlar(gecersiz):
    return {"required": ZORUNLU, "null": BOS_OLAMAZ, "invalid": gecersiz}


def _secenekler(zorunlu, varsayilan):
    secenek = {"required": zorunlu, "allow_none": not zorunlu and varsayilan is None}
    if varsayilan is not None:
        secenek["load_default"] = varsayilan
    return secenek


def _aralik(en_az, en_fazla, en_az_dahil=True):
    if en_az is None and en_fazla is None:
        return []
    if en_az is not None and en_fazla is not None:
        mesaj = f"{en_az} ile {en_fazla} arasında olmalıdır."
    elif en_az is not None:
        mesaj = f"En az {en_az} olmalıdır." if en_az_dahil else f"{en_az} değerinden büyük olmalıdır."
    else:
        mesaj = f"En fazla {en_fazla} olabilir."
    return [validate.Range(min=en_az, max=en_fazla, min_inclusive=en_az_dahil, error=mesaj)]


# ------------------------------------------------------------------ Alan fabrikaları
def metin(en_fazla, zorunlu=False, en_az=1, varsayilan=None):
    mesaj = f"En fazla {en_fazla} karakter olabilir." if en_az <= 1 else \
        f"{en_az} ile {en_fazla} karakter arasında olmalıdır."
    return fields.String(
        validate=validate.Length(min=en_az, max=en_fazla, error=mesaj),
        error_messages=_mesajlar("Metin olmalıdır."),
        **_secenekler(zorunlu, varsayilan),
    )


def tam_sayi(zorunlu=False, en_az=None, en_fazla=None, varsayilan=None):
    return fields.Integer(
        validate=_aralik(en_az, en_fazla),
        error_messages=_mesajlar("Tam sayı olmalıdır."),
        **_secenekler(zorunlu, varsayilan),
    )


def ondalik(zorunlu=False, buyuk=None, en_fazla=None):
    """`buyuk`: değer bundan BÜYÜK olmalı (eşit olamaz). Miktarlar için buyuk=0."""
    return fields.Float(
        allow_nan=False,
        validate=_aralik(buyuk, en_fazla, en_az_dahil=False),
        error_messages=_mesajlar("Sayı olmalıdır."),
        **_secenekler(zorunlu, None),
    )


def mantiksal(zorunlu=False, varsayilan=None):
    return fields.Boolean(
        error_messages=_mesajlar("true veya false olmalıdır."),
        **_secenekler(zorunlu, varsayilan),
    )


def secim(enum_sinifi, zorunlu=False, varsayilan=None):
    degerler = [uye.value for uye in enum_sinifi]
    return fields.String(
        validate=validate.OneOf(degerler, error=f"Geçerli değerler: {', '.join(degerler)}."),
        error_messages=_mesajlar("Metin olmalıdır."),
        **_secenekler(zorunlu, varsayilan.value if varsayilan is not None else None),
    )


def _gecmis_tarih(tarih):
    if tarih > date.today():
        raise ValidationError("Gelecekteki bir tarih girilemez.")


def tarih(zorunlu=False, varsayilan=None, gelecek_olabilir=True):
    return fields.Date(
        validate=[] if gelecek_olabilir else [_gecmis_tarih],
        error_messages=_mesajlar("Tarih YYYY-AA-GG biçiminde olmalıdır."),
        **_secenekler(zorunlu, varsayilan),
    )


# ------------------------------------------------------------------ Doğrulama
def dogrula(sema_sinifi, ham_veri, kismi=False):
    """
    Geçerliyse temiz veriyi (dict) döndürür. Gönderilmeyen isteğe bağlı alanlar dict'te yer almaz.
    Hatalıysa ApiHatasi(400) fırlatır: {"alanlar": {"ad": ["Bu alan zorunludur."]}}
    """
    if ham_veri is None:
        ham_veri = {}
    if not isinstance(ham_veri, dict):
        raise ApiHatasi("Geçerli bir JSON nesnesi gönderilmelidir.", 400)
    try:
        return sema_sinifi().load(ham_veri, partial=kismi)
    except ValidationError as hata:
        raise ApiHatasi(DOGRULAMA_HATASI, 400, hata.messages) from None


def sorgu_parametreleri(args):
    """request.args → dict; boş bırakılan parametreler (?tur_id=) yok sayılır."""
    return {anahtar: deger for anahtar, deger in args.items() if deger.strip()}
