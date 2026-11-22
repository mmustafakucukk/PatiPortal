"""Backend 1 eksikleri: null/Türkçe doğrulama, yeni uçlar, filtreler ve süreç testleri."""

from datetime import date, time, timedelta

from app.extensions import db
from app.models import Hayvan, KurumGorevlisi
from app.sabitler import BasvuruDurumu, HayvanDurumu, RandevuDurumu, Rol


def _yeni_kullanici_kaydet(app, email, ad_soyad="Yeni Kullanici", sifre="GucluSifre123"):
    istemci = app.test_client()
    yanit = istemci.post(
        "/api/auth/register",
        json={
            "ad_soyad": ad_soyad,
            "email": email,
            "telefon": "05559998877",
            "sifre": sifre,
            "kvkk_onay": True,
        },
    )
    return istemci, yanit


def test_kayit_otomatik_oturum_acar_ve_profil_sifre_guncellenir(app):
    istemci, kayit = _yeni_kullanici_kaydet(app, "oto@test.local")
    assert kayit.status_code == 201

    # Ayrıca /login çağırmadan oturum açık olmalı
    me = istemci.get("/api/auth/me")
    assert me.status_code == 200
    assert me.get_json()["veri"]["email"] == "oto@test.local"

    # Profil güncelleme
    guncel = istemci.put(
        "/api/users/me",
        json={"ad_soyad": "Guncel Isim", "telefon": "05551112233"},
    )
    assert guncel.status_code == 200
    assert guncel.get_json()["veri"]["ad_soyad"] == "Guncel Isim"
    assert guncel.get_json()["veri"]["telefon"] == "05551112233"

    # Yanlış mevcut şifre reddedilir
    yanlis = istemci.put(
        "/api/auth/password",
        json={"mevcut_sifre": "Yanlis123", "yeni_sifre": "YeniSifre456"},
    )
    assert yanlis.status_code == 400
    assert "mevcut_sifre" in yanlis.get_json()["alanlar"]

    # Doğru mevcut şifreyle güncellenir
    degisti = istemci.put(
        "/api/auth/password",
        json={"mevcut_sifre": "GucluSifre123", "yeni_sifre": "YeniSifre456"},
    )
    assert degisti.status_code == 200

    # Çıkış sonrası eski şifre başarısız, yeni şifre başarılı
    istemci.post("/api/auth/logout")
    assert istemci.post("/api/auth/login", json={"email": "oto@test.local", "sifre": "GucluSifre123"}).status_code == 401
    assert istemci.post("/api/auth/login", json={"email": "oto@test.local", "sifre": "YeniSifre456"}).status_code == 200


def test_null_alanlar_ve_turkce_dogrulama_mesajlari(
    kullanici_istemci, gorevli_istemci, hayvan_ekle
):
    hayvan_id = hayvan_ekle(ad="Findik")
    hayvan2_id = hayvan_ekle(ad="Tarcin")

    # Zorunlu alanda null gelirse İngilizce "Field may not be null." yerine Türkçe döner
    hatali = kullanici_istemci.post(
        "/api/applications",
        json={
            "animal_id": hayvan_id,
            "ev_tipi": "Daire",
            "aciklama": None,
            "kvkk_onay": True,
        },
    )
    assert hatali.status_code == 400
    mesajlar = " ".join(hatali.get_json()["alanlar"]["aciklama"])
    assert "Field may not be null" not in mesajlar

    # onceki_deneyim: null kabul edilir
    b1 = kullanici_istemci.post(
        "/api/applications",
        json={
            "animal_id": hayvan_id,
            "ev_tipi": "Daire",
            "onceki_deneyim": None,
            "aciklama": "Yeterince uzun ve samimi bir sahiplenme açıklaması.",
            "kvkk_onay": True,
        },
    )
    assert b1.status_code == 201
    b1_id = b1.get_json()["veri"]["id"]

    # degerlendirme_notu: null kabul edilir
    red = gorevli_istemci.put(
        f"/api/applications/{b1_id}/reddet",
        json={"degerlendirme_notu": None},
    )
    assert red.status_code == 200
    assert red.get_json()["veri"]["degerlendirme_notu"] is None

    # teslim_notu: null kabul edilir
    b2 = kullanici_istemci.post(
        "/api/applications",
        json={
            "animal_id": hayvan2_id,
            "ev_tipi": "Bahceli ev",
            "onceki_deneyim": None,
            "aciklama": "Bahçeli evimizde rahatça yaşayabilecek uygun ortamımız var.",
            "kvkk_onay": True,
        },
    )
    b2_id = b2.get_json()["veri"]["id"]
    assert gorevli_istemci.put(f"/api/applications/{b2_id}/onayla").status_code == 200

    tamamla = gorevli_istemci.post(
        "/api/adoptions/complete",
        json={"application_id": b2_id, "teslim_notu": None},
    )
    assert tamamla.status_code == 201
    assert tamamla.get_json()["veri"]["teslim_notu"] is None


