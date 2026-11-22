"""
Teslim alma saatleri, randevular ve sahiplendirme kayıtları – Bölüm 3 (API.md bölüm 6).
"""

from datetime import date, datetime, timedelta

from flask_login import current_user
from sqlalchemy import exists, func
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models import (
    Hayvan,
    Kurum,
    SahiplendirmeBasvurusu,
    SahiplendirmeKaydi,
    TeslimRandevusu,
    TeslimSaati,
    simdi,
)
from app.sabitler import BasvuruDurumu, HayvanDurumu, Islem, RandevuDurumu
from app.services.asi_servisi import asi_karnesi
from app.services.hayvan_servisi import hayvan_durumunu_degistir
from app.services.kurum_yetkisi import kurum_filtresi, kurum_yetkisi_kontrol
from app.services.ortak import bul_veya_404, logla
from app.utils.decorators import kurum_yetkisi_var_mi
from app.utils.hatalar import ApiHatasi

RANDEVU_YUKLEME = (
    joinedload(TeslimRandevusu.teslim_saati).joinedload(TeslimSaati.kurum),
    joinedload(TeslimRandevusu.basvuru).joinedload(SahiplendirmeBasvurusu.kullanici),
    joinedload(TeslimRandevusu.basvuru)
    .joinedload(SahiplendirmeBasvurusu.hayvan)
    .joinedload(Hayvan.tur),
    joinedload(TeslimRandevusu.basvuru)
    .joinedload(SahiplendirmeBasvurusu.hayvan)
    .joinedload(Hayvan.kurum),
    joinedload(TeslimRandevusu.basvuru)
    .joinedload(SahiplendirmeBasvurusu.hayvan)
    .selectinload(Hayvan.fotograflar),
)

KAYIT_YUKLEME = (
    joinedload(SahiplendirmeKaydi.hayvan).joinedload(Hayvan.tur),
    joinedload(SahiplendirmeKaydi.hayvan).joinedload(Hayvan.kurum),
    joinedload(SahiplendirmeKaydi.hayvan).selectinload(Hayvan.fotograflar),
    joinedload(SahiplendirmeKaydi.kullanici),
)


def _slot_dolu_haritasi(slot_idleri):
    """Verilen teslim saati ID'leri için aktif (planlandi) randevu sayısını toplu döner."""
    if not slot_idleri:
        return {}
    satirlar = db.session.execute(
        db.select(TeslimRandevusu.teslim_saati_id, func.count(TeslimRandevusu.id))
        .where(
            TeslimRandevusu.teslim_saati_id.in_(slot_idleri),
            TeslimRandevusu.durum == RandevuDurumu.PLANLANDI,
        )
        .group_by(TeslimRandevusu.teslim_saati_id)
    ).all()
    return {slot_id: int(sayi) for slot_id, sayi in satirlar}


# ------------------------------------------------------------------ Sözlük dönüştürücüler
def teslim_saati_sozluge_cevir(saat, dolu_sayisi=0):
    kapasite = saat.kapasite or 1
    kalan = max(kapasite - dolu_sayisi, 0)
    return {
        "id": saat.id,
        "kurum_id": saat.kurum_id,
        "tarih": saat.tarih.isoformat(),
        "baslangic_saati": saat.baslangic_saati.strftime("%H:%M"),
        "bitis_saati": saat.bitis_saati.strftime("%H:%M"),
        "kapasite": kapasite,
        "dolu_sayisi": dolu_sayisi,
        "kalan_kapasite": kalan,
        "dolu": dolu_sayisi >= kapasite,
        "aktif": saat.aktif,
    }


def teslim_saatlerini_sozluge_cevir(saatler):
    dolu_haritasi = _slot_dolu_haritasi([s.id for s in saatler])
    return [teslim_saati_sozluge_cevir(s, dolu_haritasi.get(s.id, 0)) for s in saatler]


