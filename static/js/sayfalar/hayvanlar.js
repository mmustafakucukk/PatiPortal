// =============================================================================
// sayfalar/hayvanlar.js – Yuva arayan hayvanlar: filtreler, arama, sayfalama.
// Filtreler URL'ye yazılır ve URL'den okunur.
// =============================================================================
import { el, icerikDegistir } from '../dom.js';
import { apiGet, sayfaliYanit } from '../api.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir } from '../layout.js';
import { yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, debounce, cekmeceAc, sayiFormatla } from '../ui.js';
import { hayvanKarti, sayfalama } from '../kartlar.js';

const SAYFA_BOYUTU = 12;
// yas_max dahildir (yas_max: 0 → 1 yaşından küçük)
const YAS_GRUPLARI = { yavru: { yas_max: 0 }, genc: { yas_min: 1, yas_max: 2 }, yetiskin: { yas_min: 3 } };
const CINSIYETLER = ['disi', 'erkek', 'bilinmiyor'];

const form = document.getElementById('filtre-formu');
const filtreKarti = document.getElementById('filtre-karti');
const liste = document.getElementById('hayvan-listesi');
const sayfalamaKabi = document.getElementById('sayfalama');
const sonucSayisi = document.getElementById('sonuc-sayisi');
const aramaKutusu = document.getElementById('arama');
const filtreAcMetni = document.getElementById('filtre-ac-metin');

let durum = urldenOku();
let istekNo = 0;
let sonToplam = null;
let cekmeceGosterButonu = null;

ustMenuyuYerlestir();
altBilgiyiYerlestir();
baslat();

// -----------------------------------------------------------------------------
// URL ↔ durum
// -----------------------------------------------------------------------------
function urldenOku() {
  const p = new URLSearchParams(window.location.search);
  const tamSayi = (ad) => (/^\d{1,9}$/.test(p.get(ad) || '') && Number(p.get(ad)) > 0 ? Number(p.get(ad)) : null);
  return {
    tur: tamSayi('tur'),
    kurum: tamSayi('kurum'),
    cinsiyet: CINSIYETLER.includes(p.get('cinsiyet')) ? p.get('cinsiyet') : '',
    yas: YAS_GRUPLARI[p.get('yas')] ? p.get('yas') : '',
    asi: p.get('asi') === '1',
    kisir: p.get('kisir') === '1',
    q: (p.get('q') || '').slice(0, 50),
    sayfa: tamSayi('sayfa') || 1
  };
}

function urlyeYaz(yeniGecmis = false) {
  const p = new URLSearchParams();
  if (durum.tur) p.set('tur', durum.tur);
  if (durum.kurum) p.set('kurum', durum.kurum);
  if (durum.cinsiyet) p.set('cinsiyet', durum.cinsiyet);
  if (durum.yas) p.set('yas', durum.yas);
  if (durum.asi) p.set('asi', '1');
  if (durum.kisir) p.set('kisir', '1');
  if (durum.q) p.set('q', durum.q);
  if (durum.sayfa > 1) p.set('sayfa', durum.sayfa);
  const adres = `${window.location.pathname}${p.toString() ? `?${p}` : ''}`;
  if (adres === window.location.pathname + window.location.search) return;
  window.history[yeniGecmis ? 'pushState' : 'replaceState'](null, '', adres);
}

function apiParametreleri() {
  return {
    tur_id: durum.tur,
    kurum_id: durum.kurum,
    cinsiyet: durum.cinsiyet,
    ...(YAS_GRUPLARI[durum.yas] || {}),
    asilar_tam: durum.asi ? 'true' : null,
    kisir: durum.kisir ? 'true' : null,
    arama: durum.q,
    sayfa: durum.sayfa,
    limit: SAYFA_BOYUTU
  };
}

function aktifFiltreSayisi() {
  return [durum.tur, durum.kurum, durum.cinsiyet, durum.yas, durum.asi, durum.kisir].filter(Boolean).length;
}

// -----------------------------------------------------------------------------
// Form ↔ durum
// -----------------------------------------------------------------------------
function formuDoldur() {
  form.querySelectorAll('input[name="tur"]').forEach((g) => { g.checked = g.value === String(durum.tur || ''); });
  form.querySelectorAll('input[name="cinsiyet"]').forEach((g) => { g.checked = g.value === durum.cinsiyet; });
  form.querySelectorAll('input[name="yas"]').forEach((g) => { g.checked = g.value === durum.yas; });
  form.elements.asi.checked = durum.asi;
  form.elements.kisir.checked = durum.kisir;
  form.elements.kurum.value = durum.kurum ? String(durum.kurum) : '';
  aramaKutusu.value = durum.q;
  filtreButonunuGuncelle();
}

function formdanOku() {
  const secili = form.querySelector('input[name="tur"]:checked');
  durum.tur = secili && secili.value ? Number(secili.value) : null;
  durum.cinsiyet = form.querySelector('input[name="cinsiyet"]:checked')?.value || '';
  durum.yas = form.querySelector('input[name="yas"]:checked')?.value || '';
  durum.asi = form.elements.asi.checked;
  durum.kisir = form.elements.kisir.checked;
  durum.kurum = form.elements.kurum.value ? Number(form.elements.kurum.value) : null;
}

function filtreButonunuGuncelle() {
  const sayi = aktifFiltreSayisi();
  filtreAcMetni.textContent = sayi ? `Filtreler (${sayi})` : 'Filtreler';
}

