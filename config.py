import os
from dotenv import load_dotenv

load_dotenv()

PROJE_KOKU = os.path.dirname(os.path.abspath(__file__))


class BaseConfig:
    SECRET_KEY = os.getenv("SECRET_KEY", "gelistirme-icin-gecici-anahtar")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = False
    RATELIMIT_STORAGE_URI = "memory://"
    WTF_CSRF_ENABLED = True
    FERNET_KEY = os.getenv("FERNET_KEY")

    # Bölüm 4 – fotoğraf / belge yükleme ve aşı takibi
    UPLOAD_KLASORU = os.getenv("UPLOAD_KLASORU", os.path.join(PROJE_KOKU, "uploads"))
    MAX_CONTENT_LENGTH = 60 * 1024 * 1024  # tek istekte en fazla 60 MB (birden çok fotoğraf)
    FOTO_MAKS_BAYT = 10 * 1024 * 1024      # fotoğraf başına en fazla 10 MB
    FOTO_MAKS_ADET = 10                    # tek seferde en fazla 10 fotoğraf
    FOTO_BUYUK_PIKSEL = 1200               # detay sayfası
    FOTO_KUCUK_PIKSEL = 400                # kartlar
    BELGE_MAKS_BAYT = 10 * 1024 * 1024     # aşı belgesi (PDF/resim)
    ASI_YAKLASIYOR_GUN = 7                 # aşı durumu "yaklasiyor" sayılacak gün


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///patiportal.db")


class TestingConfig(BaseConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False
    RATELIMIT_ENABLED = False


class ProductionConfig(BaseConfig):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
    SESSION_COOKIE_SECURE = True


CONFIG_MAP = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}