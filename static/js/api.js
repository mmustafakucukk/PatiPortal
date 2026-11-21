// =============================================================================
// api.js – Tüm backend çağrıları
// Yanıt biçimi: { basarili: true, veri } veya { basarili: false, hata, alanlar }.
// Oturum çerezle taşınır; yazma isteklerinde CSRF anahtarı X-CSRFToken başlığıyla
// gönderilir (anahtar GET /api/auth/csrf-token'dan bir kez alınır).
// =============================================================================

// 401 alınca giriş sayfasına yönlendirilmeyecek yollar
const YONLENDIRMESIZ_YOLLAR = ['/api/auth/me', '/api/auth/login', '/api/auth/register', '/api/auth/logout'];

// -----------------------------------------------------------------------------
// Hata sınıfı
// -----------------------------------------------------------------------------
export class ApiHatasi extends Error {
  constructor(mesaj, { durum = 0, alanlar = {} } = {}) {
    super(mesaj);
    this.name = 'ApiHatasi';
    this.durum = durum;
    this.alanlar = alanlar || {};
  }
}

// -----------------------------------------------------------------------------
// CSRF anahtarı
// -----------------------------------------------------------------------------
let csrfToken = null;
let csrfSozu = null;

/** Dışarıdan bilinen bir anahtar verilirse kullanılır. */
export function csrfTokenAyarla(token) {
  if (token) csrfToken = token;
}

