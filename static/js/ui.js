// =============================================================================
// ui.js – Toast, yükleniyor / hata / boş durum, form hataları, modal, çekmece,
// onay penceresi ve biçimlendirme yardımcıları
// =============================================================================
import { el, ikon, icerikDegistir } from './dom.js';

// -----------------------------------------------------------------------------
// Toast
// -----------------------------------------------------------------------------
const TOAST_IKONLARI = { basari: 'onay', hata: 'uyari', uyari: 'uyari', bilgi: 'bilgi' };

function toastKabi() {
  let kap = document.querySelector('.toast-kap[data-ui]');
  if (!kap) {
    kap = el('div', { class: 'toast-kap', 'data-ui': '', role: 'region', 'aria-label': 'Bildirimler' });
    document.body.appendChild(kap);
  }
  return kap;
}

/**
 * Kısa bildirim gösterir.
 *   toast('Kaydedildi', 'basari')   tür: basari | hata | uyari | bilgi
 */
export function toast(mesaj, tur = 'bilgi', sure = 4500) {
  const gecerliTur = TOAST_IKONLARI[tur] ? tur : 'bilgi';
  const kapat = () => {
    clearTimeout(zamanlayici);
    kutu.remove();
  };
  const kutu = el('div', {
    class: ['toast', `toast-${gecerliTur}`],
    role: gecerliTur === 'hata' ? 'alert' : 'status'
  }, [
    ikon(TOAST_IKONLARI[gecerliTur]),
    el('span', { class: 'toast-metin', text: mesaj }),
    el('button', { class: 'btn btn-ikon', type: 'button', 'aria-label': 'Bildirimi kapat', onClick: kapat }, [ikon('kapat', 'ikon-kucuk')])
  ]);
  toastKabi().appendChild(kutu);
  const zamanlayici = sure > 0 ? setTimeout(kapat, sure) : null;
  return kapat;
}

// -----------------------------------------------------------------------------
// Yükleniyor, hata ve boş durumları
// -----------------------------------------------------------------------------

/**
 * Kabın içine iskelet yer tutucular koyar.
 *   tur: 'kart' (hayvan kartı), 'liste' (liste satırları), 'metin' (paragraf)
 */
export function yukleniyorGoster(kap, adet = 3, tur = 'kart') {
  if (!kap) return;
  const parcalar = [];
  for (let i = 0; i < adet; i++) {
    if (tur === 'liste') {
      parcalar.push(el('div', { class: 'liste-satiri', 'aria-hidden': 'true' }, [
        el('span', { class: 'iskelet iskelet-kare' }),
        el('span', { class: 'liste-satiri-metin' }, [
          el('span', { class: 'iskelet iskelet-metin' }),
          el('span', { class: 'iskelet iskelet-metin iskelet-metin-kisa' })
        ])
      ]));
    } else if (tur === 'metin') {
      parcalar.push(el('div', { 'aria-hidden': 'true' }, [
        el('div', { class: 'iskelet iskelet-baslik' }),
        el('div', { class: 'iskelet iskelet-metin' }),
        el('div', { class: 'iskelet iskelet-metin' }),
        el('div', { class: 'iskelet iskelet-metin iskelet-metin-kisa' })
      ]));
    } else {
      parcalar.push(el('div', { class: 'iskelet-kart', 'aria-hidden': 'true' }, [
        el('div', { class: 'iskelet iskelet-foto' }),
        el('div', { class: 'iskelet-kart-govde' }, [
          el('div', { class: 'iskelet iskelet-baslik' }),
          el('div', { class: 'iskelet iskelet-metin' }),
          el('div', { class: 'iskelet iskelet-metin iskelet-metin-kisa' })
        ])
      ]));
    }
  }
  parcalar.push(el('span', { class: 'gizli-erisim', role: 'status', text: 'Yükleniyor…' }));
  icerikDegistir(kap, parcalar);
}

