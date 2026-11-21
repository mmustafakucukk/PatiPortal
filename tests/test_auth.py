"""Kimlik doğrulama (/api/auth/*) testleri – Bölüm 3."""

from app.extensions import db, limiter
from app.models import IslemKaydi, Kullanici
from app.sabitler import Islem, Rol


def _kayit_verisi(**degisiklikler):
    veri = {
        "ad_soyad": "Mehmet Demir",
        "email": "mehmet@ornek.com",
        "telefon": "0555 123 45 67",
        "sifre": "GucluSifre123",
        "kvkk_onay": True,
    }
    veri.update(degisiklikler)
    return veri


def test_kayit_basarili_sifre_hash_ve_telefon_sifreli(app, ziyaretci):
    yanit = ziyaretci.post("/api/auth/register", json=_kayit_verisi())
    assert yanit.status_code == 201
    govde = yanit.get_json()
    assert govde["basarili"] is True
    assert govde["veri"]["email"] == "mehmet@ornek.com"
    assert govde["veri"]["rol"] == Rol.ZIYARETCI
    assert govde["veri"]["telefon"] == "05551234567"
    assert "sifre_hash" not in govde["veri"]
    assert "sifre" not in govde["veri"]

    with app.app_context():
        k = db.session.scalar(db.select(Kullanici).where(Kullanici.email == "mehmet@ornek.com"))
        assert k is not None
        assert k.sifre_hash != "GucluSifre123"
        assert k.sifre_dogru_mu("GucluSifre123")
        assert k._telefon != "05551234567"  # veritabanında şifreli saklanmalı
        assert k.telefon == "05551234567"
        assert k.kvkk_onay_tarihi is not None

        log = db.session.scalar(
            db.select(IslemKaydi).where(IslemKaydi.islem_turu == Islem.KULLANICI_KAYIT_OLDU)
        )
        assert log is not None and log.hedef_id == k.id


def test_kayit_kvkk_onaysiz_reddedilir(ziyaretci):
    yanit = ziyaretci.post("/api/auth/register", json=_kayit_verisi(kvkk_onay=False))
    assert yanit.status_code == 400
    govde = yanit.get_json()
    assert govde["basarili"] is False
    assert "kvkk_onay" in govde["alanlar"]


def test_kayit_kisa_sifre_reddedilir(ziyaretci):
    yanit = ziyaretci.post("/api/auth/register", json=_kayit_verisi(sifre="1234567"))
    assert yanit.status_code == 400
    assert "sifre" in yanit.get_json()["alanlar"]


def test_kayit_ayni_email_engellenir(ziyaretci, veri):
    yanit = ziyaretci.post("/api/auth/register", json=_kayit_verisi(email="AYSE@test.local"))
    assert yanit.status_code == 409
    assert "email" in yanit.get_json()["alanlar"]


def test_giris_me_ve_cikis_akisi(ziyaretci, veri):
    # Görevli girişi
    giris = ziyaretci.post(
        "/api/auth/login",
        json={"email": "GOREVLI@test.local", "sifre": "Sifre1234"},
    )
    assert giris.status_code == 200
    govde = giris.get_json()["veri"]
    assert govde["rol"] == Rol.GOREVLI
    assert len(govde["yetkili_kurumlar"]) == 1
    assert govde["yetkili_kurumlar"][0]["id"] == veri.kurum_id

    # /api/auth/me aktif oturumu döner
    me = ziyaretci.get("/api/auth/me")
    assert me.status_code == 200
    assert me.get_json()["veri"]["id"] == veri.gorevli_id

    # Çıkış sonrası /api/auth/me 401 döner
    cikis = ziyaretci.post("/api/auth/logout")
    assert cikis.status_code == 200
    assert ziyaretci.get("/api/auth/me").status_code == 401


def test_giris_yanlis_sifre_ve_olmayan_email(ziyaretci, veri):
    y1 = ziyaretci.post("/api/auth/login", json={"email": "ayse@test.local", "sifre": "Yanlis123"})
    y2 = ziyaretci.post("/api/auth/login", json={"email": "yok@test.local", "sifre": "Sifre1234"})
    assert y1.status_code == 401
    assert y2.status_code == 401


def test_giris_pasif_hesap_reddedilir(app, ziyaretci, veri):
    with app.app_context():
        k = db.session.get(Kullanici, veri.kullanici_id)
        k.aktif = False
        db.session.commit()

    yanit = ziyaretci.post("/api/auth/login", json={"email": "ayse@test.local", "sifre": "Sifre1234"})
    assert yanit.status_code == 403


def test_yetkisiz_me_ve_logout_401(ziyaretci):
    assert ziyaretci.get("/api/auth/me").status_code == 401
    assert ziyaretci.post("/api/auth/logout").status_code == 401


def test_csrf_token_alinir(ziyaretci):
    yanit = ziyaretci.get("/api/auth/csrf-token")
    assert yanit.status_code == 200
    token = yanit.get_json()["veri"]["csrf_token"]
    assert isinstance(token, str) and len(token) > 10


def test_giris_hiz_siniri_dakikada_5_deneme(monkeypatch):
    from app import create_app
    from config import TestingConfig

    monkeypatch.setattr(TestingConfig, "RATELIMIT_ENABLED", True)
    uygulama = create_app("testing")
    with uygulama.app_context():
        db.create_all()

    istemci = uygulama.test_client()
    try:
        for _ in range(5):
            r = istemci.post("/api/auth/login", json={"email": "ayse@test.local", "sifre": "Yanlis123"})
            assert r.status_code == 401
        altinci = istemci.post("/api/auth/login", json={"email": "ayse@test.local", "sifre": "Yanlis123"})
        assert altinci.status_code == 429
        assert altinci.get_json()["basarili"] is False
    finally:
        limiter.reset()
        limiter.enabled = False
        with uygulama.app_context():
            db.session.remove()
            db.drop_all()