def test_kurum_il_ilce_filtre_ve_silme(admin_istemci, veri, hayvan_ekle):
    hayvan_ekle(ad="Mavis")

    yeni = admin_istemci.post(
        "/api/institutions",
        json={
            "ad": "Meram Bakimevi",
            "tur": "barinak",
            "il": "Konya",
            "ilce": "Meram",
            "adres": "Meram Yeni Yol, Konya",
        },
    )
    assert yeni.status_code == 201
    kurum_id = yeni.get_json()["veri"]["id"]
    assert yeni.get_json()["veri"]["il"] == "Konya"
    assert yeni.get_json()["veri"]["ilce"] == "Meram"

    # İl/ilçe filtresi
    filtreli = admin_istemci.get("/api/institutions?il=Konya&ilce=Meram")
    assert filtreli.status_code == 200
    assert any(k["id"] == kurum_id for k in filtreli.get_json()["veri"])

    # Bağlı hayvanı olan kurum silinemez (409)
    assert admin_istemci.delete(f"/api/institutions/{veri.kurum_id}").status_code == 409

    # Boş kurum silinebilir
    assert admin_istemci.delete(f"/api/institutions/{kurum_id}").status_code == 200
    assert admin_istemci.get(f"/api/institutions/{kurum_id}").status_code == 404


def test_kurum_yoneticisi_ve_eposta_ile_gorevli_atama(
    app, admin_istemci, gorevli_istemci, diger_gorevli_istemci, veri
):
    # Başlangıçta normal görevli staff yönetemez
    assert gorevli_istemci.get(f"/api/institutions/{veri.kurum_id}/staff").status_code == 403

    # Görevli 1'i kendi kurumunda 'yonetici' yap
    with app.app_context():
        atama = db.session.scalar(
            db.select(KurumGorevlisi).where(
                KurumGorevlisi.kurum_id == veri.kurum_id,
                KurumGorevlisi.kullanici_id == veri.gorevli_id,
            )
        )
        atama.gorev_tanimi = "yonetici"
        db.session.commit()

    # Yeni bir ziyaretçi kaydet
    _, kayit = _yeni_kullanici_kaydet(app, "aday@test.local", ad_soyad="Aday Gorevli")
    aday_id = kayit.get_json()["veri"]["id"]

    # Kurum yöneticisi kendi kurumuna e-posta ile ziyaretçiyi görevli olarak atayabilir
    ekle = gorevli_istemci.post(
        f"/api/institutions/{veri.kurum_id}/staff",
        json={"email": "aday@test.local", "gorev_tanimi": "veteriner"},
    )
    assert ekle.status_code == 201
    assert ekle.get_json()["veri"]["user_id"] == aday_id

    # Kurum yöneticisi 'yonetici' tanımı atayamaz ve başka kuruma erişemez
    assert gorevli_istemci.post(
        f"/api/institutions/{veri.kurum_id}/staff",
        json={"user_id": veri.kullanici_id, "gorev_tanimi": "yonetici"},
    ).status_code == 403
    assert gorevli_istemci.get(f"/api/institutions/{veri.diger_kurum_id}/staff").status_code == 403

    # Başka kurumun normal görevlisi erişemez
    assert diger_gorevli_istemci.get(f"/api/institutions/{veri.kurum_id}/staff").status_code == 403

    # Kurum yöneticisi eklediği personeli listeleyip çıkarabilir
    liste = gorevli_istemci.get(f"/api/institutions/{veri.kurum_id}/staff")
    assert liste.status_code == 200
    assert any(g["user_id"] == aday_id for g in liste.get_json()["veri"])

    assert gorevli_istemci.delete(f"/api/institutions/{veri.kurum_id}/staff/{aday_id}").status_code == 200

    # Admin kuruma görevli olarak atanamaz
    assert admin_istemci.post(
        f"/api/institutions/{veri.kurum_id}/staff",
        json={"user_id": veri.admin_id},
    ).status_code == 400


