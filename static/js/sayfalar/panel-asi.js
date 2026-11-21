// =============================================================================
// sayfalar/panel-asi.js – Aşı girişi
// Hayvan seçimi (yazdıkça öneri), türün zorunlu aşılarının durumu, aşı türü
// (zorunlular üstte), yapılma tarihi (gelecek seçilemez), sonraki doz (elle),
// uygulayan kurum, belge (PDF/fotoğraf), not.
// Kayıt iki adımlıdır: önce aşı (JSON), belge varsa ardından belge yüklemesi.
// ?hayvan=&asi= ile gelinirse form dolu açılır.
// =============================================================================
import { el, ikon, icerikDegistir, sayiParametresi } from '../dom.js';
import { apiGet, apiPost, apiUpload, ApiHatasi, sayfaliYanit } from '../api.js';
import { gorevliGerekli } from '../auth.js';
import { aktifKurum, KURUM_DEGISTI_OLAYI } from '../kurum.js';
import { panelUstCubugunuYerlestir, panelMenusunuYerlestir } from '../layout.js';
import {
  hataGoster, hataMetni, toast, formHatalariniGoster, formHatalariniTemizle, butonBekle,
  etiket, etiketRozeti, bugunIso, gunFarki, tarihFormatla
} from '../ui.js';
import { FOTOGRAF_YOK_KUCUK, hayvanBilgiMetni, kapakUrl, turAdi } from '../kartlar.js';
import { fotografKucult } from '../fotograf.js';

const EN_FAZLA_ONERI = 8;
const BELGE_EN_FAZLA_MB = 10;
const BELGE_TURLERI = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

const form = document.getElementById('asi-formu');
const aramaAlani = document.getElementById('hayvan-arama-alani');
const arama = document.getElementById('hayvan-ara');
const oneriler = document.getElementById('hayvan-onerileri');
const secilenKabi = document.getElementById('secilen-hayvan');
const zorunluKabi = document.getElementById('zorunlu-asilar');
const asiSecimi = form.elements.asi_turu_id;
const uygulama = form.elements.uygulama_tarihi;
const sonraki = form.elements.sonraki_tarih;
const sonucKabi = document.getElementById('sonuc');

let kurum = null;
let hayvanlar = [];
let asiTurleri = [];      // seçili hayvanın türüne göre { id, ad, zorunlu }
let karne = null;         // seçili hayvanın aşı karnesi
let secilen = null;
let belgeDosyasi = null;
let etkinOneri = -1;
let gorunenOneriler = [];

baslat();

async function baslat() {
  const kullanici = await gorevliGerekli().catch((hata) => {
    hataGoster(document.getElementById('icerik'), hataMetni(hata), () => window.location.reload());
    return null;
  });
  if (!kullanici) return;
  await panelUstCubugunuYerlestir({ baslik: 'Aşı gir', geri: '/panel/index.html' });
  panelMenusunuYerlestir('asi');
  kurum = await aktifKurum();
  if (!kurum) return;

  uygulama.max = bugunIso();
  uygulama.value = bugunIso();
  olaylariBagla();

  try {
    const [turler, kurumlar] = await Promise.all([
      apiGet('/api/vaccinations/turler'),
      apiGet('/api/institutions')
    ]);
    asiTurleri = turler.map((t) => ({ ...t, zorunlu: false }));
    // Klinikler üstte
    const sirali = [...kurumlar].sort((a, b) => (a.tur === b.tur ? a.ad.localeCompare(b.ad, 'tr') : a.tur === 'klinik' ? -1 : 1));
    form.elements.uygulayan_kurum_id.append(...sirali.map((k) => el('option', { value: k.id, text: `${k.ad} (${etiket('kurum_tur', k.tur)})` })));
  } catch (hata) {
    toast(`Aşı türleri yüklenemedi: ${hataMetni(hata)}`, 'hata');
  }
  kurumVarsayilani();
  asiSecenekleriniCiz();
  await hayvanlariYukle();

  // URL'den hazır seçim
  const istenenHayvan = sayiParametresi('hayvan');
  const istenenAsi = sayiParametresi('asi');
  if (istenenHayvan) {
    const h = hayvanlar.find((x) => x.id === istenenHayvan);
    if (h) {
      await hayvanSec(h);
      if (istenenAsi && asiTurleri.some((t) => t.id === istenenAsi)) asiSecimi.value = String(istenenAsi);
    } else {
      toast('İstenen hayvan bu kurumda bulunamadı.', 'uyari');
    }
  }

  window.addEventListener(KURUM_DEGISTI_OLAYI, async (olay) => {
    kurum = olay.detail;
    secimiKaldir();
    kurumVarsayilani();
    await hayvanlariYukle();
  });
}