// -----------------------------------------------------------------------------
// Başlatma
// -----------------------------------------------------------------------------
async function baslat() {
  await secenekleriYukle();
  formuDoldur();

  form.addEventListener('change', () => {
    formdanOku();
    durum.sayfa = 1;
    filtreButonunuGuncelle();
    urlyeYaz();
    listele();
  });
  form.addEventListener('submit', (olay) => olay.preventDefault());

  aramaKutusu.addEventListener('input', debounce(() => {
    durum.q = aramaKutusu.value.trim().slice(0, 50);
    durum.sayfa = 1;
    urlyeYaz();
    listele();
  }, 300));

  document.getElementById('filtre-temizle').addEventListener('click', filtreleriTemizle);
  document.getElementById('filtre-ac').addEventListener('click', filtreCekmecesiniAc);

  window.addEventListener('popstate', () => {
    durum = urldenOku();
    formuDoldur();
    listele();
  });

  listele();
}

/** Tür ve kurum seçenekleri API'den gelir; yüklenemezse liste yine çalışır. */
async function secenekleriYukle() {
  const [turler, kurumlar] = await Promise.all([
    apiGet('/api/hayvan-turleri').catch(() => []),
    apiGet('/api/institutions').catch(() => [])
  ]);

  const turKabi = document.getElementById('tur-secim');
  turKabi.append(...turler.map((t) => el('label', {}, [
    el('input', { type: 'radio', name: 'tur', value: t.id }),
    el('span', { text: t.ad })
  ])));
  if (durum.tur && !turler.some((t) => t.id === durum.tur)) durum.tur = null;

  form.elements.kurum.append(...kurumlar.map((k) => el('option', { value: k.id, text: k.ad })));
  if (durum.kurum && !kurumlar.some((k) => k.id === durum.kurum)) durum.kurum = null;
}

function filtreleriTemizle() {
  durum = { ...durum, tur: null, kurum: null, cinsiyet: '', yas: '', asi: false, kisir: false, q: '', sayfa: 1 };
  formuDoldur();
  urlyeYaz();
  listele();
}

/** Mobilde filtre formu çekmeceye taşınır, kapanınca yerine döner. */
function filtreCekmecesiniAc() {
  const temizle = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Temizle', onClick: filtreleriTemizle });
  cekmeceGosterButonu = el('button', { class: 'btn btn-ana', type: 'button', text: gosterMetni() });
  const cekmece = cekmeceAc(form, {
    baslik: 'Filtreler',
    alt: [temizle, cekmeceGosterButonu],
    kapaninca: () => {
      filtreKarti.appendChild(form);
      cekmeceGosterButonu = null;
    }
  });
  cekmeceGosterButonu.addEventListener('click', cekmece.kapat);
}

function gosterMetni() {
  return sonToplam === null ? 'Sonuçları göster' : `${sayiFormatla(sonToplam)} hayvanı göster`;
}

// -----------------------------------------------------------------------------
// Listeleme
// -----------------------------------------------------------------------------
async function listele() {
  const no = ++istekNo;
  yukleniyorGoster(liste, 6);
  icerikDegistir(sayfalamaKabi, []);
  liste.setAttribute('aria-busy', 'true');
  try {
    // Görevli giriş yapmışsa backend tüm durumları döner; bu sayfa yalnızca yuva arayanları gösterir
    const sonuc = sayfaliYanit(await apiGet('/api/animals', { ...apiParametreleri(), durum: 'barinakta' }));
    if (no !== istekNo) return; // daha yeni bir istek var

    // İstenen sayfa son sayfadan büyükse sunucu son sayfayı döner
    if (sonuc.sayfa !== durum.sayfa) {
      durum.sayfa = sonuc.sayfa;
      urlyeYaz();
    }
    sonToplam = sonuc.toplam;
    sonucSayisi.textContent = `${sayiFormatla(sonuc.toplam)} hayvan listeleniyor`;
    if (cekmeceGosterButonu) cekmeceGosterButonu.textContent = gosterMetni();

    if (!sonuc.kayitlar.length) {
      const filtreVar = aktifFiltreSayisi() > 0 || durum.q;
      bosDurumGoster(liste, filtreVar
        ? { baslik: 'Bu filtrelere uyan hayvan yok', aciklama: 'Filtreleri temizleyerek tüm yuva arayan dostları görebilirsin.' }
        : { baslik: 'Şu an yuva arayan hayvan yok', aciklama: 'Yeni dostlar eklendiğinde burada görünecek.' },
      filtreVar ? { metin: 'Filtreleri temizle', tikla: filtreleriTemizle } : null);
      liste.firstElementChild.style.gridColumn = '1 / -1';
      return;
    }

    icerikDegistir(liste, sonuc.kayitlar.map((h) => hayvanKarti(h)));
    icerikDegistir(sayfalamaKabi, sayfalama(sonuc.sayfa, sonuc.sayfa_sayisi, (yeniSayfa) => {
      durum.sayfa = yeniSayfa;
      urlyeYaz(true);
      listele();
      document.querySelector('.sayfa-baslik').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  } catch (hata) {
    if (no !== istekNo) return;
    sonucSayisi.textContent = 'Hayvanlar yüklenemedi';
    hataGoster(liste, hataMetni(hata), listele);
    liste.firstElementChild.style.gridColumn = '1 / -1';
  } finally {
    if (no === istekNo) liste.removeAttribute('aria-busy');
  }
}
