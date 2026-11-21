"""Bölüm 4 – acil ihtiyaç ve destek sözü şemaları."""

import re

from marshmallow import fields, post_load

from app.sabitler import Aciliyet, DestekDurumu, IhtiyacDurumu, IhtiyacTuru
from app.schemas.base import kvkk_onay_dogrula, telefon_dogrula
from app.schemas.ortak import BOS_OLAMAZ, ZORUNLU, Sema, metin, ondalik, secim, tam_sayi

EN_FAZLA_MIKTAR = 1_000_000


class IhtiyacFiltreSemasi(Sema):
    durum = secim(IhtiyacDurumu, varsayilan=IhtiyacDurumu.ACIK)
    kurum_id = tam_sayi(en_az=1)
    tur = secim(IhtiyacTuru)


class IhtiyacSemasi(Sema):
    """POST /api/needs · PUT /api/needs/<id> (kismi=True)."""
    kurum_id = tam_sayi(en_az=1)
    tur = secim(IhtiyacTuru, zorunlu=True)
    baslik = metin(100, zorunlu=True)
    aciklama = metin(1000)
    miktar = ondalik(zorunlu=True, buyuk=0, en_fazla=EN_FAZLA_MIKTAR)
    birim = metin(20, varsayilan="adet")
    aciliyet = secim(Aciliyet, varsayilan=Aciliyet.ORTA)


class DestekSemasi(Sema):
    """POST /api/needs/<id>/pledges – giriş yapmadan da kullanılabilir."""
    ad_soyad = metin(100, zorunlu=True, en_az=2)
    telefon = fields.String(
        required=True,
        validate=telefon_dogrula,
        error_messages={"required": ZORUNLU, "null": BOS_OLAMAZ},
    )
    miktar = ondalik(zorunlu=True, buyuk=0, en_fazla=EN_FAZLA_MIKTAR)
    aciklama = metin(500)
    kvkk_onay = fields.Boolean(
        required=True,
        validate=kvkk_onay_dogrula,
        error_messages={"required": "KVKK onayı zorunludur.", "null": "KVKK onayı zorunludur."},
    )

    @post_load
    def _telefonu_sadelestir(self, veri, **kwargs):
        veri["telefon"] = re.sub(r"[\s\-()]", "", veri["telefon"])
        return veri


class DestekDurumSemasi(Sema):
    durum = secim(DestekDurumu, zorunlu=True)