function kurumVarsayilani() {
  // Aktif kurum klinikse uygulayan kurum varsayılan olarak odur
  const secim = form.elements.uygulayan_kurum_id;
  secim.value = kurum.tur === 'klinik' && secim.querySelector(`option[value="${kurum.kurum_id}"]`) ? String(kurum.kurum_id) : '';
}

/** Kurumun tüm hayvanları (API sayfa başına en fazla 50 döner; sayfalar sırayla okunur). */
async function hayvanlariYukle() {
  arama.disabled = true;
  arama.placeholder = 'Hayvanlar yükleniyor…';
  try {
    const tumu = [];
    let sayfa = 1;
    let sayfaSayisi = 1;
    do {
      const sonuc = sayfaliYanit(await apiGet('/api/animals', { kurum_id: kurum.kurum_id, sayfa, limit: 50 }));
      tumu.push(...sonuc.kayitlar);
      sayfaSayisi = sonuc.sayfa_sayisi;
      sayfa += 1;
    } while (sayfa <= sayfaSayisi && sayfa <= 20);
    // Yuvasını bulanlar sona
    hayvanlar = tumu.sort((a, b) => ((a.durum === 'sahiplendirildi') - (b.durum === 'sahiplendirildi')) || a.ad.localeCompare(b.ad, 'tr'));
    arama.placeholder = hayvanlar.length ? 'Adını yazmaya başla…' : 'Bu kurumda hayvan yok';
  } catch (hata) {
    hayvanlar = [];
    arama.placeholder = 'Hayvanlar yüklenemedi';
    toast(hataMetni(hata), 'hata');
  } finally {
    arama.disabled = hayvanlar.length === 0;
  }
}

// -----------------------------------------------------------------------------
// Hayvan seçici (combobox)
// -----------------------------------------------------------------------------
function olaylariBagla() {
  arama.addEventListener('input', () => onerileriGoster());
  arama.addEventListener('focus', () => onerileriGoster());
  arama.addEventListener('blur', () => setTimeout(onerileriKapat, 150));
  arama.addEventListener('keydown', (olay) => {
    if (oneriler.hidden && olay.key === 'ArrowDown') {
      onerileriGoster();
      return;
    }
    if (olay.key === 'ArrowDown' || olay.key === 'ArrowUp') {
      olay.preventDefault();
      if (!gorunenOneriler.length) return;
      etkinOneri = (etkinOneri + (olay.key === 'ArrowDown' ? 1 : -1) + gorunenOneriler.length) % gorunenOneriler.length;
      etkinOneriyiIsaretle();
    } else if (olay.key === 'Enter') {
      olay.preventDefault();
      const h = gorunenOneriler[etkinOneri >= 0 ? etkinOneri : 0];
      if (h && !oneriler.hidden) hayvanSec(h);
    } else if (olay.key === 'Escape') {
      onerileriKapat();
    }
  });

  form.elements.belge.addEventListener('change', belgeSecildi);
  form.addEventListener('submit', kaydet);
}

