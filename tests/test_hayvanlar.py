from datetime import date, timedelta
from pathlib import Path

from app.extensions import db
from app.models import Hayvan, HayvanFotografi, IslemKaydi, Kurum, SahiplendirmeBasvurusu
from app.sabitler import Cinsiyet, HayvanDurumu, Islem
from tests.yardimcilar import resim_dosyasi


def _adlar(istemci, sorgu=""):
    yanit = istemci.get(f"/api/animals?limit=50&{sorgu}")
    assert yanit.status_code == 200, yanit.json
    return sorted(h["ad"] for h in yanit.json["veri"]["kayitlar"])


# ------------------------------------------------------------------ Listeleme
def test_ziyaretci_sadece_barinaktakileri_gorur(ziyaretci, hayvan_ekle):
    hayvan_ekle(ad="Pamuk")
    hayvan_ekle(ad="Boncuk", durum=HayvanDurumu.TEDAVIDE)
    hayvan_ekle(ad="Mırmır", durum=HayvanDurumu.SAHIPLENDIRILDI)

    assert _adlar(ziyaretci) == ["Pamuk"]
    assert _adlar(ziyaretci, "durum=tedavide") == ["Pamuk"]  # halk durum filtresini kullanamaz


def test_gorevli_tum_durumlari_gorebilir(gorevli_istemci, hayvan_ekle):
    hayvan_ekle(ad="Pamuk")
    hayvan_ekle(ad="Boncuk", durum=HayvanDurumu.TEDAVIDE)

    assert _adlar(gorevli_istemci) == ["Boncuk", "Pamuk"]
    assert _adlar(gorevli_istemci, "durum=tedavide") == ["Boncuk"]


def test_filtreler(ziyaretci, hayvan_ekle, veri):
    hayvan_ekle(ad="Pamuk", cinsiyet=Cinsiyet.DISI, kisirlastirildi=True)
    hayvan_ekle(ad="Karabaş", tur_id=veri.kopek_id, cinsiyet=Cinsiyet.ERKEK, cins="Kangal")

    assert _adlar(ziyaretci, f"tur_id={veri.kopek_id}") == ["Karabaş"]
    assert _adlar(ziyaretci, "cinsiyet=disi") == ["Pamuk"]
    assert _adlar(ziyaretci, "kisir=true") == ["Pamuk"]
    assert _adlar(ziyaretci, "arama=kang") == ["Karabaş"]
    assert _adlar(ziyaretci, "arama=pam") == ["Pamuk"]


def test_yas_filtresi_ve_bilinmeyen_yas(ziyaretci, hayvan_ekle):
    bugun = date.today()
    hayvan_ekle(ad="Yavru", dogum_tarihi=bugun - timedelta(days=100))
    hayvan_ekle(ad="Yetiskin", dogum_tarihi=bugun - timedelta(days=365 * 3 + 10))
    hayvan_ekle(ad="Bilinmeyen")

    assert _adlar(ziyaretci, "yas_max=0") == ["Yavru"]
    assert _adlar(ziyaretci, "yas_min=2") == ["Yetiskin"]
    assert _adlar(ziyaretci, "yas_min=1&yas_max=3") == ["Yetiskin"]

    kayitlar = {h["ad"]: h for h in ziyaretci.get("/api/animals").json["veri"]["kayitlar"]}
    assert kayitlar["Bilinmeyen"]["yas"] is None
    assert kayitlar["Bilinmeyen"]["yas_metni"] == "Bilinmiyor"
    assert kayitlar["Yavru"]["yas_metni"].endswith("aylık")
    assert kayitlar["Yetiskin"]["yas"] == 3


def test_sayfalama(ziyaretci, hayvan_ekle):
    for i in range(5):
        hayvan_ekle(ad=f"Hayvan {i}")

    veri = ziyaretci.get("/api/animals?limit=2&sayfa=3").json["veri"]
    assert len(veri["kayitlar"]) == 1
    assert veri["sayfalama"] == {"sayfa": 3, "limit": 2, "toplam": 5, "sayfa_sayisi": 3}


def test_gecersiz_filtre_400(ziyaretci):
    yanit = ziyaretci.get("/api/animals?limit=abc&cinsiyet=kiz")
    assert yanit.status_code == 400
    assert set(yanit.json["alanlar"]) == {"limit", "cinsiyet"}


def test_detay_ve_bulunamadi(ziyaretci, hayvan_ekle):
    hayvan_id = hayvan_ekle(ad="Pamuk", karakter_notu="Sakin")

    detay = ziyaretci.get(f"/api/animals/{hayvan_id}").json["veri"]
    assert detay["ad"] == "Pamuk"
    assert detay["karakter_notu"] == "Sakin"
    assert detay["fotograflar"] == [] and detay["kapak_fotografi"] is None
    assert detay["kurum"]["ad"] == "Test Barınağı"

    yanit = ziyaretci.get("/api/animals/9999")
    assert yanit.status_code == 404
    assert yanit.json == {"basarili": False, "hata": "Hayvan bulunamadı."}