def randevu_sozluge_cevir(randevu, iletisim=False, slot_dolu=0):
    kullanici = randevu.basvuru.kullanici
    basvuran = {
        "id": kullanici.id,
        "ad_soyad": kullanici.ad_soyad,
        "email": kullanici.email,
    }
    if iletisim:
        basvuran["telefon"] = kullanici.telefon

    hayvan_ozet = randevu.basvuru.hayvan.ozet()
    hayvan_ozet["kurum"] = randevu.basvuru.hayvan.kurum.ozet()

    return {
        "id": randevu.id,
        "basvuru_id": randevu.basvuru_id,
        "teslim_saati_id": randevu.teslim_saati_id,
        "kullanici_id": randevu.kullanici_id,
        "durum": randevu.durum,
        "not_metni": randevu.not_metni,
        "olusturma_tarihi": (
            randevu.olusturma_tarihi.isoformat() if randevu.olusturma_tarihi else None
        ),
        "teslim_saati": teslim_saati_sozluge_cevir(randevu.teslim_saati, slot_dolu),
        "hayvan": hayvan_ozet,
        "basvuran": basvuran,
    }


def randevulari_sozluge_cevir(randevular, iletisim=False):
    dolu_haritasi = _slot_dolu_haritasi([r.teslim_saati_id for r in randevular])
    return [
        randevu_sozluge_cevir(r, iletisim=iletisim, slot_dolu=dolu_haritasi.get(r.teslim_saati_id, 0))
        for r in randevular
    ]


def sahiplendirme_sozluge_cevir(kayit, iletisim=False, karne=False):
    hayvan_ozet = kayit.hayvan.ozet()
    hayvan_ozet["kurum"] = kayit.hayvan.kurum.ozet()

    sahiplenen = {
        "id": kayit.kullanici.id,
        "ad_soyad": kayit.kullanici.ad_soyad,
        "email": kayit.kullanici.email,
    }
    if iletisim:
        sahiplenen["telefon"] = kayit.kullanici.telefon

    veri = {
        "id": kayit.id,
        "hayvan_id": kayit.hayvan_id,
        "kullanici_id": kayit.kullanici_id,
        "basvuru_id": kayit.basvuru_id,
        "teslim_eden_id": kayit.teslim_eden_id,
        "teslim_tarihi": kayit.teslim_tarihi.isoformat() if kayit.teslim_tarihi else None,
        "teslim_notu": kayit.teslim_notu,
        "hayvan": hayvan_ozet,
        "sahiplenen": sahiplenen,
    }
    if karne:
        veri["asi_karnesi"] = asi_karnesi(kayit.hayvan)
    return veri


# ------------------------------------------------------------------ Teslim alma saatleri
def teslim_saatleri_listele(kurum_id):
    bul_veya_404(Kurum, kurum_id, "Kurum bulunamadı.")
    sorgu = (
        db.select(TeslimSaati)
        .where(
            TeslimSaati.kurum_id == kurum_id,
            TeslimSaati.aktif.is_(True),
            TeslimSaati.tarih >= date.today(),
        )
        .order_by(TeslimSaati.tarih.asc(), TeslimSaati.baslangic_saati.asc())
    )
    return db.session.scalars(sorgu).all()


def teslim_saati_ekle(kurum_id, veri):
    kurum = bul_veya_404(Kurum, kurum_id, "Kurum bulunamadı.")
    kurum_yetkisi_kontrol(kurum.id)

    if veri["tarih"] < date.today():
        raise ApiHatasi.alan("tarih", "Geçmiş bir tarih için teslim saati eklenemez.")

    saat = TeslimSaati(
        kurum_id=kurum.id,
        tarih=veri["tarih"],
        baslangic_saati=veri["baslangic_saati"],
        bitis_saati=veri["bitis_saati"],
        kapasite=veri.get("kapasite", 1),
        aktif=True,
    )
    db.session.add(saat)
    logla(
        Islem.TESLIM_SAATI_EKLENDI,
        saat,
        f"{kurum.ad}: {saat.tarih} {saat.baslangic_saati:%H:%M}-{saat.bitis_saati:%H:%M} (kapasite={saat.kapasite})",
    )
    db.session.commit()
    return saat


def _toplu_slot_adaylari(veri):
    """Toplu teslim saati isteğini (tarih, baslangic, bitis, kapasite) listesine dönüştürür."""
    if "saatler" in veri:
        return [
            (s["tarih"], s["baslangic_saati"], s["bitis_saati"], s.get("kapasite", 1))
            for s in veri["saatler"]
        ]

    adaylar = []
    secili_gunler = set(veri["gunler"])  # 0=Pazar, 1=Pazartesi ... 6=Cumartesi
    sure = timedelta(minutes=veri["sure"])
    kapasite = veri.get("kapasite", 1)

    gun = veri["baslangic_tarihi"]
    while gun <= veri["bitis_tarihi"]:
        js_gun = (gun.weekday() + 1) % 7
        if js_gun in secili_gunler:
            basla = datetime.combine(gun, veri["baslangic_saati"])
            son = datetime.combine(gun, veri["bitis_saati"])
            while basla + sure <= son:
                bitir = basla + sure
                adaylar.append((gun, basla.time(), bitir.time(), kapasite))
                basla = bitir
        gun += timedelta(days=1)

    return adaylar