/** Hata durumunu "Tekrar dene" butonuyla gösterir. */
export function hataGoster(kap, mesaj = 'Bir sorun oluştu.', tekrarDene = null) {
  if (!kap) return;
  icerikDegistir(kap, el('div', { class: 'bos-durum bos-durum-hata', role: 'alert' }, [
    el('span', { class: 'bos-durum-ikon' }, [ikon('uyari')]),
    el('h3', { text: 'Bir sorun oluştu' }),
    el('p', { text: mesaj }),
    tekrarDene && el('button', { class: 'btn btn-ana', type: 'button', onClick: tekrarDene }, [ikon('yenile'), 'Tekrar dene'])
  ]));
}

/**
 * Boş durumu gösterir.
 *   bosDurumGoster(kap, 'Henüz başvurunuz yok', { metin: 'Hayvanlara göz at', href: '/hayvanlar.html' })
 *   mesaj bir nesne de olabilir: { baslik, aciklama, ikon }
 *   link'te href yerine tikla: fn verilirse buton olur.
 */
export function bosDurumGoster(kap, mesaj, link = null) {
  if (!kap) return;
  const bilgi = typeof mesaj === 'object' && mesaj !== null ? mesaj : { baslik: mesaj };
  let eylem = null;
  if (link && link.href) {
    eylem = el('a', { class: 'btn btn-cerceve', href: link.href, text: link.metin });
  } else if (link && link.tikla) {
    eylem = el('button', { class: 'btn btn-cerceve', type: 'button', onClick: link.tikla, text: link.metin });
  }
  icerikDegistir(kap, el('div', { class: 'bos-durum' }, [
    el('span', { class: 'bos-durum-ikon' }, [ikon(bilgi.ikon || 'pati')]),
    el('h3', { text: bilgi.baslik || 'Kayıt bulunamadı' }),
    bilgi.aciklama && el('p', { text: bilgi.aciklama }),
    eylem
  ]));
}

// -----------------------------------------------------------------------------
// Form hataları
// -----------------------------------------------------------------------------
let hataSayaci = 0;

function alanKabi(alan) {
  return alan.closest('.form-alan') || alan.closest('fieldset') || alan.parentElement;
}

/**
 * Sunucudan (veya istemci doğrulamasından) gelen alan hatalarını gösterir.
 *   formHatalariniGoster(form, { email: 'Geçersiz e-posta' }, 'Genel hata mesajı')
 * Formda karşılığı olmayan alan hataları formun üstündeki genel kutuda listelenir.
 */