# ------------------------------------------------------------------ Ekleme
def test_gorevli_hizli_ekleme(app, gorevli_istemci, veri):
    yanit = gorevli_istemci.post("/api/animals", json={
        "ad": "Minnoş", "tur_id": veri.kedi_id, "cinsiyet": "disi", "yaklasik_yas_ay": 6,
    })
    assert yanit.status_code == 201, yanit.json
    hayvan = yanit.json["veri"]
    assert hayvan["kurum"]["id"] == veri.kurum_id  # tek kurumu olduğu için otomatik seçildi
    assert hayvan["durum"] == "barinakta"
    assert hayvan["yas_metni"] == "6 aylık"
    assert hayvan["asilari_tam"] is False  # kedinin zorunlu aşıları yapılmamış

    with app.app_context():
        kayit = db.session.scalar(db.select(IslemKaydi).where(IslemKaydi.islem_turu == Islem.HAYVAN_EKLENDI))
        assert kayit.hedef_id == hayvan["id"]
        assert kayit.kullanici_id == veri.gorevli_id


def test_eksik_ve_hatali_alanlar(gorevli_istemci):
    yanit = gorevli_istemci.post("/api/animals", json={})
    assert yanit.status_code == 400
    assert set(yanit.json["alanlar"]) == {"ad", "tur_id", "cinsiyet"}

    yanit = gorevli_istemci.post("/api/animals", json={"ad": "X", "tur_id": 999, "cinsiyet": "erkek"})
    assert yanit.status_code == 400
    assert "tur_id" in yanit.json["alanlar"]


def test_ziyaretci_ve_kullanici_ekleyemez(ziyaretci, kullanici_istemci, veri):
    govde = {"ad": "X", "tur_id": veri.kedi_id, "cinsiyet": "erkek"}
    assert ziyaretci.post("/api/animals", json=govde).status_code == 401
    assert kullanici_istemci.post("/api/animals", json=govde).status_code == 403


def test_gorevli_baska_kuruma_ekleyemez(gorevli_istemci, veri):
    yanit = gorevli_istemci.post("/api/animals", json={
        "ad": "X", "tur_id": veri.kedi_id, "cinsiyet": "erkek", "kurum_id": veri.diger_kurum_id,
    })
    assert yanit.status_code == 403


def test_admin_kurum_secmeli(admin_istemci, veri):
    govde = {"ad": "X", "tur_id": veri.kedi_id, "cinsiyet": "erkek"}
    yanit = admin_istemci.post("/api/animals", json=govde)
    assert yanit.status_code == 400 and "kurum_id" in yanit.json["alanlar"]

    yanit = admin_istemci.post("/api/animals", json={**govde, "kurum_id": veri.diger_kurum_id})
    assert yanit.status_code == 201


# ------------------------------------------------------------------ Güncelleme / durum
def test_guncelleme_sadece_gonderilen_alanlari_degistirir(gorevli_istemci, hayvan_ekle):
    hayvan_id = hayvan_ekle(ad="Pamuk", cins="Tekir")

    yanit = gorevli_istemci.put(f"/api/animals/{hayvan_id}", json={"karakter_notu": "Sakin"})
    assert yanit.status_code == 200
    hayvan = yanit.json["veri"]
    assert (hayvan["ad"], hayvan["cins"], hayvan["karakter_notu"]) == ("Pamuk", "Tekir", "Sakin")

    yanit = gorevli_istemci.put(f"/api/animals/{hayvan_id}", json={"ad": None})
    assert yanit.status_code == 400 and "ad" in yanit.json["alanlar"]


def test_durum_degistirme_loglanir(app, gorevli_istemci, hayvan_ekle):
    hayvan_id = hayvan_ekle()

    yanit = gorevli_istemci.patch(f"/api/animals/{hayvan_id}/durum", json={"durum": "tedavide"})
    assert yanit.status_code == 200
    assert yanit.json["veri"] == {"id": hayvan_id, "durum": "tedavide"}

    with app.app_context():
        kayit = db.session.scalar(
            db.select(IslemKaydi).where(IslemKaydi.islem_turu == Islem.HAYVAN_DURUMU_DEGISTI)
        )
        assert "barinakta → tedavide" in kayit.detay

    yanit = gorevli_istemci.patch(f"/api/animals/{hayvan_id}/durum", json={"durum": "uyuyor"})
    assert yanit.status_code == 400


def test_baska_kurumun_gorevlisi_degistiremez(diger_gorevli_istemci, hayvan_ekle):
    hayvan_id = hayvan_ekle()
    assert diger_gorevli_istemci.put(f"/api/animals/{hayvan_id}", json={"ad": "Y"}).status_code == 403
    assert diger_gorevli_istemci.patch(f"/api/animals/{hayvan_id}/durum",
                                       json={"durum": "tedavide"}).status_code == 403
    assert diger_gorevli_istemci.delete(f"/api/animals/{hayvan_id}").status_code == 403


