"""
Hayvan türleri, aşı türleri ve aşı gereklilikleri (hangi türe hangi aşı zorunlu, kaç günde bir).
Bunları sadece admin değiştirir; listeler herkese açıktır (formlardaki açılır listeler için).

Silme kuralı: Kullanımda olan tür silinmez (409).
  - Hayvan türü: o türde kayıtlı hayvan varsa
  - Aşı türü:    o aşı herhangi bir hayvana uygulanmışsa
"""

from sqlalchemy import func
from sqlalchemy.orm import selectinload

from app.extensions import db
from app.models import AsiGerekliligi, AsiTuru, Hayvan, HayvanAsisi, HayvanTuru
from app.sabitler import Islem
from app.services.ortak import bul_veya_404, logla
from app.utils.hatalar import ApiHatasi

# zorunlu_asilari_belirle(): aralık gönderilmediyse mevcut aralık korunur
_ARALIGI_KORU = object()


def _ayni_ad_var_mi(model, ad, haric_id=None):
    sorgu = db.select(model.id).where(func.lower(model.ad) == ad.lower())
    if haric_id is not None:
        sorgu = sorgu.where(model.id != haric_id)
    return db.session.scalar(sorgu) is not None


def _kullanim_sayisi(sutun, deger):
    return db.session.scalar(db.select(func.count()).where(sutun == deger))


# ------------------------------------------------------------------ Hayvan türleri
def hayvan_turunu_yukle(tur_id):
    return bul_veya_404(
        HayvanTuru, tur_id, "Hayvan türü bulunamadı.",
        secenekler=[selectinload(HayvanTuru.asi_gereklilikleri).joinedload(AsiGerekliligi.asi_turu)],
    )


def hayvan_turleri():
    turler = db.session.scalars(
        db.select(HayvanTuru)
        .options(selectinload(HayvanTuru.asi_gereklilikleri).joinedload(AsiGerekliligi.asi_turu))
        .order_by(HayvanTuru.ad)
    ).all()
    return [t.to_dict() for t in turler]


def hayvan_turu_ekle(veri):
    if _ayni_ad_var_mi(HayvanTuru, veri["ad"]):
        raise ApiHatasi("Bu hayvan türü zaten var.", 409)
    tur = HayvanTuru(ad=veri["ad"])
    db.session.add(tur)
    logla(Islem.TUR_EKLENDI, tur, f"Hayvan türü: {tur.ad}")
    db.session.commit()
    return tur


def hayvan_turu_guncelle(tur, veri):
    if _ayni_ad_var_mi(HayvanTuru, veri["ad"], haric_id=tur.id):
        raise ApiHatasi("Bu adda başka bir hayvan türü var.", 409)
    eski_ad = tur.ad
    tur.ad = veri["ad"]
    logla(Islem.TUR_GUNCELLENDI, tur, f"Hayvan türü: {eski_ad} → {tur.ad}")
    db.session.commit()
    return tur


def hayvan_turu_sil(tur):
    hayvan_sayisi = _kullanim_sayisi(Hayvan.tur_id, tur.id)
    if hayvan_sayisi:
        raise ApiHatasi(
            f"Bu türde {hayvan_sayisi} hayvan kayıtlı olduğu için silinemez. "
            "Önce hayvanların türünü değiştirin.", 409,
        )
    logla(Islem.TUR_SILINDI, tur, f"Hayvan türü: {tur.ad} (#{tur.id})")
    db.session.delete(tur)  # zorunlu aşı eşleştirmeleri de silinir (cascade)
    db.session.commit()