export function formHatalariniGoster(form, alanlar = {}, genelMesaj = '') {
  if (!form) return;
  formHatalariniTemizle(form);
  const eslesmeyenler = [];
  let ilkAlan = null;

  for (const [ad, mesaj] of Object.entries(alanlar || {})) {
    const oge = form.elements.namedItem(ad);
    if (!oge) {
      eslesmeyenler.push(mesaj);
      continue;
    }
    const girdiler = oge instanceof RadioNodeList ? Array.from(oge) : [oge];
    const kap = alanKabi(girdiler[0]);
    let hataEl = kap.querySelector(':scope > .form-hata, :scope .form-hata');
    if (!hataEl) {
      hataEl = el('p', { class: 'form-hata', 'data-ui-olusturdu': '' });
      kap.appendChild(hataEl);
    }
    if (!hataEl.id) hataEl.id = `form-hata-${++hataSayaci}`;
    hataEl.textContent = mesaj;

    kap.classList.add('hatali');
    kap.querySelector('.secim-grubu, .saat-izgara')?.classList.add('hatali');
    for (const girdi of girdiler) {
      girdi.setAttribute('aria-invalid', 'true');
      const onceki = (girdi.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (!onceki.includes(hataEl.id)) girdi.setAttribute('aria-describedby', [...onceki, hataEl.id].join(' '));
    }
    if (!ilkAlan) ilkAlan = girdiler[0];
  }

  const genelMesajlar = [genelMesaj, ...eslesmeyenler].filter(Boolean);
  if (genelMesajlar.length) {
    form.prepend(el('div', { class: 'uyari-kutusu uyari-kutusu-acil form-genel-hata', role: 'alert', style: { marginBottom: '18px' } }, [
      ikon('uyari'),
      el('div', { class: 'uyari-kutusu-metin' }, genelMesajlar.map((m) => el('p', { text: m })))
    ]));
  }

  if (ilkAlan) ilkAlan.focus({ preventScroll: false });
  else if (genelMesajlar.length) form.querySelector('.form-genel-hata')?.scrollIntoView({ block: 'nearest' });
}

/** Formdaki tüm hata işaretlerini kaldırır. */
export function formHatalariniTemizle(form) {
  if (!form) return;
  form.querySelectorAll('.form-genel-hata').forEach((k) => k.remove());
  form.querySelectorAll('[aria-invalid="true"]').forEach((g) => g.removeAttribute('aria-invalid'));
  form.querySelectorAll('.hatali').forEach((k) => k.classList.remove('hatali'));
  form.querySelectorAll('.form-hata').forEach((h) => {
    if (h.hasAttribute('data-ui-olusturdu')) h.remove();
    else h.textContent = '';
  });
}

// -----------------------------------------------------------------------------
// Katmanlar: modal ve çekmece (Esc ile kapanır, odak içeride kalır)
// -----------------------------------------------------------------------------
const katmanlar = [];
const ODAKLANABILIR = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function klavyeIsleyici(olay) {
  const ust = katmanlar[katmanlar.length - 1];
  if (!ust) return;
  if (olay.key === 'Escape' && ust.kapatilabilir) {
    olay.preventDefault();
    ust.kapat();
  } else if (olay.key === 'Tab') {
    const odaklar = Array.from(ust.kutu.querySelectorAll(ODAKLANABILIR)).filter((e) => e.offsetParent !== null || e === document.activeElement);
    if (!odaklar.length) {
      olay.preventDefault();
      ust.kutu.focus();
      return;
    }
    const ilk = odaklar[0];
    const son = odaklar[odaklar.length - 1];
    if (olay.shiftKey && (document.activeElement === ilk || !ust.kutu.contains(document.activeElement))) {
      olay.preventDefault();
      son.focus();
    } else if (!olay.shiftKey && (document.activeElement === son || !ust.kutu.contains(document.activeElement))) {
      olay.preventDefault();
      ilk.focus();
    }
  }
}

function katmanAc(arka, kutu, { kapatilabilir = true, kapaninca = null } = {}) {
  // Arka plandaki içeriği klavye ve ekran okuyucu için devre dışı bırak
  const pasiflestirilenler = [];
  for (const cocuk of Array.from(document.body.children)) {
    if (cocuk === arka || cocuk.classList.contains('toast-kap') || cocuk.inert) continue;
    cocuk.inert = true;
    pasiflestirilenler.push(cocuk);
  }
  const katman = {
    arka, kutu, kapatilabilir,
    onceki: document.activeElement,
    kapat: () => katmanKapat(katman)
  };
  katman.kapaninca = kapaninca;
  katman.pasiflestirilenler = pasiflestirilenler;
  katmanlar.push(katman);

  if (katmanlar.length === 1) {
    document.addEventListener('keydown', klavyeIsleyici);
    document.documentElement.style.overflow = 'hidden';
  }
  arka.addEventListener('mousedown', (olay) => {
    if (olay.target === arka && katman.kapatilabilir) katman.kapat();
  });
  document.body.appendChild(arka);

  // Önce [autofocus], sonra gövdedeki ilk odaklanabilir öğe, yoksa kapat düğmesi
  const govde = kutu.querySelector('.modal-govde, .cekmece-govde');
  const ilkOdak = kutu.querySelector('[autofocus]') || govde?.querySelector(ODAKLANABILIR) || kutu.querySelector(ODAKLANABILIR);
  (ilkOdak || kutu).focus();
  return katman;
}

function katmanKapat(katman) {
  const sira = katmanlar.indexOf(katman);
  if (sira === -1) return;
  katmanlar.splice(sira, 1);
  katman.arka.remove();
  katman.pasiflestirilenler.forEach((e) => { e.inert = false; });
  if (!katmanlar.length) {
    document.removeEventListener('keydown', klavyeIsleyici);
    document.documentElement.style.overflow = '';
  }
  if (katman.onceki && typeof katman.onceki.focus === 'function' && document.contains(katman.onceki)) {
    katman.onceki.focus();
  }
  if (typeof katman.kapaninca === 'function') katman.kapaninca();
}

let katmanSayaci = 0;

/**
 * Modal açar.
 *   const m = modalAc(icerik, { baslik: 'Başvuru detayı', alt: [buton1, buton2], genis: true })
 *   m.kapat()
 * icerik: Node veya Node dizisi. alt: modalın altındaki butonlar.
 */
export function modalAc(icerik, secenekler = {}) {
  const { baslik = '', alt = null, genis = false, kapatilabilir = true, kapaninca = null } = secenekler;
  const baslikId = `modal-baslik-${++katmanSayaci}`;
  let katman = null;
  const govde = el('div', { class: 'modal-govde' }, icerik);
  const kutu = el('div', {
    class: ['modal', genis && 'modal-genis'],
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': baslikId, tabindex: '-1'
  }, [
    el('div', { class: 'modal-baslik' }, [
      el('h2', { id: baslikId, text: baslik }),
      kapatilabilir && el('button', { class: 'btn btn-ikon', type: 'button', 'aria-label': 'Kapat', onClick: () => katman.kapat() }, [ikon('kapat')])
    ]),
    govde,
    alt && el('div', { class: 'modal-alt' }, alt)
  ]);
  const arka = el('div', { class: 'modal-arka acik' }, [kutu]);
  katman = katmanAc(arka, kutu, { kapatilabilir, kapaninca });
  return { kutu, govde, kapat: katman.kapat };
}

/** En üstteki modalı (veya çekmeceyi) kapatır. */
export function modalKapat() {
  const ust = katmanlar[katmanlar.length - 1];
  if (ust) ust.kapat();
}

/**
 * Çekmece açar (mobilde alttan, geniş ekranda sağdan).
 *   cekmeceAc(icerik, { baslik: 'Filtreler', alt: [buton] })
 */
export function cekmeceAc(icerik, secenekler = {}) {
  const { baslik = '', alt = null, kapaninca = null } = secenekler;
  const baslikId = `cekmece-baslik-${++katmanSayaci}`;
  let katman = null;
  const govde = el('div', { class: 'cekmece-govde' }, icerik);
  const kutu = el('div', { class: 'cekmece', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': baslikId, tabindex: '-1' }, [
    el('div', { class: 'cekmece-baslik' }, [
      el('h2', { id: baslikId, text: baslik }),
      el('button', { class: 'btn btn-ikon', type: 'button', 'aria-label': 'Kapat', onClick: () => katman.kapat() }, [ikon('kapat')])
    ]),
    govde,
    alt && el('div', { class: 'cekmece-alt' }, alt)
  ]);
  const arka = el('div', { class: 'cekmece-arka acik' }, [kutu]);
  katman = katmanAc(arka, kutu, { kapaninca });
  return { kutu, govde, kapat: katman.kapat };
}

/**
 * Onay penceresi. Kullanıcı onaylarsa true, vazgeçerse false döner.
 *   if (await onayIste('Bu hayvan silinsin mi?', { onayMetni: 'Sil', tehlike: true })) { ... }
 */
export function onayIste(mesaj, secenekler = {}) {
  const {
    baslik = 'Emin misiniz?', onayMetni = 'Onayla', iptalMetni = 'Vazgeç',
    tehlike = false, uyari = ''
  } = secenekler;
  return new Promise((coz) => {
    let sonuc = false;
    const icerik = [
      el('p', { text: mesaj }),
      uyari && el('div', { class: 'uyari-kutusu uyari-kutusu-uyari' }, [
        ikon('uyari'), el('div', { class: 'uyari-kutusu-metin' }, [el('p', { text: uyari })])
      ])
    ];
    const iptalBtn = el('button', { class: 'btn btn-cerceve', type: 'button', text: iptalMetni });
    const onayBtn = el('button', { class: ['btn', tehlike ? 'btn-tehlike-dolu' : 'btn-ana'], type: 'button', text: onayMetni });
    const modal = modalAc(icerik, { baslik, alt: [iptalBtn, onayBtn], kapaninca: () => coz(sonuc) });
    iptalBtn.addEventListener('click', () => modal.kapat());
    onayBtn.addEventListener('click', () => { sonuc = true; modal.kapat(); });
    onayBtn.focus();
  });
}

// -----------------------------------------------------------------------------
// Tarih ve saat
// Tarihler API'den ISO biçiminde gelir ("2026-11-20", "14:30", "2026-11-20T14:30").
// Saat dilimi kaymasını önlemek için Date.parse yerine elle ayrıştırılır.
// -----------------------------------------------------------------------------
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const AYLAR_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const GUNLER_KISA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

const iki = (n) => String(n).padStart(2, '0');

/** ISO tarihten yerel Date (gece yarısı) üretir; geçersizse null. */
export function tarihNesnesi(iso) {
  const eslesme = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!eslesme) return null;
  const [, y, a, g] = eslesme.map(Number);
  const tarih = new Date(y, a - 1, g);
  return Number.isNaN(tarih.getTime()) ? null : tarih;
}

