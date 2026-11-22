"""
Kimlik doğrulama iş kuralları – Bölüm 3 (API.md bölüm 3).
"""

import re

from flask_login import current_user, login_user, logout_user
from sqlalchemy.orm import joinedload, selectinload

from app.extensions import db
from app.models import Kullanici, KurumGorevlisi, simdi
from app.sabitler import Islem, Rol
from app.services.ortak import bul_veya_404, logla
from app.utils.hatalar import ApiHatasi

KULLANICI_YUKLEME = (
    selectinload(Kullanici.kurum_gorevleri).joinedload(KurumGorevlisi.kurum),
)


def _email_normalize(email):
    return (email or "").strip().lower()


def _telefon_temizle(telefon):
    return re.sub(r"[\s\-()]", "", (telefon or "").strip())


def kullanici_kayit(veri):
    ad_soyad = veri["ad_soyad"].strip()
    if len(ad_soyad) < 2:
        raise ApiHatasi.alan("ad_soyad", "Ad soyad en az 2 karakter olmalıdır.")

    email = _email_normalize(veri["email"])
    mevcut = db.session.scalar(db.select(Kullanici.id).where(Kullanici.email == email))
    if mevcut is not None:
        raise ApiHatasi(
            "Bu e-posta adresi zaten kayıtlı.",
            409,
            {"email": ["Bu e-posta adresi zaten kayıtlı."]},
        )

    kullanici = Kullanici(
        ad_soyad=ad_soyad,
        email=email,
        rol=Rol.ZIYARETCI,
        kvkk_onay_tarihi=simdi(),
        aktif=True,
    )
    kullanici.telefon = _telefon_temizle(veri["telefon"])
    kullanici.sifre_belirle(veri["sifre"])

    db.session.add(kullanici)
    db.session.flush()
    logla(Islem.KULLANICI_KAYIT_OLDU, kullanici, f"{kullanici.email} kayıt oldu")
    db.session.commit()

    # Kayıt olan kullanıcı otomatik olarak oturum açar
    login_user(kullanici)
    return kullanici


def kullanici_giris(veri):
    email = _email_normalize(veri["email"])
    sifre = veri["sifre"]

    kullanici = db.session.scalar(
        db.select(Kullanici).options(*KULLANICI_YUKLEME).where(Kullanici.email == email)
    )
    if kullanici is None or not kullanici.sifre_dogru_mu(sifre):
        raise ApiHatasi("E-posta veya şifre hatalı.", 401)

    if not kullanici.aktif:
        raise ApiHatasi("Hesabınız pasif durumdadır.", 403)

    login_user(kullanici)
    logla(Islem.KULLANICI_GIRIS_YAPTI, kullanici, f"{kullanici.email} giriş yaptı")
    db.session.commit()
    return kullanici


def sifre_degistir(veri):
    kullanici = bul_veya_404(Kullanici, current_user.id, "Kullanıcı bulunamadı.")

    if not kullanici.sifre_dogru_mu(veri["mevcut_sifre"]):
        raise ApiHatasi.alan("mevcut_sifre", "Mevcut şifreniz hatalı.")

    kullanici.sifre_belirle(veri["yeni_sifre"])
    logla(Islem.SIFRE_DEGISTIRILDI, kullanici, f"{kullanici.email} şifresini değiştirdi")
    db.session.commit()


def kullanici_cikis():
    logout_user()