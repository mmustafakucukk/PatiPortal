// =============================================================================
// sayfalar/panel-hayvanlar.js – Kurumun hayvanları (mobilde kart, geniş ekranda tablo)
// Arama, tür ve durum filtresi; durum değiştirme, düzenleme, silme
// "Yuvasını buldu" elle seçilemez, başvuru onayıyla oluşur.
// =============================================================================
import { el, ikon, icerikDegistir, secimParametresi, sayiParametresi } from '../dom.js';
import { apiGet, apiPatch, apiDelete, ApiHatasi, sayfaliYanit, hayvanTurleriniGetir } from '../api.js';
import { gorevliGerekli } from '../auth.js';
import { aktifKurum, KURUM_DEGISTI_OLAYI } from '../kurum.js';
import { panelUstCubugunuYerlestir, panelMenusunuYerlestir } from '../layout.js';
import {
  yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, toast, onayIste, debounce,
  etiket, etiketRozeti, sayiFormatla
} from '../ui.js';
import { FOTOGRAF_YOK_KUCUK, hayvanBilgiMetni, asiRozeti, sayfalama, kapakUrl } from '../kartlar.js';

const SAYFA_BOYUTU = 20;
const TUM_DURUMLAR = ['barinakta', 'tedavide', 'sahiplendirildi'];
const ELLE_SECILEBILIR = ['barinakta', 'tedavide'];

const form = document.getElementById('filtre');
const liste = document.getElementById('hayvan-listesi');
const sayfalamaKabi = document.getElementById('sayfalama');
const sonucSayisi = document.getElementById('sonuc-sayisi');

const p = new URLSearchParams(window.location.search);
const durum = {
  q: (p.get('q') || '').slice(0, 50),
  tur: sayiParametresi('tur'),
  durum: secimParametresi('durum', TUM_DURUMLAR, ''),
  sayfa: sayiParametresi('sayfa') || 1
};
let kurum = null;
let istekNo = 0;
let bekleyenler = new Map(); // hayvan_id → bekleyen başvuru sayısı

baslat();

async function baslat() {
  const kullanici = await gorevliGerekli().catch((hata) => {
    hataGoster(document.getElementById('icerik'), hataMetni(hata), () => window.location.reload());
    return null;
  });
  if (!kullanici) return;
  await panelUstCubugunuYerlestir({
    baslik: 'Hayvanlar',
    ek: el('a', { class: 'btn btn-ana', href: '/panel/hayvan-ekle.html' }, [ikon('arti'), 'Ekle'])
  });
  panelMenusunuYerlestir('hayvanlar');
  kurum = await aktifKurum();
  if (!kurum) return;
  window.addEventListener(KURUM_DEGISTI_OLAYI, (olay) => {
    kurum = olay.detail;
    durum.sayfa = 1;
    urlyeYaz();
    listele();
  });

  try {
    const turler = await hayvanTurleriniGetir();
    form.elements.tur.append(...turler.map((t) => el('option', { value: t.id, text: t.ad })));
    if (durum.tur && !turler.some((t) => t.id === durum.tur)) durum.tur = null;
  } catch { /* tür filtresi olmadan devam */ }

  form.elements.q.value = durum.q;
  form.elements.tur.value = durum.tur ? String(durum.tur) : '';
  form.elements.durum.value = durum.durum;

  form.addEventListener('submit', (olay) => olay.preventDefault());
  form.addEventListener('change', (olay) => {
    if (olay.target.name === 'q') return;
    durum.tur = form.elements.tur.value ? Number(form.elements.tur.value) : null;
    durum.durum = form.elements.durum.value;
    durum.sayfa = 1;
    urlyeYaz();
    listele();
  });
  form.elements.q.addEventListener('input', debounce(() => {
    durum.q = form.elements.q.value.trim().slice(0, 50);
    durum.sayfa = 1;
    urlyeYaz();
    listele();
  }, 300));

  listele();
}

function urlyeYaz() {
  const yeni = new URLSearchParams();
  if (durum.q) yeni.set('q', durum.q);
  if (durum.tur) yeni.set('tur', durum.tur);
  if (durum.durum) yeni.set('durum', durum.durum);
  if (durum.sayfa > 1) yeni.set('sayfa', durum.sayfa);
  window.history.replaceState(null, '', `${window.location.pathname}${yeni.toString() ? `?${yeni}` : ''}`);
}

