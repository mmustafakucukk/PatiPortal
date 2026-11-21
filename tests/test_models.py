"""Veritabanı şeması, kısıtlar, şifreleme ve seed testleri."""

from datetime import date, time, timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import (
    DestekTalebi,
    Hayvan,
    Kullanici,
    Kurum,
    KurumGorevlisi,
    SahiplendirmeBasvurusu,
    SahiplendirmeKaydi,
    TeslimRandevusu,
    TeslimSaati,
    simdi,
)
from app.sabitler import BasvuruDurumu, Cinsiyet, Rol
from app.seed import veritabanini_doldur


def test_tum_16_tablo_olusturuldu(app):
    with app.app_context():
        assert len(db.metadata.tables) == 16


def test_sqlite_yabanci_anahtar_korumasi_aktif(app, veri):
    with app.app_context():
        hayvan = Hayvan(
            ad="GecersizKurum",
            tur_id=veri.kedi_id,
            cinsiyet=Cinsiyet.DISI,
            kurum_id=999999,
        )
        db.session.add(hayvan)
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_telefon_veritabaninda_sifreli_saklanir(app, veri, ihtiyac_ekle):
    ihtiyac_id = ihtiyac_ekle()
    with app.app_context():
        kullanici = db.session.get(Kullanici, veri.kullanici_id)
        assert kullanici.telefon == "05550000000"
        assert kullanici._telefon != "05550000000"

        soz = DestekTalebi(
            ihtiyac_id=ihtiyac_id,
            ad_soyad="Gizli Destekçi",
            miktar=5.0,
            kvkk_onay_tarihi=simdi(),
        )
        soz.telefon = "05557778899"
        db.session.add(soz)
        db.session.commit()

        assert soz.telefon == "05557778899"
        assert soz._telefon != "05557778899"


def test_ayni_email_ve_ayni_kurum_gorevlisi_tekrarlanamaz(app, veri):
    with app.app_context():
        kopya_kullanici = Kullanici(
            ad_soyad="Kopya",
            email="ayse@test.local",
            rol=Rol.ZIYARETCI,
            kvkk_onay_tarihi=simdi(),
        )
        kopya_kullanici.sifre_belirle("Sifre1234")
        db.session.add(kopya_kullanici)
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()

        kopya_atama = KurumGorevlisi(kurum_id=veri.kurum_id, kullanici_id=veri.gorevli_id)
        db.session.add(kopya_atama)
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_kismi_tekillik_ve_birebir_teslim_kisitlari(app, veri, hayvan_ekle):
    hayvan_id = hayvan_ekle()
    with app.app_context():
        b1 = SahiplendirmeBasvurusu(
            hayvan_id=hayvan_id,
            kullanici_id=veri.kullanici_id,
            ev_tipi="Daire",
            aciklama="İlk başvuru",
            kvkk_onay_tarihi=simdi(),
            durum=BasvuruDurumu.BEKLEMEDE,
        )
        db.session.add(b1)
        db.session.commit()

        # Aynı kullanıcı aynı hayvana ikinci BEKLEMEDE başvuru atamaz (uq_bekleyen_basvuru)
        b2 = SahiplendirmeBasvurusu(
            hayvan_id=hayvan_id,
            kullanici_id=veri.kullanici_id,
            ev_tipi="Daire",
            aciklama="İkinci başvuru",
            kvkk_onay_tarihi=simdi(),
            durum=BasvuruDurumu.BEKLEMEDE,
        )
        db.session.add(b2)
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()

        # İlk başvuru onaylanınca tek randevu ve tek sahiplendirme kaydı kısıtı çalışır
        b1.durum = BasvuruDurumu.ONAYLANDI
        slot = TeslimSaati(
            kurum_id=veri.kurum_id,
            tarih=date.today() + timedelta(days=1),
            baslangic_saati=time(10, 0),
            bitis_saati=time(11, 0),
        )
        db.session.add(slot)
        db.session.flush()

        db.session.add(
            TeslimRandevusu(
                basvuru_id=b1.id,
                teslim_saati_id=slot.id,
                kullanici_id=veri.kullanici_id,
            )
        )
        db.session.commit()

        db.session.add(
            TeslimRandevusu(
                basvuru_id=b1.id,
                teslim_saati_id=slot.id,
                kullanici_id=veri.kullanici_id,
            )
        )
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()

        db.session.add(
            SahiplendirmeKaydi(
                hayvan_id=hayvan_id,
                kullanici_id=veri.kullanici_id,
                basvuru_id=b1.id,
                teslim_eden_id=veri.gorevli_id,
            )
        )
        db.session.commit()

        db.session.add(
            SahiplendirmeKaydi(
                hayvan_id=hayvan_id,
                kullanici_id=veri.kullanici_id,
                basvuru_id=b1.id,
                teslim_eden_id=veri.gorevli_id,
            )
        )
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_seed_idempotent_ve_demo_hesabi_giris_yapabilir(app):
    with app.app_context():
        assert veritabanini_doldur() is True
        kurum_sayisi = db.session.query(Kurum).count()
        assert kurum_sayisi == 3

        # İkinci çağrı kopya veri eklemez
        assert veritabanini_doldur() is False
        assert db.session.query(Kurum).count() == kurum_sayisi

    istemci = app.test_client()
    giris = istemci.post(
        "/api/auth/login",
        json={"email": "admin@patiportal.local", "sifre": "Admin1234!"},
    )
    assert giris.status_code == 200
    assert giris.get_json()["veri"]["rol"] == Rol.ADMIN