"""Teslim saatleri, randevular, sahiplendirme kayıtları ve istatistik testleri – Bölüm 3."""

from datetime import date, timedelta

from app.extensions import db
from app.models import IslemKaydi, TeslimRandevusu, TeslimSaati
from app.sabitler import HayvanDurumu, IhtiyacDurumu, Islem, RandevuDurumu


def _onayli_basvuru_olustur(kullanici_istemci, gorevli_istemci, hayvan_id):
    basvuru = kullanici_istemci.post(
        "/api/applications",
        json={
            "animal_id": hayvan_id,
            "ev_tipi": "Daire",
            "aciklama": "Kedime sıcak bir yuva sunmak istiyorum.",
            "kvkk_onay": True,
        },
    ).get_json()["veri"]
    gorevli_istemci.put(f"/api/applications/{basvuru['id']}/onayla")
    return basvuru["id"]


def test_teslim_saati_ekleme_listeleme_ve_silme(
    ziyaretci, gorevli_istemci, diger_gorevli_istemci, veri
):
    yarin = (date.today() + timedelta(days=1)).isoformat()
    dun = (date.today() - timedelta(days=1)).isoformat()

    # Başka kurumun görevlisi ekleyemez
    assert diger_gorevli_istemci.post(
        f"/api/institutions/{veri.kurum_id}/pickup-slots",
        json={"tarih": yarin, "baslangic_saati": "10:00", "bitis_saati": "12:00"},
    ).status_code == 403

    # Geçmiş tarih ve ters saat aralığı reddedilir
    assert gorevli_istemci.post(
        f"/api/institutions/{veri.kurum_id}/pickup-slots",
        json={"tarih": dun, "baslangic_saati": "10:00", "bitis_saati": "12:00"},
    ).status_code == 400
    assert gorevli_istemci.post(
        f"/api/institutions/{veri.kurum_id}/pickup-slots",
        json={"tarih": yarin, "baslangic_saati": "14:00", "bitis_saati": "12:00"},
    ).status_code == 400

    ekle = gorevli_istemci.post(
        f"/api/institutions/{veri.kurum_id}/pickup-slots",
        json={"tarih": yarin, "baslangic_saati": "10:00", "bitis_saati": "12:00"},
    )
    assert ekle.status_code == 201
    slot_id = ekle.get_json()["veri"]["id"]

    # Herkes müsait saatleri görebilir
    liste = ziyaretci.get(f"/api/institutions/{veri.kurum_id}/pickup-slots")
    assert liste.status_code == 200
    assert len(liste.get_json()["veri"]) == 1

    # Silme
    assert diger_gorevli_istemci.delete(f"/api/pickup-slots/{slot_id}").status_code == 403
    assert gorevli_istemci.delete(f"/api/pickup-slots/{slot_id}").status_code == 200
    assert len(ziyaretci.get(f"/api/institutions/{veri.kurum_id}/pickup-slots").get_json()["veri"]) == 0


def test_randevu_iptal_yeniden_alma_ve_teslim_tamamlama_akisi(
    app, kullanici_istemci, gorevli_istemci, diger_gorevli_istemci, veri, hayvan_ekle
):
    hayvan_id = hayvan_ekle(ad="Köpük")
    yarin = (date.today() + timedelta(days=1)).isoformat()
    ertesi = (date.today() + timedelta(days=2)).isoformat()

    slot1 = gorevli_istemci.post(
        f"/api/institutions/{veri.kurum_id}/pickup-slots",
        json={"tarih": yarin, "baslangic_saati": "10:00", "bitis_saati": "11:00"},
    ).get_json()["veri"]["id"]
    slot2 = gorevli_istemci.post(
        f"/api/institutions/{veri.kurum_id}/pickup-slots",
        json={"tarih": ertesi, "baslangic_saati": "14:00", "bitis_saati": "15:00"},
    ).get_json()["veri"]["id"]

    # Onaylanmamış başvuru için randevu alınamaz
    bekleyen = kullanici_istemci.post(
        "/api/applications",
        json={
            "animal_id": hayvan_id,
            "ev_tipi": "Daire",
            "aciklama": "Sıcak ve güvenli bir yuva sunmak istiyorum.",
            "kvkk_onay": True,
        },
    ).get_json()["veri"]["id"]
    assert kullanici_istemci.post(
        "/api/appointments", json={"application_id": bekleyen, "slot_id": slot1}
    ).status_code == 409

    # Başvuru onaylanınca randevu alınabilir
    gorevli_istemci.put(f"/api/applications/{bekleyen}/onayla")
    r1 = kullanici_istemci.post(
        "/api/appointments",
        json={"application_id": bekleyen, "slot_id": slot1, "not_metni": "Taşıma çantasıyla geleceğim"},
    )
    assert r1.status_code == 201
    randevu_id = r1.get_json()["veri"]["id"]

    # Aktif randevusu olan saat silinemez (409)
    assert gorevli_istemci.delete(f"/api/pickup-slots/{slot1}").status_code == 409

    # Görevli kurum randevularını görür; diğer kurum görevlisi görmez
    assert len(gorevli_istemci.get("/api/appointments").get_json()["veri"]) == 1
    assert len(diger_gorevli_istemci.get("/api/appointments").get_json()["veri"]) == 0

    # Kullanıcı randevusunu iptal edip yeni saat alabilir
    iptal = kullanici_istemci.put(f"/api/appointments/{randevu_id}/iptal")
    assert iptal.status_code == 200
    assert iptal.get_json()["veri"]["durum"] == RandevuDurumu.IPTAL

    r2 = kullanici_istemci.post(
        "/api/appointments", json={"application_id": bekleyen, "slot_id": slot2}
    )
    assert r2.status_code == 201
    assert r2.get_json()["veri"]["teslim_saati_id"] == slot2

    # Görevli teslimatı tamamlar
    assert diger_gorevli_istemci.post(
        "/api/adoptions/complete", json={"application_id": bekleyen}
    ).status_code == 403

    tamamla = gorevli_istemci.post(
        "/api/adoptions/complete",
        json={"application_id": bekleyen, "teslim_notu": "Kimlik ve aşı karnesi teslim edildi"},
    )
    assert tamamla.status_code == 201
    assert tamamla.get_json()["veri"]["hayvan"]["ad"] == "Köpük"

    # Tekrar teslimat 409
    assert gorevli_istemci.post(
        "/api/adoptions/complete", json={"application_id": bekleyen}
    ).status_code == 409

    # Kullanıcının sahiplendiği hayvanlar sekmesinde görünür
    sahiplendiklerim = kullanici_istemci.get("/api/adoptions/me")
    assert sahiplendiklerim.status_code == 200
    assert len(sahiplendiklerim.get_json()["veri"]) == 1

    # Geçmiş randevusu olan slot2 silindiğinde FK hatası vermeden pasifleştirilir
    assert gorevli_istemci.delete(f"/api/pickup-slots/{slot2}").status_code == 200

    with app.app_context():
        assert db.session.get(TeslimRandevusu, randevu_id).durum == RandevuDurumu.TAMAMLANDI
        assert db.session.get(TeslimSaati, slot2).aktif is False
        log = db.session.scalar(
            db.select(IslemKaydi).where(IslemKaydi.islem_turu == Islem.SAHIPLENDIRME_TAMAMLANDI)
        )
        assert log is not None


