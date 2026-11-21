// =============================================================================
// panel.js – Kurum paneli sayfalarının ortak başlatıcısı
// Görevli kontrolü, üst çubuk (kurum seçiciyle), alt menü ve kurum değişimi.
// =============================================================================
import { gorevliGerekli, yetkisizGoster } from './auth.js';
import { aktifKurum, KURUM_DEGISTI_OLAYI } from './kurum.js';
import { panelUstCubugunuYerlestir, panelMenusunuYerlestir } from './layout.js';
import { hataGoster, hataMetni } from './ui.js';

/**
 * Panel sayfasını başlatır.
 *   const s = await panelSayfasi({ baslik: 'Randevular', menu: 'randevular', kurumDegisince: yukle });
 *   if (!s) return;   // giriş/yetki yok; sayfa yönlendirildi veya mesaj gösterildi
 *   s.kurum           // { kurum_id, id, ad, tur } – kurum değişince güncellenir
 */
export async function panelSayfasi({ baslik, geri = '/panel/index.html', ek = null, menu = null, kurumDegisince = null }) {
  let kullanici;
  try {
    kullanici = await gorevliGerekli();
  } catch (hata) {
    hataGoster(document.querySelector('main'), hataMetni(hata), () => window.location.reload());
    return null;
  }
  if (!kullanici) return null;

  await panelUstCubugunuYerlestir({ baslik, geri, ek });
  if (menu) panelMenusunuYerlestir(menu);

  const sayfa = { kullanici, kurum: await aktifKurum() };

  window.addEventListener(KURUM_DEGISTI_OLAYI, (olay) => {
    sayfa.kurum = olay.detail;
    if (typeof kurumDegisince === 'function') kurumDegisince(olay.detail);
  });

  if (!sayfa.kurum) {
    yetkisizGoster('Hesabınıza bağlı bir kurum bulunamadı.');
    return null;
  }
  return sayfa;
}
