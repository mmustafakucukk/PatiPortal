"""Testlerde kullanılan küçük yardımcılar."""

import io

from PIL import Image


def resim_dosyasi(bicim="JPEG", boyut=(1600, 900), exif_yon=None, gps=False):
    """Test için bellekte resim üretir. exif_yon=6 → telefon 90° döndürülmüş çekmiş gibi."""
    resim = Image.new("RGB", boyut, (255, 140, 0))
    tampon = io.BytesIO()
    secenekler = {}
    if exif_yon or gps:
        exif = Image.Exif()
        if exif_yon:
            exif[0x0112] = exif_yon
        if gps:
            gps_ifd = exif.get_ifd(0x8825)
            gps_ifd[1] = "N"
            gps_ifd[2] = (37.0, 52.0, 0.0)
        secenekler["exif"] = exif
    resim.save(tampon, bicim, **secenekler)
    tampon.seek(0)
    return tampon

