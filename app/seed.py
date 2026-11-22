"""
Geliştirme ve demo ortamı için örnek veri (seed) üretici.

Kullanım:
    flask --app app:create_app seed
    flask --app app:create_app seed --sifirla
"""

from datetime import date, time, timedelta

import click

from app.extensions import db
from app.models import (
    AcilIhtiyac,
    AsiGerekliligi,
    AsiTuru,
    DestekTalebi,
    Hayvan,
    HayvanAsisi,
    HayvanTuru,
    IslemKaydi,
    Kullanici,
    Kurum,
    KurumGorevlisi,
    SahiplendirmeBasvurusu,
    SahiplendirmeKaydi,
    TeslimRandevusu,
    TeslimSaati,
    simdi,
)
from app.sabitler import (
    Aciliyet,
    BasvuruDurumu,
    Cinsiyet,
    DestekDurumu,
    HayvanDurumu,
    IhtiyacDurumu,
    IhtiyacTuru,
    Islem,
    KurumTuru,
    RandevuDurumu,
    Rol,
)


def _kullanici_olustur(ad_soyad, email, telefon, sifre, rol):
    k = Kullanici(
        ad_soyad=ad_soyad,
        email=email,
        rol=rol,
        kvkk_onay_tarihi=simdi(),
        aktif=True,
    )
    k.telefon = telefon
    k.sifre_belirle(sifre)
    return k


