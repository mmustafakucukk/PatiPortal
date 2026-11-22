"""
Sabit değer listeleri (enum'lar).

Veritabanında düz metin olarak saklanılırlar ("barinakta", "kedi" gibi).
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
    REZERVE = "rezerve"
    SAHIPLENDIRILDI = "sahiplendirildi"


class HayvanSiralama(StrEnum):
    """GET /api/animals?siralama=..."""
    YENI = "yeni"      # en son eklenen önce (varsayılan)
    ESKI = "eski"      # en uzun süredir bekleyen önce
    AD = "ad"          # ada göre A→Z
    GENC = "genc"      # en genç önce (doğum tarihi bilinmeyenler sonda)
    YASLI = "yasli"    # en yaşlı önce (doğum tarihi bilinmeyenler sonda)


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
    IPTAL = "iptal"


class RandevuDurumu(StrEnum):
    PLANLANDI = "planlandi"
    TAMAMLANDI = "tamamlandi"
    IPTAL = "iptal"
    GELMEDI = "gelmedi"


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
    DESTEK_IPTAL_EDILDI = "destek_iptal_edildi"
    TUR_EKLENDI = "tur_eklendi"          # hayvan türü veya aşı türü (hedef_tablo'dan anlaşılır)
    TUR_GUNCELLENDI = "tur_guncellendi"
    TUR_SILINDI = "tur_silindi"
    ZORUNLU_ASILAR_DEGISTI = "zorunlu_asilar_degisti"

    # Bölüm 3 (Abdulhafız): kimlik doğrulama, kullanıcı/kurum, başvuru ve teslimat
    KULLANICI_KAYIT_OLDU = "kullanici_kayit_oldu"
    KULLANICI_GIRIS_YAPTI = "kullanici_giris_yapti"
    KULLANICI_OLUSTURULDU = "kullanici_olusturuldu"
    KULLANICI_GUNCELLENDI = "kullanici_guncellendi"
    KULLANICI_SILINDI = "kullanici_silindi"
    PROFIL_GUNCELLENDI = "profil_guncellendi"
    SIFRE_DEGISTIRILDI = "sifre_degistirildi"
    KURUM_EKLENDI = "kurum_eklendi"
    KURUM_GUNCELLENDI = "kurum_guncellendi"
    KURUM_SILINDI = "kurum_silindi"
    GOREVLI_ATANDI = "gorevli_atandi"
    GOREVLI_CIKARILDI = "gorevli_cikarildi"
    BASVURU_OLUSTURULDU = "basvuru_olusturuldu"
    BASVURU_ONAYLANDI = "basvuru_onaylandi"
    BASVURU_REDDEDILDI = "basvuru_reddedildi"
    BASVURU_IPTAL_EDILDI = "basvuru_iptal_edildi"
    TESLIM_SAATI_EKLENDI = "teslim_saati_eklendi"
    TESLIM_SAATI_SILINDI = "teslim_saati_silindi"
    RANDEVU_OLUSTURULDU = "randevu_olusturuldu"
    RANDEVU_IPTAL_EDILDI = "randevu_iptal_edildi"
    RANDEVU_GELMEDI = "randevu_gelmedi"
    SAHIPLENDIRME_TAMAMLANDI = "sahiplendirme_tamamlandi"