def teslim_saati_toplu_ekle(kurum_id, veri):
    kurum = bul_veya_404(Kurum, kurum_id, "Kurum bulunamadı.")
    kurum_yetkisi_kontrol(kurum.id)

    adaylar = _toplu_slot_adaylari(veri)
    if not adaylar:
        raise ApiHatasi("Seçilen tarih ve saat aralığında oluşturulacak teslim saati bulunamadı.", 400)
    if len(adaylar) > 200:
        raise ApiHatasi("Tek seferde en fazla 200 teslim saati eklenebilir.", 400)

    bugun = date.today()
    tarihler = {t for t, _, _, _ in adaylar if t >= bugun}
    mevcut_anahtarlar = set()
    if tarihler:
        mevcutlar = db.session.execute(
            db.select(TeslimSaati.tarih, TeslimSaati.baslangic_saati, TeslimSaati.bitis_saati).where(
                TeslimSaati.kurum_id == kurum.id,
                TeslimSaati.aktif.is_(True),
                TeslimSaati.tarih.in_(tarihler),
            )
        ).all()
        mevcut_anahtarlar = {(t, b, s) for t, b, s in mevcutlar}

    eklenenler = []
    atlanan = 0
    for tarih_degeri, baslangic, bitis, kapasite in adaylar:
        anahtar = (tarih_degeri, baslangic, bitis)
        if tarih_degeri < bugun or anahtar in mevcut_anahtarlar:
            atlanan += 1
            continue
        mevcut_anahtarlar.add(anahtar)
        saat = TeslimSaati(
            kurum_id=kurum.id,
            tarih=tarih_degeri,
            baslangic_saati=baslangic,
            bitis_saati=bitis,
            kapasite=kapasite,
            aktif=True,
        )
        db.session.add(saat)
        eklenenler.append(saat)

    if eklenenler:
        db.session.flush()
        logla(
            Islem.TESLIM_SAATI_EKLENDI,
            kurum,
            f"{kurum.ad}: {len(eklenenler)} teslim saati toplu eklendi ({atlanan} atlandı)",
        )
        db.session.commit()

    return eklenenler, atlanan


def teslim_saati_sil(slot_id):
    saat = bul_veya_404(TeslimSaati, slot_id, "Teslim alma saati bulunamadı.")
    kurum_yetkisi_kontrol(saat.kurum_id)

    aktif_randevu_var = db.session.scalar(
        db.select(
            exists().where(
                TeslimRandevusu.teslim_saati_id == saat.id,
                TeslimRandevusu.durum == RandevuDurumu.PLANLANDI,
            )
        )
    )
    if aktif_randevu_var:
        raise ApiHatasi(
            "Bu saate planlanmış aktif bir randevu olduğu için kaldırılamaz.",
            409,
        )

    herhangi_randevu_var = db.session.scalar(
        db.select(exists().where(TeslimRandevusu.teslim_saati_id == saat.id))
    )
    logla(
        Islem.TESLIM_SAATI_SILINDI,
        saat,
        f"Teslim saati #{saat.id} ({saat.tarih}) kaldırıldı",
    )
    if herhangi_randevu_var:
        saat.aktif = False
    else:
        db.session.delete(saat)
    db.session.commit()


