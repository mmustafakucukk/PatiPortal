"""
SQLite veritabanı yedekleme betiği.

Kullanım:
    python scripts/yedekle.py
    python scripts/yedekle.py --saklama-gun 30 --hedef backups
"""

import argparse
import os
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

PROJE_KOKU = Path(__file__).resolve().parent.parent
if str(PROJE_KOKU) not in sys.path:
    sys.path.insert(0, str(PROJE_KOKU))

from app import create_app
from app.extensions import db


def veritabani_yolunu_bul(app):
    with app.app_context():
        url = db.engine.url
        if not url.drivername.startswith("sqlite"):
            raise RuntimeError(
                f"Bu betik SQLite içindir; mevcut sürücü: {url.drivername}. "
                "PostgreSQL için pg_dump kullanınız."
            )
        yol = url.database
        if not yol or yol == ":memory:":
            raise RuntimeError("Bellek-içi veritabanı yedeklenemez.")
        if not os.path.isabs(yol):
            yol = os.path.join(app.instance_path, yol)
        return Path(yol)


def yedekle(hedef_dizin, saklama_gun=14):
    app = create_app()
    kaynak = veritabani_yolunu_bul(app)
    if not kaynak.exists():
        raise FileNotFoundError(f"Veritabanı dosyası bulunamadı: {kaynak}")

    hedef = Path(hedef_dizin)
    hedef.mkdir(parents=True, exist_ok=True)

    damga = datetime.now().strftime("%Y%m%d_%H%M%S")
    yedek_dosya = hedef / f"patiportal_{damga}.db"

    with sqlite3.connect(kaynak) as src, sqlite3.connect(yedek_dosya) as dst:
        src.backup(dst)

    # Eski yedekleri temizle
    sinir = datetime.now() - timedelta(days=saklama_gun)
    silinen = 0
    for dosya in hedef.glob("patiportal_*.db"):
        if datetime.fromtimestamp(dosya.stat().st_mtime) < sinir:
            dosya.unlink()
            silinen += 1

    print(f"Yedek oluşturuldu: {yedek_dosya}")
    if silinen:
        print(f"{saklama_gun} günden eski {silinen} yedek temizlendi.")


def main():
    parser = argparse.ArgumentParser(description="PatiPortal SQLite veritabanı yedekleme")
    parser.add_argument("--hedef", default=str(PROJE_KOKU / "backups"), help="Yedek klasörü")
    parser.add_argument("--saklama-gun", type=int, default=14, help="Yedek saklama süresi (gün)")
    args = parser.parse_args()
    yedekle(args.hedef, args.saklama_gun)


if __name__ == "__main__":
    main()