/** Date nesnesini ISO tarihe çevirir (YYYY-MM-DD, yerel saat). */
export function isoTarih(tarih) {
  return `${tarih.getFullYear()}-${iki(tarih.getMonth() + 1)}-${iki(tarih.getDate())}`;
}

/** Bugünün ISO tarihi. */
export function bugunIso() {
  return isoTarih(new Date());
}

/** ISO tarihe gün ekler. */
export function gunEkle(iso, gun) {
  const tarih = tarihNesnesi(iso);
  if (!tarih) return null;
  tarih.setDate(tarih.getDate() + gun);
  return isoTarih(tarih);
}

/** İki ISO tarih arasındaki gün farkı (b - a). */
export function gunFarki(a, b) {
  const t1 = tarihNesnesi(a);
  const t2 = tarihNesnesi(b);
  if (!t1 || !t2) return null;
  return Math.round((t2 - t1) / 86400000);
}

/** "2026-11-20" → "20.11.2026" */
export function tarihFormatla(iso) {
  const tarih = tarihNesnesi(iso);
  if (!tarih) return '—';
  return `${iki(tarih.getDate())}.${iki(tarih.getMonth() + 1)}.${tarih.getFullYear()}`;
}

/** "14:30:00" veya "2026-11-20T14:30" → "14:30" */
export function saatFormatla(iso) {
  const eslesme = /(?:T|^)(\d{2}):(\d{2})/.exec(String(iso || ''));
  return eslesme ? `${eslesme[1]}:${eslesme[2]}` : '—';
}

