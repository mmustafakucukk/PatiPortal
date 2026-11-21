"""
PatiPortal veritabanı modelleri – 16 tablo.

 1 Kullanici               kullanicilar
 2 Kurum                   kurumlar                    (barınak / klinik)
 3 KurumGorevlisi          kurum_gorevlileri           (hangi görevli hangi kurumda yetkili)
 4 HayvanTuru              hayvan_turleri
 5 Hayvan                  hayvanlar
 6 HayvanFotografi         hayvan_fotograflari
 7 AsiTuru                 asi_turleri
 8 AsiGerekliligi          asi_gereklilikleri          (hangi türe hangi aşı zorunlu)
 9 HayvanAsisi             hayvan_asilari
10 AcilIhtiyac             acil_ihtiyaclar
11 DestekTalebi            destek_talepleri
12 SahiplendirmeBasvurusu  sahiplendirme_basvurulari
13 TeslimSaati             teslim_saatleri
14 TeslimRandevusu         teslim_randevulari
15 SahiplendirmeKaydi      sahiplendirme_kayitlari
16 IslemKaydi              islem_kayitlari

Kurallar:
- Tarih-saat alanları UTC olarak saklanır (simdi()).
- Kişisel telefon numaraları şifreli saklanır; modelde `telefon` özelliği otomatik şifreler/çözer.
- to_dict() şifre hash'ini ASLA dışarı vermez; telefon sadece istenirse (iletisim=True) eklenir.
"""

import sqlite3
from datetime import date, datetime, timezone

from flask_login import UserMixin
from sqlalchemy import event
from sqlalchemy.engine import Engine
from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db
from app.sabitler import (
    Aciliyet, BasvuruDurumu, Cinsiyet, DestekDurumu, HayvanDurumu, IhtiyacDurumu,
    IhtiyacTuru, KurumTuru, RandevuDurumu, Rol,
)
from app.utils.crypto import coz, sifrele

FOTO_URL_ONEKI = "/uploads/hayvanlar"


@event.listens_for(Engine, "connect")
def _sqlite_yabanci_anahtarlari_ac(dbapi_baglantisi, _):
    """SQLite yabancı anahtar (FK) kurallarını varsayılan olarak uygulamaz; PostgreSQL gibi davransın."""
    if isinstance(dbapi_baglantisi, sqlite3.Connection):
        imlec = dbapi_baglantisi.cursor()
        imlec.execute("PRAGMA foreign_keys=ON")
        imlec.close()


def simdi():
    """Şu anki zaman (UTC, saat dilimi bilgisi olmadan)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(deger):
    return deger.isoformat() if deger else None


def enum_tipi(enum_sinifi):
    """Enum değerlerini veritabanında düz metin (VARCHAR) olarak saklar; SQLite ve PostgreSQL'de aynı çalışır."""
    return db.Enum(
        enum_sinifi,
        native_enum=False,
        length=20,
        values_callable=lambda enum: [uye.value for uye in enum],
        validate_strings=True,
    )