def veritabanini_doldur(sifirla=False):
    """Örnek verileri veritabanına ekler. Zaten veri varsa tekrar eklemez."""
    if sifirla:
        db.drop_all()
        db.create_all()

    if db.session.scalar(db.select(Kurum.id).limit(1)) is not None:
        return False

    bugun = date.today()
    zaman = simdi()

    # 1. Kurumlar
    merkez = Kurum(
        ad="Konya Merkez Hayvan Barınağı",
        tur=KurumTuru.BARINAK,
        adres="Selçuklu, Konya",
        telefon="0332 222 10 10",
        email="merkez@patiportal.local",
    )
    selcuklu = Kurum(
        ad="Selçuklu Geçici Bakımevi",
        tur=KurumTuru.BARINAK,
        adres="Bosna Hersek Mah., Selçuklu / Konya",
        telefon="0332 222 20 20",
        email="selcuklu@patiportal.local",
    )
    klinik = Kurum(
        ad="Merkez Veteriner Kliniği",
        tur=KurumTuru.KLINIK,
        adres="Meram, Konya",
        telefon="0332 222 30 30",
        email="klinik@patiportal.local",
    )
    db.session.add_all([merkez, selcuklu, klinik])

    # 2. Kullanıcılar
    admin = _kullanici_olustur(
        "Sistem Yöneticisi", "admin@patiportal.local", "05550000001", "Admin1234!", Rol.ADMIN
    )
    gorevli1 = _kullanici_olustur(
        "Zeynep Kaya", "gorevli@patiportal.local", "05550000002", "Gorevli1234!", Rol.GOREVLI
    )
    gorevli2 = _kullanici_olustur(
        "Ahmet Demir", "gorevli2@patiportal.local", "05550000003", "Gorevli1234!", Rol.GOREVLI
    )
    ayse = _kullanici_olustur(
        "Ayşe Yılmaz", "ayse@patiportal.local", "05551112233", "Kullanici1234!", Rol.ZIYARETCI
    )
    mehmet = _kullanici_olustur(
        "Mehmet Çelik", "mehmet@patiportal.local", "05554445566", "Kullanici1234!", Rol.ZIYARETCI
    )
    db.session.add_all([admin, gorevli1, gorevli2, ayse, mehmet])
    db.session.flush()

    # 3. Kurum görevlileri
    db.session.add_all([
        KurumGorevlisi(kurum=merkez, kullanici=gorevli1, gorev_tanimi="yonetici"),
        KurumGorevlisi(kurum=selcuklu, kullanici=gorevli2, gorev_tanimi="veteriner"),
    ])

    # 4. Hayvan türleri, aşı türleri ve zorunlu aşı eşleştirmeleri
    kedi = HayvanTuru(ad="Kedi")
    kopek = HayvanTuru(ad="Köpek")
    kus = HayvanTuru(ad="Kuş")
    db.session.add_all([kedi, kopek, kus])

    karma = AsiTuru(ad="Karma", aciklama="Temel viral hastalıklara karşı koruyucu karma aşı.")
    kuduz = AsiTuru(ad="Kuduz", aciklama="Yıllık zorunlu kuduz aşısı.")
    parazit = AsiTuru(ad="İç-Dış Parazit", aciklama="Düzenli parazit uygulaması.")
    losemi = AsiTuru(ad="Lösemi", aciklama="Kediler için lösemi aşısı.")
    db.session.add_all([karma, kuduz, parazit, losemi])
    db.session.flush()

    db.session.add_all([
        AsiGerekliligi(hayvan_turu=kedi, asi_turu=karma, tekrar_araligi_gun=365),
        AsiGerekliligi(hayvan_turu=kedi, asi_turu=kuduz, tekrar_araligi_gun=365),
        AsiGerekliligi(hayvan_turu=kopek, asi_turu=karma, tekrar_araligi_gun=365),
        AsiGerekliligi(hayvan_turu=kopek, asi_turu=kuduz, tekrar_araligi_gun=365),
        AsiGerekliligi(hayvan_turu=kopek, asi_turu=parazit, tekrar_araligi_gun=90),
    ])

    # 5. Hayvanlar
    pamuk = Hayvan(
        ad="Pamuk",
        tur=kedi,
        cins="Tekir",
        cinsiyet=Cinsiyet.DISI,
        dogum_tarihi=bugun - timedelta(days=420),
        saglik_durumu="Sağlıklı, genel muayenesi tamamlandı.",
        karakter_notu="Sakin, çocuklarla ve diğer kedilerle iyi anlaşır.",
        kisirlastirildi=True,
        kurum=merkez,
        durum=HayvanDurumu.BARINAKTA,
        ekleyen_id=gorevli1.id,
    )
    karabas = Hayvan(
        ad="Karabaş",
        tur=kopek,
        cins="Golden Melezi",
        cinsiyet=Cinsiyet.ERKEK,
        dogum_tarihi=bugun - timedelta(days=760),
        saglik_durumu="Sağlıklı, enerjik.",
        karakter_notu="Oyuncu, yürüyüşü çok sever.",
        kisirlastirildi=True,
        kurum=merkez,
        durum=HayvanDurumu.BARINAKTA,
        ekleyen_id=gorevli1.id,
    )
    boncuk = Hayvan(
        ad="Boncuk",
        tur=kedi,
        cins="Van Kedisi Melezi",
        cinsiyet=Cinsiyet.DISI,
        dogum_tarihi=bugun - timedelta(days=150),
        saglik_durumu="Ön patisindeki incinme nedeniyle tedavi altında.",
        karakter_notu="Sevecen, kucakta uyumayı sever.",
        kisirlastirildi=False,
        kurum=merkez,
        durum=HayvanDurumu.TEDAVIDE,
        ekleyen_id=gorevli1.id,
    )
    duman = Hayvan(
        ad="Duman",
        tur=kedi,
        cins="Sarman",
        cinsiyet=Cinsiyet.ERKEK,
        dogum_tarihi=None,  # Yaşı bilinmiyor senaryosu
        saglik_durumu="Sağlıklı.",
        karakter_notu="Meraklı ve uyumlu.",
        kisirlastirildi=True,
        kurum=selcuklu,
        durum=HayvanDurumu.BARINAKTA,
        ekleyen_id=gorevli2.id,
    )
    zeytin = Hayvan(
        ad="Zeytin",
        tur=kopek,
        cins="Terrier",
        cinsiyet=Cinsiyet.DISI,
        dogum_tarihi=bugun - timedelta(days=500),
        saglik_durumu="Tüm aşıları tamamlandı, yeni yuvasına teslim edildi.",
        karakter_notu="İtaatkar ve neşeli.",
        kisirlastirildi=True,
        kurum=merkez,
        durum=HayvanDurumu.SAHIPLENDIRILDI,
        ekleyen_id=gorevli1.id,
    )
    db.session.add_all([pamuk, karabas, boncuk, duman, zeytin])
    db.session.flush()

    # 6. Aşı kayıtları (zamanında, yaklaşan, gecikmiş, tamamlandı)
    db.session.add_all([
        # Pamuk: zorunlu aşıları tam
        HayvanAsisi(
            hayvan=pamuk, asi_turu=karma,
            uygulama_tarihi=bugun - timedelta(days=60),
            sonraki_tarih=bugun + timedelta(days=300),
            uygulayan_kurum=klinik, giren_id=gorevli1.id,
        ),
        HayvanAsisi(
            hayvan=pamuk, asi_turu=kuduz,
            uygulama_tarihi=bugun - timedelta(days=45),
            sonraki_tarih=bugun + timedelta(days=320),
            uygulayan_kurum=klinik, giren_id=gorevli1.id,
        ),
        # Karabaş: karma yaklaşıyor (3 gün sonra), kuduz zamanında, parazit gecikmiş
        HayvanAsisi(
            hayvan=karabas, asi_turu=karma,
            uygulama_tarihi=bugun - timedelta(days=27),
            sonraki_tarih=bugun + timedelta(days=3),
            uygulayan_kurum=klinik, giren_id=gorevli1.id,
        ),
        HayvanAsisi(
            hayvan=karabas, asi_turu=kuduz,
            uygulama_tarihi=bugun - timedelta(days=30),
            sonraki_tarih=bugun + timedelta(days=335),
            uygulayan_kurum=klinik, giren_id=gorevli1.id,
        ),
        HayvanAsisi(
            hayvan=karabas, asi_turu=parazit,
            uygulama_tarihi=bugun - timedelta(days=95),
            sonraki_tarih=bugun - timedelta(days=5),
            uygulayan_kurum=klinik, giren_id=gorevli1.id,
        ),
        # Boncuk: tek doz yapılmış, sonraki doz yok (tamamlandı)
        HayvanAsisi(
            hayvan=boncuk, asi_turu=parazit,
            uygulama_tarihi=bugun - timedelta(days=10),
            sonraki_tarih=None,
            uygulayan_kurum=klinik, giren_id=gorevli1.id,
        ),
    ])

    # 7. Acil ihtiyaçlar ve destek sözleri
    mama_ihtiyaci = AcilIhtiyac(
        kurum=merkez,
        tur=IhtiyacTuru.MAMA,
        baslik="Yavru Kedi Maması",
        aciklama="Barınağımıza yeni gelen yavrular için kuru ve yaş mama ihtiyacı.",
        miktar=40.0,
        birim="kg",
        aciliyet=Aciliyet.YUKSEK,
        durum=IhtiyacDurumu.ACIK,
        olusturan_id=gorevli1.id,
    )
    battaniye_ihtiyaci = AcilIhtiyac(
        kurum=selcuklu,
        tur=IhtiyacTuru.MALZEME,
        baslik="Kışlık Polar Battaniye",
        aciklama="Gece soğukları için temiz battaniye desteği.",
        miktar=25.0,
        birim="adet",
        aciliyet=Aciliyet.ORTA,
        durum=IhtiyacDurumu.ACIK,
        olusturan_id=gorevli2.id,
    )
    ilac_ihtiyaci = AcilIhtiyac(
        kurum=merkez,
        tur=IhtiyacTuru.ILAC,
        baslik="Vitamin Takviyesi",
        aciklama="Tedavideki hayvanlar için destek vitamini.",
        miktar=10.0,
        birim="kutu",
        aciliyet=Aciliyet.DUSUK,
        durum=IhtiyacDurumu.KARSILANDI,
        olusturan_id=gorevli1.id,
        kapanma_tarihi=zaman,
    )
    db.session.add_all([mama_ihtiyaci, battaniye_ihtiyaci, ilac_ihtiyaci])
    db.session.flush()

    soz1 = DestekTalebi(
        ihtiyac=mama_ihtiyaci,
        kullanici_id=ayse.id,
        ad_soyad=ayse.ad_soyad,
        miktar=15.0,
        aciklama="Hafta sonu barınağa getireceğim.",
        durum=DestekDurumu.SOZ_VERILDI,
        kvkk_onay_tarihi=zaman,
    )
    soz1.telefon = "05551112233"

    soz2 = DestekTalebi(
        ihtiyac=ilac_ihtiyaci,
        kullanici_id=mehmet.id,
        ad_soyad=mehmet.ad_soyad,
        miktar=10.0,
        aciklama="Teslim edildi.",
        durum=DestekDurumu.TESLIM_EDILDI,
        kvkk_onay_tarihi=zaman,
    )
    soz2.telefon = "05554445566"
    db.session.add_all([soz1, soz2])

    # 8. Sahiplendirme başvuruları, teslim saatleri, randevu ve sahiplendirme kaydı
    bekleyen_basvuru = SahiplendirmeBasvurusu(
        hayvan=pamuk,
        kullanici=ayse,
        ev_tipi="Balkon fileli daire",
        onceki_deneyim="Daha önce 4 yıl kedi baktım.",
        aciklama="Pamuk'a sıcak ve güvenli bir yuva sunmak istiyorum.",
        kvkk_onay_tarihi=zaman,
        durum=BasvuruDurumu.BEKLEMEDE,
    )
    onayli_basvuru = SahiplendirmeBasvurusu(
        hayvan=zeytin,
        kullanici=mehmet,
        ev_tipi="Bahçeli müstakil ev",
        onceki_deneyim="İlk kez köpek sahipleniyorum, eğitim araştırması yaptım.",
        aciklama="Zeytin ile her gün yürüyüş yapabileceğimiz geniş bahçemiz var.",
        kvkk_onay_tarihi=zaman,
        durum=BasvuruDurumu.ONAYLANDI,
        degerlendiren_id=gorevli1.id,
        degerlendirme_tarihi=zaman,
    )
    db.session.add_all([bekleyen_basvuru, onayli_basvuru])

    slot1 = TeslimSaati(
        kurum=merkez,
        tarih=bugun + timedelta(days=2),
        baslangic_saati=time(10, 0),
        bitis_saati=time(12, 0),
        aktif=True,
    )
    slot2 = TeslimSaati(
        kurum=merkez,
        tarih=bugun + timedelta(days=3),
        baslangic_saati=time(14, 0),
        bitis_saati=time(16, 0),
        aktif=True,
    )
    slot3 = TeslimSaati(
        kurum=selcuklu,
        tarih=bugun + timedelta(days=4),
        baslangic_saati=time(11, 0),
        bitis_saati=time(13, 0),
        aktif=True,
    )
    db.session.add_all([slot1, slot2, slot3])
    db.session.flush()

    db.session.add(
        TeslimRandevusu(
            basvuru=onayli_basvuru,
            teslim_saati=slot1,
            kullanici_id=mehmet.id,
            durum=RandevuDurumu.TAMAMLANDI,
            not_metni="Taşıma kafesiyle gelindi.",
        )
    )
    db.session.add(
        SahiplendirmeKaydi(
            hayvan=zeytin,
            kullanici=mehmet,
            basvuru_id=onayli_basvuru.id,
            teslim_eden_id=gorevli1.id,
            teslim_notu="Aşı karnesi ve kimlik bilgileri teslim edildi.",
        )
    )
    db.session.add(
        IslemKaydi(
            kullanici_id=admin.id,
            islem_turu=str(Islem.KURUM_EKLENDI),
            hedef_tablo="kurumlar",
            hedef_id=merkez.id,
            detay="Seed verisi oluşturuldu",
        )
    )

    db.session.commit()
    return True


def cli_komutlarini_kaydet(app):
    @app.cli.command("seed")
    @click.option("--sifirla", is_flag=True, help="Tabloları sıfırlayıp örnek verileri yeniden yükler.")
    def seed_komutu(sifirla):
        """Geliştirme ortamı için örnek veritabanı kayıtlarını oluşturur."""
        if sifirla and not (app.debug or app.testing):
            raise click.ClickException("Canlı (production) ortamda --sifirla kullanılamaz.")

        eklendi = veritabanini_doldur(sifirla=sifirla)
        if not eklendi:
            click.echo("Veritabanında zaten kayıt var. Yeniden yüklemek için --sifirla kullanın.")
            return

        click.echo("Örnek veriler başarıyla yüklendi.")
        click.echo("Test hesapları:")
        click.echo("  Admin    : admin@patiportal.local    / Admin1234!")
        click.echo("  Görevli 1: gorevli@patiportal.local  / Gorevli1234!")
        click.echo("  Görevli 2: gorevli2@patiportal.local / Gorevli1234!")
        click.echo("  Kullanıcı: ayse@patiportal.local     / Kullanici1234!")