"""
Kurum ve kurum görevlisi yönetimi iş kuralları – Bölüm 3 (API.md bölüm 4).
"""

from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models import Kullanici, Kurum, KurumGorevlisi
from app.sabitler import Islem, KurumTuru, Rol
from app.services.ortak import bul_veya_404, logla
from app.utils.hatalar import ApiHatasi


def kurum_listesi(filtre, admin_mi=False):
    sorgu = db.select(Kurum)

    if not admin_mi:
        sorgu = sorgu.where(Kurum.aktif.is_(True))
    elif filtre.get("aktif") is not None:
        sorgu = sorgu.where(Kurum.aktif == filtre["aktif"])

    if filtre.get("tur"):
        sorgu = sorgu.where(Kurum.tur == KurumTuru(filtre["tur"]))

    sorgu = sorgu.order_by(Kurum.ad.asc(), Kurum.id.asc())
    return db.session.scalars(sorgu).all()


def kurum_getir(kurum_id, admin_mi=False):
    kurum = bul_veya_404(Kurum, kurum_id, "Kurum bulunamadı.")
    if not admin_mi and not kurum.aktif:
        raise ApiHatasi("Kurum bulunamadı.", 404)
    return kurum


def kurum_ekle(veri):
    kurum = Kurum(
        ad=veri["ad"],
        tur=KurumTuru(veri["tur"]),
        adres=veri.get("adres"),
        telefon=veri.get("telefon"),
        email=veri.get("email"),
        aktif=True,
    )
    db.session.add(kurum)
    logla(Islem.KURUM_EKLENDI, kurum, f"{kurum.ad} ({kurum.tur}) eklendi")
    db.session.commit()
    return kurum


def kurum_guncelle(kurum_id, degisiklikler):
    kurum = bul_veya_404(Kurum, kurum_id, "Kurum bulunamadı.")
    degisenler = []

    for alan in ("ad", "adres", "telefon", "email", "aktif"):
        if alan in degisiklikler:
            setattr(kurum, alan, degisiklikler[alan])
            degisenler.append(alan)

    if "tur" in degisiklikler and degisiklikler["tur"] is not None:
        kurum.tur = KurumTuru(degisiklikler["tur"])
        degisenler.append("tur")

    if degisenler:
        logla(
            Islem.KURUM_GUNCELLENDI,
            kurum,
            f"{kurum.ad}: {', '.join(degisenler)}",
        )
        db.session.commit()

    return kurum


def kurum_gorevlileri(kurum_id):
    bul_veya_404(Kurum, kurum_id, "Kurum bulunamadı.")
    atamalar = db.session.scalars(
        db.select(KurumGorevlisi)
        .options(joinedload(KurumGorevlisi.kullanici))
        .where(KurumGorevlisi.kurum_id == kurum_id)
        .order_by(KurumGorevlisi.baslangic_tarihi.asc())
    ).all()
    return [
        {
            "id": a.id,
            "kurum_id": a.kurum_id,
            "user_id": a.kullanici_id,
            "ad_soyad": a.kullanici.ad_soyad,
            "email": a.kullanici.email,
            "gorev_tanimi": a.gorev_tanimi,
            "baslangic_tarihi": a.baslangic_tarihi.isoformat() if a.baslangic_tarihi else None,
        }
        for a in atamalar
    ]


def gorevli_ata(kurum_id, veri):
    kurum = bul_veya_404(Kurum, kurum_id, "Kurum bulunamadı.")
    kullanici = bul_veya_404(Kullanici, veri["user_id"], "Kullanıcı bulunamadı.")

    if kullanici.rol != Rol.GOREVLI:
        raise ApiHatasi.alan(
            "user_id",
            "Kuruma sadece görevli rolündeki kullanıcılar atanabilir.",
        )

    mevcut = db.session.scalar(
        db.select(KurumGorevlisi.id).where(
            KurumGorevlisi.kurum_id == kurum.id,
            KurumGorevlisi.kullanici_id == kullanici.id,
        )
    )
    if mevcut is not None:
        raise ApiHatasi("Bu kullanıcı zaten bu kuruma görevli olarak atanmış.", 409)

    atama = KurumGorevlisi(
        kurum_id=kurum.id,
        kullanici_id=kullanici.id,
        gorev_tanimi=veri["gorev_tanimi"],
    )
    db.session.add(atama)
    logla(
        Islem.GOREVLI_ATANDI,
        atama,
        f"{kullanici.email} → {kurum.ad} ({atama.gorev_tanimi})",
    )
    db.session.commit()
    return {
        "id": atama.id,
        "kurum_id": kurum.id,
        "user_id": kullanici.id,
        "ad_soyad": kullanici.ad_soyad,
        "email": kullanici.email,
        "gorev_tanimi": atama.gorev_tanimi,
    }


def gorevli_cikar(kurum_id, kullanici_id):
    kurum = bul_veya_404(Kurum, kurum_id, "Kurum bulunamadı.")
    atama = db.session.scalar(
        db.select(KurumGorevlisi)
        .options(joinedload(KurumGorevlisi.kullanici))
        .where(
            KurumGorevlisi.kurum_id == kurum.id,
            KurumGorevlisi.kullanici_id == kullanici_id,
        )
    )
    if atama is None:
        raise ApiHatasi("Bu kullanıcı ilgili kurumda görevli değil.", 404)

    logla(
        Islem.GOREVLI_CIKARILDI,
        atama,
        f"{atama.kullanici.email} ✕ {kurum.ad}",
    )
    db.session.delete(atama)
    db.session.commit()