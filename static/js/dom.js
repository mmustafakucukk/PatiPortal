// =============================================================================
// dom.js – Güvenli eleman oluşturucu ve küçük DOM yardımcıları
// Kullanıcıdan veya API'den gelen metin hiçbir zaman innerHTML ile basılmaz;
// tüm içerik textContent / createTextNode ile eklenir.
// =============================================================================

const SVG_NS = 'http://www.w3.org/2000/svg';

// Değeri doğrudan özellik (property) olarak atanan boolean nitelikler
const BOOLEAN_NITELIKLER = new Set([
  'disabled', 'checked', 'selected', 'hidden', 'required', 'readonly',
  'multiple', 'autofocus', 'open', 'novalidate'
]);

/**
 * Güvenli eleman oluşturur.
 *   el('div', { class: 'kart' }, [el('h3', { text: 'Pamuk' }), 'metin'])
 *
 * Özellikler:
 *   class      : 'a b' veya ['a', kosul && 'b']
 *   text       : textContent olarak yazılır
 *   style      : { width: '40%' } veya { '--degisken': '1' }
 *   dataset    : { id: 5 } → data-id="5"
 *   on         : { click: fn, input: fn }  (ayrıca onClick: fn biçimi de olur)
 *   href / src : guvenliUrl() ile denetlenir
 *   diğerleri  : setAttribute (null / undefined / false ise eklenmez)
 */
export function el(etiket, ozellikler = {}, cocuklar = []) {
  const eleman = document.createElement(etiket);
  ozellikleriUygula(eleman, ozellikler);
  cocuklariEkle(eleman, cocuklar);
  return eleman;
}

function ozellikleriUygula(eleman, ozellikler) {
  if (!ozellikler) return;
  for (const [ad, deger] of Object.entries(ozellikler)) {
    if (deger === undefined || deger === null) continue;

    if (ad === 'class' || ad === 'className') {
      const siniflar = Array.isArray(deger) ? deger.filter(Boolean).join(' ') : deger;
      if (siniflar) eleman.setAttribute('class', siniflar);
    } else if (ad === 'text') {
      eleman.textContent = String(deger);
    } else if (ad === 'html' || ad === 'innerHTML') {
      throw new Error('dom.js: html özelliği desteklenmez, text kullanın.');
    } else if (ad === 'style' && typeof deger === 'object') {
      for (const [k, v] of Object.entries(deger)) {
        if (v === null || v === undefined) continue;
        if (k.startsWith('--')) eleman.style.setProperty(k, v);
        else eleman.style[k] = v;
      }
    } else if (ad === 'dataset' && typeof deger === 'object') {
      for (const [k, v] of Object.entries(deger)) {
        if (v !== null && v !== undefined) eleman.dataset[k] = String(v);
      }
    } else if (ad === 'on' && typeof deger === 'object') {
      for (const [olay, fn] of Object.entries(deger)) eleman.addEventListener(olay, fn);
    } else if (/^on[A-Z]/.test(ad) && typeof deger === 'function') {
      eleman.addEventListener(ad.slice(2).toLowerCase(), deger);
    } else if (ad === 'href' || ad === 'src' || ad === 'action' || ad === 'formaction') {
      const url = guvenliUrl(deger);
      if (url !== null) eleman.setAttribute(ad, url);
    } else if (ad === 'value' && 'value' in eleman) {
      eleman.value = String(deger);
    } else if (BOOLEAN_NITELIKLER.has(ad)) {
      if (deger) {
        eleman.setAttribute(ad, '');
        if (ad in eleman) eleman[ad] = true;
      }
    } else if (deger === false) {
      continue;
    } else if (deger === true) {
      eleman.setAttribute(ad, ad.startsWith('aria-') ? 'true' : '');
    } else {
      eleman.setAttribute(ad, String(deger));
    }
  }
}