def test_rezerve_basvuru_iptal_ve_basvuruda_randevu(
    app, kullanici_istemci, gorevli_istemci, veri, hayvan_ekle
):
    hayvan_id = hayvan_ekle(ad="Bulut")
    yarin = (date.today() + timedelta(days=1)).isoformat()

    slot = gorevli_istemci.post(
        f"/api/institutions/{veri.kurum_id}/pickup-slots",
        json={"tarih": yarin, "baslangic_saati": "10:00", "bitis_saati": "11:00", "kapasite": 1},
    ).get_json()["veri"]

    basvuru = kullanici_istemci.post(
        "/api/applications",
        json={
            "animal_id": hayvan_id,
            "ev_tipi": "Daire",
            "aciklama": "Bulut için sıcak bir yuva hazırladık, ilgilenmeye hazırız.",
            "kvkk_onay": True,
        },
    ).get_json()["veri"]

    # Onayda hayvan 'rezerve' olur
    onay = gorevli_istemci.put(f"/api/applications/{basvuru['id']}/onayla")
    assert onay.status_code == 200
    assert onay.get_json()["veri"]["hayvan"]["durum"] == HayvanDurumu.REZERVE

    # Randevu alınınca /applications/me içinde görünür
    randevu = kullanici_istemci.post(
        "/api/appointments",
        json={"application_id": basvuru["id"], "slot_id": slot["id"]},
    )
    assert randevu.status_code == 201

    benim = kullanici_istemci.get("/api/applications/me").get_json()["veri"]
    kayit = next(b for b in benim if b["id"] == basvuru["id"])
    assert kayit["randevu"] is not None
    assert kayit["randevu"]["tarih"] == yarin
    assert kayit["randevu"]["durum"] == RandevuDurumu.PLANLANDI

    # Onaylı başvuru iptal edilince randevu iptal olur ve hayvan tekrar barinakta olur
    iptal = kullanici_istemci.put(f"/api/applications/{basvuru['id']}/iptal")
    assert iptal.status_code == 200
    assert iptal.get_json()["veri"]["durum"] == BasvuruDurumu.IPTAL
    assert iptal.get_json()["veri"]["randevu"]["durum"] == RandevuDurumu.IPTAL

    with app.app_context():
        assert db.session.get(Hayvan, hayvan_id).durum == HayvanDurumu.BARINAKTA


