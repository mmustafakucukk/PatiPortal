"""
Fotoğraf ve belge dosyalarının diske kaydedilmesi / silinmesi.

Hayvan fotoğrafı yüklenirken:
  - Sadece JPG, PNG, WEBP kabul edilir, en fazla 10 MB (config: FOTO_MAKS_BAYT).
  - Dosya adı rastgele üretilir; kullanıcının verdiği ad kullanılmaz.
  - Telefonun EXIF yön bilgisine göre fotoğraf düzeltilir, sonra EXIF (konum dahil) atılır.
  - İki boyut kaydedilir: büyük (≤1200 px, detay sayfası) ve küçük (≤400 px, kartlar). Format WEBP.

Bu modül veritabanına dokunmaz; sadece diskle uğraşır.
Ayarlar (boyut sınırları, klasör) config.py → BaseConfig içinde.
"""

import secrets
from pathlib import Path

from flask import current_app
from PIL import Image, ImageOps, UnidentifiedImageError

from app.models import HayvanFotografi
from app.utils.hatalar import ApiHatasi

RESIM_UZANTILARI = {".jpg", ".jpeg", ".png", ".webp"}
RESIM_FORMATLARI = {"JPEG", "PNG", "WEBP"}
BELGE_UZANTILARI = RESIM_UZANTILARI | {".pdf"}

# Çok büyük piksel sayılı (sıkıştırma bombası) dosyaları reddet: ~50 megapiksel
Image.MAX_IMAGE_PIXELS = 50_000_000


def klasor(alt_klasor):
    yol = Path(current_app.config["UPLOAD_KLASORU"]) / alt_klasor
    yol.mkdir(parents=True, exist_ok=True)
    return yol


def _gecersiz(alan, mesaj):
    return ApiHatasi("Yüklenen dosyada hata var.", 400, {alan: [mesaj]})


def _boyut_kontrol(dosya, maks_bayt, alan):
    dosya.stream.seek(0, 2)
    boyut = dosya.stream.tell()
    dosya.stream.seek(0)
    if boyut == 0:
        raise _gecersiz(alan, f"{dosya.filename}: dosya boş.")
    if boyut > maks_bayt:
        raise _gecersiz(alan, f"{dosya.filename}: en fazla {maks_bayt // (1024 * 1024)} MB olabilir.")


def resmi_ac(dosya, alan="fotograflar"):
    """Yüklenen dosyayı kontrol edip Pillow resmi olarak açar. Sorun varsa ApiHatasi fırlatır."""
    uzanti = Path(dosya.filename or "").suffix.lower()
    if uzanti not in RESIM_UZANTILARI:
        raise _gecersiz(alan, f"{dosya.filename}: sadece JPG, PNG veya WEBP yükleyebilirsiniz.")
    _boyut_kontrol(dosya, current_app.config["FOTO_MAKS_BAYT"], alan)
    try:
        resim = Image.open(dosya.stream)
        resim.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError):
        raise _gecersiz(alan, f"{dosya.filename}: dosya okunamadı veya bozuk.") from None
    # Uzantı .jpg olup içeriği başka bir şey olan dosyalara karşı asıl biçime bak
    if resim.format not in RESIM_FORMATLARI:
        raise _gecersiz(alan, f"{dosya.filename}: sadece JPG, PNG veya WEBP yükleyebilirsiniz.")
    return resim


def _temizle(resim):
    """Yönü düzeltir ve RGB'ye çevirir. Yeni resim EXIF taşımaz (kaydederken exif verilmiyor)."""
    resim = ImageOps.exif_transpose(resim)
    if resim.mode in ("RGBA", "LA") or (resim.mode == "P" and "transparency" in resim.info):
        resim = resim.convert("RGBA")
        zemin = Image.new("RGB", resim.size, (255, 255, 255))
        zemin.paste(resim, mask=resim.getchannel("A"))
        return zemin
    return resim.convert("RGB")


def hayvan_fotografi_kaydet(resim):
    """Resmi büyük ve küçük boyutta kaydeder, rastgele kök adı döndürür."""
    resim = _temizle(resim)
    kok = secrets.token_hex(16)
    hedef = klasor("hayvanlar")
    boyutlar = {
        "buyuk": current_app.config["FOTO_BUYUK_PIKSEL"],
        "kucuk": current_app.config["FOTO_KUCUK_PIKSEL"],
    }
    for boyut_adi, piksel in boyutlar.items():
        kopya = resim.copy()
        kopya.thumbnail((piksel, piksel), Image.Resampling.LANCZOS)  # büyütmez, sadece küçültür
        kopya.save(hedef / HayvanFotografi.dosya_ismi(kok, boyut_adi), "WEBP", quality=80, method=4)
    return kok


def hayvan_fotografi_dosyalarini_sil(kok):
    hedef = klasor("hayvanlar")
    for boyut_adi in HayvanFotografi.BOYUTLAR:
        (hedef / HayvanFotografi.dosya_ismi(kok, boyut_adi)).unlink(missing_ok=True)


def belge_kaydet(dosya, alan="belge"):
    """Aşı belgesini (PDF veya resim) kaydeder, dosya adını döndürür."""
    uzanti = Path(dosya.filename or "").suffix.lower()
    if uzanti not in BELGE_UZANTILARI:
        raise _gecersiz(alan, f"{dosya.filename}: sadece PDF, JPG, PNG veya WEBP yükleyebilirsiniz.")

    hedef = klasor("belgeler")
    if uzanti == ".pdf":
        _boyut_kontrol(dosya, current_app.config["BELGE_MAKS_BAYT"], alan)
        if dosya.stream.read(5) != b"%PDF-":
            raise _gecersiz(alan, f"{dosya.filename}: geçerli bir PDF değil.")
        dosya.stream.seek(0)
        ad = f"{secrets.token_hex(16)}.pdf"
        dosya.save(hedef / ad)
        return ad

    resim = _temizle(resmi_ac(dosya, alan))  # resim belgeler de EXIF'ten temizlenir
    resim.thumbnail((2000, 2000), Image.Resampling.LANCZOS)
    ad = f"{secrets.token_hex(16)}.jpg"
    resim.save(hedef / ad, "JPEG", quality=88)
    return ad


def belge_sil(dosya_adi):
    if dosya_adi:
        (klasor("belgeler") / dosya_adi).unlink(missing_ok=True)