/** "2026-11-20T14:30" → "20.11.2026 14:30" */
export function tarihSaatFormatla(iso) {
  const saat = saatFormatla(iso);
  return saat === '—' ? tarihFormatla(iso) : `${tarihFormatla(iso)} ${saat}`;
}

/** "2026-11-16" → "16 Kas" */
export function kisaTarih(iso) {
  const tarih = tarihNesnesi(iso);
  return tarih ? `${tarih.getDate()} ${AYLAR_KISA[tarih.getMonth()]}` : '—';
}

/** "2026-03-12" → "Mart 2026" */
export function ayYil(iso) {
  const tarih = tarihNesnesi(iso);
  return tarih ? `${AYLAR[tarih.getMonth()]} ${tarih.getFullYear()}` : '—';
}

/** Haftanın günü: "Perşembe" (kisa: "Per") */
export function gunAdi(iso, kisa = false) {
  const tarih = tarihNesnesi(iso);
  if (!tarih) return '';
  return (kisa ? GUNLER_KISA : GUNLER)[tarih.getDay()];
}

/** "Bugün", "Yarın", "Dün", bu hafta içindeyse gün adı, değilse "16 Kas" */
export function goreceliGun(iso) {
  const fark = gunFarki(bugunIso(), iso);
  if (fark === null) return '—';
  if (fark === 0) return 'Bugün';
  if (fark === 1) return 'Yarın';
  if (fark === -1) return 'Dün';
  if (fark > 1 && fark < 7) return gunAdi(iso);
  return kisaTarih(iso);
}