async function listele() {
  const no = ++istekNo;
  yukleniyorGoster(liste, 4, 'liste');
  icerikDegistir(sayfalamaKabi, []);
  try {
    // Görevli için durum boşsa tüm durumlar gelir
    const [ham, basvurular] = await Promise.all([
      apiGet('/api/animals', {
        kurum_id: kurum.kurum_id,
        durum: durum.durum,
        tur_id: durum.tur,
        arama: durum.q,
        sayfa: durum.sayfa,
        limit: SAYFA_BOYUTU
      }),
      apiGet('/api/applications', { durum: 'beklemede', kurum_id: kurum.kurum_id }).catch(() => [])
    ]);
    if (no !== istekNo) return;
    const sonuc = sayfaliYanit(ham);
    bekleyenler = new Map();
    for (const b of basvurular) bekleyenler.set(b.hayvan_id, (bekleyenler.get(b.hayvan_id) || 0) + 1);
    sonucSayisi.textContent = `${kurum.ad} · ${sayiFormatla(sonuc.toplam)} hayvan`;
    if (!sonuc.kayitlar.length) {
      const filtreVar = durum.q || durum.tur || durum.durum;
      bosDurumGoster(liste, filtreVar
        ? { baslik: 'Bu filtrelere uyan hayvan yok', aciklama: 'Aramayı veya filtreleri değiştir.' }
        : { baslik: 'Bu kurumda henüz hayvan yok', aciklama: 'İlk hayvanı 30 saniyede ekleyebilirsin.' },
      filtreVar ? { metin: 'Filtreleri temizle', tikla: temizle } : { metin: 'Hayvan ekle', href: '/panel/hayvan-ekle.html' });
      return;
    }
    icerikDegistir(liste, tablo(sonuc.kayitlar));
    icerikDegistir(sayfalamaKabi, sayfalama(sonuc.sayfa, sonuc.sayfa_sayisi, (yeni) => {
      durum.sayfa = yeni;
      urlyeYaz();
      listele();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
  } catch (hata) {
    if (no !== istekNo) return;
    sonucSayisi.textContent = '';
    hataGoster(liste, hataMetni(hata), listele);
  }
}

function temizle() {
  durum.q = '';
  durum.tur = null;
  durum.durum = '';
  durum.sayfa = 1;
  form.reset();
  urlyeYaz();
  listele();
}

// -----------------------------------------------------------------------------
function tablo(hayvanlar) {
  return el('div', { class: 'tablo-kap' }, [
    el('table', { class: 'tablo' }, [
      el('caption', { class: 'gizli-erisim', text: `${kurum.ad} hayvanları` }),
      el('thead', {}, [el('tr', {}, [
        el('th', { scope: 'col', text: 'Hayvan' }),
        el('th', { scope: 'col', text: 'Aşı' }),
        el('th', { scope: 'col', text: 'Durum' }),
        el('th', { scope: 'col', text: 'Bekleyen başvuru' }),
        el('th', { scope: 'col' }, [el('span', { class: 'gizli-erisim', text: 'İşlemler' })])
      ])]),
      el('tbody', {}, hayvanlar.map(satir))
    ])
  ]);
}

function satir(h) {
  const bekleyen = bekleyenler.get(h.id) || 0;
  return el('tr', {}, [
    el('td', { class: 'tablo-baslik-hucre', 'data-etiket': 'Hayvan' }, [
      el('div', { class: 'hucre-hayvan' }, [
        el('img', { class: 'kucuk-foto', src: kapakUrl(h) || FOTOGRAF_YOK_KUCUK, alt: '' }),
        el('div', {}, [
          el('a', { href: `/panel/hayvan-duzenle.html?id=${h.id}`, style: { color: 'var(--metin)' }, text: h.ad }),
          el('div', { class: 'metin-kucuk metin-ikincil', style: { fontWeight: 400 }, text: hayvanBilgiMetni(h, { kisir: false }) })
        ])
      ])
    ]),
    el('td', { 'data-etiket': 'Aşı' }, [asiRozeti(h) || '—']),
    el('td', { 'data-etiket': 'Durum' }, [durumHucresi(h)]),
    el('td', { 'data-etiket': 'Bekleyen başvuru' }, [bekleyen
      ? el('a', { href: `/panel/basvurular.html?hayvan=${h.id}`, text: `${bekleyen} başvuru` })
      : '—']),
    el('td', {}, [el('div', { class: 'tablo-eylem' }, [
      el('a', { class: 'btn btn-cerceve', href: `/panel/hayvan-duzenle.html?id=${h.id}` }, [ikon('duzenle'), 'Düzenle', el('span', { class: 'gizli-erisim', text: `: ${h.ad}` })]),
      ELLE_SECILEBILIR.includes(h.durum) && silDugmesi(h)
    ])])
  ]);
}

function durumHucresi(h) {
  if (!ELLE_SECILEBILIR.includes(h.durum)) {
    return el('span', { title: 'Başvuru onayıyla oluşur, elle değiştirilemez.' }, [etiketRozeti('durum', h.durum)]);
  }
  const secim = el('select', { class: 'durum-secimi', 'aria-label': `${h.ad} durumu` },
    ELLE_SECILEBILIR.map((d) => el('option', { value: d, selected: d === h.durum, text: etiket('durum', d) })));
  secim.addEventListener('change', async () => {
    const yeni = secim.value;
    secim.disabled = true;
    try {
      await apiPatch(`/api/animals/${h.id}/durum`, { durum: yeni });
      h.durum = yeni;
      toast(`${h.ad}: ${etiket('durum', yeni)}`, 'basari');
    } catch (hata) {
      secim.value = h.durum;
      toast(hataMetni(hata), 'hata');
    } finally {
      secim.disabled = false;
    }
  });
  return secim;
}

function silDugmesi(h) {
  const dugme = el('button', { class: 'btn btn-tehlike btn-ikon', type: 'button', 'aria-label': `${h.ad} kaydını sil`, title: 'Sil' }, [ikon('cop')]);
  dugme.addEventListener('click', async () => {
    const bekleyen = bekleyenler.get(h.id) || 0;
    const onay = await onayIste(`${h.ad} ve fotoğrafları, aşı kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz.`, {
      baslik: `${h.ad} silinsin mi?`,
      onayMetni: 'Sil',
      tehlike: true,
      uyari: bekleyen ? `Bu hayvana ait ${bekleyen} bekleyen başvuru var; başvurusu olan hayvan silinemez. Önce başvuruları değerlendir.` : ''
    });
    if (!onay) return;
    dugme.disabled = true;
    try {
      await apiDelete(`/api/animals/${h.id}`);
      toast(`${h.ad} silindi.`, 'basari');
      listele();
    } catch (hata) {
      dugme.disabled = false;
      // 409: başvurusu veya sahiplendirme kaydı olan hayvan silinemez
      toast(hata instanceof ApiHatasi && hata.durum === 409 ? `${hata.message} Durumunu değiştirebilirsin.` : hataMetni(hata), 'hata', 7000);
    }
  });
  return dugme;
}