# ------------------------------------------------------------------ Randevular
def randevu_olustur(veri):
    basvuru = bul_veya_404(
        SahiplendirmeBasvurusu,
        veri["application_id"],
        "Başvuru bulunamadı.",
        secenekler=[joinedload(SahiplendirmeBasvurusu.hayvan)],
    )

    if basvuru.kullanici_id != current_user.id:
        raise ApiHatasi("Bu başvuru için randevu oluşturma yetkiniz yok.", 403)

    if basvuru.durum != BasvuruDurumu.ONAYLANDI:
        raise ApiHatasi(
            "Sadece onaylanmış başvurular için teslim alma randevusu alınabilir.",
            409,
        )

    teslim_edilmis = db.session.scalar(
        db.select(exists().where(SahiplendirmeKaydi.basvuru_id == basvuru.id))
    )
    if teslim_edilmis:
        raise ApiHatasi("Bu başvurunun teslimatı zaten tamamlanmış.", 409)

    saat = bul_veya_404(TeslimSaati, veri["slot_id"], "Teslim alma saati bulunamadı.")
    if not saat.aktif or saat.kurum_id != basvuru.hayvan.kurum_id:
        raise ApiHatasi.alan("slot_id", "Seçilen teslim alma saati bu kurum için uygun değil.")
    if saat.tarih < date.today():
        raise ApiHatasi.alan("slot_id", "Geçmiş tarihli bir teslim saati seçilemez.")

    dolu_sayisi = _slot_dolu_haritasi([saat.id]).get(saat.id, 0)
    if dolu_sayisi >= (saat.kapasite or 1):
        raise ApiHatasi("Seçilen teslim alma saati dolu.", 409)

    not_metni = (veri.get("not_metni") or "").strip() or None
    mevcut = db.session.scalar(
        db.select(TeslimRandevusu).where(TeslimRandevusu.basvuru_id == basvuru.id)
    )
    if mevcut is not None:
        if mevcut.durum not in (RandevuDurumu.IPTAL, RandevuDurumu.GELMEDI):
            raise ApiHatasi("Bu başvuru için zaten aktif bir randevunuz var.", 409)
        mevcut.teslim_saati_id = saat.id
        mevcut.durum = RandevuDurumu.PLANLANDI
        mevcut.not_metni = not_metni
        mevcut.olusturma_tarihi = simdi()
        randevu = mevcut
    else:
        randevu = TeslimRandevusu(
            basvuru_id=basvuru.id,
            teslim_saati_id=saat.id,
            kullanici_id=current_user.id,
            durum=RandevuDurumu.PLANLANDI,
            not_metni=not_metni,
        )
        db.session.add(randevu)

    logla(
        Islem.RANDEVU_OLUSTURULDU,
        randevu,
        f"Başvuru #{basvuru.id} için teslim randevusu ({saat.tarih} {saat.baslangic_saati:%H:%M})",
    )
    db.session.commit()
    return bul_veya_404(TeslimRandevusu, randevu.id, secenekler=list(RANDEVU_YUKLEME))


def benim_randevularim():
    sorgu = (
        db.select(TeslimRandevusu)
        .options(*RANDEVU_YUKLEME)
        .where(TeslimRandevusu.kullanici_id == current_user.id)
        .order_by(TeslimRandevusu.olusturma_tarihi.desc(), TeslimRandevusu.id.desc())
    )
    return db.session.scalars(sorgu).all()


def kurum_randevulari(filtre):
    sorgu = (
        db.select(TeslimRandevusu)
        .join(TeslimRandevusu.teslim_saati)
        .options(*RANDEVU_YUKLEME)
    )
    kurum_kosulu = kurum_filtresi(TeslimSaati.kurum_id)
    if kurum_kosulu is not None:
        sorgu = sorgu.where(kurum_kosulu)

    if filtre.get("kurum_id"):
        kurum_yetkisi_kontrol(filtre["kurum_id"])
        sorgu = sorgu.where(TeslimSaati.kurum_id == filtre["kurum_id"])
    if filtre.get("tarih"):
        sorgu = sorgu.where(TeslimSaati.tarih == filtre["tarih"])
    if filtre.get("durum"):
        sorgu = sorgu.where(TeslimRandevusu.durum == RandevuDurumu(filtre["durum"]))

    sorgu = sorgu.order_by(TeslimSaati.tarih.asc(), TeslimSaati.baslangic_saati.asc())
    return db.session.scalars(sorgu).all()


def randevu_iptal(randevu_id):
    randevu = bul_veya_404(
        TeslimRandevusu,
        randevu_id,
        "Randevu bulunamadı.",
        secenekler=list(RANDEVU_YUKLEME),
    )

    kendi_randevusu = randevu.kullanici_id == current_user.id
    kurum_yetkili = kurum_yetkisi_var_mi(current_user, randevu.basvuru.hayvan.kurum_id)
    if not (kendi_randevusu or kurum_yetkili):
        raise ApiHatasi("Bu randevuyu iptal etme yetkiniz yok.", 403)

    if randevu.durum != RandevuDurumu.PLANLANDI:
        raise ApiHatasi("Sadece planlanmış randevular iptal edilebilir.", 409)

    randevu.durum = RandevuDurumu.IPTAL
    logla(Islem.RANDEVU_IPTAL_EDILDI, randevu, f"Randevu #{randevu.id} iptal edildi")
    db.session.commit()
    return randevu