function cocuklariEkle(eleman, cocuklar) {
  if (cocuklar === null || cocuklar === undefined || cocuklar === false) return;
  const liste = Array.isArray(cocuklar) ? cocuklar : [cocuklar];
  for (const cocuk of liste) {
    if (cocuk === null || cocuk === undefined || cocuk === false || cocuk === '') continue;
    if (Array.isArray(cocuk)) cocuklariEkle(eleman, cocuk);
    else if (cocuk instanceof Node) eleman.appendChild(cocuk);
    else eleman.appendChild(document.createTextNode(String(cocuk)));
  }
}

/** Kabın içeriğini verilen çocuklarla değiştirir (çocuk yoksa boşaltır). */
export function icerikDegistir(kap, cocuklar = []) {
  if (!kap) return;
  kap.replaceChildren();
  cocuklariEkle(kap, cocuklar);
}

/** Kabı boşaltır. */
export function temizle(kap) {
  if (kap) kap.replaceChildren();
}

/** Belgeden tek eleman seçer. */
export function $(secici, kok = document) {
  return kok.querySelector(secici);
}

/** Belgeden eleman listesi seçer (dizi döner). */
export function $$(secici, kok = document) {
  return Array.from(kok.querySelectorAll(secici));
}

/**
 * Bağlantı ve görsel adreslerini denetler. javascript:, vbscript: gibi
 * adresleri reddeder. İzin verilenler: göreli yollar, http(s), mailto, tel,
 * blob ve data:image / data:application/pdf.
 */
export function guvenliUrl(url) {
  if (url === null || url === undefined) return null;
  const metin = String(url).trim();
  if (metin === '') return '';
  // Kontrol karakterleri ve boşluklarla gizlenmiş şemaları yakalamak için sadeleştir
  const sade = metin.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  if (/^(javascript|vbscript):/.test(sade)) return null;
  if (sade.startsWith('data:')) {
    return /^data:(image\/(png|jpe?g|gif|webp|svg\+xml)|application\/pdf)[;,]/.test(sade) ? metin : null;
  }
  const semaVar = /^[a-z][a-z0-9+.-]*:/.test(sade);
  if (!semaVar) return metin; // göreli yol, #çapa, ?sorgu
  return /^(https?|mailto|tel|blob):/.test(sade) ? metin : null;
}

/** Telefon numarasından tel: bağlantısı üretir ("0532 123 45 67" → "tel:05321234567"). */
export function telLinki(telefon) {
  const rakamlar = String(telefon || '').replace(/[^\d+]/g, '');
  return rakamlar ? `tel:${rakamlar}` : null;
}

/**
 * URL'deki parametreyi pozitif tam sayı olarak okur; geçersizse null döner.
 *   sayiParametresi('id') → 5 veya null
 */
export function sayiParametresi(ad, arama = window.location.search) {
  const deger = new URLSearchParams(arama).get(ad);
  if (deger === null || !/^\d{1,9}$/.test(deger)) return null;
  const sayi = Number(deger);
  return sayi > 0 ? sayi : null;
}

/**
 * URL'deki parametreyi izin verilen değerler listesine göre okur.
 *   secimParametresi('durum', ['acik', 'karsilandi'])
 */
export function secimParametresi(ad, izinliler, varsayilan = null, arama = window.location.search) {
  const deger = new URLSearchParams(arama).get(ad);
  return izinliler.includes(deger) ? deger : varsayilan;
}

// -----------------------------------------------------------------------------
// İkonlar: satır içi SVG, çizgi stili, 1.8 kalınlık (.ikon sınıfı)
// -----------------------------------------------------------------------------
const PATI = [
  ['circle', { cx: 6.5, cy: 10, r: 1.9 }], ['circle', { cx: 9.5, cy: 5.8, r: 1.9 }],
  ['circle', { cx: 14.5, cy: 5.8, r: 1.9 }], ['circle', { cx: 17.5, cy: 10, r: 1.9 }],
  ['path', { d: 'M12 12.2c-2.3 0-3.7 1.8-4.8 3.5-1 1.6-.8 3.6 1 4.1 1.3.4 2.4-.3 3.8-.3s2.5.7 3.8.3c1.8-.5 2-2.5 1-4.1-1.1-1.7-2.5-3.5-4.8-3.5z' }]
];