# ------------------------------------------------------------------ Silme
def test_silme_fotograf_dosyalarini_da_siler(app, gorevli_istemci, ziyaretci, hayvan_ekle):
    hayvan_id = hayvan_ekle()
    gorevli_istemci.post(f"/api/animals/{hayvan_id}/photos",
                         data={"fotograflar": [(resim_dosyasi(), "a.jpg")]},
                         content_type="multipart/form-data")
    klasor = Path(app.config["UPLOAD_KLASORU"]) / "hayvanlar"
    assert len(list(klasor.iterdir())) == 2  # büyük + küçük

    yanit = gorevli_istemci.delete(f"/api/animals/{hayvan_id}")
    assert yanit.status_code == 200
    assert list(klasor.iterdir()) == []
    assert ziyaretci.get(f"/api/animals/{hayvan_id}").status_code == 404
    with app.app_context():
        assert db.session.scalar(db.select(db.func.count(HayvanFotografi.id))) == 0


def test_basvurusu_olan_hayvan_silinemez(app, gorevli_istemci, hayvan_ekle, veri):
    hayvan_id = hayvan_ekle()
    with app.app_context():
        db.session.add(SahiplendirmeBasvurusu(hayvan_id=hayvan_id, kullanici_id=veri.kullanici_id))
        db.session.commit()

    yanit = gorevli_istemci.delete(f"/api/animals/{hayvan_id}")
    assert yanit.status_code == 409
    with app.app_context():
        assert db.session.get(Hayvan, hayvan_id) is not None


def test_hayvan_durumunu_degistir_bolum3_icin(app, hayvan_ekle):
    """Bölüm 3 başvuru onayında bu fonksiyonu kullanacak: durumu değiştirir, loglar, commit etmez."""
    from app.services.hayvan_servisi import hayvan_durumunu_degistir

    hayvan_id = hayvan_ekle()
    with app.test_request_context():
        hayvan = db.session.get(Hayvan, hayvan_id)
        assert hayvan_durumunu_degistir(hayvan, HayvanDurumu.SAHIPLENDIRILDI) is True
        assert hayvan_durumunu_degistir(hayvan, HayvanDurumu.SAHIPLENDIRILDI) is False  # zaten öyle
        db.session.rollback()  # commit etmediği için geri alınabilir
        assert db.session.get(Hayvan, hayvan_id).durum == HayvanDurumu.BARINAKTA


# ------------------------------------------------------------------ Sıralama ve il filtresi
def _sirali_adlar(istemci, siralama):
    yanit = istemci.get(f"/api/animals?limit=50&siralama={siralama}")
    assert yanit.status_code == 200, yanit.json
    return [h["ad"] for h in yanit.json["veri"]["kayitlar"]]


def test_siralama(ziyaretci, hayvan_ekle):
    bugun = date.today()
    hayvan_ekle(ad="Zeytin", dogum_tarihi=bugun - timedelta(days=60))     # ilk eklenen, en genç
    hayvan_ekle(ad="boncuk", dogum_tarihi=bugun - timedelta(days=2000))   # en yaşlı
    hayvan_ekle(ad="Arap")                                                 # yaşı bilinmiyor, son eklenen

    assert _sirali_adlar(ziyaretci, "yeni") == ["Arap", "boncuk", "Zeytin"]
    assert _sirali_adlar(ziyaretci, "eski") == ["Zeytin", "boncuk", "Arap"]
    assert _sirali_adlar(ziyaretci, "ad") == ["Arap", "boncuk", "Zeytin"]  # büyük/küçük harf fark etmez
    assert _sirali_adlar(ziyaretci, "genc") == ["Zeytin", "boncuk", "Arap"]   # bilinmeyen yaş sonda
    assert _sirali_adlar(ziyaretci, "yasli") == ["boncuk", "Zeytin", "Arap"]
    varsayilan = [h["ad"] for h in ziyaretci.get("/api/animals").json["veri"]["kayitlar"]]
    assert varsayilan == ["Arap", "boncuk", "Zeytin"]  # siralama verilmezse "yeni"

    yanit = ziyaretci.get("/api/animals?siralama=fiyat")
    assert yanit.status_code == 400 and "siralama" in yanit.json["alanlar"]


def test_il_filtresi_kurum_adresinde_arar(app, ziyaretci, hayvan_ekle, veri):
    with app.app_context():
        db.session.get(Kurum, veri.kurum_id).adres = "Yaka Mah. Meram / Konya"
        db.session.get(Kurum, veri.diger_kurum_id).adres = "Moda, Kadıköy / Istanbul"
        db.session.commit()
    hayvan_ekle(ad="Konyali")
    hayvan_ekle(ad="Istanbullu", kurum_id=veri.diger_kurum_id)

    assert _adlar(ziyaretci, "il=konya") == ["Konyali"]
    assert _adlar(ziyaretci, "il=Kadıköy") == ["Istanbullu"]
    assert _adlar(ziyaretci, "il=Ankara") == []
