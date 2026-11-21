import io
from datetime import date, timedelta

from app.sabitler import HayvanDurumu

BUGUN = date.today()


def _gun(n):
    """Bugünden n gün sonrası (negatifse önce), ISO metin olarak."""
    return (BUGUN + timedelta(days=n)).isoformat()


def _karne(istemci, hayvan_id):
    yanit = istemci.get(f"/api/animals/{hayvan_id}/vaccinations")
    assert yanit.status_code == 200, yanit.json
    return yanit.json["veri"]


# ------------------------------------------------------------------ Ekleme ve karne
def test_asi_ekleme_ve_karne(gorevli_istemci, ziyaretci, hayvan_ekle, veri):
    hayvan_id = hayvan_ekle()
    yanit = gorevli_istemci.post(f"/api/animals/{hayvan_id}/vaccinations", json={
        "asi_turu_id": veri.karma_id, "uygulama_tarihi": _gun(-10), "sonraki_tarih": _gun(20),
        "uygulayan_kurum_id": veri.klinik_id,
    })
    assert yanit.status_code == 201, yanit.json
    assert yanit.json["veri"]["uygulayan_kurum"]["ad"] == "Test Kliniği"

    karne = _karne(ziyaretci, hayvan_id)
    assert [a["durum"] for a in karne["asilar"]] == ["zamaninda"]
    assert [a["ad"] for a in karne["eksik_zorunlu_asilar"]] == ["Kuduz"]
    assert karne["asilari_tam"] is False


def test_tarih_varsayilan_bugun(gorevli_istemci, hayvan_ekle, veri):
    hayvan_id = hayvan_ekle()
    yanit = gorevli_istemci.post(f"/api/animals/{hayvan_id}/vaccinations", json={"asi_turu_id": veri.kuduz_id})
    assert yanit.json["veri"]["uygulama_tarihi"] == BUGUN.isoformat()


def test_tarih_kurallari(gorevli_istemci, hayvan_ekle, veri):
    hayvan_id = hayvan_ekle()
    url = f"/api/animals/{hayvan_id}/vaccinations"

    yanit = gorevli_istemci.post(url, json={"asi_turu_id": veri.karma_id, "uygulama_tarihi": _gun(1)})
    assert yanit.status_code == 400 and "uygulama_tarihi" in yanit.json["alanlar"]

    yanit = gorevli_istemci.post(url, json={
        "asi_turu_id": veri.karma_id, "uygulama_tarihi": _gun(-1), "sonraki_tarih": _gun(-5),
    })
    assert yanit.status_code == 400 and "sonraki_tarih" in yanit.json["alanlar"]

    yanit = gorevli_istemci.post(url, json={"asi_turu_id": 999})
    assert yanit.status_code == 400 and "asi_turu_id" in yanit.json["alanlar"]


def test_yeni_doz_eski_dozu_tamamlar(gorevli_istemci, ziyaretci, hayvan_ekle, asi_ekle, veri):
    hayvan_id = hayvan_ekle()
    asi_ekle(hayvan_id, veri.karma_id, BUGUN - timedelta(days=400), BUGUN - timedelta(days=35))

    assert [a["durum"] for a in _karne(ziyaretci, hayvan_id)["asilar"]] == ["gecikti"]
    assert len(gorevli_istemci.get("/api/vaccinations/gecikmis").json["veri"]) == 1

    asi_ekle(hayvan_id, veri.karma_id, BUGUN - timedelta(days=5), BUGUN + timedelta(days=360))

    # Liste en yeniden eskiye: yeni doz zamanında, eski dozun "sonraki dozu" yapılmış
    assert [a["durum"] for a in _karne(ziyaretci, hayvan_id)["asilar"]] == ["zamaninda", "tamamlandi"]
    assert gorevli_istemci.get("/api/vaccinations/gecikmis").json["veri"] == []


# ------------------------------------------------------------------ Panel listeleri
def test_yaklasan_asilar(gorevli_istemci, admin_istemci, hayvan_ekle, asi_ekle, veri):
    def ekle(ad, sonraki_gun, **alanlar):
        hayvan_id = hayvan_ekle(ad=ad, **alanlar)
        asi_ekle(hayvan_id, veri.karma_id, BUGUN - timedelta(days=30), BUGUN + timedelta(days=sonraki_gun))

    ekle("Yakın", 3)
    ekle("Uzak", 20)
    ekle("Sahiplenilmiş", 2, durum=HayvanDurumu.SAHIPLENDIRILDI)  # artık barınağın sorumluluğunda değil
    ekle("Diğer kurumdan", 1, kurum_id=veri.diger_kurum_id)       # görevli görmez, admin görür

    def adlar(istemci, gun):
        yanit = istemci.get(f"/api/vaccinations/yaklasan?gun={gun}")
        assert yanit.status_code == 200
        return [a["hayvan"]["ad"] for a in yanit.json["veri"]]

    assert adlar(gorevli_istemci, 7) == ["Yakın"]
    assert adlar(gorevli_istemci, 30) == ["Yakın", "Uzak"]
    assert adlar(admin_istemci, 7) == ["Diğer kurumdan", "Yakın"]

    kayit = gorevli_istemci.get("/api/vaccinations/yaklasan").json["veri"][0]
    assert kayit["durum"] == "yaklasiyor" and kayit["asi_turu"]["ad"] == "Karma"


