// =============================================================================
// yonetim.js – Sistem yönetimi sayfalarının ortak başlatıcısı
// Sistem yöneticisi kontrolü, üst menü, yönetim menüsü ve alt bilgi.
// =============================================================================
import { sistemYoneticisiGerekli } from './auth.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir, yonetimMenusunuYerlestir } from './layout.js';
import { el, ikon } from './dom.js';
import { hataGoster, hataMetni, cekmeceAc } from './ui.js';

/**
 * Yönetim sayfasını başlatır.
 *   const kullanici = await yonetimSayfasi('kurumlar');
 *   if (!kullanici) return;   // giriş/yetki yok; yönlendirildi veya mesaj gösterildi
 */
export async function yonetimSayfasi(aktif) {
  ustMenuyuYerlestir({ acilBant: false });
  altBilgiyiYerlestir();
  let kullanici;
  try {
    kullanici = await sistemYoneticisiGerekli();
  } catch (hata) {
    hataGoster(document.querySelector('main'), hataMetni(hata), () => window.location.reload());
    return null;
  }
  if (!kullanici) return null;
  yonetimMenusunuYerlestir(aktif);
  return kullanici;
}

/**
 * Tablo satırı için "İşlemler" düğmesi: tıklanınca işlemleri çekmecede listeler.
 *   islemMenusu('Pamuk', [{ metin: 'Düzenle', ikon: 'duzenle', tikla: (dugme) => … }, { metin: 'Sil', tehlike: true, tikla }])
 * tikla(dugme) çekmece kapandıktan sonra çağrılır; dugme "İşlemler" düğmesidir (butonBekle için).
 */
export function islemMenusu(baslik, islemler) {
  const dugme = el('button', { class: 'btn btn-cerceve', type: 'button', 'aria-haspopup': 'dialog' }, [
    ikon('daha'), 'İşlemler', el('span', { class: 'gizli-erisim', text: `: ${baslik}` })
  ]);
  dugme.addEventListener('click', () => {
    let cekmece = null;
    const liste = el('ul', { class: 'cekmece-menu' }, islemler.filter(Boolean).map((i) => el('li', {}, [
      el('button', {
        type: 'button', class: i.tehlike ? 'tehlike' : null,
        onClick: () => {
          cekmece.kapat();
          setTimeout(() => i.tikla(dugme), 0);
        }
      }, [ikon(i.ikon || 'ileri'), i.metin])
    ])));
    cekmece = cekmeceAc(liste, { baslik });
  });
  return dugme;
}