# ---------------------------------------------------------------- 1. Kullanıcılar
class Kullanici(UserMixin, db.Model):
    __tablename__ = "kullanicilar"

    id = db.Column(db.Integer, primary_key=True)
    ad_soyad = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), nullable=False, unique=True, index=True)
    _telefon = db.Column("telefon", db.Text)  # şifreli
    sifre_hash = db.Column(db.String(255), nullable=False)
    rol = db.Column(enum_tipi(Rol), nullable=False, default=Rol.ZIYARETCI)
    kvkk_onay_tarihi = db.Column(db.DateTime, nullable=False)
    aktif = db.Column(db.Boolean, nullable=False, default=True)
    olusturma_tarihi = db.Column(db.DateTime, nullable=False, default=simdi)

    kurum_gorevleri = db.relationship(
        "KurumGorevlisi", back_populates="kullanici", cascade="all, delete-orphan"
    )

    @property
    def telefon(self):
        return coz(self._telefon)

    @telefon.setter
    def telefon(self, deger):
        self._telefon = sifrele(deger)

    @property
    def is_active(self):  # Flask-Login pasif kullanıcıyı içeri almaz
        return self.aktif

    @property
    def yetkili_kurum_idleri(self):
        """app/utils/decorators.py → kurum_yetkisi_var_mi() bunu kullanır."""
        return [gorev.kurum_id for gorev in self.kurum_gorevleri]

    def sifre_belirle(self, sifre):
        self.sifre_hash = generate_password_hash(sifre)

    def sifre_dogru_mu(self, sifre):
        return check_password_hash(self.sifre_hash, sifre)

    def to_dict(self, iletisim=False):
        """/api/auth/me yanıtı (API.md bölüm 3) ile aynı alanlar."""
        veri = {
            "id": self.id,
            "ad_soyad": self.ad_soyad,
            "email": self.email,
            "rol": self.rol,
            "aktif": self.aktif,
            "yetkili_kurumlar": [
                {"id": g.kurum.id, "ad": g.kurum.ad} for g in self.kurum_gorevleri
            ],
            "olusturma_tarihi": _iso(self.olusturma_tarihi),
        }
        if iletisim:
            veri["telefon"] = self.telefon
        return veri


# ---------------------------------------------------------------- 2. Kurumlar
class Kurum(db.Model):
    __tablename__ = "kurumlar"

    id = db.Column(db.Integer, primary_key=True)
    ad = db.Column(db.String(150), nullable=False)
    tur = db.Column(enum_tipi(KurumTuru), nullable=False, default=KurumTuru.BARINAK)
    adres = db.Column(db.String(500))
    telefon = db.Column(db.String(20))  # kurumun telefonu kişisel veri değildir, şifrelenmez
    email = db.Column(db.String(120))
    aktif = db.Column(db.Boolean, nullable=False, default=True)
    olusturma_tarihi = db.Column(db.DateTime, nullable=False, default=simdi)

    gorevliler = db.relationship(
        "KurumGorevlisi", back_populates="kurum", cascade="all, delete-orphan"
    )

    def ozet(self):
        return {"id": self.id, "ad": self.ad, "tur": self.tur}

    def to_dict(self):
        return {
            **self.ozet(),
            "adres": self.adres,
            "telefon": self.telefon,
            "email": self.email,
            "aktif": self.aktif,
        }


