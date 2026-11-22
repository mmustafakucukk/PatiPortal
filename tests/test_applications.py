"""Sahiplendirme başvuruları (/api/applications/*) testleri – Bölüm 3."""

from app.extensions import db
from app.models import Hayvan, IslemKaydi, Kullanici, SahiplendirmeBasvurusu, simdi
from app.sabitler import BasvuruDurumu, HayvanDurumu, Islem, Rol
from app.services.basvuru_servisi import OTOMATIK_RED_NOTU


def _basvuru_govdesi(animal_id, **degisiklikler):
    govde = {
        "animal_id": animal_id,
        "ev_tipi": "Bahçeli ev",
        "onceki_deneyim": "Daha önce 5 yıl kedi baktım.",
        "aciklama": "Sıcak ve güvenli bir yuva sunmak istiyorum.",
        "kvkk_onay": True,
    }
    govde.update(degisiklikler)
    return govde


def _ikinci_kullanici_istemci(app):
    with app.app_context():
        k = Kullanici(
            ad_soyad="Ali Veli",
            email="ali@test.local",
            rol=Rol.ZIYARETCI,
            kvkk_onay_tarihi=simdi(),
        )
        k.sifre_belirle("Sifre1234")
        k.telefon = "05559998877"
        db.session.add(k)
        db.session.commit()
        kid = k.id

    istemci = app.test_client()
    with istemci.session_transaction() as oturum:
        oturum["_user_id"] = str(kid)
        oturum["_fresh"] = True
    return istemci, kid


def test_basvuru_olusturma_ve_benim_basvurularim(app, ziyaretci, kullanici_istemci, hayvan_ekle):
    hayvan_id = hayvan_ekle(ad="Maviş")

    assert ziyaretci.post("/api/applications", json=_basvuru_govdesi(hayvan_id)).status_code == 401

    kvkk_yok = kullanici_istemci.post(
        "/api/applications", json=_basvuru_govdesi(hayvan_id, kvkk_onay=False)
    )
    assert kvkk_yok.status_code == 400
    assert "kvkk_onay" in kvkk_yok.get_json()["alanlar"]

    olustur = kullanici_istemci.post("/api/applications", json=_basvuru_govdesi(hayvan_id))
    assert olustur.status_code == 201
    v = olustur.get_json()["veri"]
    assert v["durum"] == BasvuruDurumu.BEKLEMEDE
    assert v["hayvan"]["ad"] == "Maviş"

    benim = kullanici_istemci.get("/api/applications/me")
    assert benim.status_code == 200
    assert len(benim.get_json()["veri"]) == 1

    with app.app_context():
        log = db.session.scalar(
            db.select(IslemKaydi).where(IslemKaydi.islem_turu == Islem.BASVURU_OLUSTURULDU)
        )
        assert log is not None and log.hedef_id == v["id"]


def test_uygun_olmayan_hayvana_basvuru_engellenir(kullanici_istemci, hayvan_ekle):
    tedavide_id = hayvan_ekle(ad="Boncuk", durum=HayvanDurumu.TEDAVIDE)
    sahiplendirildi_id = hayvan_ekle(ad="Zeytin", durum=HayvanDurumu.SAHIPLENDIRILDI)

    assert kullanici_istemci.post(
        "/api/applications", json=_basvuru_govdesi(tedavide_id)
    ).status_code == 409
    assert kullanici_istemci.post(
        "/api/applications", json=_basvuru_govdesi(sahiplendirildi_id)
    ).status_code == 409


def test_ayni_hayvana_ikinci_beklemede_basvuru_409_red_sonrasi_acilir(
    kullanici_istemci, gorevli_istemci, hayvan_ekle
):
    hayvan_id = hayvan_ekle()

    ilk = kullanici_istemci.post("/api/applications", json=_basvuru_govdesi(hayvan_id))
    assert ilk.status_code == 201
    basvuru_id = ilk.get_json()["veri"]["id"]

    # Aynı hayvana ikinci beklemede başvuru engellenir
    assert kullanici_istemci.post(
        "/api/applications", json=_basvuru_govdesi(hayvan_id)
    ).status_code == 409

    # Görevli reddettikten sonra kullanıcı tekrar başvurabilir
    red = gorevli_istemci.put(
        f"/api/applications/{basvuru_id}/reddet",
        json={"degerlendirme_notu": "Eksik bilgi"},
    )
    assert red.status_code == 200
    assert kullanici_istemci.post(
        "/api/applications", json=_basvuru_govdesi(hayvan_id)
    ).status_code == 201


