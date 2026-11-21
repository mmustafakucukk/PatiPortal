"""
Bölüm 4 testleri için hazırlık. Her test boş bir bellek-içi veritabanıyla başlar.

Hazır kayıtlar (`veri` fikstürü):
    kurum (barınak), diger_kurum (barınak), klinik
    kedi (zorunlu aşılar: Karma, Kuduz), kopek (zorunlu aşı yok)
    admin, gorevli (kurum'a bağlı), diger_gorevli (diger_kurum'a bağlı), kullanici

İstemciler: ziyaretci, kullanici_istemci, gorevli_istemci, diger_gorevli_istemci, admin_istemci

NOT: Testler sırasında app context açık tutulmaz; veritabanına doğrudan bakmak için
     `with app.app_context():` kullanılır. (Açık tutulursa Flask-Login giriş yapan
     kullanıcıyı istekler arasında hatırlar ve testler birbirini etkiler.)
"""

from types import SimpleNamespace

import pytest

from app import create_app
from app.extensions import db, login_manager
from app.models import (
    AcilIhtiyac, AsiGerekliligi, AsiTuru, Hayvan, HayvanAsisi, HayvanTuru, Kullanici, Kurum,
    KurumGorevlisi, simdi,
)
from app.sabitler import Aciliyet, Cinsiyet, IhtiyacTuru, KurumTuru, Rol


def _kullanici_yukle(kullanici_id):
    return db.session.get(Kullanici, int(kullanici_id))


@pytest.fixture
def app(tmp_path):
    uygulama = create_app("testing")
    uygulama.config["UPLOAD_KLASORU"] = str(tmp_path / "uploads")
    # create_app()'teki user_loader şimdilik None döndürüyor (Bölüm 3, Adım 3'te bağlanacak).
    # Testlerde giriş yapmış kullanıcıyı kullanabilmek için gerçek yükleyiciyi bağlıyoruz.
    # Abdulhafız user_loader'ı bağlayınca bu satır silinebilir.
    login_manager.user_loader(_kullanici_yukle)
    with uygulama.app_context():
        db.create_all()
    yield uygulama
    with uygulama.app_context():
        db.session.remove()
        db.drop_all()


def _kullanici(ad, email, rol):
    k = Kullanici(ad_soyad=ad, email=email, rol=rol, kvkk_onay_tarihi=simdi())
    k.sifre_belirle("Sifre1234")
    k.telefon = "05550000000"
    return k


@pytest.fixture
def veri(app):
    with app.app_context():
        kurum = Kurum(ad="Test Barınağı", tur=KurumTuru.BARINAK)
        diger_kurum = Kurum(ad="Diğer Barınak", tur=KurumTuru.BARINAK)
        klinik = Kurum(ad="Test Kliniği", tur=KurumTuru.KLINIK)
        kedi, kopek = HayvanTuru(ad="Kedi"), HayvanTuru(ad="Köpek")
        karma, kuduz = AsiTuru(ad="Karma"), AsiTuru(ad="Kuduz")
        admin = _kullanici("Admin", "admin@test.local", Rol.ADMIN)
        gorevli = _kullanici("Görevli", "gorevli@test.local", Rol.GOREVLI)
        diger_gorevli = _kullanici("Diğer Görevli", "diger@test.local", Rol.GOREVLI)
        kullanici = _kullanici("Ayşe Yılmaz", "ayse@test.local", Rol.ZIYARETCI)

        db.session.add_all([kurum, diger_kurum, klinik, kedi, kopek, karma, kuduz,
                            admin, gorevli, diger_gorevli, kullanici])
        db.session.add_all([
            AsiGerekliligi(hayvan_turu=kedi, asi_turu=karma),
            AsiGerekliligi(hayvan_turu=kedi, asi_turu=kuduz),
            KurumGorevlisi(kurum=kurum, kullanici=gorevli),
            KurumGorevlisi(kurum=diger_kurum, kullanici=diger_gorevli),
        ])
        db.session.commit()

        return SimpleNamespace(
            kurum_id=kurum.id, diger_kurum_id=diger_kurum.id, klinik_id=klinik.id,
            kedi_id=kedi.id, kopek_id=kopek.id, karma_id=karma.id, kuduz_id=kuduz.id,
            admin_id=admin.id, gorevli_id=gorevli.id, diger_gorevli_id=diger_gorevli.id,
            kullanici_id=kullanici.id,
        )


def _giris_yapmis_istemci(app, kullanici_id):
    istemci = app.test_client()
    with istemci.session_transaction() as oturum:
        oturum["_user_id"] = str(kullanici_id)
        oturum["_fresh"] = True
    return istemci


@pytest.fixture
def ziyaretci(app):
    return app.test_client()


@pytest.fixture
def kullanici_istemci(app, veri):
    return _giris_yapmis_istemci(app, veri.kullanici_id)


@pytest.fixture
def gorevli_istemci(app, veri):
    return _giris_yapmis_istemci(app, veri.gorevli_id)


@pytest.fixture
def diger_gorevli_istemci(app, veri):
    return _giris_yapmis_istemci(app, veri.diger_gorevli_id)


@pytest.fixture
def admin_istemci(app, veri):
    return _giris_yapmis_istemci(app, veri.admin_id)


# ------------------------------------------------------------------ Kayıt oluşturan yardımcılar
@pytest.fixture
def hayvan_ekle(app, veri):
    """hayvan_id = hayvan_ekle(ad="Tekir", durum=HayvanDurumu.TEDAVIDE)"""
    def _ekle(**alanlar):
        varsayilan = {"ad": "Pamuk", "tur_id": veri.kedi_id, "cinsiyet": Cinsiyet.DISI, "kurum_id": veri.kurum_id}
        varsayilan.update(alanlar)
        with app.app_context():
            hayvan = Hayvan(**varsayilan)
            db.session.add(hayvan)
            db.session.commit()
            return hayvan.id
    return _ekle


@pytest.fixture
def asi_ekle(app):
    """asi_ekle(hayvan_id, asi_turu_id, uygulama_tarihi, sonraki_tarih=None)"""
    def _ekle(hayvan_id, asi_turu_id, uygulama_tarihi, sonraki_tarih=None):
        with app.app_context():
            asi = HayvanAsisi(hayvan_id=hayvan_id, asi_turu_id=asi_turu_id,
                              uygulama_tarihi=uygulama_tarihi, sonraki_tarih=sonraki_tarih)
            db.session.add(asi)
            db.session.commit()
            return asi.id
    return _ekle


@pytest.fixture
def ihtiyac_ekle(app, veri):
    def _ekle(**alanlar):
        varsayilan = {"kurum_id": veri.kurum_id, "tur": IhtiyacTuru.MAMA, "baslik": "Kedi maması",
                      "miktar": 10, "birim": "kg", "aciliyet": Aciliyet.ORTA}
        varsayilan.update(alanlar)
        with app.app_context():
            ihtiyac = AcilIhtiyac(**varsayilan)
            db.session.add(ihtiyac)
            db.session.commit()
            return ihtiyac.id
    return _ekle
