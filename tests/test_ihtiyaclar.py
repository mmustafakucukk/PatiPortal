from app.extensions import db
from app.models import DestekTalebi, IslemKaydi
from app.sabitler import Aciliyet, IhtiyacDurumu

DESTEK = {"ad_soyad": "Ali Veli", "telefon": "0555 111 22 33", "miktar": 6, "kvkk_onay": True}


def _ihtiyac(istemci, ihtiyac_id):
    return istemci.get(f"/api/needs/{ihtiyac_id}").json["veri"]


# ------------------------------------------------------------------ Liste
def test_liste_aciliyete_gore_sirali(ziyaretci, ihtiyac_ekle):
    ihtiyac_ekle(baslik="Battaniye", aciliyet=Aciliyet.DUSUK)
    ihtiyac_ekle(baslik="Mama", aciliyet=Aciliyet.YUKSEK)
    ihtiyac_ekle(baslik="İlaç", aciliyet=Aciliyet.ORTA)
    ihtiyac_ekle(baslik="Eski", durum=IhtiyacDurumu.KARSILANDI)

    yanit = ziyaretci.get("/api/needs")
    assert [i["baslik"] for i in yanit.json["veri"]] == ["Mama", "İlaç", "Battaniye"]
    assert [i["baslik"] for i in ziyaretci.get("/api/needs?durum=karsilandi").json["veri"]] == ["Eski"]


# ------------------------------------------------------------------ Destek sözü
def test_destek_sozu_ve_karsilanmis_olabilir_isareti(app, ziyaretci, ihtiyac_ekle):
    ihtiyac_id = ihtiyac_ekle(miktar=10)

    yanit = ziyaretci.post(f"/api/needs/{ihtiyac_id}/pledges", json=DESTEK)
    assert yanit.status_code == 201, yanit.json
    assert "telefon" not in yanit.json["veri"]  # telefon herkese geri gösterilmez

    ihtiyac = _ihtiyac(ziyaretci, ihtiyac_id)
    assert (ihtiyac["toplam_soz"], ihtiyac["kalan"], ihtiyac["ilerleme_yuzde"]) == (6, 4, 60)
    assert ihtiyac["karsilanmis_olabilir"] is False

    ziyaretci.post(f"/api/needs/{ihtiyac_id}/pledges", json={**DESTEK, "miktar": 4})
    ihtiyac = _ihtiyac(ziyaretci, ihtiyac_id)
    assert ihtiyac["karsilanmis_olabilir"] is True
    assert ihtiyac["durum"] == "acik"  # kapatma kararını görevli verir

    with app.app_context():
        talep = db.session.scalars(db.select(DestekTalebi)).first()
        assert talep._telefon != "05551112233"  # veritabanında şifreli
        assert talep.telefon == "05551112233"


def test_kvkk_onaysiz_destek_reddedilir(ziyaretci, ihtiyac_ekle):
    yanit = ziyaretci.post(f"/api/needs/{ihtiyac_ekle()}/pledges", json={**DESTEK, "kvkk_onay": False})
    assert yanit.status_code == 400 and "kvkk_onay" in yanit.json["alanlar"]


def test_kapanmis_ihtiyaca_destek_verilemez(ziyaretci, ihtiyac_ekle):
    ihtiyac_id = ihtiyac_ekle(durum=IhtiyacDurumu.KARSILANDI)
    assert ziyaretci.post(f"/api/needs/{ihtiyac_id}/pledges", json=DESTEK).status_code == 409


def test_iptal_edilen_soz_toplama_girmez(gorevli_istemci, ziyaretci, ihtiyac_ekle):
    ihtiyac_id = ihtiyac_ekle()
    talep_id = ziyaretci.post(f"/api/needs/{ihtiyac_id}/pledges", json=DESTEK).json["veri"]["id"]

    yanit = gorevli_istemci.patch(f"/api/pledges/{talep_id}/durum", json={"durum": "iptal"})
    assert yanit.status_code == 200
    assert _ihtiyac(ziyaretci, ihtiyac_id)["toplam_soz"] == 0


def test_gorevli_sozleri_iletisim_bilgisiyle_gorur(gorevli_istemci, diger_gorevli_istemci, ziyaretci, ihtiyac_ekle):
    ihtiyac_id = ihtiyac_ekle()
    ziyaretci.post(f"/api/needs/{ihtiyac_id}/pledges", json=DESTEK)
    url = f"/api/needs/{ihtiyac_id}/pledges"

    talepler = gorevli_istemci.get(url).json["veri"]
    assert talepler[0]["telefon"] == "05551112233"
    assert ziyaretci.get(url).status_code == 401
    assert diger_gorevli_istemci.get(url).status_code == 403