def zorunlu_asilari_belirle(tur, veri):
    """
    Türün zorunlu aşı listesini gönderilen liste ile DEĞİŞTİRİR (eklenen eklenir, çıkarılan silinir).
    `veri` ZorunluAsilarSemasi'ndan gelir: ya "asi_turu_idleri" ya da "asilar" (aralıklarla).
    Sadece "asi_turu_idleri" gönderilirse listede kalan aşıların tekrar aralığı korunur.
    """
    if "asilar" in veri:
        istenen = {a["asi_turu_id"]: a.get("tekrar_araligi_gun") for a in veri["asilar"]}
        alan = "asilar"
    else:
        istenen = {asi_turu_id: _ARALIGI_KORU for asi_turu_id in veri["asi_turu_idleri"]}
        alan = "asi_turu_idleri"

    mevcut_asi_idleri = set(db.session.scalars(db.select(AsiTuru.id).where(AsiTuru.id.in_(istenen))))
    bilinmeyenler = set(istenen) - mevcut_asi_idleri
    if bilinmeyenler:
        raise ApiHatasi.alan(alan, f"Bu aşı türleri bulunamadı: {sorted(bilinmeyenler)}")

    tur.asi_gereklilikleri = [g for g in tur.asi_gereklilikleri if g.asi_turu_id in istenen]
    mevcutlar = {g.asi_turu_id: g for g in tur.asi_gereklilikleri}
    for asi_turu_id, aralik in sorted(istenen.items()):
        gereklilik = mevcutlar.get(asi_turu_id)
        if gereklilik is None:
            gereklilik = AsiGerekliligi(asi_turu_id=asi_turu_id)
            tur.asi_gereklilikleri.append(gereklilik)
        if aralik is not _ARALIGI_KORU:
            gereklilik.tekrar_araligi_gun = aralik

    logla(Islem.ZORUNLU_ASILAR_DEGISTI, tur, f"{tur.ad} zorunlu aşıları: {sorted(istenen)}")
    db.session.commit()
    return hayvan_turunu_yukle(tur.id)


# ------------------------------------------------------------------ Aşı türleri
def asi_turunu_yukle(asi_turu_id):
    return bul_veya_404(AsiTuru, asi_turu_id, "Aşı türü bulunamadı.")


def tekrar_araligi(hayvan_turu_id, asi_turu_id):
    """Bu türde bu aşının kaç günde bir tekrarlanacağı; tanımlı değilse None."""
    return db.session.scalar(
        db.select(AsiGerekliligi.tekrar_araligi_gun).where(
            AsiGerekliligi.hayvan_turu_id == hayvan_turu_id,
            AsiGerekliligi.asi_turu_id == asi_turu_id,
        )
    )


def asi_turleri(hayvan_turu_id=None):
    """
    hayvan_turu_id verilirse her aşı için o türde zorunlu olup olmadığı ve
    tekrar aralığı (sonraki doz önerisi için) da döner.
    """
    turler = db.session.scalars(db.select(AsiTuru).order_by(AsiTuru.ad)).all()
    if hayvan_turu_id is None:
        return [t.to_dict() for t in turler]
    gereklilikler = dict(db.session.execute(
        db.select(AsiGerekliligi.asi_turu_id, AsiGerekliligi.tekrar_araligi_gun)
        .where(AsiGerekliligi.hayvan_turu_id == hayvan_turu_id)
    ).all())
    return [
        {**t.to_dict(), "zorunlu": t.id in gereklilikler, "tekrar_araligi_gun": gereklilikler.get(t.id)}
        for t in turler
    ]


def asi_turu_ekle(veri):
    if _ayni_ad_var_mi(AsiTuru, veri["ad"]):
        raise ApiHatasi("Bu aşı türü zaten var.", 409)
    asi_turu = AsiTuru(ad=veri["ad"], aciklama=veri.get("aciklama"))
    db.session.add(asi_turu)
    logla(Islem.TUR_EKLENDI, asi_turu, f"Aşı türü: {asi_turu.ad}")
    db.session.commit()
    return asi_turu


def asi_turu_guncelle(asi_turu, degisiklikler):
    if "ad" in degisiklikler and _ayni_ad_var_mi(AsiTuru, degisiklikler["ad"], haric_id=asi_turu.id):
        raise ApiHatasi("Bu adda başka bir aşı türü var.", 409)
    for alan, deger in degisiklikler.items():
        setattr(asi_turu, alan, deger)
    degisen = ", ".join(degisiklikler) or "-"
    logla(Islem.TUR_GUNCELLENDI, asi_turu, f"Aşı türü #{asi_turu.id}, değişen alanlar: {degisen}")
    db.session.commit()
    return asi_turu


def asi_turu_sil(asi_turu):
    uygulama_sayisi = _kullanim_sayisi(HayvanAsisi.asi_turu_id, asi_turu.id)
    if uygulama_sayisi:
        raise ApiHatasi(
            f"Bu aşı {uygulama_sayisi} kez uygulandığı için silinemez; aşı karnelerindeki kayıtlar bozulur.", 409,
        )
    logla(Islem.TUR_SILINDI, asi_turu, f"Aşı türü: {asi_turu.ad} (#{asi_turu.id})")
    db.session.execute(db.delete(AsiGerekliligi).where(AsiGerekliligi.asi_turu_id == asi_turu.id))
    db.session.delete(asi_turu)
    db.session.commit()
