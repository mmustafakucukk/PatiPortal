"""
Acil ihtiyaçlar ve destek talepleri (destek sözleri).

- Liste aciliyete göre sıralıdır (yüksek → düşük), sonra en yeni.
- Her ihtiyaçla birlikte iptal edilmemiş destek sözlerinin toplamı döner.
- Karşılanmış (kapanmış) bir ihtiyaca destek sözü verilemez.
- Söz verilen miktar ihtiyacı karşılarsa "karsilanmis_olabilir" = true olur; kapatmayı görevli yapar.
"""

from flask_login import current_user
from sqlalchemy import case, func
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models import AcilIhtiyac, DestekTalebi, simdi
from app.sabitler import Aciliyet, DestekDurumu, IhtiyacDurumu, Islem
from app.services.kurum_yetkisi import kayit_icin_kurum_sec, kurum_yetkisi_kontrol
from app.services.ortak import logla
from app.utils.hatalar import ApiHatasi

ACILIYET_SIRASI = case(
    {Aciliyet.YUKSEK: 0, Aciliyet.ORTA: 1, Aciliyet.DUSUK: 2},
    value=AcilIhtiyac.aciliyet,
)


def _soz_toplamlari():
    """ihtiyac_id → iptal edilmemiş sözlerin toplam miktarı (alt sorgu)."""
    return (
        db.select(DestekTalebi.ihtiyac_id, func.sum(DestekTalebi.miktar).label("toplam"))
        .where(DestekTalebi.durum != DestekDurumu.IPTAL)
        .group_by(DestekTalebi.ihtiyac_id)
        .subquery()
    )


def _ihtiyac_sorgusu():
    toplamlar = _soz_toplamlari()
    return (
        db.select(AcilIhtiyac, func.coalesce(toplamlar.c.toplam, 0).label("toplam_soz"))
        .outerjoin(toplamlar, toplamlar.c.ihtiyac_id == AcilIhtiyac.id)
        .options(joinedload(AcilIhtiyac.kurum))
    )


def ihtiyac_listesi(filtre):
    sorgu = _ihtiyac_sorgusu().where(AcilIhtiyac.durum == filtre["durum"])
    if filtre.get("kurum_id"):
        sorgu = sorgu.where(AcilIhtiyac.kurum_id == filtre["kurum_id"])
    if filtre.get("tur"):
        sorgu = sorgu.where(AcilIhtiyac.tur == filtre["tur"])
    sorgu = sorgu.order_by(ACILIYET_SIRASI, AcilIhtiyac.olusturma_tarihi.desc(), AcilIhtiyac.id.desc())
    return [ihtiyac.to_dict(toplam_soz=toplam) for ihtiyac, toplam in db.session.execute(sorgu)]


def ihtiyac_detayi(ihtiyac_id):
    satir = db.session.execute(_ihtiyac_sorgusu().where(AcilIhtiyac.id == ihtiyac_id)).first()
    if satir is None:
        raise ApiHatasi("İhtiyaç bulunamadı.", 404)
    ihtiyac, toplam = satir
    return ihtiyac.to_dict(toplam_soz=toplam)


def ihtiyac_ekle(veri):
    veri = dict(veri)
    kurum = kayit_icin_kurum_sec(veri.pop("kurum_id", None))
    ihtiyac = AcilIhtiyac(**veri, kurum=kurum, olusturan_id=current_user.id)
    db.session.add(ihtiyac)
    logla(Islem.IHTIYAC_EKLENDI, ihtiyac, ihtiyac.baslik)
    db.session.commit()
    return ihtiyac


def ihtiyac_guncelle(ihtiyac, degisiklikler):
    """Kurum değiştirilemez; yanlış kuruma eklenen ihtiyaç silinip yeniden eklenir."""
    kurum_yetkisi_kontrol(ihtiyac.kurum_id)
    degisiklikler = {alan: deger for alan, deger in degisiklikler.items() if alan != "kurum_id"}
    for alan, deger in degisiklikler.items():
        setattr(ihtiyac, alan, deger)
    logla(Islem.IHTIYAC_GUNCELLENDI, ihtiyac, f"Değişen alanlar: {', '.join(degisiklikler) or '-'}")
    db.session.commit()
    return ihtiyac