def test_panel_listeleri_gorevliye_ozel(ziyaretci, kullanici_istemci):
    assert ziyaretci.get("/api/vaccinations/yaklasan").status_code == 401
    assert kullanici_istemci.get("/api/vaccinations/gecikmis").status_code == 403


# ------------------------------------------------------------------ "Aşıları tam" hesabı
def test_asilari_tam_liste_filtre_ve_karne_ayni_sonucu_verir(ziyaretci, hayvan_ekle, asi_ekle, veri):
    once, sonra = (lambda n: BUGUN - timedelta(days=n)), (lambda n: BUGUN + timedelta(days=n))

    tam = hayvan_ekle(ad="Tam")
    asi_ekle(tam, veri.karma_id, once(10), sonra(300))
    asi_ekle(tam, veri.kuduz_id, once(10))

    eksik = hayvan_ekle(ad="Eksik")
    asi_ekle(eksik, veri.karma_id, once(10))

    gecikmis = hayvan_ekle(ad="Gecikmis")
    asi_ekle(gecikmis, veri.karma_id, once(400), once(1))
    asi_ekle(gecikmis, veri.kuduz_id, once(10))

    yenilenmis = hayvan_ekle(ad="Yenilenmis")
    asi_ekle(yenilenmis, veri.karma_id, once(400), once(30))
    asi_ekle(yenilenmis, veri.karma_id, once(20), sonra(300))
    asi_ekle(yenilenmis, veri.kuduz_id, once(10))

    hayvan_ekle(ad="Kopek", tur_id=veri.kopek_id)  # köpek için zorunlu aşı tanımlı değil

    kayitlar = ziyaretci.get("/api/animals?limit=50").json["veri"]["kayitlar"]
    liste = {h["ad"]: h["asilari_tam"] for h in kayitlar}
    assert liste == {"Tam": True, "Eksik": False, "Gecikmis": False, "Yenilenmis": True, "Kopek": True}

    for hayvan in kayitlar:  # karnedeki hesap (Python) ile listedeki hesap (SQL) aynı olmalı
        assert _karne(ziyaretci, hayvan["id"])["asilari_tam"] == hayvan["asilari_tam"], hayvan["ad"]

    def filtrele(deger):
        return {h["ad"] for h in ziyaretci.get(f"/api/animals?asilar_tam={deger}").json["veri"]["kayitlar"]}

    assert filtrele("true") == {"Tam", "Yenilenmis", "Kopek"}
    assert filtrele("false") == {"Eksik", "Gecikmis"}


# ------------------------------------------------------------------ Güncelle / sil / belge
def test_asi_guncelle_ve_sil(gorevli_istemci, diger_gorevli_istemci, ziyaretci, hayvan_ekle, asi_ekle, veri):
    hayvan_id = hayvan_ekle()
    asi_id = asi_ekle(hayvan_id, veri.karma_id, BUGUN - timedelta(days=10))

    yanit = gorevli_istemci.put(f"/api/vaccinations/{asi_id}", json={"sonraki_tarih": _gun(30)})
    assert yanit.status_code == 200 and yanit.json["veri"]["sonraki_tarih"] == _gun(30)

    yanit = gorevli_istemci.put(f"/api/vaccinations/{asi_id}", json={"sonraki_tarih": _gun(-20)})
    assert yanit.status_code == 400

    assert diger_gorevli_istemci.delete(f"/api/vaccinations/{asi_id}").status_code == 403
    assert gorevli_istemci.delete(f"/api/vaccinations/{asi_id}").status_code == 200
    assert _karne(ziyaretci, hayvan_id)["asilar"] == []


def test_belge_yukleme_ve_indirme(gorevli_istemci, ziyaretci, hayvan_ekle, asi_ekle, veri):
    asi_id = asi_ekle(hayvan_ekle(), veri.kuduz_id, BUGUN)
    url = f"/api/vaccinations/{asi_id}/belge"

    assert ziyaretci.get(url).status_code == 404  # henüz belge yok
    yanit = gorevli_istemci.post(url, data={"belge": (io.BytesIO(b"%PDF-1.4 deneme"), "karne.pdf")},
                                 content_type="multipart/form-data")
    assert yanit.status_code == 200 and yanit.json["veri"]["belge_url"] == url

    indirilen = ziyaretci.get(url)
    assert indirilen.status_code == 200 and indirilen.data.startswith(b"%PDF-")

    yanit = gorevli_istemci.post(url, data={"belge": (io.BytesIO(b"<html>"), "sahte.pdf")},
                                 content_type="multipart/form-data")
    assert yanit.status_code == 400