function onerileriGoster() {
  const aranan = arama.value.trim().toLocaleLowerCase('tr');
  gorunenOneriler = hayvanlar
    .filter((h) => !aranan || h.ad.toLocaleLowerCase('tr').includes(aranan) || (h.cins || '').toLocaleLowerCase('tr').includes(aranan))
    .slice(0, EN_FAZLA_ONERI);
  etkinOneri = gorunenOneriler.length ? 0 : -1;
  if (!gorunenOneriler.length) {
    icerikDegistir(oneriler, el('li', { class: 'oneri-bos', role: 'option', 'aria-disabled': 'true', text: aranan ? 'Bu adla hayvan bulunamadı.' : 'Bu kurumda hayvan yok.' }));
  } else {
    icerikDegistir(oneriler, gorunenOneriler.map((h, i) => {
      const li = el('li', { id: `hayvan-oneri-${h.id}`, role: 'option', 'aria-selected': i === etkinOneri ? 'true' : 'false' }, [
        el('img', { class: 'kucuk-foto', src: kapakUrl(h) || FOTOGRAF_YOK_KUCUK, alt: '' }),
        el('span', { class: 'liste-satiri-metin' }, [
          el('span', { class: 'liste-satiri-baslik', style: { fontSize: '16px' }, text: h.ad }),
          el('span', { class: 'liste-satiri-alt', text: [hayvanBilgiMetni(h, { kisir: false }), etiket('durum', h.durum)].filter(Boolean).join(' · ') })
        ])
      ]);
      li.addEventListener('mousedown', (olay) => {
        olay.preventDefault(); // seçimden önce input'un blur olmasını engelle
        hayvanSec(h);
      });
      return li;
    }));
  }
  oneriler.hidden = false;
  arama.setAttribute('aria-expanded', 'true');
  etkinOneriyiIsaretle();
}

function etkinOneriyiIsaretle() {
  oneriler.querySelectorAll('[role="option"]').forEach((li, i) => li.setAttribute('aria-selected', i === etkinOneri ? 'true' : 'false'));
  const etkin = gorunenOneriler[etkinOneri];
  if (etkin) {
    arama.setAttribute('aria-activedescendant', `hayvan-oneri-${etkin.id}`);
    document.getElementById(`hayvan-oneri-${etkin.id}`)?.scrollIntoView({ block: 'nearest' });
  } else {
    arama.removeAttribute('aria-activedescendant');
  }
}

function onerileriKapat() {
  oneriler.hidden = true;
  arama.setAttribute('aria-expanded', 'false');
  arama.removeAttribute('aria-activedescendant');
}

async function hayvanSec(h) {
  onerileriKapat();
  secilen = h;
  form.elements.hayvan_id.value = h.id;
  aramaAlani.hidden = true;
  formHatalariniTemizle(form);

  const degistir = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Değiştir' });
  degistir.addEventListener('click', () => {
    secimiKaldir();
    arama.focus();
  });
  icerikDegistir(secilenKabi, el('div', { class: 'secilen-hayvan' }, [
    el('div', { class: 'ozet-hayvan' }, [
      el('img', { src: kapakUrl(h) || FOTOGRAF_YOK_KUCUK, alt: '', width: '64', height: '64' }),
      el('div', { class: 'ozet-hayvan-metin' }, [
        el('span', { class: 'ozet-hayvan-ad', text: h.ad }),
        el('span', { class: 'ozet-hayvan-alt', text: [hayvanBilgiMetni(h, { kisir: false }), etiket('durum', h.durum)].filter(Boolean).join(' · ') })
      ])
    ]),
    degistir
  ]));
  secilenKabi.hidden = false;

  const adres = new URL(window.location.href);
  adres.searchParams.set('hayvan', h.id);
  adres.searchParams.delete('asi');
  window.history.replaceState(null, '', adres);

  await hayvanAsiBilgisiniYukle();
}

