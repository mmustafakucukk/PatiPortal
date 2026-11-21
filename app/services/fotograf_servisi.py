"""
Hayvan fotoğrafları: yükleme, kapak seçme, silme.
Dosyaların kendisiyle dosyalar.py uğraşır; burada kayıtlar ve kurallar var.
"""

from flask import current_app

from app.extensions import db
from app.models import HayvanFotografi
from app.sabitler import Islem
from app.services import dosyalar
from app.services.kurum_yetkisi import kurum_yetkisi_kontrol
from app.services.ortak import logla
from app.utils.hatalar import ApiHatasi


def fotograflari_ekle(hayvan, yuklenenler):
    """
    Önce TÜM dosyalar kontrol edilir; biri bile hatalıysa hiçbiri kaydedilmez.
    Hayvanın kapak fotoğrafı yoksa ilk yüklenen kapak olur.
    """
    kurum_yetkisi_kontrol(hayvan.kurum_id)

    if not yuklenenler:
        raise ApiHatasi("Yüklenen dosyada hata var.", 400, {"fotograflar": ["En az bir fotoğraf seçin."]})
    maks_adet = current_app.config["FOTO_MAKS_ADET"]
    if len(yuklenenler) > maks_adet:
        raise ApiHatasi("Yüklenen dosyada hata var.", 400,
                        {"fotograflar": [f"Tek seferde en fazla {maks_adet} fotoğraf yükleyebilirsiniz."]})

    resimler = [dosyalar.resmi_ac(dosya) for dosya in yuklenenler]

    kaydedilen_dosyalar = []
    try:
        for resim in resimler:
            kaydedilen_dosyalar.append(dosyalar.hayvan_fotografi_kaydet(resim))

        kapak_var = any(f.kapak_mi for f in hayvan.fotograflar)
        sonraki_sira = max((f.sira for f in hayvan.fotograflar), default=-1) + 1
        yeni_fotograflar = []
        for i, kok in enumerate(kaydedilen_dosyalar):
            foto = HayvanFotografi(dosya_adi=kok, sira=sonraki_sira + i, kapak_mi=(not kapak_var and i == 0))
            hayvan.fotograflar.append(foto)
            yeni_fotograflar.append(foto)

        logla(Islem.FOTOGRAF_EKLENDI, hayvan, f"{hayvan.ad}: {len(yeni_fotograflar)} fotoğraf eklendi")
        db.session.commit()
    except Exception:
        # Veritabanına yazılamadıysa diske yazılan dosyalar da geri alınır.
        db.session.rollback()
        for kok in kaydedilen_dosyalar:
            dosyalar.hayvan_fotografi_dosyalarini_sil(kok)
        raise
    return yeni_fotograflar


def kapak_yap(foto):
    hayvan = foto.hayvan
    kurum_yetkisi_kontrol(hayvan.kurum_id)
    for diger in hayvan.fotograflar:
        diger.kapak_mi = diger.id == foto.id
    db.session.commit()
    return foto


def fotograf_sil(foto):
    """Silinen kapak ise sıradaki ilk fotoğraf kapak olur."""
    hayvan = foto.hayvan
    kurum_yetkisi_kontrol(hayvan.kurum_id)
    kok, kapakti = foto.dosya_adi, foto.kapak_mi

    hayvan.fotograflar.remove(foto)  # delete-orphan: kayıt silinir
    if kapakti and hayvan.fotograflar:
        hayvan.fotograflar[0].kapak_mi = True

    logla(Islem.FOTOGRAF_SILINDI, hayvan, f"{hayvan.ad}: fotoğraf #{foto.id} silindi")
    db.session.commit()
    dosyalar.hayvan_fotografi_dosyalarini_sil(kok)
