"""Bölüm 4 – aşı karnesi ve aşı türü şemaları."""

from datetime import date

from app.schemas.ortak import Sema, metin, tam_sayi, tarih


class AsiSemasi(Sema):
    """POST /api/animals/<id>/vaccinations · PUT /api/vaccinations/<id> (kismi=True)."""
    asi_turu_id = tam_sayi(zorunlu=True, en_az=1)
    uygulama_tarihi = tarih(varsayilan=date.today, gelecek_olabilir=False)
    sonraki_tarih = tarih()
    uygulayan_kurum_id = tam_sayi(en_az=1)
    aciklama = metin(500)


class GecikmisAsiFiltreSemasi(Sema):
    kurum_id = tam_sayi(en_az=1)


class YaklasanAsiFiltreSemasi(GecikmisAsiFiltreSemasi):
    gun = tam_sayi(en_az=1, en_fazla=90, varsayilan=7)


class AsiTuruFiltreSemasi(Sema):
    hayvan_turu_id = tam_sayi(en_az=1)


class AsiTuruSemasi(Sema):
    ad = metin(50, zorunlu=True)
    aciklama = metin(500)
