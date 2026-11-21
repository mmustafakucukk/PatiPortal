"""Kullanıcı ve kurum yönetimi (/api/users/*, /api/institutions/*) testleri – Bölüm 3."""

from app.extensions import db
from app.models import Kullanici, Kurum, KurumGorevlisi, SahiplendirmeBasvurusu, simdi
from app.sabitler import KurumTuru, Rol


# ------------------------------------------------------------------ Kullanıcılar
def test_kullanici_listesi_sadece_admin_ve_filtreli(
    ziyaretci, kullanici_istemci, gorevli_istemci, admin_istemci, veri
):
    assert ziyaretci.get("/api/users").status_code == 401
    assert kullanici_istemci.get("/api/users").status_code == 403
    assert gorevli_istemci.get("/api/users").status_code == 403

    hepsi = admin_istemci.get("/api/users")
    assert hepsi.status_code == 200
    assert len(hepsi.get_json()["veri"]) == 4

    gorevliler = admin_istemci.get("/api/users?rol=gorevli&aktif=true")
    assert gorevliler.status_code == 200
    assert len(gorevliler.get_json()["veri"]) == 2


def test_admin_yeni_gorevli_olusturur_ve_ayni_email_409(admin_istemci, veri):
    govde = {
        "ad_soyad": "Yeni Görevli",
        "email": "yeni.gorevli@test.local",
        "telefon": "0555 222 33 44",
        "sifre": "GucluSifre123",
        "rol": "gorevli",
    }
    yanit = admin_istemci.post("/api/users", json=govde)
    assert yanit.status_code == 201
    v = yanit.get_json()["veri"]
    assert v["rol"] == Rol.GOREVLI
    assert v["telefon"] == "05552223344"

    tekrar = admin_istemci.post("/api/users", json=govde)
    assert tekrar.status_code == 409


def test_admin_kullanici_gunceller_ve_kendini_kilitleyemez(admin_istemci, veri):
    guncel = admin_istemci.put(
        f"/api/users/{veri.kullanici_id}",
        json={"rol": "gorevli", "aktif": False},
    )
    assert guncel.status_code == 200
    assert guncel.get_json()["veri"]["rol"] == Rol.GOREVLI
    assert guncel.get_json()["veri"]["aktif"] is False

    # Admin kendini pasifleştiremez veya kendi admin yetkisini kaldıramaz
    assert admin_istemci.put(f"/api/users/{veri.admin_id}", json={"aktif": False}).status_code == 400
    assert admin_istemci.put(f"/api/users/{veri.admin_id}", json={"rol": "gorevli"}).status_code == 400


def test_kvkk_hesap_silme_bagli_kayit_yoksa_kalici_siler(app, kullanici_istemci, veri):
    yanit = kullanici_istemci.delete("/api/users/me")
    assert yanit.status_code == 200
    assert kullanici_istemci.get("/api/auth/me").status_code == 401

    with app.app_context():
        assert db.session.get(Kullanici, veri.kullanici_id) is None


def test_kvkk_hesap_silme_basvuru_varsa_anonimlestirir(app, kullanici_istemci, veri, hayvan_ekle):
    hayvan_id = hayvan_ekle()
    with app.app_context():
        db.session.add(
            SahiplendirmeBasvurusu(
                hayvan_id=hayvan_id,
                kullanici_id=veri.kullanici_id,
                ev_tipi="Daire",
                aciklama="Bahçeli evde bakacağım",
                kvkk_onay_tarihi=simdi(),
            )
        )
        db.session.commit()

    yanit = kullanici_istemci.delete("/api/users/me")
    assert yanit.status_code == 200
    assert kullanici_istemci.get("/api/auth/me").status_code == 401

    with app.app_context():
        k = db.session.get(Kullanici, veri.kullanici_id)
        assert k is not None
        assert k.aktif is False
        assert k.ad_soyad == "Silinmiş Kullanıcı"
        assert k._telefon is None
        assert k.email.endswith("@silindi.local")


# ------------------------------------------------------------------ Kurumlar
def test_kurum_listeleme_herkese_acik_ve_pasif_gizlenir(app, ziyaretci, admin_istemci, veri):
    with app.app_context():
        pasif = db.session.get(Kurum, veri.diger_kurum_id)
        pasif.aktif = False
        db.session.commit()

    herkes = ziyaretci.get("/api/institutions")
    assert herkes.status_code == 200
    assert len(herkes.get_json()["veri"]) == 2  # sadece aktifler

    klinikler = ziyaretci.get("/api/institutions?tur=klinik")
    assert len(klinikler.get_json()["veri"]) == 1

    admin_tumu = admin_istemci.get("/api/institutions")
    assert len(admin_tumu.get_json()["veri"]) == 3


def test_admin_kurum_ekler_ve_gunceller(gorevli_istemci, admin_istemci):
    assert gorevli_istemci.post("/api/institutions", json={"ad": "Yetkisiz"}).status_code == 403

    ekle = admin_istemci.post(
        "/api/institutions",
        json={
            "ad": "Selçuklu Hayvan Barınağı",
            "tur": "barinak",
            "adres": "Konya Selçuklu Merkez",
            "telefon": "0332 123 45 67",
            "email": "selcuklu@barinak.org",
        },
    )
    assert ekle.status_code == 201
    kurum_id = ekle.get_json()["veri"]["id"]

    guncelle = admin_istemci.put(
        f"/api/institutions/{kurum_id}",
        json={"tur": KurumTuru.KLINIK.value, "aktif": False},
    )
    assert guncelle.status_code == 200
    assert guncelle.get_json()["veri"]["tur"] == KurumTuru.KLINIK
    assert guncelle.get_json()["veri"]["aktif"] is False


def test_kurum_gorevli_atama_listeleme_ve_cikarma(app, admin_istemci, veri):
    # Ziyaretçi rolündeki kullanıcı kuruma atanamaz
    hatali = admin_istemci.post(
        f"/api/institutions/{veri.kurum_id}/staff",
        json={"user_id": veri.kullanici_id},
    )
    assert hatali.status_code == 400

    # Diğer görevliyi bu kuruma da ata
    ata = admin_istemci.post(
        f"/api/institutions/{veri.kurum_id}/staff",
        json={"user_id": veri.diger_gorevli_id, "gorev_tanimi": "veteriner"},
    )
    assert ata.status_code == 201
    assert ata.get_json()["veri"]["gorev_tanimi"] == "veteriner"

    # Aynı atama tekrar yapılırsa 409
    tekrar = admin_istemci.post(
        f"/api/institutions/{veri.kurum_id}/staff",
        json={"user_id": veri.diger_gorevli_id},
    )
    assert tekrar.status_code == 409

    # Kurum görevlileri listesinde 2 kişi olmalı
    liste = admin_istemci.get(f"/api/institutions/{veri.kurum_id}/staff")
    assert liste.status_code == 200
    assert len(liste.get_json()["veri"]) == 2

    # Görevliyi çıkar
    sil = admin_istemci.delete(f"/api/institutions/{veri.kurum_id}/staff/{veri.diger_gorevli_id}")
    assert sil.status_code == 200

    # Tekrar çıkarmak isterse 404
    assert admin_istemci.delete(
        f"/api/institutions/{veri.kurum_id}/staff/{veri.diger_gorevli_id}"
    ).status_code == 404

    with app.app_context():
        kalan = db.session.scalars(
            db.select(KurumGorevlisi).where(KurumGorevlisi.kurum_id == veri.kurum_id)
        ).all()
        assert len(kalan) == 1