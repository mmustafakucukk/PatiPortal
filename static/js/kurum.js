// =============================================================================
// kurum.js – Panelde aktif kurum seçimi
// Bir kişi birden fazla kurumda görevli olabilir; tüm panel işlemleri aktif
// kurum için yapılır. Seçim tarayıcı deposunda saklanır.
// =============================================================================
import { mevcutKullanici, sistemYoneticisiMi } from './auth.js';
import { apiGet } from './api.js';
import { el, ikon, icerikDegistir } from './dom.js';

const DEPO_ANAHTARI = 'patiportal_aktif_kurum';
export const KURUM_DEGISTI_OLAYI = 'kurum-degisti';

function depodanOku() {
  try {
    const deger = window.localStorage.getItem(DEPO_ANAHTARI);
    return deger && /^\d+$/.test(deger) ? Number(deger) : null;
  } catch {
    return null;
  }
}

function depoyaYaz(id) {
  try {
    window.localStorage.setItem(DEPO_ANAHTARI, String(id));
  } catch { /* gizli pencere vb.: seçim yalnızca bu sayfada geçerli */ }
}

let bellektekiSecim = null;
let kurumlarSozu = null;

/**
 * Kullanıcının işlem yapabileceği kurumlar: [{ kurum_id, id, ad, tur }].
 * Görevli için /api/auth/me'deki yetkili_kurumlar; sistem yöneticisi için tüm aktif kurumlar.
 * Tür bilgisi (barınak/klinik) kurum listesinden tamamlanır.
 */
export function kullaniciKurumlari() {
  if (!kurumlarSozu) {
    kurumlarSozu = (async () => {
      const kullanici = await mevcutKullanici();
      if (!kullanici) return [];
      let tumu = [];
      try {
        tumu = await apiGet('/api/institutions');
      } catch {
        tumu = [];
      }
      const kaynak = sistemYoneticisiMi(kullanici)
        ? tumu.filter((k) => k.aktif !== false)
        : (kullanici.yetkili_kurumlar || []);
      return kaynak.map((k) => {
        const tam = tumu.find((x) => x.id === k.id);
        return { kurum_id: k.id, id: k.id, ad: k.ad, tur: tam?.tur || null };
      });
    })();
    kurumlarSozu.catch(() => { kurumlarSozu = null; });
  }
  return kurumlarSozu;
}

/**
 * Aktif kurumu döner: { kurum_id, id, ad, tur } veya kullanıcının kurumu yoksa null.
 * Kayıtlı seçim geçersizse kullanıcının ilk kurumu seçilir.
 */
export async function aktifKurum() {
  const kurumlar = await kullaniciKurumlari();
  if (!kurumlar.length) return null;
  const kayitli = bellektekiSecim ?? depodanOku();
  const secili = kurumlar.find((k) => k.kurum_id === kayitli) || kurumlar[0];
  if (secili.kurum_id !== kayitli) {
    bellektekiSecim = secili.kurum_id;
    depoyaYaz(secili.kurum_id);
  }
  return secili;
}

/**
 * Aktif kurumu değiştirir ve sayfaya 'kurum-degisti' olayı gönderir.
 *   window.addEventListener('kurum-degisti', (e) => yenidenYukle(e.detail))
 */
export async function aktifKurumuDegistir(id) {
  const kurum = (await kullaniciKurumlari()).find((k) => k.kurum_id === Number(id));
  if (!kurum) return null;
  bellektekiSecim = kurum.kurum_id;
  depoyaYaz(kurum.kurum_id);
  window.dispatchEvent(new CustomEvent(KURUM_DEGISTI_OLAYI, { detail: kurum }));
  return kurum;
}

/**
 * Kurum seçiciyi kaba yerleştirir: birden fazla kurum varsa açılır liste,
 * tek kurum varsa yalnızca kurum adı.
 */
export async function kurumSeciciyiYerlestir(kap) {
  if (!kap) return;
  const kurumlar = await kullaniciKurumlari();
  const aktif = await aktifKurum();
  kap.classList.add('kurum-secici');
  if (!aktif) {
    icerikDegistir(kap, []);
    return;
  }
  if (kurumlar.length === 1) {
    icerikDegistir(kap, el('span', { class: 'kurum-secici-tek' }, [ikon('bina'), aktif.ad]));
    return;
  }
  const secimId = `kurum-secici-${Math.random().toString(36).slice(2, 8)}`;
  const secim = el('select', {
    id: secimId,
    on: { change: (olay) => aktifKurumuDegistir(olay.target.value) }
  }, kurumlar.map((k) => el('option', { value: k.kurum_id, selected: k.kurum_id === aktif.kurum_id, text: k.ad })));
  icerikDegistir(kap, [el('label', { class: 'gizli-erisim', for: secimId, text: 'Aktif kurum' }), secim]);

  // Başka bir seçici (ör. aynı sayfadaki ikinci kopya) değiştirirse eşitle
  window.addEventListener(KURUM_DEGISTI_OLAYI, (olay) => {
    if (secim.value !== String(olay.detail.kurum_id)) secim.value = String(olay.detail.kurum_id);
  });
}
