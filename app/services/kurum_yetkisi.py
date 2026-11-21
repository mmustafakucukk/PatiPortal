"""
Kurum bazlı yetki (Kurum Görevlileri tablosu).

Kural: Görevli sadece bağlı olduğu kurumların hayvanlarını, aşılarını ve ihtiyaçlarını
ekleyip değiştirebilir. Admin her kurumda yetkilidir. Okuma (listeleme) herkese açıktır.
Asıl kontrol app/utils/decorators.py → kurum_yetkisi_var_mi() ile yapılır.
"""

from flask_login import current_user

from app.extensions import db
from app.models import Kurum
from app.utils.decorators import ROL_ADMIN, kurum_yetkisi_var_mi
from app.utils.hatalar import ApiHatasi


def yetkili_kurum_idleri():
    """Admin için None (hepsi), görevli için bağlı olduğu kurumların id kümesi."""
    if current_user.rol == ROL_ADMIN:
        return None
    return set(current_user.yetkili_kurum_idleri)


def kurum_yetkisi_kontrol(kurum_id):
    if not kurum_yetkisi_var_mi(current_user, kurum_id):
        raise ApiHatasi("Bu kurum üzerinde işlem yapma yetkiniz yok.", 403)


def kayit_icin_kurum_sec(istenen_kurum_id):
    """
    Yeni kayıt (hayvan, ihtiyaç) hangi kuruma eklenecek?
    kurum_id gönderilmemişse ve görevli tek bir kuruma bağlıysa o kurum seçilir.
    """
    if istenen_kurum_id is None:
        yetkili = yetkili_kurum_idleri()
        if yetkili is not None and len(yetkili) == 1:
            istenen_kurum_id = next(iter(yetkili))
        else:
            raise ApiHatasi.alan("kurum_id", "Kaydın hangi kuruma ekleneceğini seçin.")

    kurum = db.session.get(Kurum, istenen_kurum_id)
    if kurum is None or not kurum.aktif:
        raise ApiHatasi.alan("kurum_id", "Böyle bir kurum yok.")
    kurum_yetkisi_kontrol(kurum.id)
    return kurum


def kurum_filtresi(kurum_id_sutunu):
    """Görevlinin panelde sadece kendi kurumlarını görmesi için WHERE koşulu (admin için None)."""
    yetkili = yetkili_kurum_idleri()
    if yetkili is None:
        return None
    return kurum_id_sutunu.in_(yetkili)