/** Sayıyı Türkçe biçimde yazar: 1250 → "1.250" */
export function sayiFormatla(sayi) {
  const n = Number(sayi);
  return Number.isFinite(n) ? n.toLocaleString('tr-TR') : '—';
}

// -----------------------------------------------------------------------------
// Yaş ve aşı durumu (türetilen bilgiler)
// -----------------------------------------------------------------------------

/** Doğum tarihinden bugüne tam ay sayısı; tarih yoksa null. */
export function aySayisi(dogumTarihi, bugun = bugunIso()) {
  const d = tarihNesnesi(dogumTarihi);
  const b = tarihNesnesi(bugun);
  if (!d || !b) return null;
  let ay = (b.getFullYear() - d.getFullYear()) * 12 + (b.getMonth() - d.getMonth());
  if (b.getDate() < d.getDate()) ay -= 1;
  return Math.max(0, ay);
}

/** Yaş (yıl, ondalıklı); tarih yoksa null. */
export function yasYil(dogumTarihi) {
  const ay = aySayisi(dogumTarihi);
  return ay === null ? null : ay / 12;
}

/**
 * Doğum tarihinden okunur yaş: "2 yaş", "Yaklaşık 2 yaş", "6 aylık", "Bilinmiyor"
 */
export function yasMetni(dogumTarihi, tahminiMi = false) {
  const ay = aySayisi(dogumTarihi);
  if (ay === null) return 'Bilinmiyor';
  let metin;
  if (ay < 1) metin = '1 aylıktan küçük';
  else if (ay < 12) metin = `${ay} aylık`;
  else metin = `${Math.floor(ay / 12)} yaş`;
  return tahminiMi ? `Yaklaşık ${metin}` : metin;
}

/**
 * Hızlı ekleme ekranındaki yaş seçimini yaklaşık aya çevirir (API: yaklasik_yas_ay).
 *   'bilinmiyor' → null, 'yavru' → 6, 'genc' → 24, 'yetiskin' → 60, 3 (yıl) → 36
 */
export function yasSecimindenAy(secim) {
  const yil = Object.prototype.hasOwnProperty.call(YAS_SECENEKLERI, secim) ? YAS_SECENEKLERI[secim] : Number(String(secim).replace(',', '.'));
  if (yil === null || !Number.isFinite(yil) || yil < 0 || yil > 30) return null;
  return Math.round(yil * 12);
}

/** Yaş seçeneklerinin karşılık geldiği yaklaşık yaş (yıl). */
export const YAS_SECENEKLERI = {
  bilinmiyor: null,
  yavru: 0.5,   // 0–1 yaş
  genc: 2,      // 1–3 yaş
  yetiskin: 5   // 3+ yaş
};

/**
 * Hızlı ekleme ekranındaki yaş seçimini doğum tarihine çevirir.
 *   'bilinmiyor' → null, 'yavru' → 6 ay önce, 'genc' → 2 yıl önce,
 *   'yetiskin' → 5 yıl önce, 3 veya '3' (yaklaşık 3 yaş) → 3 yıl önce
 */
export function yasSecimindenTarih(secim, bugun = bugunIso()) {
  if (secim === null || secim === undefined || secim === '' || secim === 'bilinmiyor') return null;
  let yil = Object.prototype.hasOwnProperty.call(YAS_SECENEKLERI, secim) ? YAS_SECENEKLERI[secim] : Number(String(secim).replace(',', '.'));
  if (yil === null || !Number.isFinite(yil) || yil < 0 || yil > 40) return null;
  const tarih = tarihNesnesi(bugun);
  tarih.setMonth(tarih.getMonth() - Math.round(yil * 12));
  return isoTarih(tarih);
}

/** Aşının "yaklaşıyor" sayılacağı gün sayısı (backend ile aynı). */
export const ASI_YAKLASMA_GUN = 7;

/**
 * Sonraki doz tarihine göre aşı durumu: 'zamaninda' | 'yaklasiyor' | 'gecikti' | 'tamamlandi'.
 * Backend her aşı kaydıyla 'durum' gönderir; bu fonksiyon yalnızca durum yoksa kullanılır.
 */