def test_toplu_teslim_saati_kapasite_filtre_gelmedi_ve_sahiplendirmeler(
    app, kullanici_istemci, gorevli_istemci, diger_gorevli_istemci, veri, hayvan_ekle
):
    baslangic = date.today() + timedelta(days=1)
    bitis = baslangic + timedelta(days=1)
    gunler = sorted({(baslangic.weekday() + 1) % 7, (bitis.weekday() + 1) % 7})

    # Toplu saat ekleme
    toplu = gorevli_istemci.post(
        f"/api/institutions/{veri.kurum_id}/pickup-slots/bulk",
        json={
            "baslangic_tarihi": baslangic.isoformat(),
            "bitis_tarihi": bitis.isoformat(),
            "gunler": gunler,
            "baslangic_saati": "10:00",
            "bitis_saati": "11:00",
            "sure": 30,
            "kapasite": 1,
        },
    )
    assert toplu.status_code == 201
    assert toplu.get_json()["veri"]["eklenen_sayisi"] == 4

    # Aynı aralık tekrar gönderilince çakışanlar atlanır
    tekrar = gorevli_istemci.post(
        f"/api/institutions/{veri.kurum_id}/pickup-slots/bulk",
        json={
            "baslangic_tarihi": baslangic.isoformat(),
            "bitis_tarihi": bitis.isoformat(),
            "gunler": gunler,
            "baslangic_saati": "10:00",
            "bitis_saati": "11:00",
            "sure": 30,
            "kapasite": 1,
        },
    )
    assert tekrar.status_code == 201
    assert tekrar.get_json()["veri"]["eklenen_sayisi"] == 0
    assert tekrar.get_json()["veri"]["atlanan_sayisi"] == 4

    slot_id = toplu.get_json()["veri"]["eklenenler"][0]["id"]
    slot_tarih = toplu.get_json()["veri"]["eklenenler"][0]["tarih"]

    # İki kullanıcı iki farklı hayvana onaylı başvuru alsın
    h1 = hayvan_ekle(ad="Susam")
    h2 = hayvan_ekle(ad="Poyraz")
    ikinci_istemci, _ = _yeni_kullanici_kaydet(app, "ikinci@test.local", ad_soyad="Ikinci Kisi")

    b1 = kullanici_istemci.post(
        "/api/applications",
        json={"animal_id": h1, "ev_tipi": "Daire", "aciklama": "Susam için başvuru açıklaması.", "kvkk_onay": True},
    ).get_json()["veri"]["id"]
    b2 = ikinci_istemci.post(
        "/api/applications",
        json={"animal_id": h2, "ev_tipi": "Daire", "aciklama": "Poyraz için başvuru açıklaması.", "kvkk_onay": True},
    ).get_json()["veri"]["id"]
    assert gorevli_istemci.put(f"/api/applications/{b1}/onayla").status_code == 200
    assert gorevli_istemci.put(f"/api/applications/{b2}/onayla").status_code == 200

    # Kapasitesi 1 olan saate 1. randevu alınır, 2. randevu 409 döner
    r1 = kullanici_istemci.post("/api/appointments", json={"application_id": b1, "slot_id": slot_id})
    assert r1.status_code == 201
    r1_id = r1.get_json()["veri"]["id"]

    slotlar = kullanici_istemci.get(f"/api/institutions/{veri.kurum_id}/pickup-slots").get_json()["veri"]
    dolu_slot = next(s for s in slotlar if s["id"] == slot_id)
    assert dolu_slot["dolu"] is True
    assert dolu_slot["dolu_sayisi"] == 1
    assert dolu_slot["kalan_kapasite"] == 0

    assert ikinci_istemci.post("/api/appointments", json={"application_id": b2, "slot_id": slot_id}).status_code == 409

    # Randevu kurum_id ve tarih filtresi
    filtreli = gorevli_istemci.get(f"/api/appointments?kurum_id={veri.kurum_id}&tarih={slot_tarih}")
    assert filtreli.status_code == 200
    assert len(filtreli.get_json()["veri"]) == 1
    assert gorevli_istemci.get(f"/api/appointments?kurum_id={veri.diger_kurum_id}").status_code == 403

    # 'gelmedi' durumu
    gelmedi = gorevli_istemci.put(f"/api/appointments/{r1_id}/gelmedi")
    assert gelmedi.status_code == 200
    assert gelmedi.get_json()["veri"]["durum"] == RandevuDurumu.GELMEDI

    # Teslim tamamla → /api/adoptions ve /api/adoptions/me (asi_karnesi dahil)
    assert gorevli_istemci.post("/api/adoptions/complete", json={"application_id": b1}).status_code == 201

    kurum_listesi = gorevli_istemci.get(f"/api/adoptions?kurum_id={veri.kurum_id}")
    assert kurum_listesi.status_code == 200
    assert len(kurum_listesi.get_json()["veri"]) == 1
    assert diger_gorevli_istemci.get(f"/api/adoptions?kurum_id={veri.kurum_id}").status_code == 403

    benim_sahiplendiklerim = kullanici_istemci.get("/api/adoptions/me").get_json()["veri"]
    assert len(benim_sahiplendiklerim) == 1
    assert "asi_karnesi" in benim_sahiplendiklerim[0]
    assert "asilar" in benim_sahiplendiklerim[0]["asi_karnesi"]


def test_istatistikler_ve_islem_kayitlari(
    admin_istemci, gorevli_istemci, veri, hayvan_ekle, ihtiyac_ekle
):
    hayvan_ekle(ad="Karamel")
    ihtiyac_ekle()

    # Kamu istatistiklerinde acik_ihtiyac bulunur
    kamu = admin_istemci.get("/api/stats/public").get_json()["veri"]
    assert kamu["acik_ihtiyac"] == 1

    # Panel istatistiklerinde kurum_id filtresi ve rezerve_hayvan
    panel = gorevli_istemci.get(f"/api/stats?kurum_id={veri.kurum_id}")
    assert panel.status_code == 200
    assert "rezerve_hayvan" in panel.get_json()["veri"]
    assert gorevli_istemci.get(f"/api/stats?kurum_id={veri.diger_kurum_id}").status_code == 403

    # İşlem kaydı üretmek için gerçek bir API işlemi yap
    assert admin_istemci.put(
        f"/api/institutions/{veri.kurum_id}",
        json={"il": "Konya", "ilce": "Selçuklu"},
    ).status_code == 200

    # İşlem kayıtları: sadece admin
    assert gorevli_istemci.get("/api/audit-logs").status_code == 403

    loglar = admin_istemci.get(f"/api/audit-logs?kurum_id={veri.kurum_id}&limit=10")
    assert loglar.status_code == 200
    govde = loglar.get_json()["veri"]
    assert "kayitlar" in govde and "sayfalama" in govde
    assert govde["sayfalama"]["toplam"] >= 1
    assert "kullanici" in govde["kayitlar"][0]