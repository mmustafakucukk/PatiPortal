"""
KVKK veri saklama süresi dolmuş kişisel verileri anonimleştirme betiği.

Kullanım:
    python scripts/kvkk_temizlik.py                 # Önizleme (değişiklik yapmaz)
    python scripts/kvkk_temizlik.py --uygula        # 365 günden eski kayıtları anonimleştirir
    python scripts/kvkk_temizlik.py --gun 180 --uygula
"""

import argparse
import sys
from datetime import timedelta
from pathlib import Path

PROJE_KOKU = Path(__file__).resolve().parent.parent
if str(PROJE_KOKU) not in sys.path:
    sys.path.insert(0, str(PROJE_KOKU))

from app import create_app
from app.extensions import db
from app.models import DestekTalebi, SahiplendirmeBasvurusu, simdi
from app.sabitler import BasvuruDurumu, DestekDurumu


def kvkk_temizle(saklama_gun=365, uygula=False):
    app = create_app()
    sinir = simdi() - timedelta(days=saklama_gun)

    with app.app_context():
        eski_destekler = db.session.scalars(
            db.select(DestekTalebi).where(
                DestekTalebi.durum.in_([DestekDurumu.TESLIM_EDILDI, DestekDurumu.IPTAL]),
                DestekTalebi.kvkk_onay_tarihi < sinir,
                DestekTalebi._telefon.is_not(None),
            )
        ).all()

        eski_red_basvurular = db.session.scalars(
            db.select(SahiplendirmeBasvurusu).where(
                SahiplendirmeBasvurusu.durum == BasvuruDurumu.REDDEDILDI,
                SahiplendirmeBasvurusu.basvuru_tarihi < sinir,
                SahiplendirmeBasvurusu.aciklama != "[KVKK kapsamında anonimleştirildi]",
            )
        ).all()

        print(f"Eşik tarih ({saklama_gun} gün öncesi): {sinir.isoformat()}")
        print(f"Anonimleştirilecek kapalı destek sözü  : {len(eski_destekler)}")
        print(f"Anonimleştirilecek eski red başvurusu  : {len(eski_red_basvurular)}")

        if not uygula:
            print("Önizleme modu: veritabanında değişiklik yapılmadı (--uygula ile çalıştırın).")
            return

        for destek in eski_destekler:
            destek.ad_soyad = "Anonim Destekçi"
            destek._telefon = None
            destek.aciklama = None

        for basvuru in eski_red_basvurular:
            basvuru.onceki_deneyim = None
            basvuru.aciklama = "[KVKK kapsamında anonimleştirildi]"

        db.session.commit()
        print("KVKK anonimleştirme işlemi tamamlandı.")


def main():
    parser = argparse.ArgumentParser(description="PatiPortal KVKK veri saklama temizliği")
    parser.add_argument("--gun", type=int, default=365, help="Saklama süresi (gün)")
    parser.add_argument("--uygula", action="store_true", help="Değişiklikleri veritabanına uygula")
    args = parser.parse_args()
    kvkk_temizle(saklama_gun=args.gun, uygula=args.uygula)


if __name__ == "__main__":
    main()