export function asiDurumu(sonrakiDoz, bugun = bugunIso()) {
  if (!sonrakiDoz) return 'tamamlandi';
  const fark = gunFarki(bugun, sonrakiDoz);
  if (fark === null) return 'tamamlandi';
  if (fark < 0) return 'gecikti';
  if (fark <= ASI_YAKLASMA_GUN) return 'yaklasiyor';
  return 'zamaninda';
}

/**
 * İhtiyacın karşılanma durumu: miktar, söz verilen toplam, kalan ve oran (0–100).
 * Backend toplam_soz / kalan / ilerleme_yuzde gönderir; yoksa destek listesinden hesaplanır.
 */
export function ihtiyacOranlari(ihtiyac, destekler = null) {
  const miktar = Number(ihtiyac.miktar) || 0;
  let soz = ihtiyac.toplam_soz;
  if (soz === undefined && Array.isArray(destekler)) {
    soz = destekler.filter((d) => d.durum !== 'iptal').reduce((t, d) => t + Number(d.miktar), 0);
  }
  soz = Number(soz) || 0;
  const kalan = ihtiyac.kalan !== undefined ? Math.max(0, Number(ihtiyac.kalan)) : Math.max(0, miktar - soz);
  const sozOrani = ihtiyac.ilerleme_yuzde !== undefined
    ? Math.min(100, Math.round(Number(ihtiyac.ilerleme_yuzde)))
    : (miktar > 0 ? Math.min(100, Math.round((soz / miktar) * 100)) : 0);
  return { miktar, soz, kalan, sozOrani };
}