# ---------------------------------------------------------------- 3. Kurum görevlileri
class KurumGorevlisi(db.Model):
    __tablename__ = "kurum_gorevlileri"
    __table_args__ = (db.UniqueConstraint("kurum_id", "kullanici_id", name="uq_kurum_kullanici"),)

    id = db.Column(db.Integer, primary_key=True)
    kurum_id = db.Column(db.Integer, db.ForeignKey("kurumlar.id", ondelete="CASCADE"), nullable=False)
    kullanici_id = db.Column(
        db.Integer, db.ForeignKey("kullanicilar.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gorev_tanimi = db.Column(db.String(50), nullable=False, default="gorevli")  # "yonetici", "veteriner"...
    baslangic_tarihi = db.Column(db.DateTime, nullable=False, default=simdi)

    kurum = db.relationship("Kurum", back_populates="gorevliler")
    kullanici = db.relationship("Kullanici", back_populates="kurum_gorevleri")


# ---------------------------------------------------------------- 4. Hayvan türleri
class HayvanTuru(db.Model):
    __tablename__ = "hayvan_turleri"

    id = db.Column(db.Integer, primary_key=True)
    ad = db.Column(db.String(30), nullable=False, unique=True)

    asi_gereklilikleri = db.relationship(
        "AsiGerekliligi", back_populates="hayvan_turu", cascade="all, delete-orphan"
    )

    def ozet(self):
        return {"id": self.id, "ad": self.ad}

    def to_dict(self):
        return {
            **self.ozet(),
            "zorunlu_asilar": [g.asi_turu.ozet() for g in self.asi_gereklilikleri],
        }


# ---------------------------------------------------------------- 5. Hayvanlar
class Hayvan(db.Model):
    __tablename__ = "hayvanlar"
    __table_args__ = (db.Index("ix_hayvanlar_tur_durum", "tur_id", "durum"),)

    id = db.Column(db.Integer, primary_key=True)
    ad = db.Column(db.String(50), nullable=False)
    tur_id = db.Column(db.Integer, db.ForeignKey("hayvan_turleri.id"), nullable=False)
    cins = db.Column(db.String(50))
    cinsiyet = db.Column(enum_tipi(Cinsiyet), nullable=False, default=Cinsiyet.BILINMIYOR)
    dogum_tarihi = db.Column(db.Date)  # tahmini olabilir; boşsa yaş "Bilinmiyor"
    saglik_durumu = db.Column(db.Text)
    karakter_notu = db.Column(db.Text)  # "Çocuklarla iyi anlaşır" gibi
    kisirlastirildi = db.Column(db.Boolean, nullable=False, default=False)
    kurum_id = db.Column(db.Integer, db.ForeignKey("kurumlar.id"), nullable=False, index=True)
    durum = db.Column(enum_tipi(HayvanDurumu), nullable=False, default=HayvanDurumu.BARINAKTA)
    ekleyen_id = db.Column(db.Integer, db.ForeignKey("kullanicilar.id", ondelete="SET NULL"))
    olusturma_tarihi = db.Column(db.DateTime, nullable=False, default=simdi)
    guncelleme_tarihi = db.Column(db.DateTime, nullable=False, default=simdi, onupdate=simdi)

    tur = db.relationship("HayvanTuru")
    kurum = db.relationship("Kurum")
    fotograflar = db.relationship(
        "HayvanFotografi", back_populates="hayvan",
        cascade="all, delete-orphan", order_by="HayvanFotografi.sira",
    )
    asilar = db.relationship("HayvanAsisi", back_populates="hayvan", cascade="all, delete-orphan")

    @property
    def yas_ay(self):
        if self.dogum_tarihi is None:
            return None
        bugun, dogum = date.today(), self.dogum_tarihi
        ay = (bugun.year - dogum.year) * 12 + (bugun.month - dogum.month)
        if bugun.day < dogum.day:
            ay -= 1
        return max(ay, 0)

    @property
    def yas(self):
        """Tam yıl olarak yaş; doğum tarihi bilinmiyorsa None."""
        return None if self.yas_ay is None else self.yas_ay // 12

    @property
    def yas_metni(self):
        ay = self.yas_ay
        if ay is None:
            return "Bilinmiyor"
        if ay == 0:
            return "1 aylıktan küçük"
        if ay < 12:
            return f"{ay} aylık"
        return f"{ay // 12} yaşında"

    @property
    def kapak_fotografi(self):
        if not self.fotograflar:
            return None
        return next((f for f in self.fotograflar if f.kapak_mi), self.fotograflar[0])

    def ozet(self):
        """Başka kayıtların içinde (başvuru, aşı listesi...) gösterilecek kısa bilgi."""
        kapak = self.kapak_fotografi
        return {
            "id": self.id,
            "ad": self.ad,
            "tur": self.tur.ad if self.tur else None,
            "durum": self.durum,
            "kapak_fotografi": kapak.to_dict() if kapak else None,
        }

    def to_dict(self, detay=False, asilari_tam=None):
        """`asilari_tam` toplu sorguyla hesaplanıp dışarıdan verilir (bkz. asi_servisi)."""
        kapak = self.kapak_fotografi
        veri = {
            "id": self.id,
            "ad": self.ad,
            "tur": self.tur.ozet(),
            "cins": self.cins,
            "cinsiyet": self.cinsiyet,
            "dogum_tarihi": _iso(self.dogum_tarihi),
            "yas": self.yas,
            "yas_metni": self.yas_metni,
            "kisirlastirildi": self.kisirlastirildi,
            "durum": self.durum,
            "asilari_tam": asilari_tam,
            "kurum": self.kurum.ozet(),
            "kapak_fotografi": kapak.to_dict() if kapak else None,
        }
        if detay:
            veri.update({
                "saglik_durumu": self.saglik_durumu,
                "karakter_notu": self.karakter_notu,
                "kurum": self.kurum.to_dict(),
                "fotograflar": [f.to_dict() for f in self.fotograflar],
                "olusturma_tarihi": _iso(self.olusturma_tarihi),
                "guncelleme_tarihi": _iso(self.guncelleme_tarihi),
            })
        return veri


# ---------------------------------------------------------------- 6. Hayvan fotoğrafları
class HayvanFotografi(db.Model):
    __tablename__ = "hayvan_fotograflari"

    BOYUTLAR = ("buyuk", "kucuk")

    id = db.Column(db.Integer, primary_key=True)
    hayvan_id = db.Column(
        db.Integer, db.ForeignKey("hayvanlar.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Rastgele üretilmiş kök ad. Diskte iki dosya olur: <kok>_buyuk.webp ve <kok>_kucuk.webp
    dosya_adi = db.Column(db.String(64), nullable=False, unique=True)
    kapak_mi = db.Column(db.Boolean, nullable=False, default=False)
    sira = db.Column(db.Integer, nullable=False, default=0)
    yukleme_tarihi = db.Column(db.DateTime, nullable=False, default=simdi)

    hayvan = db.relationship("Hayvan", back_populates="fotograflar")

    @staticmethod
    def dosya_ismi(kok, boyut):
        return f"{kok}_{boyut}.webp"

    def to_dict(self):
        return {
            "id": self.id,
            "kapak_mi": self.kapak_mi,
            "sira": self.sira,
            "url_buyuk": f"{FOTO_URL_ONEKI}/{self.dosya_ismi(self.dosya_adi, 'buyuk')}",
            "url_kucuk": f"{FOTO_URL_ONEKI}/{self.dosya_ismi(self.dosya_adi, 'kucuk')}",
        }


# ---------------------------------------------------------------- 7. Aşı türleri
class AsiTuru(db.Model):
    __tablename__ = "asi_turleri"

    id = db.Column(db.Integer, primary_key=True)
    ad = db.Column(db.String(50), nullable=False, unique=True)
    aciklama = db.Column(db.Text)

    def ozet(self):
        return {"id": self.id, "ad": self.ad}

    def to_dict(self):
        return {**self.ozet(), "aciklama": self.aciklama}


# ---------------------------------------------------------------- 8. Aşı gereklilikleri
class AsiGerekliligi(db.Model):
    __tablename__ = "asi_gereklilikleri"
    __table_args__ = (db.UniqueConstraint("hayvan_turu_id", "asi_turu_id", name="uq_tur_asi"),)

    id = db.Column(db.Integer, primary_key=True)
    hayvan_turu_id = db.Column(
        db.Integer, db.ForeignKey("hayvan_turleri.id", ondelete="CASCADE"), nullable=False
    )
    asi_turu_id = db.Column(
        db.Integer, db.ForeignKey("asi_turleri.id", ondelete="CASCADE"), nullable=False
    )

    hayvan_turu = db.relationship("HayvanTuru", back_populates="asi_gereklilikleri")
    asi_turu = db.relationship("AsiTuru")


# ---------------------------------------------------------------- 9. Hayvan aşıları
class HayvanAsisi(db.Model):
    """
    Uygulanmış bir aşı dozu. `sonraki_tarih` bir sonraki dozun tarihidir.
    Aynı aşının daha yeni bir dozu girildiğinde eskisinin "sonraki dozu" yapılmış sayılır.
    Durum (zamanında / yaklaşıyor / gecikti / tamamlandı) bu yüzden hesaplanır, saklanmaz.
    """
    __tablename__ = "hayvan_asilari"

    id = db.Column(db.Integer, primary_key=True)
    hayvan_id = db.Column(
        db.Integer, db.ForeignKey("hayvanlar.id", ondelete="CASCADE"), nullable=False, index=True
    )
    asi_turu_id = db.Column(db.Integer, db.ForeignKey("asi_turleri.id"), nullable=False)
    uygulama_tarihi = db.Column(db.Date, nullable=False)
    sonraki_tarih = db.Column(db.Date, index=True)
    uygulayan_kurum_id = db.Column(db.Integer, db.ForeignKey("kurumlar.id", ondelete="SET NULL"))
    belge_dosyasi = db.Column(db.String(80))  # rastgele dosya adı (pdf/jpg)
    aciklama = db.Column(db.Text)
    giren_id = db.Column(db.Integer, db.ForeignKey("kullanicilar.id", ondelete="SET NULL"))
    olusturma_tarihi = db.Column(db.DateTime, nullable=False, default=simdi)

    hayvan = db.relationship("Hayvan", back_populates="asilar")
    asi_turu = db.relationship("AsiTuru")
    uygulayan_kurum = db.relationship("Kurum")

    def to_dict(self, durum=None):
        return {
            "id": self.id,
            "hayvan_id": self.hayvan_id,
            "asi_turu": self.asi_turu.ozet(),
            "uygulama_tarihi": _iso(self.uygulama_tarihi),
            "sonraki_tarih": _iso(self.sonraki_tarih),
            "uygulayan_kurum": self.uygulayan_kurum.ozet() if self.uygulayan_kurum else None,
            "belge_url": f"/api/vaccinations/{self.id}/belge" if self.belge_dosyasi else None,
            "aciklama": self.aciklama,
            "durum": durum,
        }


# ---------------------------------------------------------------- 10. Acil ihtiyaçlar
class AcilIhtiyac(db.Model):
    __tablename__ = "acil_ihtiyaclar"

    id = db.Column(db.Integer, primary_key=True)
    kurum_id = db.Column(db.Integer, db.ForeignKey("kurumlar.id"), nullable=False, index=True)
    tur = db.Column(enum_tipi(IhtiyacTuru), nullable=False)
    baslik = db.Column(db.String(100), nullable=False)
    aciklama = db.Column(db.Text)
    miktar = db.Column(db.Float, nullable=False)
    birim = db.Column(db.String(20), nullable=False, default="adet")  # kg, kutu, adet...
    aciliyet = db.Column(enum_tipi(Aciliyet), nullable=False, default=Aciliyet.ORTA)
    durum = db.Column(enum_tipi(IhtiyacDurumu), nullable=False, default=IhtiyacDurumu.ACIK, index=True)
    olusturan_id = db.Column(db.Integer, db.ForeignKey("kullanicilar.id", ondelete="SET NULL"))
    olusturma_tarihi = db.Column(db.DateTime, nullable=False, default=simdi)
    kapanma_tarihi = db.Column(db.DateTime)

    kurum = db.relationship("Kurum")
    destek_talepleri = db.relationship("DestekTalebi", back_populates="ihtiyac")

    def ozet(self):
        return {"id": self.id, "baslik": self.baslik, "durum": self.durum, "kurum": self.kurum.ozet()}

    def to_dict(self, toplam_soz=0.0):
        """`toplam_soz` (iptal edilmemiş destek sözlerinin toplamı) toplu sorguyla hesaplanıp verilir."""
        toplam_soz = float(toplam_soz or 0)
        return {
            "id": self.id,
            "kurum": self.kurum.ozet(),
            "tur": self.tur,
            "baslik": self.baslik,
            "aciklama": self.aciklama,
            "miktar": self.miktar,
            "birim": self.birim,
            "aciliyet": self.aciliyet,
            "durum": self.durum,
            "toplam_soz": toplam_soz,
            "kalan": max(self.miktar - toplam_soz, 0),
            "ilerleme_yuzde": min(100, round(toplam_soz / self.miktar * 100)) if self.miktar else 0,
            # Görevli panelinde "karşılanmış olabilir" uyarısı için. Kapatma kararı görevlinindir.
            "karsilanmis_olabilir": self.durum == IhtiyacDurumu.ACIK and toplam_soz >= self.miktar,
            "olusturma_tarihi": _iso(self.olusturma_tarihi),
            "kapanma_tarihi": _iso(self.kapanma_tarihi),
        }


# ---------------------------------------------------------------- 11. Destek talepleri
class DestekTalebi(db.Model):
    """Bir acil ihtiyaca verilen destek sözü. Giriş yapmadan da verilebilir (kullanici_id boş)."""
    __tablename__ = "destek_talepleri"

    id = db.Column(db.Integer, primary_key=True)
    ihtiyac_id = db.Column(db.Integer, db.ForeignKey("acil_ihtiyaclar.id"), nullable=False, index=True)
    kullanici_id = db.Column(db.Integer, db.ForeignKey("kullanicilar.id", ondelete="SET NULL"), index=True)
    ad_soyad = db.Column(db.String(100), nullable=False)
    _telefon = db.Column("telefon", db.Text, nullable=False)  # şifreli
    miktar = db.Column(db.Float, nullable=False)
    aciklama = db.Column(db.Text)
    durum = db.Column(enum_tipi(DestekDurumu), nullable=False, default=DestekDurumu.SOZ_VERILDI)
    kvkk_onay_tarihi = db.Column(db.DateTime, nullable=False)
    tarih = db.Column(db.DateTime, nullable=False, default=simdi)

    ihtiyac = db.relationship("AcilIhtiyac", back_populates="destek_talepleri")

    @property
    def telefon(self):
        return coz(self._telefon)

    @telefon.setter
    def telefon(self, deger):
        self._telefon = sifrele(deger)

    def to_dict(self, iletisim=False):
        veri = {
            "id": self.id,
            "ihtiyac": self.ihtiyac.ozet(),
            "ad_soyad": self.ad_soyad,
            "miktar": self.miktar,
            "aciklama": self.aciklama,
            "durum": self.durum,
            "tarih": _iso(self.tarih),
        }
        if iletisim:
            veri["telefon"] = self.telefon
        return veri


# ---------------------------------------------------------------- 12. Sahiplendirme başvuruları
# Alan adları app/schemas/application.py (BasvuruOlusturSemasi) ile uyumlu.
class SahiplendirmeBasvurusu(db.Model):
    __tablename__ = "sahiplendirme_basvurulari"
    __table_args__ = (
        # Bir kullanıcı aynı hayvana aynı anda sadece bir "beklemede" başvuru yapabilir.
        db.Index(
            "uq_bekleyen_basvuru", "hayvan_id", "kullanici_id", unique=True,
            sqlite_where=db.text("durum = 'beklemede'"),
            postgresql_where=db.text("durum = 'beklemede'"),
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    hayvan_id = db.Column(db.Integer, db.ForeignKey("hayvanlar.id"), nullable=False, index=True)
    kullanici_id = db.Column(db.Integer, db.ForeignKey("kullanicilar.id"), nullable=False, index=True)
    ev_tipi = db.Column(db.String(100))
    onceki_deneyim = db.Column(db.Text)
    aciklama = db.Column(db.Text)
    kvkk_onay_tarihi = db.Column(db.DateTime)
    durum = db.Column(enum_tipi(BasvuruDurumu), nullable=False, default=BasvuruDurumu.BEKLEMEDE, index=True)
    degerlendiren_id = db.Column(db.Integer, db.ForeignKey("kullanicilar.id", ondelete="SET NULL"))
    degerlendirme_notu = db.Column(db.Text)
    basvuru_tarihi = db.Column(db.DateTime, nullable=False, default=simdi)
    degerlendirme_tarihi = db.Column(db.DateTime)

    hayvan = db.relationship("Hayvan")
    kullanici = db.relationship("Kullanici", foreign_keys=[kullanici_id])


# ---------------------------------------------------------------- 13. Teslim alma saatleri
# Alan adları app/schemas/application.py (TeslimSaatiOlusturSemasi) ile uyumlu.
class TeslimSaati(db.Model):
    __tablename__ = "teslim_saatleri"

    id = db.Column(db.Integer, primary_key=True)
    kurum_id = db.Column(db.Integer, db.ForeignKey("kurumlar.id"), nullable=False, index=True)
    tarih = db.Column(db.Date, nullable=False)
    baslangic_saati = db.Column(db.Time, nullable=False)
    bitis_saati = db.Column(db.Time, nullable=False)
    aktif = db.Column(db.Boolean, nullable=False, default=True)

    kurum = db.relationship("Kurum")


# ---------------------------------------------------------------- 14. Teslim alma randevuları
class TeslimRandevusu(db.Model):
    __tablename__ = "teslim_randevulari"

    id = db.Column(db.Integer, primary_key=True)
    basvuru_id = db.Column(
        db.Integer, db.ForeignKey("sahiplendirme_basvurulari.id"), nullable=False, unique=True
    )
    teslim_saati_id = db.Column(db.Integer, db.ForeignKey("teslim_saatleri.id"), nullable=False)
    kullanici_id = db.Column(db.Integer, db.ForeignKey("kullanicilar.id"), nullable=False, index=True)
    durum = db.Column(enum_tipi(RandevuDurumu), nullable=False, default=RandevuDurumu.PLANLANDI)
    not_metni = db.Column(db.Text)
    olusturma_tarihi = db.Column(db.DateTime, nullable=False, default=simdi)

    basvuru = db.relationship("SahiplendirmeBasvurusu")
    teslim_saati = db.relationship("TeslimSaati")


# ---------------------------------------------------------------- 15. Sahiplendirme kayıtları
class SahiplendirmeKaydi(db.Model):
    """Hangi hayvan, kime, ne zaman, hangi görevli tarafından teslim edildi. Kullanıcı sekmesinde gösterilir."""
    __tablename__ = "sahiplendirme_kayitlari"

    id = db.Column(db.Integer, primary_key=True)
    hayvan_id = db.Column(db.Integer, db.ForeignKey("hayvanlar.id"), nullable=False, index=True)
    kullanici_id = db.Column(db.Integer, db.ForeignKey("kullanicilar.id"), nullable=False, index=True)
    basvuru_id = db.Column(db.Integer, db.ForeignKey("sahiplendirme_basvurulari.id"), unique=True, nullable=True)
    teslim_eden_id = db.Column(db.Integer, db.ForeignKey("kullanicilar.id", ondelete="SET NULL"))
    teslim_tarihi = db.Column(db.DateTime, nullable=False, default=simdi)
    teslim_notu = db.Column(db.Text)

    hayvan = db.relationship("Hayvan")
    kullanici = db.relationship("Kullanici", foreign_keys=[kullanici_id])


# ---------------------------------------------------------------- 16. İşlem kayıtları
class IslemKaydi(db.Model):
    """
    Önemli işlemlerin geçmişi. app/utils/audit.py → islem_kaydet() yazar.
    `hedef_tablo` + `hedef_id` hangi kayıtla ilgili olduğunu gösterir; kayıt sonradan
    silinse de log kalsın diye yabancı anahtar değildir.
    """
    __tablename__ = "islem_kayitlari"

    id = db.Column(db.Integer, primary_key=True)
    kullanici_id = db.Column(db.Integer, db.ForeignKey("kullanicilar.id", ondelete="SET NULL"))
    islem_turu = db.Column(db.String(50), nullable=False, index=True)
    hedef_tablo = db.Column(db.String(50))
    hedef_id = db.Column(db.Integer)
    detay = db.Column(db.Text)
    ip_adresi = db.Column(db.String(45))
    tarih = db.Column(db.DateTime, nullable=False, default=simdi, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "kullanici_id": self.kullanici_id,
            "islem_turu": self.islem_turu,
            "hedef_tablo": self.hedef_tablo,
            "hedef_id": self.hedef_id,
            "detay": self.detay,
            "tarih": _iso(self.tarih),
        }