async function csrfAl(yenile = false) {
  if (csrfToken && !yenile) return csrfToken;
  if (!csrfSozu) {
    csrfSozu = fetch('/api/auth/csrf-token', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((y) => y.json())
      .then((json) => {
        csrfToken = json?.veri?.csrf_token || null;
        return csrfToken;
      })
      .finally(() => { csrfSozu = null; });
  }
  return csrfSozu;
}

// -----------------------------------------------------------------------------
// Genel istek fonksiyonları
// Son parametre isteğe bağlı seçeneklerdir: { girisYonlendirmesi: false } verilirse
// 401'de giriş sayfasına gidilmez, yalnızca ApiHatasi fırlatılır.
// -----------------------------------------------------------------------------
export const apiGet = (yol, parametreler = {}, secenekler = {}) => istek('GET', yol, { parametreler, ...secenekler });
export const apiPost = (yol, govde = {}, secenekler = {}) => istek('POST', yol, { govde, ...secenekler });
export const apiPut = (yol, govde = {}, secenekler = {}) => istek('PUT', yol, { govde, ...secenekler });
export const apiPatch = (yol, govde = {}, secenekler = {}) => istek('PATCH', yol, { govde, ...secenekler });
export const apiDelete = (yol, govde = null, secenekler = {}) => istek('DELETE', yol, { govde, ...secenekler });
/** Dosya yükleme (multipart). */
export const apiUpload = (yol, formData, yontem = 'POST', secenekler = {}) => istek(yontem, yol, { formData, ...secenekler });

/**
 * Sayfalı liste yanıtını tek biçime getirir:
 *   { kayitlar, sayfalama: { sayfa, limit, toplam, sayfa_sayisi } }
 *   → { kayitlar, toplam, sayfa, limit, sayfa_sayisi }
 */
export function sayfaliYanit(veri) {
  const s = veri?.sayfalama || {};
  return {
    kayitlar: Array.isArray(veri?.kayitlar) ? veri.kayitlar : [],
    toplam: s.toplam ?? 0,
    sayfa: s.sayfa ?? 1,
    limit: s.limit ?? 12,
    sayfa_sayisi: Math.max(1, s.sayfa_sayisi ?? 1)
  };
}

function sorguMetni(parametreler) {
  const arama = new URLSearchParams();
  for (const [ad, deger] of Object.entries(parametreler || {})) {
    if (deger === null || deger === undefined || deger === '') continue;
    if (Array.isArray(deger)) {
      if (deger.length) arama.set(ad, deger.join(','));
    } else {
      arama.set(ad, String(deger));
    }
  }
  const metin = arama.toString();
  return metin ? `?${metin}` : '';
}

/** Backend alan hatalarını liste olarak döner ({ email: ['…'] }); ilk mesaja sadeleştirilir. */
function alanlariSadelestir(alanlar) {
  if (!alanlar || typeof alanlar !== 'object') return {};
  const sonuc = {};
  for (const [ad, deger] of Object.entries(alanlar)) {
    if (Array.isArray(deger)) sonuc[ad] = String(deger[0] ?? '');
    else if (deger && typeof deger === 'object') sonuc[ad] = String(Object.values(deger).flat()[0] ?? '');
    else sonuc[ad] = String(deger ?? '');
  }
  return sonuc;
}

const csrfHatasiMi = (durum, json) => durum === 400 && /CSRF/i.test(json?.hata || '');

async function istek(yontem, yol, { parametreler = null, govde = null, formData = null, girisYonlendirmesi = true } = {}) {
  let sonuc;
  try {
    sonuc = await gercekIstek(yontem, yol, parametreler, govde, formData);
    if (yontem !== 'GET' && csrfHatasiMi(sonuc.durum, sonuc.json)) {
      await csrfAl(true); // oturum değişmiş olabilir: anahtarı yenile ve bir kez tekrar dene
      sonuc = await gercekIstek(yontem, yol, parametreler, govde, formData);
    }
  } catch (hata) {
    if (hata instanceof ApiHatasi) throw hata;
    console.error('İstek başarısız:', yontem, yol, hata);
    throw new ApiHatasi('Bağlantı kurulamadı, tekrar deneyin.', { durum: 0 });
  }

  const { durum, json } = sonuc;
  if (durum === 401 && girisYonlendirmesi && !YONLENDIRMESIZ_YOLLAR.includes(yol)) {
    girisSayfasinaYonlendir();
  }
  if (durum >= 400 || !json || json.basarili !== true) {
    throw new ApiHatasi(json?.hata || varsayilanHataMesaji(durum), { durum, alanlar: alanlariSadelestir(json?.alanlar) });
  }
  return json.veri;
}

function varsayilanHataMesaji(durum) {
  if (durum === 401) return 'Bu işlem için giriş yapmalısınız.';
  if (durum === 403) return 'Bu işlem için yetkiniz yok.';
  if (durum === 404) return 'Kayıt bulunamadı.';
  if (durum === 413) return 'Dosya çok büyük.';
  if (durum === 429) return 'Çok fazla deneme yaptınız. Biraz bekleyip tekrar deneyin.';
  if (durum >= 500) return 'Sunucuda bir sorun oluştu, tekrar deneyin.';
  return 'İşlem tamamlanamadı.';
}

function girisSayfasinaYonlendir() {
  if (/\/(giris|kayit)\.html$/.test(window.location.pathname)) return;
  const donus = window.location.pathname + window.location.search + window.location.hash;
  window.location.href = `/giris.html?donus=${encodeURIComponent(donus)}`;
}

async function gercekIstek(yontem, yol, parametreler, govde, formData) {
  const basliklar = { Accept: 'application/json' };
  const secenekler = { method: yontem, credentials: 'same-origin', headers: basliklar };
  if (yontem !== 'GET') {
    const token = await csrfAl();
    if (token) basliklar['X-CSRFToken'] = token;
  }
  if (formData) {
    secenekler.body = formData; // Content-Type'ı tarayıcı sınırlarıyla birlikte ayarlar
  } else if (govde !== null && yontem !== 'GET') {
    basliklar['Content-Type'] = 'application/json';
    secenekler.body = JSON.stringify(govde);
  }
  const yanit = await fetch(yol + sorguMetni(parametreler), secenekler);
  let json = null;
  try {
    json = await yanit.json();
  } catch {
    json = null;
  }
  return { durum: yanit.status, json };
}

/**
 * Hayvan türleri, eklenme sırasıyla (Kedi, Köpek önce gelir).
 * API ada göre sıralı döndürüyor; açılır listeler ve filtreler bu sırayı kullanır.
 */
export async function hayvanTurleriniGetir() {
  const turler = await apiGet('/api/hayvan-turleri');
  return [...turler].sort((x, y) => x.id - y.id);
}