// -----------------------------------------------------------------------------
// Etiketler (Türkçe karşılıklar) ve rozetler
// -----------------------------------------------------------------------------
const ETIKETLER = {
  durum: { barinakta: 'Yuva arıyor', tedavide: 'Tedavide', sahiplendirildi: 'Yuvasını buldu' },
  cinsiyet: { erkek: 'Erkek', disi: 'Dişi', bilinmiyor: 'Bilinmiyor' },
  kurum_tur: { barinak: 'Barınak', klinik: 'Klinik' },
  ihtiyac_tur: { mama: 'Mama', ilac: 'İlaç', malzeme: 'Malzeme', diger: 'Diğer' },
  aciliyet: { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' },
  ihtiyac_durum: { acik: 'Açık', karsilandi: 'Karşılandı' },
  destek_durum: { soz_verildi: 'Söz verildi', teslim_edildi: 'Teslim edildi', iptal: 'İptal edildi' },
  basvuru_durum: { beklemede: 'Beklemede', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi' },
  randevu_durum: { planlandi: 'Planlandı', tamamlandi: 'Teslim edildi', iptal: 'İptal edildi' },
  asi_durum: { zamaninda: 'Zamanında', tamamlandi: 'Tamamlandı', yaklasiyor: 'Yaklaşıyor', gecikti: 'Gecikti', yapilmadi: 'Henüz yapılmadı' },
  rol: { admin: 'Sistem yöneticisi', gorevli: 'Görevli', ziyaretci: 'Ziyaretçi' },
  evet_hayir: { true: 'Evet', false: 'Hayır' }
};

/** Alan değerinin Türkçe karşılığı: etiket('durum', 'barinakta') → "Yuva arıyor" */
export function etiket(alan, deger) {
  const tablo = ETIKETLER[alan];
  if (!tablo) return deger === null || deger === undefined ? '' : String(deger);
  const anahtar = String(deger);
  return Object.prototype.hasOwnProperty.call(tablo, anahtar) ? tablo[anahtar] : anahtar;
}

const ROZET_TURLERI = {
  durum: { barinakta: 'basari', tedavide: 'bilgi', sahiplendirildi: 'notr' },
  kurum_tur: { barinak: 'basari', klinik: 'bilgi' },
  aciliyet: { dusuk: 'notr', orta: 'uyari', yuksek: 'acil' },
  ihtiyac_durum: { acik: 'bilgi', karsilandi: 'basari' },
  destek_durum: { soz_verildi: 'bilgi', teslim_edildi: 'basari', iptal: 'notr' },
  basvuru_durum: { beklemede: 'uyari', onaylandi: 'basari', reddedildi: 'acil' },
  randevu_durum: { planlandi: 'bilgi', tamamlandi: 'basari', iptal: 'notr' },
  asi_durum: { zamaninda: 'basari', tamamlandi: 'basari', yaklasiyor: 'uyari', gecikti: 'acil', yapilmadi: 'notr' },
  rol: { admin: 'bilgi', gorevli: 'bilgi', ziyaretci: 'notr' }
};

/** Alan değerine uygun renkte rozet: etiketRozeti('aciliyet', 'yuksek') */
export function etiketRozeti(alan, deger, ekSinif = '') {
  const tur = ROZET_TURLERI[alan]?.[deger] || 'notr';
  return el('span', { class: ['rozet', `rozet-${tur}`, ekSinif], text: etiket(alan, deger) });
}

// -----------------------------------------------------------------------------
// Türkçe ekler
// -----------------------------------------------------------------------------
const UNLULER = 'aıoueiöüâîû';

/**
 * Özel ada belirtme hâli eki ekler: "Pamuk" → "Pamuk'u", "Paşa" → "Paşa'yı",
 * "Kömür" → "Kömür'ü", "Zeytin" → "Zeytin'i"
 */
export function belirtmeHali(ad) {
  const metin = String(ad || '').trim();
  if (!metin) return metin;
  const kucukAd = metin.toLocaleLowerCase('tr');
  let sonUnlu = 'e';
  for (let i = kucukAd.length - 1; i >= 0; i--) {
    if (UNLULER.includes(kucukAd[i])) {
      sonUnlu = kucukAd[i];
      break;
    }
  }
  const ek = { a: 'ı', ı: 'ı', â: 'ı', e: 'i', i: 'i', î: 'i', o: 'u', u: 'u', û: 'u', ö: 'ü', ü: 'ü' }[sonUnlu] || 'i';
  const unluyleBitiyor = UNLULER.includes(kucukAd[kucukAd.length - 1]);
  return `${metin}'${unluyleBitiyor ? 'y' : ''}${ek}`;
}

// -----------------------------------------------------------------------------
// Diğer
// -----------------------------------------------------------------------------

/** Ardışık çağrıları birleştirir; son çağrıdan ms sonra çalışır. */
export function debounce(fn, ms = 300) {
  let zamanlayici = null;
  return function (...args) {
    clearTimeout(zamanlayici);
    zamanlayici = setTimeout(() => fn.apply(this, args), ms);
  };
}

/** Butonu işlem süresince pasifleştirir ve dönen gösterge ekler. */
export async function butonBekle(buton, isFn) {
  const oncekiPasif = buton.disabled;
  buton.disabled = true;
  buton.setAttribute('aria-busy', 'true');
  try {
    return await isFn();
  } finally {
    buton.disabled = oncekiPasif;
    buton.removeAttribute('aria-busy');
  }
}

/**
 * "Şifreyi göster" düğmesini şifre alanına bağlar.
 *   sifreGosterBagla(document.getElementById('sifre-goster'), document.getElementById('sifre'))
 */
export function sifreGosterBagla(dugme, girdi) {
  if (!dugme || !girdi) return;
  const guncelle = (gorunur) => {
    girdi.type = gorunur ? 'text' : 'password';
    dugme.setAttribute('aria-pressed', String(gorunur));
    dugme.setAttribute('aria-label', gorunur ? 'Şifreyi gizle' : 'Şifreyi göster');
    icerikDegistir(dugme, ikon(gorunur ? 'gozKapali' : 'goz'));
  };
  guncelle(false);
  dugme.addEventListener('click', () => guncelle(girdi.type === 'password'));
}

/** Hata nesnesinden kullanıcıya gösterilecek metni çıkarır. */
export function hataMetni(hata) {
  if (hata && typeof hata.message === 'string' && hata.message) return hata.message;
  return 'Bir sorun oluştu, tekrar deneyin.';
}
