from functools import wraps
from flask_login import current_user
from app.utils.responses import hata_yaniti

# Rol sabitleri (Hazım models.py'yi tamamladığında buradaki değerler birebir eşitlenir)
ROL_ADMIN = "admin"
ROL_GOREVLI = "gorevli"
ROL_KULLANICI = "ziyaretci"  # veya "kullanici"


def _aktif_oturum_kontrolu():
    """Kullanıcının giriş yapmış ve hesabının aktif olduğunu doğrular."""
    if not current_user.is_authenticated:
        return hata_yaniti("Bu işlem için giriş yapmanız gerekiyor.", 401)
    if not getattr(current_user, "aktif", True):
        return hata_yaniti("Hesabınız pasif durumdadır.", 403)
    return None


def giris_gerekli(f):
    """Katman 2+: Giriş yapmış herhangi bir kullanıcı (kullanıcı, görevli, admin)."""
    @wraps(f)
    def sarici(*args, **kwargs):
        hata = _aktif_oturum_kontrolu()
        if hata:
            return hata
        return f(*args, **kwargs)
    return sarici


def gorevli_gerekli(f):
    """Katman 3+: Barınak/klinik görevlisi veya sistem yöneticisi."""
    @wraps(f)
    def sarici(*args, **kwargs):
        hata = _aktif_oturum_kontrolu()
        if hata:
            return hata
        if getattr(current_user, "rol", None) not in (ROL_GOREVLI, ROL_ADMIN):
            return hata_yaniti("Bu işlem sadece barınak görevlileri ve yöneticiler içindir.", 403)
        return f(*args, **kwargs)
    return sarici


def admin_gerekli(f):
    """Katman 4: Sadece sistem yöneticisi."""
    @wraps(f)
    def sarici(*args, **kwargs):
        hata = _aktif_oturum_kontrolu()
        if hata:
            return hata
        if getattr(current_user, "rol", None) != ROL_ADMIN:
            return hata_yaniti("Bu işlem sadece sistem yöneticileri içindir.", 403)
        return f(*args, **kwargs)
    return sarici


def kurum_yetkisi_var_mi(kullanici, kurum_id):
    """
    16 tabloluk şemadaki 'Kurum Görevlileri' kontrolü:
    - Admin her kurumda yetkilidir.
    - Görevli sadece atandığı kurum(lar)da yetkilidir.
    """
    if getattr(kullanici, "rol", None) == ROL_ADMIN:
        return True
    if getattr(kullanici, "rol", None) != ROL_GOREVLI:
        return False

    # Hazım'ın models.py'de kuracağı ilişki adına göre (ör. yetkili_kurum_idleri) çalışır
    yetkili_kurumlar = getattr(kullanici, "yetkili_kurum_idleri", [])
    return kurum_id in yetkili_kurumlar


def kurum_yetkili_gerekli(parametre_adi="kurum_id"):
    """URL parametresindeki kurum_id için görevlinin o kuruma yetkili olduğunu doğrular."""
    def dekorator(f):
        @wraps(f)
        def sarici(*args, **kwargs):
            hata = _aktif_oturum_kontrolu()
            if hata:
                return hata

            kurum_id = kwargs.get(parametre_adi)
            if kurum_id is None:
                return hata_yaniti("Kurum bilgisi eksik.", 400)

            if not kurum_yetkisi_var_mi(current_user, kurum_id):
                return hata_yaniti("Bu kurum üzerinde işlem yapma yetkiniz yok.", 403)

            return f(*args, **kwargs)
        return sarici
    return dekorator