def test_giris_yapmis_kullanicinin_bilgileri_otomatik_dolar(kullanici_istemci, ihtiyac_ekle):
    yanit = kullanici_istemci.post(f"/api/needs/{ihtiyac_ekle()}/pledges", json={"miktar": 2, "kvkk_onay": True})
    assert yanit.status_code == 201, yanit.json
    assert yanit.json["veri"]["ad_soyad"] == "Ayşe Yılmaz"

    sozlerim = kullanici_istemci.get("/api/pledges/me").json["veri"]
    assert len(sozlerim) == 1
    assert sozlerim[0]["telefon"] == "05550000000"
    assert sozlerim[0]["ihtiyac"]["baslik"] == "Kedi maması"
    assert sozlerim[0]["ihtiyac"]["birim"] == "kg"


# ------------------------------------------------------------------ Görevli işlemleri
def test_gorevli_ihtiyac_ekler_gunceller_kapatir(app, gorevli_istemci, veri):
    yanit = gorevli_istemci.post("/api/needs", json={
        "tur": "ilac", "baslik": "Antibiyotik", "miktar": 5, "birim": "kutu", "aciliyet": "yuksek",
    })
    assert yanit.status_code == 201, yanit.json
    ihtiyac = yanit.json["veri"]
    assert ihtiyac["kurum"]["id"] == veri.kurum_id

    yanit = gorevli_istemci.put(f"/api/needs/{ihtiyac['id']}", json={"miktar": 8})
    assert (yanit.json["veri"]["miktar"], yanit.json["veri"]["baslik"]) == (8, "Antibiyotik")

    yanit = gorevli_istemci.patch(f"/api/needs/{ihtiyac['id']}/karsilandi")
    assert yanit.json["veri"]["durum"] == "karsilandi"
    assert yanit.json["veri"]["kapanma_tarihi"] is not None
    assert gorevli_istemci.patch(f"/api/needs/{ihtiyac['id']}/karsilandi").status_code == 409

    with app.app_context():
        islemler = db.session.scalars(db.select(IslemKaydi.islem_turu).order_by(IslemKaydi.id)).all()
        assert islemler == ["ihtiyac_eklendi", "ihtiyac_guncellendi", "ihtiyac_karsilandi"]


def test_ihtiyac_silme(gorevli_istemci, ziyaretci, ihtiyac_ekle):
    bos = ihtiyac_ekle()
    assert gorevli_istemci.delete(f"/api/needs/{bos}").status_code == 200

    sozlu = ihtiyac_ekle()
    ziyaretci.post(f"/api/needs/{sozlu}/pledges", json=DESTEK)
    assert gorevli_istemci.delete(f"/api/needs/{sozlu}").status_code == 409


def test_yetkisiz_ihtiyac_islemleri(ziyaretci, diger_gorevli_istemci, ihtiyac_ekle):
    assert ziyaretci.post("/api/needs", json={"tur": "mama", "baslik": "X", "miktar": 1}).status_code == 401
    ihtiyac_id = ihtiyac_ekle()
    assert diger_gorevli_istemci.patch(f"/api/needs/{ihtiyac_id}/karsilandi").status_code == 403


def test_kullanici_kendi_sozunu_iptal_eder(app, kullanici_istemci, admin_istemci, ziyaretci, ihtiyac_ekle):
    ihtiyac_id = ihtiyac_ekle(miktar=10)
    yanit = kullanici_istemci.post(f"/api/needs/{ihtiyac_id}/pledges", json={"miktar": 4, "kvkk_onay": True})
    talep_id = yanit.json["veri"]["id"]
    anonim_id = ziyaretci.post(f"/api/needs/{ihtiyac_id}/pledges", json=DESTEK).json["veri"]["id"]
    url = f"/api/pledges/{talep_id}/iptal"

    assert ziyaretci.patch(url).status_code == 401
    assert admin_istemci.patch(url).status_code == 403  # başkasının sözü (admin de olsa bu uç kişisel)
    assert kullanici_istemci.patch(f"/api/pledges/{anonim_id}/iptal").status_code == 403

    yanit = kullanici_istemci.patch(url)
    assert yanit.status_code == 200 and yanit.json["veri"]["durum"] == "iptal"
    assert kullanici_istemci.patch(url).status_code == 409
    assert _ihtiyac(ziyaretci, ihtiyac_id)["toplam_soz"] == 6  # sadece anonim söz kaldı

    with app.app_context():
        islem = db.session.scalars(db.select(IslemKaydi.islem_turu).order_by(IslemKaydi.id.desc())).first()
        assert islem == "destek_iptal_edildi"


def test_teslim_edilmis_soz_iptal_edilemez(kullanici_istemci, gorevli_istemci, ihtiyac_ekle):
    ihtiyac_id = ihtiyac_ekle()
    talep_id = kullanici_istemci.post(f"/api/needs/{ihtiyac_id}/pledges",
                                      json={"miktar": 1, "kvkk_onay": True}).json["veri"]["id"]
    gorevli_istemci.patch(f"/api/pledges/{talep_id}/durum", json={"durum": "teslim_edildi"})
    assert kullanici_istemci.patch(f"/api/pledges/{talep_id}/iptal").status_code == 409