function secimiKaldir() {
  secilen = null;
  karne = null;
  asiTurleri = asiTurleri.map((t) => ({ ...t, zorunlu: false }));
  form.elements.hayvan_id.value = '';
  arama.value = '';
  aramaAlani.hidden = false;
  secilenKabi.hidden = true;
  zorunluKabi.hidden = true;
  icerikDegistir(secilenKabi, []);
  asiSecenekleriniCiz();
  window.history.replaceState(null, '', window.location.pathname);
}

async function hayvanAsiBilgisiniYukle() {
  zorunluKabi.hidden = false;
  icerikDegistir(zorunluKabi, [el('div', { class: 'iskelet iskelet-metin' }), el('div', { class: 'iskelet iskelet-metin iskelet-metin-kisa' })]);
  const h = secilen;
  try {
    const [turler, k] = await Promise.all([
      apiGet('/api/vaccinations/turler', { hayvan_turu_id: h.tur?.id }),
      apiGet(`/api/animals/${h.id}/vaccinations`)
    ]);
    if (secilen !== h) return; // bu sırada başka hayvan seçildi
    asiTurleri = turler;
    karne = k;
    zorunluListesiniCiz();
    const oncekiSecim = asiSecimi.value;
    asiSecenekleriniCiz();
    asiSecimi.value = oncekiSecim;
  } catch (hata) {
    hataGoster(zorunluKabi, hataMetni(hata), hayvanAsiBilgisiniYukle);
  }
}

/** Karnede her aşı türünün en son kaydı. */
function sonKayitlar() {
  const son = new Map();
  for (const a of karne?.asilar || []) {
    const onceki = son.get(a.asi_turu.id);
    if (!onceki || a.uygulama_tarihi > onceki.uygulama_tarihi || (a.uygulama_tarihi === onceki.uygulama_tarihi && a.id > onceki.id)) {
      son.set(a.asi_turu.id, a);
    }
  }
  return son;
}

function zorunluListesiniCiz() {
  const zorunlular = asiTurleri.filter((t) => t.zorunlu);
  const tur = turAdi(secilen) || 'Bu tür';
  if (!zorunlular.length) {
    icerikDegistir(zorunluKabi, el('p', { class: 'form-yardim', text: `${tur} için tanımlı zorunlu aşı yok.` }));
    return;
  }
  const son = sonKayitlar();
  const bugun = bugunIso();
  icerikDegistir(zorunluKabi, [
    el('h3', { class: 'alt-baslik', style: { marginTop: 0 }, text: `${tur} için zorunlu aşılar` }),
    el('ul', { class: 'asi-durum-listesi' }, zorunlular.map((t) => {
      const kayit = son.get(t.id);
      let rozet;
      let alt;
      if (!kayit) {
        rozet = el('span', { class: 'rozet rozet-acil', text: 'Eksik' });
        alt = 'Hiç yapılmamış';
      } else {
        rozet = etiketRozeti('asi_durum', kayit.durum);
        const fark = kayit.sonraki_tarih ? gunFarki(bugun, kayit.sonraki_tarih) : null;
        const ek = (kayit.durum === 'yaklasiyor' || kayit.durum === 'gecikti') && fark !== null
          ? ` (${fark < 0 ? `${-fark} gün gecikti` : fark === 0 ? 'bugün' : `${fark} gün kaldı`})`
          : '';
        alt = `Son: ${tarihFormatla(kayit.uygulama_tarihi)}` + (kayit.sonraki_tarih ? ` · Sonraki: ${tarihFormatla(kayit.sonraki_tarih)}${ek}` : '');
      }
      const sec = el('button', { class: 'btn btn-cerceve-ana', type: 'button' }, ['Seç', el('span', { class: 'gizli-erisim', text: `: ${t.ad}` })]);
      sec.addEventListener('click', () => {
        asiSecimi.value = String(t.id);
        asiSecimi.focus();
      });
      return el('li', {}, [
        el('span', {}, [el('strong', { text: t.ad }), el('small', { text: alt })]),
        el('span', { class: 'satir', style: { flexWrap: 'nowrap' } }, [rozet, sec])
      ]);
    }))
  ]);
}

