"""
Sabit değer listeleri (enum'lar).

Veritabanında düz metin olarak saklanırlar ("barinakta", "kedi" gibi).
Hem modeller hem de doğrulama şemaları buradan okur, böylece
izin verilen değerler tek bir yerde tanımlı olur.
"""

from enum import StrEnum


class Rol(StrEnum):
    """
    API.md ile aynı: kayıt olan kullanıcının rolü 'ziyaretci'dir.
    Giriş yapmamış ziyaretçinin rolü yoktur (current_user anonimdir).
    app/utils/decorators.py içindeki ROL_* sabitleriyle birebir aynı olmalı.
    """
    ZIYARETCI = "ziyaretci"   # kayıtlı kullanıcı
    GOREVLI = "gorevli"       # barınak / klinik görevlisi
    ADMIN = "admin"           # sistem yöneticisi


class KurumTuru(StrEnum):
    BARINAK = "barinak"
    KLINIK = "klinik"


class Cinsiyet(StrEnum):
    ERKEK = "erkek"
    DISI = "disi"
    BILINMIYOR = "bilinmiyor"


class HayvanDurumu(StrEnum):
    BARINAKTA = "barinakta"
    TEDAVIDE = "tedavide"
    SAHIPLENDIRILDI = "sahiplendirildi"


class AsiDurumu(StrEnum):
    """Hesaplanan bir değerdir, veritabanında saklanmaz (bkz. asi_servisi.asi_durumu)."""
    TAMAMLANDI = "tamamlandi"    # sonraki doz yok ya da sonraki doz zaten yapılmış
    ZAMANINDA = "zamaninda"      # sonraki doza daha çok var
    YAKLASIYOR = "yaklasiyor"    # sonraki doz önümüzdeki günlerde
    GECIKTI = "gecikti"          # sonraki dozun tarihi geçmiş


class IhtiyacTuru(StrEnum):
    MAMA = "mama"
    ILAC = "ilac"
    MALZEME = "malzeme"
    DIGER = "diger"


class Aciliyet(StrEnum):
    DUSUK = "dusuk"
    ORTA = "orta"
    YUKSEK = "yuksek"


class IhtiyacDurumu(StrEnum):
    ACIK = "acik"
    KARSILANDI = "karsilandi"


class DestekDurumu(StrEnum):
    SOZ_VERILDI = "soz_verildi"
    TESLIM_EDILDI = "teslim_edildi"
    IPTAL = "iptal"


class BasvuruDurumu(StrEnum):
    BEKLEMEDE = "beklemede"
    ONAYLANDI = "onaylandi"
    REDDEDILDI = "reddedildi"


class RandevuDurumu(StrEnum):
    PLANLANDI = "planlandi"
    TAMAMLANDI = "tamamlandi"
    IPTAL = "iptal"


class Islem(StrEnum):
    """İşlem kayıtları tablosuna (islem_turu) yazılan Backend 2 işlem adları."""
    HAYVAN_EKLENDI = "hayvan_eklendi"
    HAYVAN_GUNCELLENDI = "hayvan_guncellendi"
    HAYVAN_DURUMU_DEGISTI = "hayvan_durumu_degisti"
    HAYVAN_SILINDI = "hayvan_silindi"
    FOTOGRAF_EKLENDI = "fotograf_eklendi"
    FOTOGRAF_SILINDI = "fotograf_silindi"
    ASI_EKLENDI = "asi_eklendi"
    ASI_GUNCELLENDI = "asi_guncellendi"
    ASI_SILINDI = "asi_silindi"
    IHTIYAC_EKLENDI = "ihtiyac_eklendi"
    IHTIYAC_GUNCELLENDI = "ihtiyac_guncellendi"
    IHTIYAC_KARSILANDI = "ihtiyac_karsilandi"
    IHTIYAC_SILINDI = "ihtiyac_silindi"
    DESTEK_VERILDI = "destek_verildi"
    DESTEK_DURUMU_DEGISTI = "destek_durumu_degisti"
    TUR_EKLENDI = "tur_eklendi"
    ZORUNLU_ASILAR_DEGISTI = "zorunlu_asilar_degisti"