def test_kurum_bazli_listeleme_ve_telefon_gizliligi(
    kullanici_istemci, gorevli_istemci, diger_gorevli_istemci, admin_istemci, veri, hayvan_ekle
):
    h1 = hayvan_ekle(ad="Kurum1 Kedisi", kurum_id=veri.kurum_id)
    h2 = hayvan_ekle(ad="Kurum2 Kedisi", kurum_id=veri.diger_kurum_id)

    b1 = kullanici_istemci.post("/api/applications", json=_basvuru_govdesi(h1)).get_json()["veri"]["id"]
    kullanici_istemci.post("/api/applications", json=_basvuru_govdesi(h2))

    # Normal kullanıcı görevli listesine erişemez
    assert kullanici_istemci.get("/api/applications").status_code == 403

    # Görevli 1 sadece kendi kurumundaki 1 başvuruyu görür; listede telefon dönmez
    liste1 = gorevli_istemci.get("/api/applications?durum=beklemede")
    assert liste1.status_code == 200
    kayitlar = liste1.get_json()["veri"]
    assert len(kayitlar) == 1
    assert kayitlar[0]["id"] == b1
    assert "telefon" not in kayitlar[0]["basvuran"]

    # Detayda yetkili görevliye telefon görünür, diğer kurum görevlisine 403 döner
    detay = gorevli_istemci.get(f"/api/applications/{b1}")
    assert detay.status_code == 200
    assert detay.get_json()["veri"]["basvuran"]["telefon"] == "05550000000"
    assert diger_gorevli_istemci.get(f"/api/applications/{b1}").status_code == 403

    # Admin tüm kurumların başvurularını görür
    assert len(admin_istemci.get("/api/applications").get_json()["veri"]) == 2


def test_basvuru_onay_hayvani_gunceller_ve_diger_basvurulari_reddeder(
    app, kullanici_istemci, gorevli_istemci, diger_gorevli_istemci, hayvan_ekle
):
    hayvan_id = hayvan_ekle(ad="Pati")
    ikinci_istemci, _ = _ikinci_kullanici_istemci(app)

    b1 = kullanici_istemci.post("/api/applications", json=_basvuru_govdesi(hayvan_id)).get_json()["veri"]["id"]
    b2 = ikinci_istemci.post("/api/applications", json=_basvuru_govdesi(hayvan_id)).get_json()["veri"]["id"]

    # Başka kurumun görevlisi onaylayamaz
    assert diger_gorevli_istemci.put(f"/api/applications/{b1}/onayla").status_code == 403

    onay = gorevli_istemci.put(f"/api/applications/{b1}/onayla")
    assert onay.status_code == 200
    assert onay.get_json()["veri"]["durum"] == BasvuruDurumu.ONAYLANDI
    assert onay.get_json()["veri"]["hayvan"]["durum"] == HayvanDurumu.REZERVE

    # Tekrar onaylama veya reddetme 409 döner
    assert gorevli_istemci.put(f"/api/applications/{b1}/onayla").status_code == 409
    assert gorevli_istemci.put(f"/api/applications/{b1}/reddet", json={}).status_code == 409

    with app.app_context():
        hayvan = db.session.get(Hayvan, hayvan_id)
        assert hayvan.durum == HayvanDurumu.REZERVE

        diger = db.session.get(SahiplendirmeBasvurusu, b2)
        assert diger.durum == BasvuruDurumu.REDDEDILDI
        assert diger.degerlendirme_notu == OTOMATIK_RED_NOTU

        log_turleri = {
            log.islem_turu for log in db.session.scalars(db.select(IslemKaydi)).all()
        }
        assert Islem.BASVURU_ONAYLANDI in log_turleri
        assert Islem.BASVURU_REDDEDILDI in log_turleri
        assert Islem.HAYVAN_DURUMU_DEGISTI in log_turleri


def test_basvuru_reddetme_hayvan_durumunu_degistirmez(
    app, kullanici_istemci, gorevli_istemci, hayvan_ekle
):
    hayvan_id = hayvan_ekle(ad="Duman")
    b1 = kullanici_istemci.post("/api/applications", json=_basvuru_govdesi(hayvan_id)).get_json()["veri"]["id"]

    red = gorevli_istemci.put(
        f"/api/applications/{b1}/reddet",
        json={"degerlendirme_notu": "Ev ortamı uygun değil."},
    )
    assert red.status_code == 200
    assert red.get_json()["veri"]["durum"] == BasvuruDurumu.REDDEDILDI
    assert red.get_json()["veri"]["degerlendirme_notu"] == "Ev ortamı uygun değil."

    with app.app_context():
        assert db.session.get(Hayvan, hayvan_id).durum == HayvanDurumu.BARINAKTA