def randevu_gelmedi(randevu_id):
    randevu = bul_veya_404(
        TeslimRandevusu,
        randevu_id,
        "Randevu bulunamadı.",
        secenekler=list(RANDEVU_YUKLEME),
    )
    kurum_yetkisi_kontrol(randevu.basvuru.hayvan.kurum_id)

    if randevu.durum != RandevuDurumu.PLANLANDI:
        raise ApiHatasi("Sadece planlanmış randevular 'gelmedi' olarak işaretlenebilir.", 409)

    randevu.durum = RandevuDurumu.GELMEDI
    logla(Islem.RANDEVU_GELMEDI, randevu, f"Randevu #{randevu.id} gelmedi olarak işaretlendi")
    db.session.commit()
    return randevu


# ------------------------------------------------------------------ Sahiplendirme kayıtları
def sahiplendirme_tamamla(veri):
    basvuru = bul_veya_404(
        SahiplendirmeBasvurusu,
        veri["application_id"],
        "Başvuru bulunamadı.",
        secenekler=[
            joinedload(SahiplendirmeBasvurusu.hayvan),
            joinedload(SahiplendirmeBasvurusu.kullanici),
        ],
    )
    kurum_yetkisi_kontrol(basvuru.hayvan.kurum_id)

    if basvuru.durum != BasvuruDurumu.ONAYLANDI:
        raise ApiHatasi("Sadece onaylanmış başvuruların teslimatı tamamlanabilir.", 409)

    mevcut_kayit = db.session.scalar(
        db.select(SahiplendirmeKaydi.id).where(SahiplendirmeKaydi.basvuru_id == basvuru.id)
    )
    if mevcut_kayit is not None:
        raise ApiHatasi("Bu başvuru için sahiplendirme kaydı zaten oluşturulmuş.", 409)

    hayvan_durumunu_degistir(basvuru.hayvan, HayvanDurumu.SAHIPLENDIRILDI)

    randevu = db.session.scalar(
        db.select(TeslimRandevusu).where(
            TeslimRandevusu.basvuru_id == basvuru.id,
            TeslimRandevusu.durum == RandevuDurumu.PLANLANDI,
        )
    )
    if randevu is not None:
        randevu.durum = RandevuDurumu.TAMAMLANDI

    kayit = SahiplendirmeKaydi(
        hayvan_id=basvuru.hayvan_id,
        kullanici_id=basvuru.kullanici_id,
        basvuru_id=basvuru.id,
        teslim_eden_id=current_user.id,
        teslim_notu=(veri.get("teslim_notu") or "").strip() or None,
    )
    db.session.add(kayit)
    logla(
        Islem.SAHIPLENDIRME_TAMAMLANDI,
        kayit,
        f"Hayvan #{basvuru.hayvan_id} ({basvuru.hayvan.ad}) → Kullanıcı #{basvuru.kullanici_id} teslim edildi",
    )
    db.session.commit()
    return bul_veya_404(SahiplendirmeKaydi, kayit.id, secenekler=list(KAYIT_YUKLEME))


def kurum_sahiplendirmeleri(filtre):
    sorgu = (
        db.select(SahiplendirmeKaydi)
        .join(SahiplendirmeKaydi.hayvan)
        .options(*KAYIT_YUKLEME)
    )
    kurum_kosulu = kurum_filtresi(Hayvan.kurum_id)
    if kurum_kosulu is not None:
        sorgu = sorgu.where(kurum_kosulu)

    if filtre.get("kurum_id"):
        kurum_yetkisi_kontrol(filtre["kurum_id"])
        sorgu = sorgu.where(Hayvan.kurum_id == filtre["kurum_id"])

    sorgu = sorgu.order_by(SahiplendirmeKaydi.teslim_tarihi.desc(), SahiplendirmeKaydi.id.desc())
    return db.session.scalars(sorgu).all()


def benim_sahiplendiklerim():
    sorgu = (
        db.select(SahiplendirmeKaydi)
        .options(*KAYIT_YUKLEME)
        .where(SahiplendirmeKaydi.kullanici_id == current_user.id)
        .order_by(SahiplendirmeKaydi.teslim_tarihi.desc(), SahiplendirmeKaydi.id.desc())
    )
    return db.session.scalars(sorgu).all()