def test_kamu_ve_gorevli_istatistikleri(
    ziyaretci,
    kullanici_istemci,
    gorevli_istemci,
    diger_gorevli_istemci,
    admin_istemci,
    veri,
    hayvan_ekle,
    asi_ekle,
    ihtiyac_ekle,
):
    bugun = date.today()
    h1 = hayvan_ekle(ad="Barinakta1", kurum_id=veri.kurum_id, durum=HayvanDurumu.BARINAKTA)
    h2 = hayvan_ekle(ad="Tedavide1", kurum_id=veri.kurum_id, durum=HayvanDurumu.TEDAVIDE)
    h3 = hayvan_ekle(ad="Teslim1", kurum_id=veri.kurum_id, durum=HayvanDurumu.BARINAKTA)
    hayvan_ekle(ad="DigerKurum", kurum_id=veri.diger_kurum_id, durum=HayvanDurumu.BARINAKTA)

    # h1'e bekleyen başvuru, h3'e onaylı başvuru + teslimat
    kullanici_istemci.post(
        "/api/applications",
        json={
            "animal_id": h1,
            "ev_tipi": "Daire",
            "aciklama": "Çok iyi bakacağım söz veriyorum.",
            "kvkk_onay": True,
        },
    )
    b3 = _onayli_basvuru_olustur(kullanici_istemci, gorevli_istemci, h3)
    gorevli_istemci.post("/api/adoptions/complete", json={"application_id": b3})

    # Aşılar: h1 için bu hafta gelecek doz, h2 için gecikmiş doz
    # h1 için eski gecikmiş dozun üstüne yeni doz girilmiş olsun (gecikmiş sayılmamalı)
    asi_ekle(h1, veri.karma_id, bugun - timedelta(days=40), bugun - timedelta(days=10))
    asi_ekle(h1, veri.karma_id, bugun - timedelta(days=5), bugun + timedelta(days=3))
    asi_ekle(h2, veri.kuduz_id, bugun - timedelta(days=30), bugun - timedelta(days=2))

    # İhtiyaçlar: 1 açık, 1 karşılanmış
    ihtiyac_ekle(kurum_id=veri.kurum_id, durum=IhtiyacDurumu.ACIK)
    ihtiyac_ekle(kurum_id=veri.kurum_id, durum=IhtiyacDurumu.KARSILANDI)

    # Kamu istatistikleri herkese açık
    kamu = ziyaretci.get("/api/stats/public")
    assert kamu.status_code == 200
    kv = kamu.get_json()["veri"]
    assert kv["barinaktaki_hayvan"] == 2
    assert kv["sahiplendirilen_hayvan"] == 1
    assert kv["aktif_kurum"] == 3

    # Panel istatistikleri sadece görevli/admin
    assert ziyaretci.get("/api/stats").status_code == 401
    assert kullanici_istemci.get("/api/stats").status_code == 403

    panel = gorevli_istemci.get("/api/stats")
    assert panel.status_code == 200
    pv = panel.get_json()["veri"]
    assert pv["toplam_hayvan"] == 3
    assert pv["barinaktaki_hayvan"] == 1
    assert pv["tedavideki_hayvan"] == 1
    assert pv["sahiplendirilen_hayvan"] == 1
    assert pv["bekleyen_basvuru"] == 1
    assert pv["acik_ihtiyac"] == 1
    assert pv["bu_hafta_asisi_gelen"] == 1
    assert pv["geciken_asi"] == 1
    assert pv["aylik_basvuru"] == 2
    assert pv["aylik_sahiplendirme"] == 1

    # Diğer görevli sadece kendi kurumunu (1 hayvan), admin tüm kurumları (4 hayvan) görür
    assert diger_gorevli_istemci.get("/api/stats").get_json()["veri"]["toplam_hayvan"] == 1
    assert admin_istemci.get("/api/stats").get_json()["veri"]["toplam_hayvan"] == 4