// -----------------------------------------------------------------------------
// Aşı türü seçenekleri (zorunlular üstte)
// -----------------------------------------------------------------------------
function asiSecenekleriniCiz() {
  const zorunlular = asiTurleri.filter((t) => t.zorunlu);
  const digerleri = asiTurleri.filter((t) => !t.zorunlu);
  const secenek = (t) => el('option', { value: t.id, text: t.ad });
  icerikDegistir(asiSecimi, [
    el('option', { value: '', text: 'Aşı türü seçin' }),
    zorunlular.length > 0 && el('optgroup', { label: `${turAdi(secilen) || 'Tür'} için zorunlu` }, zorunlular.map(secenek)),
    zorunlular.length > 0
      ? el('optgroup', { label: 'Diğer aşılar' }, digerleri.map(secenek))
      : digerleri.map(secenek)
  ]);
}

// -----------------------------------------------------------------------------
// Belge
// -----------------------------------------------------------------------------
async function belgeSecildi() {
  const dosya = form.elements.belge.files?.[0];
  const kap = document.getElementById('secilen-belge');
  if (!dosya) return;
  if (!BELGE_TURLERI.includes(dosya.type)) {
    form.elements.belge.value = '';
    formHatalariniGoster(form, { belge: 'Belge PDF, JPG, PNG veya WEBP olmalı.' });
    return;
  }
  if (dosya.size > BELGE_EN_FAZLA_MB * 1024 * 1024) {
    form.elements.belge.value = '';
    formHatalariniGoster(form, { belge: `Belge en fazla ${BELGE_EN_FAZLA_MB} MB olabilir.` });
    return;
  }
  try {
    belgeDosyasi = dosya.type.startsWith('image/') ? await fotografKucult(dosya) : dosya;
  } catch {
    belgeDosyasi = dosya;
  }
  const kaldir = el('button', { class: 'btn btn-ikon btn-sade', type: 'button', 'aria-label': 'Belgeyi kaldır' }, [ikon('kapat')]);
  kaldir.addEventListener('click', belgeyiKaldir);
  icerikDegistir(kap, [ikon('belge'), el('span', { text: `${dosya.name} (${Math.max(1, Math.round(belgeDosyasi.size / 1024))} KB)` }), kaldir]);
  kap.hidden = false;
}

function belgeyiKaldir() {
  belgeDosyasi = null;
  form.elements.belge.value = '';
  const kap = document.getElementById('secilen-belge');
  kap.hidden = true;
  icerikDegistir(kap, []);
}

async function belgeyiYukle(asiId, dosya) {
  const veri = new FormData();
  veri.append('belge', dosya, dosya.name);
  try {
    await apiUpload(`/api/vaccinations/${asiId}/belge`, veri);
    return null;
  } catch (hata) {
    return hataMetni(hata);
  }
}