def ihtiyac_karsilandi(ihtiyac):
    kurum_yetkisi_kontrol(ihtiyac.kurum_id)
    if ihtiyac.durum == IhtiyacDurumu.KARSILANDI:
        raise ApiHatasi("Bu ihtiyaç zaten karşılandı olarak işaretlenmiş.", 409)
    ihtiyac.durum = IhtiyacDurumu.KARSILANDI
    ihtiyac.kapanma_tarihi = simdi()
    logla(Islem.IHTIYAC_KARSILANDI, ihtiyac, ihtiyac.baslik)
    db.session.commit()
    return ihtiyac


def ihtiyac_sil(ihtiyac):
    """Yanlışlıkla eklenen ihtiyaç silinebilir; destek sözü gelmişse silinmez, kapatılmalıdır."""
    kurum_yetkisi_kontrol(ihtiyac.kurum_id)
    if ihtiyac.destek_talepleri:
        raise ApiHatasi("Bu ihtiyaca destek sözü verildiği için silinemez. "
                        "Bunun yerine karşılandı olarak işaretleyin.", 409)
    logla(Islem.IHTIYAC_SILINDI, ihtiyac, f"{ihtiyac.baslik} (#{ihtiyac.id}) silindi")
    db.session.delete(ihtiyac)
    db.session.commit()


# ------------------------------------------------------------------ Destek talepleri
def destek_ver(ihtiyac, veri):
    if ihtiyac.durum != IhtiyacDurumu.ACIK:
        raise ApiHatasi("Bu ihtiyaç karşılandığı için artık destek sözü alınmıyor.", 409)

    talep = DestekTalebi(
        ihtiyac=ihtiyac,
        kullanici_id=current_user.id if current_user.is_authenticated else None,
        ad_soyad=veri["ad_soyad"],
        miktar=veri["miktar"],
        aciklama=veri.get("aciklama"),
        kvkk_onay_tarihi=simdi(),
    )
    talep.telefon = veri["telefon"]  # şifrelenerek saklanır
    db.session.add(talep)
    logla(Islem.DESTEK_VERILDI, talep, f"{ihtiyac.baslik}: {veri['miktar']} {ihtiyac.birim}")
    db.session.commit()
    return talep


def destek_talepleri(ihtiyac):
    kurum_yetkisi_kontrol(ihtiyac.kurum_id)
    talepler = db.session.scalars(
        db.select(DestekTalebi).where(DestekTalebi.ihtiyac_id == ihtiyac.id).order_by(DestekTalebi.tarih.desc())
    ).all()
    return [t.to_dict(iletisim=True) for t in talepler]


def destek_durumu_degistir(talep, yeni_durum):
    kurum_yetkisi_kontrol(talep.ihtiyac.kurum_id)
    eski_durum = talep.durum
    talep.durum = yeni_durum
    logla(Islem.DESTEK_DURUMU_DEGISTI, talep, f"{eski_durum} → {yeni_durum}")
    db.session.commit()
    return talep


def destegimi_iptal_et(talep):
    """
    Kullanıcı kendi verdiği destek sözünü iptal eder. Sadece hesabıyla verdiği sözler
    iptal edilebilir (giriş yapmadan verilen sözün sahibi bilinmez; onu görevli iptal eder).
    Teslim edilmiş söz iptal edilemez.
    """
    if talep.kullanici_id != current_user.id:
        raise ApiHatasi("Sadece kendi destek sözünüzü iptal edebilirsiniz.", 403)
    if talep.durum == DestekDurumu.IPTAL:
        raise ApiHatasi("Bu destek sözü zaten iptal edilmiş.", 409)
    if talep.durum == DestekDurumu.TESLIM_EDILDI:
        raise ApiHatasi("Teslim edilmiş destek sözü iptal edilemez.", 409)
    talep.durum = DestekDurumu.IPTAL
    logla(Islem.DESTEK_IPTAL_EDILDI, talep, f"{talep.ihtiyac.baslik}: kullanıcı iptal etti")
    db.session.commit()
    return talep


def kullanicinin_destekleri():
    """Kullanıcılar sekmesi: giriş yapmış kullanıcının verdiği destek sözleri."""
    talepler = db.session.scalars(
        db.select(DestekTalebi)
        .where(DestekTalebi.kullanici_id == current_user.id)
        .options(joinedload(DestekTalebi.ihtiyac).joinedload(AcilIhtiyac.kurum))
        .order_by(DestekTalebi.tarih.desc())
    ).all()
    return [t.to_dict(iletisim=True) for t in talepler]