# ------------------------------------------------------------------ Türler
def test_asi_turleri(ziyaretci, admin_istemci, gorevli_istemci, veri):
    turler = ziyaretci.get(f"/api/vaccinations/turler?hayvan_turu_id={veri.kedi_id}").json["veri"]
    assert {t["ad"]: t["zorunlu"] for t in turler} == {"Karma": True, "Kuduz": True}

    assert admin_istemci.post("/api/vaccinations/turler", json={"ad": "Lösemi"}).status_code == 201
    assert admin_istemci.post("/api/vaccinations/turler", json={"ad": "karma"}).status_code == 409
    assert gorevli_istemci.post("/api/vaccinations/turler", json={"ad": "Yeni"}).status_code == 403


def test_zorunlu_asilari_belirleme(admin_istemci, ziyaretci, veri):
    url = f"/api/hayvan-turleri/{veri.kopek_id}/zorunlu-asilar"

    yanit = admin_istemci.put(url, json={"asi_turu_idleri": [veri.kuduz_id]})
    assert yanit.status_code == 200
    assert [a["ad"] for a in yanit.json["veri"]["zorunlu_asilar"]] == ["Kuduz"]

    assert admin_istemci.put(url, json={"asi_turu_idleri": [999]}).status_code == 400
    assert admin_istemci.put(url, json={"asi_turu_idleri": []}).json["veri"]["zorunlu_asilar"] == []

    turler = {t["ad"]: t for t in ziyaretci.get("/api/hayvan-turleri").json["veri"]}
    assert len(turler["Kedi"]["zorunlu_asilar"]) == 2


# ------------------------------------------------------------------ Kurum filtresi
def test_panel_listeleri_kurum_filtresi_ve_kurum_bilgisi(gorevli_istemci, admin_istemci, hayvan_ekle, asi_ekle, veri):
    def gecikmis_ekle(ad, kurum_id):
        hayvan_id = hayvan_ekle(ad=ad, kurum_id=kurum_id)
        asi_ekle(hayvan_id, veri.karma_id, BUGUN - timedelta(days=400), BUGUN - timedelta(days=5))

    gecikmis_ekle("Bizim", veri.kurum_id)
    gecikmis_ekle("Onların", veri.diger_kurum_id)

    def adlar(istemci, sorgu=""):
        yanit = istemci.get(f"/api/vaccinations/gecikmis{sorgu}")
        assert yanit.status_code == 200, yanit.json
        return [a["hayvan"]["ad"] for a in yanit.json["veri"]]

    assert sorted(adlar(admin_istemci)) == ["Bizim", "Onların"]
    assert adlar(admin_istemci, f"?kurum_id={veri.diger_kurum_id}") == ["Onların"]
    assert adlar(gorevli_istemci, f"?kurum_id={veri.kurum_id}") == ["Bizim"]
    assert gorevli_istemci.get(f"/api/vaccinations/gecikmis?kurum_id={veri.diger_kurum_id}").status_code == 403
    assert gorevli_istemci.get(f"/api/vaccinations/yaklasan?kurum_id={veri.diger_kurum_id}").status_code == 403

    kayit = admin_istemci.get(f"/api/vaccinations/gecikmis?kurum_id={veri.kurum_id}").json["veri"][0]
    assert kayit["hayvan"]["kurum"] == {"id": veri.kurum_id, "ad": "Test Barınağı", "tur": "barinak"}


