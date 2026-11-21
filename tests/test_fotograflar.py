import io
from pathlib import Path

from PIL import Image

from app.extensions import db
from app.models import HayvanFotografi
from tests.yardimcilar import resim_dosyasi


def _yukle(istemci, hayvan_id, *dosyalar):
    return istemci.post(
        f"/api/animals/{hayvan_id}/photos",
        data={"fotograflar": list(dosyalar)},
        content_type="multipart/form-data",
    )


def _resmi_indir(istemci, url):
    yanit = istemci.get(url)
    assert yanit.status_code == 200
    return Image.open(io.BytesIO(yanit.data))


def test_yukleme_iki_boyut_exifsiz_ilk_kapak(gorevli_istemci, ziyaretci, hayvan_ekle):
    hayvan_id = hayvan_ekle()
    yanit = _yukle(
        gorevli_istemci, hayvan_id,
        (resim_dosyasi(boyut=(1600, 900), exif_yon=6, gps=True), "telefon_konumlu.jpg"),
        (resim_dosyasi(bicim="PNG", boyut=(300, 200)), "ikinci.png"),
    )
    assert yanit.status_code == 201, yanit.json
    birinci, ikinci = yanit.json["veri"]
    assert birinci["kapak_mi"] is True and ikinci["kapak_mi"] is False
    assert "telefon_konumlu" not in birinci["url_buyuk"]  # kullanıcının dosya adı kullanılmaz

    buyuk = _resmi_indir(ziyaretci, birinci["url_buyuk"])
    assert buyuk.size == (675, 1200)       # 90° döndürülüp 1200 px'e küçültüldü
    assert len(buyuk.getexif()) == 0       # konum dahil EXIF silindi
    assert max(_resmi_indir(ziyaretci, birinci["url_kucuk"]).size) == 400
    assert _resmi_indir(ziyaretci, ikinci["url_buyuk"]).size == (300, 200)  # küçük resim büyütülmez


def test_sonraki_yuklemede_kapak_degismez(gorevli_istemci, hayvan_ekle):
    hayvan_id = hayvan_ekle()
    _yukle(gorevli_istemci, hayvan_id, (resim_dosyasi(), "a.jpg"))
    yeni = _yukle(gorevli_istemci, hayvan_id, (resim_dosyasi(), "b.jpg")).json["veri"][0]
    assert yeni["kapak_mi"] is False
    assert yeni["sira"] == 1


def test_hatali_dosya_varsa_hicbiri_kaydedilmez(app, gorevli_istemci, hayvan_ekle):
    hayvan_id = hayvan_ekle()
    yanit = _yukle(
        gorevli_istemci, hayvan_id,
        (resim_dosyasi(), "iyi.jpg"),
        (io.BytesIO(b"bu bir resim degil"), "kotu.jpg"),
    )
    assert yanit.status_code == 400
    assert "kotu.jpg" in yanit.json["alanlar"]["fotograflar"][0]

    with app.app_context():
        assert db.session.scalar(db.select(db.func.count(HayvanFotografi.id))) == 0
    klasor = Path(app.config["UPLOAD_KLASORU"]) / "hayvanlar"
    assert not klasor.exists() or list(klasor.iterdir()) == []


def test_desteklenmeyen_bicim_ve_boyut_siniri(app, gorevli_istemci, hayvan_ekle):
    hayvan_id = hayvan_ekle()
    assert _yukle(gorevli_istemci, hayvan_id, (resim_dosyasi(bicim="GIF"), "a.gif")).status_code == 400

    app.config["FOTO_MAKS_BAYT"] = 1000
    yanit = _yukle(gorevli_istemci, hayvan_id, (resim_dosyasi(), "buyuk.jpg"))
    assert yanit.status_code == 400


def test_dosya_secilmemis(gorevli_istemci, hayvan_ekle):
    hayvan_id = hayvan_ekle()
    yanit = gorevli_istemci.post(f"/api/animals/{hayvan_id}/photos", data={}, content_type="multipart/form-data")
    assert yanit.status_code == 400 and "fotograflar" in yanit.json["alanlar"]


def test_kapak_degistirme_ve_kapak_silinince_devir(gorevli_istemci, ziyaretci, hayvan_ekle):
    hayvan_id = hayvan_ekle()
    fotograflar = _yukle(gorevli_istemci, hayvan_id, *[(resim_dosyasi(), f"{i}.jpg") for i in range(3)]).json["veri"]
    ilk, _, son = [f["id"] for f in fotograflar]

    assert gorevli_istemci.put(f"/api/photos/{son}/kapak").status_code == 200
    detay = ziyaretci.get(f"/api/animals/{hayvan_id}").json["veri"]
    assert detay["kapak_fotografi"]["id"] == son
    assert sum(f["kapak_mi"] for f in detay["fotograflar"]) == 1

    assert gorevli_istemci.delete(f"/api/photos/{son}").status_code == 200
    detay = ziyaretci.get(f"/api/animals/{hayvan_id}").json["veri"]
    assert len(detay["fotograflar"]) == 2
    assert detay["kapak_fotografi"]["id"] == ilk


def test_yetkisiz_yukleme(ziyaretci, diger_gorevli_istemci, hayvan_ekle):
    hayvan_id = hayvan_ekle()
    assert _yukle(ziyaretci, hayvan_id, (resim_dosyasi(), "a.jpg")).status_code == 401
    assert _yukle(diger_gorevli_istemci, hayvan_id, (resim_dosyasi(), "a.jpg")).status_code == 403


def test_klasor_disina_cikilamaz(ziyaretci):
    assert ziyaretci.get("/uploads/hayvanlar/../../config.py").status_code == 404
