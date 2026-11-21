// =============================================================================
// auth.js – Oturum, rol ve kurum yetkisi kontrolü
// Not: Arayüzde buton gizlemek yetki kontrolü değildir; asıl kontrol backend'de.
// Bu dosya yalnızca kullanıcıya yetkisi olmayan ekranları göstermemek içindir.
// =============================================================================
import { apiGet, apiPost, ApiHatasi } from './api.js';
import { el, ikon, icerikDegistir } from './dom.js';

let kullaniciSozu = null;
let sonKullanici = null;

/**
 * Giriş yapmış kullanıcıyı döner (yoksa null). Sonuç sayfa boyunca önbellekte tutulur.
 *   const k = await mevcutKullanici();
 *   await mevcutKullanici({ yenile: true }) → sunucudan yeniden okur
 */
export function mevcutKullanici({ yenile = false } = {}) {
  if (!kullaniciSozu || yenile) {
    kullaniciSozu = apiGet('/api/auth/me')
      .then((kullanici) => {
        sonKullanici = kullanici || null;
        return sonKullanici;
      })
      .catch((hata) => {
        if (hata instanceof ApiHatasi && hata.durum === 401) {
          sonKullanici = null;
          return null;
        }
        kullaniciSozu = null; // ağ hatasında bir sonraki çağrı yeniden denesin
        throw hata;
      });
  }
  return kullaniciSozu;
}

/** Önbellekteki kullanıcıyı eşzamanlı okur (mevcutKullanici en az bir kez beklenmiş olmalı). */
export function onbellektekiKullanici() {
  return sonKullanici;
}

/** Giriş/çıkış sonrası önbelleği temizler. */
export function oturumOnbelleginiTemizle() {
  kullaniciSozu = null;
  sonKullanici = null;
}

/** Rol 'gorevli' ve en az bir kuruma atanmış mı. */
export function gorevliMi(kullanici = sonKullanici) {
  return !!kullanici && kullanici.rol === 'gorevli'
    && Array.isArray(kullanici.yetkili_kurumlar) && kullanici.yetkili_kurumlar.length > 0;
}

export function sistemYoneticisiMi(kullanici = sonKullanici) {
  return !!kullanici && kullanici.rol === 'admin';
}

/** Panel sayfalarına girebilir mi (görevli veya sistem yöneticisi). */
export function panelErisimiVarMi(kullanici = sonKullanici) {
  return gorevliMi(kullanici) || sistemYoneticisiMi(kullanici);
}

/** Kullanıcı verilen kurumda işlem yapabilir mi (admin her kurumda). */
export function yetkiVarMi(kurumId, kullanici = sonKullanici) {
  if (!kullanici) return false;
  if (sistemYoneticisiMi(kullanici)) return true;
  return (kullanici.yetkili_kurumlar || []).some((k) => k.id === Number(kurumId));
}

/** Giriş sayfası adresi; giriş sonrası verilen sayfaya (varsayılan: bu sayfa) döner. */
export function girisAdresi(donus = window.location.pathname + window.location.search + window.location.hash) {
  return `/giris.html?donus=${encodeURIComponent(donus)}`;
}

/**
 * Giriş sonrası gidilecek adres. ?donus= yalnızca site içi bir yol ise kabul edilir.
 * Sonra: görevli → panel, sistem yöneticisi → yönetim, diğerleri → anasayfa.
 */
export function girisSonrasiAdres(kullanici, donus = new URLSearchParams(window.location.search).get('donus')) {
  if (donus && /^\/[\w\-./]*(\?[^\s]*)?(#[\w\-]*)?$/.test(donus) && !donus.includes('..') && !donus.startsWith('//')
    && !/\/(giris|kayit)\.html/.test(donus)) {
    return donus;
  }
  if (gorevliMi(kullanici)) return '/panel/index.html';
  if (sistemYoneticisiMi(kullanici)) return '/yonetim/index.html';
  return '/index.html';
}

/** Sayfanın ana içeriğini "yetkiniz yok" mesajıyla değiştirir. */
export function yetkisizGoster(mesaj = 'Bu sayfayı görüntüleme yetkiniz yok.') {
  const kap = document.querySelector('main') || document.body;
  document.title = 'Yetkiniz yok – PatiPortal';
  icerikDegistir(kap, el('div', { class: 'konteyner', style: { paddingBlock: '48px' } }, [
    el('div', { class: 'bos-durum bos-durum-hata', role: 'alert' }, [
      el('span', { class: 'bos-durum-ikon' }, [ikon('uyari')]),
      el('h1', { style: { fontSize: '22px', margin: '0' }, text: 'Bu sayfaya erişiminiz yok' }),
      el('p', { text: mesaj }),
      el('a', { class: 'btn btn-ana', href: '/index.html', text: 'Anasayfaya dön' })
    ])
  ]));
}

/** Giriş yoksa giriş sayfasına yönlendirir ve null döner. */
export async function girisGerekli() {
  const kullanici = await mevcutKullanici();
  if (!kullanici) {
    window.location.href = girisAdresi();
    return null;
  }
  return kullanici;
}

/** En az bir kurumda görevli (veya sistem yöneticisi) olmayı gerektirir. */
export async function gorevliGerekli() {
  const kullanici = await girisGerekli();
  if (!kullanici) return null;
  if (!panelErisimiVarMi(kullanici)) {
    yetkisizGoster('Bu sayfa kurum görevlileri içindir. Bir kuruma görevli olarak eklenmeniz gerekir.');
    return null;
  }
  return kullanici;
}

/** Sistem yöneticisi olmayı gerektirir. */
export async function sistemYoneticisiGerekli() {
  const kullanici = await girisGerekli();
  if (!kullanici) return null;
  if (!sistemYoneticisiMi(kullanici)) {
    yetkisizGoster('Bu sayfa yalnızca sistem yöneticileri içindir.');
    return null;
  }
  return kullanici;
}

/** Oturumu kapatır ve anasayfaya döner. */
export async function cikisYap(yonlendir = '/index.html') {
  try {
    await apiPost('/api/auth/logout');
  } finally {
    oturumOnbelleginiTemizle();
    if (yonlendir) window.location.href = yonlendir;
  }
}