# ------------------------------------------------------------------ Tekrar aralığı → sonraki doz önerisi
def test_tekrar_araligi_ve_otomatik_sonraki_doz(admin_istemci, gorevli_istemci, ziyaretci, hayvan_ekle, veri):
    url = f"/api/hayvan-turleri/{veri.kedi_id}/zorunlu-asilar"
    yanit = admin_istemci.put(url, json={"asilar": [
        {"asi_turu_id": veri.karma_id, "tekrar_araligi_gun": 365},
        {"asi_turu_id": veri.kuduz_id},
    ]})
    assert yanit.status_code == 200, yanit.json
    zorunlular = {a["ad"]: a["tekrar_araligi_gun"] for a in yanit.json["veri"]["zorunlu_asilar"]}
    assert zorunlular == {"Karma": 365, "Kuduz": None}

    turler = ziyaretci.get(f"/api/vaccinations/turler?hayvan_turu_id={veri.kedi_id}").json["veri"]
    assert {t["ad"]: t["tekrar_araligi_gun"] for t in turler} == {"Karma": 365, "Kuduz": None}

    hayvan_id = hayvan_ekle()
    asi_url = f"/api/animals/{hayvan_id}/vaccinations"
    # Sonraki doz boş → aralıktan hesaplanır (frontend boşsa null gönderiyor)
    yanit = gorevli_istemci.post(asi_url, json={
        "asi_turu_id": veri.karma_id, "uygulama_tarihi": _gun(-10), "sonraki_tarih": None,
    })
    assert yanit.json["veri"]["sonraki_tarih"] == _gun(355)
    # Elle girilen tarih ezilmez
    yanit = gorevli_istemci.post(asi_url, json={
        "asi_turu_id": veri.karma_id, "uygulama_tarihi": _gun(-1), "sonraki_tarih": _gun(30),
    })
    assert yanit.json["veri"]["sonraki_tarih"] == _gun(30)
    # Aralığı tanımlı olmayan aşıda sonraki doz boş kalır
    yanit = gorevli_istemci.post(asi_url, json={"asi_turu_id": veri.kuduz_id})
    assert yanit.json["veri"]["sonraki_tarih"] is None

    # Eski biçim (sadece id listesi) mevcut aralıkları korur
    yanit = admin_istemci.put(url, json={"asi_turu_idleri": [veri.karma_id]})
    assert yanit.json["veri"]["zorunlu_asilar"] == [{"id": veri.karma_id, "ad": "Karma", "tekrar_araligi_gun": 365}]


def test_zorunlu_asilar_bicim_hatalari(admin_istemci, veri):
    url = f"/api/hayvan-turleri/{veri.kedi_id}/zorunlu-asilar"
    assert admin_istemci.put(url, json={}).status_code == 400
    assert admin_istemci.put(url, json={"asi_turu_idleri": [], "asilar": []}).status_code == 400
    yanit = admin_istemci.put(url, json={"asilar": [{"asi_turu_id": veri.karma_id, "tekrar_araligi_gun": 0}]})
    assert yanit.status_code == 400


# ------------------------------------------------------------------ Tür düzenleme / silme
def test_hayvan_turu_guncelle_ve_sil(admin_istemci, gorevli_istemci, ziyaretci, hayvan_ekle, veri):
    yanit = admin_istemci.put(f"/api/hayvan-turleri/{veri.kopek_id}", json={"ad": "Köpekler"})
    assert yanit.status_code == 200 and yanit.json["veri"]["ad"] == "Köpekler"
    assert admin_istemci.put(f"/api/hayvan-turleri/{veri.kopek_id}", json={"ad": "kedi"}).status_code == 409
    assert admin_istemci.put(f"/api/hayvan-turleri/{veri.kopek_id}", json={"ad": "Köpekler"}).status_code == 200
    assert gorevli_istemci.put(f"/api/hayvan-turleri/{veri.kopek_id}", json={"ad": "X"}).status_code == 403

    hayvan_ekle(tur_id=veri.kedi_id)
    yanit = admin_istemci.delete(f"/api/hayvan-turleri/{veri.kedi_id}")
    assert yanit.status_code == 409 and "1 hayvan" in yanit.json["hata"]

    assert admin_istemci.delete(f"/api/hayvan-turleri/{veri.kopek_id}").status_code == 200
    assert [t["ad"] for t in ziyaretci.get("/api/hayvan-turleri").json["veri"]] == ["Kedi"]
    assert admin_istemci.delete("/api/hayvan-turleri/999").status_code == 404


def test_asi_turu_guncelle_ve_sil(admin_istemci, gorevli_istemci, ziyaretci, hayvan_ekle, asi_ekle, veri):
    url = f"/api/vaccinations/turler/{veri.kuduz_id}"
    yanit = admin_istemci.put(url, json={"aciklama": "Yılda bir"})
    assert yanit.status_code == 200
    assert (yanit.json["veri"]["ad"], yanit.json["veri"]["aciklama"]) == ("Kuduz", "Yılda bir")
    assert admin_istemci.put(url, json={"ad": "KARMA"}).status_code == 409
    assert admin_istemci.put(url, json={"ad": None}).status_code == 400
    assert gorevli_istemci.delete(url).status_code == 403

    # Uygulanmış aşı silinemez
    asi_ekle(hayvan_ekle(), veri.karma_id, BUGUN)
    assert admin_istemci.delete(f"/api/vaccinations/turler/{veri.karma_id}").status_code == 409

    # Hiç uygulanmamış aşı silinir, türlerin zorunlu listesinden de çıkar
    assert admin_istemci.delete(url).status_code == 200
    kedi = next(t for t in ziyaretci.get("/api/hayvan-turleri").json["veri"] if t["id"] == veri.kedi_id)
    assert [a["ad"] for a in kedi["zorunlu_asilar"]] == ["Karma"]
