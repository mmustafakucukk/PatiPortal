"""
Kullanıcı yönetimi ve KVKK hesap silme iş kuralları – Bölüm 3 (API.md bölüm 4).
"""

import re
import uuid

from flask_login import current_user, logout_user
from sqlalchemy import exists, or_
from sqlalchemy.orm import selectinload

from app.extensions import db
from app.models import (
    Kullanici,
    KurumGorevlisi,
    SahiplendirmeBasvurusu,
    SahiplendirmeKaydi,
    TeslimRandevusu,
    simdi,
)
from app.sabitler import Islem, Rol
from app.services.ortak import bul_veya_404, logla
from app.utils.audit import islem_kaydet
from app.utils.hatalar import ApiHatasi

YUKLEME = (
    selectinload(Kullanici.kurum_gorevleri).joinedload(KurumGorevlisi.kurum),
)


def _email_normalize(email):
    return (email or "").strip().lower()


def _telefon_temizle(telefon):
    return re.sub(r"[\s\-()]", "", (telefon or "").strip())


def kullanici_listesi(filtre):
    sorgu = db.select(Kullanici).options(*YUKLEME)

    if filtre.get("rol"):
        sorgu = sorgu.where(Kullanici.rol == Rol(filtre["rol"]))
    if filtre.get("aktif") is not None:
        sorgu = sorgu.where(Kullanici.aktif == filtre["aktif"])
    if filtre.get("arama"):
        aranan = f"%{filtre['arama']}%"
        sorgu = sorgu.where(
            or_(Kullanici.ad_soyad.ilike(aranan), Kullanici.email.ilike(aranan))
        )

    sorgu = sorgu.order_by(Kullanici.olusturma_tarihi.desc(), Kullanici.id.desc())
    return db.session.scalars(sorgu).all()


def kullanici_olustur(veri):
    ad_soyad = veri["ad_soyad"].strip()
    if len(ad_soyad) < 2:
        raise ApiHatasi.alan("ad_soyad", "Ad soyad en az 2 karakter olmalıdır.")

    email = _email_normalize(veri["email"])
    if db.session.scalar(db.select(Kullanici.id).where(Kullanici.email == email)) is not None:
        raise ApiHatasi(
            "Bu e-posta adresi zaten kayıtlı.",
            409,
            {"email": ["Bu e-posta adresi zaten kayıtlı."]},
        )

    kullanici = Kullanici(
        ad_soyad=ad_soyad,
        email=email,
        rol=Rol(veri["rol"]),
        kvkk_onay_tarihi=simdi(),
        aktif=True,
    )
    kullanici.telefon = _telefon_temizle(veri["telefon"])
    kullanici.sifre_belirle(veri["sifre"])

    db.session.add(kullanici)
    logla(
        Islem.KULLANICI_OLUSTURULDU,
        kullanici,
        f"{kullanici.email} ({kullanici.rol}) oluşturuldu",
    )
    db.session.commit()
    return bul_veya_404(Kullanici, kullanici.id, secenekler=list(YUKLEME))


def profil_guncelle(degisiklikler):
    kullanici = bul_veya_404(
        Kullanici, current_user.id, "Kullanıcı bulunamadı.", secenekler=list(YUKLEME)
    )

    degisenler = []
    if "ad_soyad" in degisiklikler and degisiklikler["ad_soyad"] is not None:
        kullanici.ad_soyad = degisiklikler["ad_soyad"]
        degisenler.append("ad_soyad")

    if "telefon" in degisiklikler and degisiklikler["telefon"] is not None:
        kullanici.telefon = _telefon_temizle(degisiklikler["telefon"])
        degisenler.append("telefon")

    if degisenler:
        logla(
            Islem.PROFIL_GUNCELLENDI,
            kullanici,
            f"{kullanici.email}: {', '.join(degisenler)}",
        )
        db.session.commit()

    return kullanici


def kullanici_guncelle(kullanici_id, degisiklikler):
    kullanici = bul_veya_404(
        Kullanici, kullanici_id, "Kullanıcı bulunamadı.", secenekler=list(YUKLEME)
    )

    kendi_hesabi = current_user.is_authenticated and current_user.id == kullanici.id
    if kendi_hesabi:
        if degisiklikler.get("aktif") is False:
            raise ApiHatasi("Kendi hesabınızı bu ekrandan pasifleştiremezsiniz.", 400)
        if "rol" in degisiklikler and degisiklikler["rol"] != Rol.ADMIN.value:
            raise ApiHatasi("Kendi yönetici yetkinizi kaldıramazsınız.", 400)

    degisenler = []
    if "ad_soyad" in degisiklikler and degisiklikler["ad_soyad"] is not None:
        kullanici.ad_soyad = degisiklikler["ad_soyad"]
        degisenler.append("ad_soyad")

    if "telefon" in degisiklikler and degisiklikler["telefon"] is not None:
        kullanici.telefon = _telefon_temizle(degisiklikler["telefon"])
        degisenler.append("telefon")

    if "rol" in degisiklikler and degisiklikler["rol"] is not None:
        yeni_rol = Rol(degisiklikler["rol"])
        if kullanici.rol != yeni_rol:
            kullanici.rol = yeni_rol
            degisenler.append(f"rol={yeni_rol}")
            # Görevli rolünden çıkarılırsa kurum atamaları temizlenir
            if yeni_rol != Rol.GOREVLI and kullanici.kurum_gorevleri:
                kullanici.kurum_gorevleri.clear()

    if "aktif" in degisiklikler and degisiklikler["aktif"] is not None:
        if kullanici.aktif != degisiklikler["aktif"]:
            kullanici.aktif = degisiklikler["aktif"]
            degisenler.append(f"aktif={kullanici.aktif}")

    if degisenler:
        logla(
            Islem.KULLANICI_GUNCELLENDI,
            kullanici,
            f"{kullanici.email}: {', '.join(degisenler)}",
        )
        db.session.commit()

    return kullanici


def hesabimi_sil():
    kullanici = bul_veya_404(
        Kullanici, current_user.id, "Kullanıcı bulunamadı.", secenekler=list(YUKLEME)
    )

    bagli_kayit_var = db.session.scalar(
        db.select(
            or_(
                exists().where(SahiplendirmeBasvurusu.kullanici_id == kullanici.id),
                exists().where(TeslimRandevusu.kullanici_id == kullanici.id),
                exists().where(SahiplendirmeKaydi.kullanici_id == kullanici.id),
            )
        )
    )

    silinen_id = kullanici.id
    if bagli_kayit_var:
        kullanici.ad_soyad = "Silinmiş Kullanıcı"
        kullanici.email = f"silinmis_{silinen_id}_{uuid.uuid4().hex[:8]}@silindi.local"
        kullanici._telefon = None
        kullanici.sifre_belirle(uuid.uuid4().hex)
        kullanici.aktif = False
        kullanici.kurum_gorevleri.clear()
        logla(
            Islem.KULLANICI_SILINDI,
            kullanici,
            "KVKK kapsamında kişisel veriler anonimleştirildi ve hesap kapatıldı",
        )
    else:
        db.session.delete(kullanici)
        islem_kaydet(
            str(Islem.KULLANICI_SILINDI),
            "kullanicilar",
            silinen_id,
            "KVKK kapsamında hesap kalıcı olarak silindi",
            kullanici_id=None,
        )

    db.session.commit()
    logout_user()