export const IKONLAR = {
  pati: PATI,
  arti: [['path', { d: 'M12 5v14M5 12h14' }]],
  geri: [['path', { d: 'm15 18-6-6 6-6' }]],
  ileri: [['path', { d: 'm9 18 6-6-6-6' }]],
  asagi: [['path', { d: 'm6 9 6 6 6-6' }]],
  ara: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'm20 20-3.5-3.5' }]],
  kapat: [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
  onay: [['path', { d: 'M20 6 9 17l-5-5' }]],
  takvim: [['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }], ['path', { d: 'M16 3v4M8 3v4M3 10h18' }]],
  saat: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3 2' }]],
  telefon: [['path', { d: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2' }]],
  konum: [['path', { d: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z' }], ['circle', { cx: 12, cy: 9.5, r: 2.5 }]],
  ev: [['path', { d: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' }]],
  belge: [['path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 3v5h5M9 13h6M9 17h6' }]],
  ihtiyac: [['path', { d: 'M6 8h12l-1 12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z' }], ['path', { d: 'M9 8V6a3 3 0 0 1 6 0v2' }]],
  menu: [['path', { d: 'M4 6h16M4 12h16M4 18h16' }]],
  daha: [['circle', { cx: 5, cy: 12, r: 1.3 }], ['circle', { cx: 12, cy: 12, r: 1.3 }], ['circle', { cx: 19, cy: 12, r: 1.3 }]],
  kamera: [['path', { d: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z' }], ['circle', { cx: 12, cy: 13.5, r: 3.5 }]],
  uyari: [['path', { d: 'M12 3.5 2.5 20h19z' }], ['path', { d: 'M12 10v4.5M12 17.5h.01' }]],
  bilgi: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 11v5.5M12 7.5h.01' }]],
  cikis: [['path', { d: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3' }], ['path', { d: 'm10 17 5-5-5-5M15 12H3' }]],
  filtre: [['path', { d: 'M4 6h16M7 12h10M10 18h4' }]],
  bina: [['path', { d: 'M3 21h18M5 21V8l7-4.5L19 8v13M10 21v-4h4v4M9 10.5h.01M15 10.5h.01M9 14h.01M15 14h.01' }]],
  cop: [['path', { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3' }]],
  duzenle: [['path', { d: 'M4 20h4L19 9l-4-4L4 16z' }], ['path', { d: 'm13.5 6.5 4 4' }]],
  asi: [['path', { d: 'm18 2 4 4M17 7l3-3M19 9l-10.3 10.3a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 0 1 0-1.4L15 5M9 11l4 4M5 19l-3 3M14 4l6 6' }]],
  goz: [['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z' }], ['circle', { cx: 12, cy: 12, r: 3 }]],
  gozKapali: [['path', { d: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2' }]],
  kullanici: [['circle', { cx: 12, cy: 8, r: 4 }], ['path', { d: 'M4 21a8 8 0 0 1 16 0' }]],
  kullanicilar: [['circle', { cx: 9, cy: 8, r: 3.5 }], ['path', { d: 'M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6' }]],
  yenile: [['path', { d: 'M20 11a8 8 0 1 0-2.3 5.7' }], ['path', { d: 'M20 4v7h-7' }]],
  liste: [['path', { d: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01' }]],
  grafik: [['path', { d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' }]],
  ayarlar: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1' }]],
  kalp: [['path', { d: 'M12 20s-7.5-4.6-9.3-9.2C1.5 7.5 3.8 4.5 7 4.5c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3.2 0 5.5 3 4.3 6.3C19.5 15.4 12 20 12 20z' }]]
};

/**
 * Satır içi SVG ikon oluşturur. Ekran okuyuculardan gizlidir; anlam taşıyorsa
 * butona aria-label verin.
 *   ikon('pati'), ikon('arti', 'ikon-buyuk')
 */
export function ikon(ad, ekSinif = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', ['ikon', ekSinif].filter(Boolean).join(' '));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [etiket, nitelikler] of IKONLAR[ad] || []) {
    const parca = document.createElementNS(SVG_NS, etiket);
    for (const [k, v] of Object.entries(nitelikler)) parca.setAttribute(k, String(v));
    svg.appendChild(parca);
  }
  return svg;
}
