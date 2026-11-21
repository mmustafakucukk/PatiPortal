"""
Kişisel verileri (telefon) şifreleme – Fernet.

Anahtar .env'deki FERNET_KEY'dir. Üretmek için:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Geliştirme ve testte anahtar yoksa veya geçersizse SECRET_KEY'den türetilir.
Canlıda (production) anahtar yoksa uygulama hata verir; sessizce zayıf anahtar kullanılmaz.
"""

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app


def _fernet():
    anahtar = current_app.config.get("FERNET_KEY") or os.getenv("FERNET_KEY")
    try:
        return Fernet(anahtar)
    except (TypeError, ValueError):
        if not (current_app.debug or current_app.testing):
            raise RuntimeError("FERNET_KEY .env dosyasında tanımlı değil veya geçersiz.") from None
        ozet = hashlib.sha256(current_app.config["SECRET_KEY"].encode()).digest()
        return Fernet(base64.urlsafe_b64encode(ozet))


def sifrele(metin):
    if metin is None:
        return None
    return _fernet().encrypt(metin.encode()).decode()


def coz(sifreli_metin):
    if sifreli_metin is None:
        return None
    try:
        return _fernet().decrypt(sifreli_metin.encode()).decode()
    except InvalidToken:
        current_app.logger.error("Şifreli alan çözülemedi (FERNET_KEY değişmiş olabilir).")
        return None