// -----------------------------------------------------------------------------
// Kayıt
// -----------------------------------------------------------------------------
async function kaydet(olay) {
  olay.preventDefault();
  formHatalariniTemizle(form);
  const hatalar = {};
  if (!secilen) hatalar.hayvan_ara = 'Önce hayvanı seç.';
  if (!asiSecimi.value) hatalar.asi_turu_id = 'Aşı türünü seç.';
  if (!uygulama.value) hatalar.uygulama_tarihi = 'Yapılma tarihini gir.';
  else if (uygulama.value > bugunIso()) hatalar.uygulama_tarihi = 'Yapılma tarihi gelecekte olamaz.';
  if (sonraki.value && uygulama.value && sonraki.value <= uygulama.value) hatalar.sonraki_tarih = 'Sonraki doz, yapılma tarihinden sonra olmalı.';
  if (Object.keys(hatalar).length) {
    formHatalariniGoster(form, hatalar);
    return;
  }

  const govde = {
    asi_turu_id: Number(asiSecimi.value),
    uygulama_tarihi: uygulama.value,
    sonraki_tarih: sonraki.value || null,
    uygulayan_kurum_id: form.elements.uygulayan_kurum_id.value ? Number(form.elements.uygulayan_kurum_id.value) : null,
    aciklama: form.elements.aciklama.value.trim() || null
  };
  const belge = belgeDosyasi;

  await butonBekle(form.querySelector('[type="submit"]'), async () => {
    let asi;
    try {
      asi = await apiPost(`/api/animals/${secilen.id}/vaccinations`, govde);
    } catch (hata) {
      if (hata instanceof ApiHatasi && hata.durum === 400) formHatalariniGoster(form, hata.alanlar, Object.keys(hata.alanlar).length ? '' : hata.message);
      else formHatalariniGoster(form, {}, hataMetni(hata));
      return;
    }
    // Aşı kaydedildi; belge ayrı istekle yüklenir. Belge yüklenemezse aşı kaydı korunur.
    const belgeHatasi = belge ? await belgeyiYukle(asi.id, belge) : null;
    basariGoster(asi, belge, belgeHatasi);
    // Aynı hayvan seçili kalır; aşı alanları sıfırlanır
    asiSecimi.value = '';
    uygulama.value = bugunIso();
    sonraki.value = '';
    form.elements.aciklama.value = '';
    belgeyiKaldir();
    await hayvanAsiBilgisiniYukle();
  });
}

function basariGoster(asi, belge, belgeHatasi) {
  const h = secilen;
  const baskaHayvan = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Başka hayvan seç' });
  baskaHayvan.addEventListener('click', () => {
    icerikDegistir(sonucKabi, []);
    secimiKaldir();
    arama.focus();
  });

  let belgeParcasi = null;
  if (belge && belgeHatasi) {
    const tekrar = el('button', { class: 'btn btn-ana', type: 'button' }, [ikon('yenile'), 'Belgeyi tekrar yükle']);
    tekrar.addEventListener('click', () => butonBekle(tekrar, async () => {
      const yeniHata = await belgeyiYukle(asi.id, belge);
      if (yeniHata) {
        toast(`Belge yine yüklenemedi: ${yeniHata}`, 'hata');
      } else {
        toast('Belge yüklendi.', 'basari');
        tekrar.closest('.uyari-kutusu')?.remove();
        if (secilen === h) hayvanAsiBilgisiniYukle();
      }
    }));
    belgeParcasi = el('div', { class: 'uyari-kutusu uyari-kutusu-uyari', role: 'alert' }, [
      ikon('uyari'),
      el('div', { class: 'uyari-kutusu-metin yigin', style: { gap: '8px' } }, [
        el('strong', { text: 'Aşı kaydedildi ama belge yüklenemedi' }),
        el('p', { text: belgeHatasi }),
        tekrar
      ])
    ]);
  }

  icerikDegistir(sonucKabi, el('div', { class: 'yigin', style: { gap: '12px', marginBottom: '16px' } }, [
    el('div', { class: 'uyari-kutusu uyari-kutusu-basari', tabindex: '-1', id: 'asi-sonuc' }, [
      ikon('onay'),
      el('div', { class: 'uyari-kutusu-metin yigin', style: { gap: '8px' } }, [
        el('strong', { text: `${asi.asi_turu?.ad || 'Aşı'} – ${h.ad} için kaydedildi` }),
        el('p', { text: `Yapılma: ${tarihFormatla(asi.uygulama_tarihi)}${asi.sonraki_tarih ? ` · Sonraki doz: ${tarihFormatla(asi.sonraki_tarih)}` : ''}${belge && !belgeHatasi ? ' · Belge eklendi' : ''}` }),
        el('div', { class: 'satir' }, [
          baskaHayvan,
          el('a', { class: 'btn btn-cerceve', href: `/hayvan.html?id=${h.id}#asi-karnesi` }, 'Karneyi gör')
        ])
      ])
    ]),
    belgeParcasi
  ]));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('asi-sonuc').focus({ preventScroll: true });
}
