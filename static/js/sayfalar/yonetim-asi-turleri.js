// =============================================================================
// sayfalar/yonetim-asi-turleri.js – Aşı türleri ve aşı gereklilikleri
// Gereklilik tablosu: satırlar aşı türleri, sütunlar hayvan türleri; hücrede
// onay kutusu ("bu tür için zorunlu"). Değişiklikler işaretlenir ve "Kaydet" ile
// toplu gönderilir: değişen her hayvan türü için
//   PUT /api/hayvan-turleri/<id>/zorunlu-asilar { asi_turu_idleri: [...] }
// (API türün listesini gönderilenle değiştirir). Backend'de tekrar aralığı alanı
// yok; hücrede yalnızca onay kutusu vardır.
// Aşı türleri: liste ve ekleme (düzenleme/silme backend'de yok).
// ?#tur-<id> ile gelinirse o hayvan türünün sütunu vurgulanır.
// =============================================================================
import { el, ikon, icerikDegistir } from '../dom.js';
import { apiGet, apiPost, apiPut, ApiHatasi } from '../api.js';
import { yonetimSayfasi } from '../yonetim.js';
import {
  yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, toast, onayIste, modalAc, butonBekle,
  formHatalariniGoster, formHatalariniTemizle, istegeBagli
} from '../ui.js';

const tabloKabi = document.getElementById('gereklilik-tablosu');
const asiListesi = document.getElementById('asi-listesi');

let hayvanTurleri = [];  // [{ id, ad, zorunlu_asilar }]
let asiTurleri = [];     // [{ id, ad, aciklama }]
let kayitli = new Map(); // hayvan türü id → Set(aşı türü id)  (sunucudaki hâl)
let secili = new Map();  // hayvan türü id → Set(aşı türü id)  (ekrandaki hâl)
let kaydediliyor = false;

baslat();

async function baslat() {
  const kullanici = await yonetimSayfasi('asi-turleri');
  if (!kullanici) return;
  const ekle = el('button', { class: 'btn btn-ana', type: 'button' }, [ikon('arti'), 'Aşı türü ekle']);
  ekle.addEventListener('click', asiTuruEkleAc);
  icerikDegistir(document.getElementById('baslik-eylem'), ekle);

  window.addEventListener('beforeunload', (olay) => {
    if (degisiklikSayisi().hucre > 0 && !kaydediliyor) {
      olay.preventDefault();
      olay.returnValue = '';
    }
  });
  window.addEventListener('hashchange', sutunuVurgula);
  yukle();
}

async function yukle() {
  yukleniyorGoster(tabloKabi, 4, 'metin');
  yukleniyorGoster(asiListesi, 3, 'liste');
  try {
    [hayvanTurleri, asiTurleri] = await Promise.all([
      apiGet('/api/hayvan-turleri'),
      apiGet('/api/vaccinations/turler')
    ]);
  } catch (hata) {
    hataGoster(tabloKabi, hataMetni(hata), yukle);
    icerikDegistir(asiListesi, []);
    return;
  }
  // Tablo sırası: hayvan türleri ekleniş sırasıyla, aşılar alfabetik (Türkçe)
  hayvanTurleri.sort((x, y) => x.id - y.id);
  asiTurleri.sort((x, y) => x.ad.localeCompare(y.ad, 'tr'));
  kayitli = new Map(hayvanTurleri.map((t) => [t.id, new Set(t.zorunlu_asilar.map((a) => a.id))]));
  secili = new Map([...kayitli].map(([id, kume]) => [id, new Set(kume)]));
  tabloyuCiz();
  asiListesiniCiz();
  sutunuVurgula();
}

// -----------------------------------------------------------------------------
// Değişiklik takibi
// -----------------------------------------------------------------------------
function farkliMi(turId, asiId) {
  return kayitli.get(turId).has(asiId) !== secili.get(turId).has(asiId);
}

function degisenTurler() {
  return hayvanTurleri.filter((t) => asiTurleri.some((a) => farkliMi(t.id, a.id)));
}

function degisiklikSayisi() {
  let hucre = 0;
  for (const t of hayvanTurleri) for (const a of asiTurleri) if (farkliMi(t.id, a.id)) hucre += 1;
  return { hucre, tur: degisenTurler().length };
}

// -----------------------------------------------------------------------------
// Gereklilik tablosu
// -----------------------------------------------------------------------------
const durumMetni = el('p', { 'aria-live': 'polite' });
const vazgecDugmesi = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Geri al' });
const kaydetDugmesi = el('button', { class: 'btn btn-ana', type: 'button', text: 'Kaydet' });
vazgecDugmesi.addEventListener('click', geriAl);
kaydetDugmesi.addEventListener('click', () => butonBekle(kaydetDugmesi, kaydet));

function zorunluSayisiMetni(turId) {
  const n = secili.get(turId).size;
  return n ? `${n} zorunlu` : 'zorunlu yok';
}

function tabloyuCiz() {
  if (!hayvanTurleri.length || !asiTurleri.length) {
    bosDurumGoster(tabloKabi, {
      baslik: !hayvanTurleri.length ? 'Önce hayvan türü ekle' : 'Önce aşı türü ekle',
      aciklama: 'Gereklilik tablosu için en az bir hayvan türü ve bir aşı türü gerekir.',
      ikon: 'asi'
    }, !hayvanTurleri.length ? { metin: 'Hayvan türleri', href: '/yonetim/hayvan-turleri.html' } : { metin: 'Aşı türü ekle', tikla: asiTuruEkleAc });
    return;
  }

  const baslikSatiri = el('tr', {}, [
    el('th', { scope: 'col', class: 'gereklilik-asi', text: 'Aşı türü' }),
    ...hayvanTurleri.map((t) => el('th', { scope: 'col', id: `sutun-${t.id}`, dataset: { tur: t.id } }, [
      t.ad,
      el('small', { id: `sutun-sayi-${t.id}`, text: zorunluSayisiMetni(t.id) })
    ]))
  ]);

  const satirlar = asiTurleri.map((a) => el('tr', {}, [
    el('th', { scope: 'row', class: 'gereklilik-asi' }, [a.ad, a.aciklama && el('small', { text: a.aciklama })]),
    ...hayvanTurleri.map((t) => {
      const kutu = el('input', {
        type: 'checkbox',
        checked: secili.get(t.id).has(a.id),
        'aria-label': `${a.ad}, ${t.ad} için zorunlu`,
        dataset: { tur: t.id, asi: a.id }
      });
      const hucre = el('td', { dataset: { tur: t.id } }, [el('label', { class: 'gereklilik-kutu' }, [kutu])]);
      kutu.addEventListener('change', () => {
        const kume = secili.get(t.id);
        if (kutu.checked) kume.add(a.id);
        else kume.delete(a.id);
        hucre.classList.toggle('degisti', farkliMi(t.id, a.id));
        document.getElementById(`sutun-sayi-${t.id}`).textContent = zorunluSayisiMetni(t.id);
        cubuguGuncelle();
      });
      return hucre;
    })
  ]));

  icerikDegistir(tabloKabi, [
    el('div', { class: 'gereklilik-kap' }, [
      el('table', { class: 'gereklilik' }, [
        el('caption', { class: 'gizli-erisim', text: 'Aşı gereklilikleri: satırlar aşı türleri, sütunlar hayvan türleri' }),
        el('thead', {}, [baslikSatiri]),
        el('tbody', {}, satirlar)
      ])
    ]),
    el('div', { class: 'gereklilik-aciklama' }, [
      el('span', {}, [el('i', { 'aria-hidden': 'true' }), 'Kaydedilmemiş değişiklik']),
      el('span', { text: 'Tekrar aralığı (gün) backend\'de tanımlı değil; sonraki doz tarihi aşı girilirken elle yazılır.' })
    ]),
    el('div', { class: 'kaydet-cubugu', role: 'region', 'aria-label': 'Gereklilik değişiklikleri' }, [
      durumMetni,
      el('div', { class: 'btn-grup' }, [vazgecDugmesi, kaydetDugmesi])
    ])
  ]);
  cubuguGuncelle();
}

function cubuguGuncelle() {
  const { hucre, tur } = degisiklikSayisi();
  durumMetni.textContent = hucre
    ? `${hucre} değişiklik (${tur} hayvan türü) kaydedilmedi`
    : 'Tüm değişiklikler kaydedildi';
  durumMetni.classList.toggle('metin-ikincil', !hucre);
  durumMetni.parentElement?.classList.toggle('bekliyor', hucre > 0);
  kaydetDugmesi.disabled = !hucre;
  vazgecDugmesi.disabled = !hucre;
  kaydetDugmesi.textContent = hucre ? `Kaydet (${hucre})` : 'Kaydet';
}

async function geriAl() {
  const onay = await onayIste('Kaydedilmemiş tüm işaretler son kaydedilen hâle döner.', { baslik: 'Değişiklikler geri alınsın mı?', onayMetni: 'Geri al' });
  if (!onay) return;
  secili = new Map([...kayitli].map(([id, kume]) => [id, new Set(kume)]));
  tabloyuCiz();
  sutunuVurgula();
}

/** Değişen her hayvan türü için tam listeyi gönderir; biri başarısız olsa da diğerleri denenir. */
async function kaydet() {
  const turler = degisenTurler();
  if (!turler.length) return;
  kaydediliyor = true;
  const hatalar = [];
  for (const t of turler) {
    try {
      const guncel = await apiPut(`/api/hayvan-turleri/${t.id}/zorunlu-asilar`, { asi_turu_idleri: [...secili.get(t.id)] });
      kayitli.set(t.id, new Set(guncel.zorunlu_asilar.map((a) => a.id)));
      secili.set(t.id, new Set(kayitli.get(t.id)));
    } catch (hata) {
      hatalar.push(`${t.ad}: ${hata instanceof ApiHatasi ? hata.message : hataMetni(hata)}`);
    }
  }
  kaydediliyor = false;
  tabloyuCiz();
  sutunuVurgula();
  if (hatalar.length) {
    toast(`Bazı türler kaydedilemedi. ${hatalar.join(' · ')}`, 'hata', 8000);
  } else {
    toast(`${turler.map((t) => t.ad).join(', ')} için zorunlu aşılar kaydedildi.`, 'basari', 6000);
  }
}

/** #tur-<id> ile gelinirse o hayvan türünün sütunu vurgulanır ve görünür olur. */
function sutunuVurgula() {
  tabloKabi.querySelectorAll('.vurgulu').forEach((x) => x.classList.remove('vurgulu'));
  const eslesme = /^#tur-(\d+)$/.exec(window.location.hash);
  if (!eslesme) return;
  const hucreler = tabloKabi.querySelectorAll(`[data-tur="${eslesme[1]}"]`);
  if (!hucreler.length) return;
  hucreler.forEach((x) => x.classList.add('vurgulu'));
  const baslik = document.getElementById(`sutun-${eslesme[1]}`);
  baslik?.scrollIntoView({ block: 'nearest', inline: 'center' });
  document.getElementById('gereklilik-baslik').scrollIntoView({ block: 'start', behavior: 'smooth' });
  tabloKabi.querySelector(`input[data-tur="${eslesme[1]}"]`)?.focus({ preventScroll: true });
}

// -----------------------------------------------------------------------------
// Aşı türleri listesi ve ekleme
// -----------------------------------------------------------------------------
function asiListesiniCiz() {
  if (!asiTurleri.length) {
    bosDurumGoster(asiListesi, { baslik: 'Henüz aşı türü yok', ikon: 'asi' }, { metin: 'Aşı türü ekle', tikla: asiTuruEkleAc });
    return;
  }
  const zorunluOlduguTurler = (asiId) => hayvanTurleri.filter((t) => kayitli.get(t.id).has(asiId)).map((t) => t.ad);
  icerikDegistir(asiListesi, [
    el('div', { class: 'tablo-kap' }, [
      el('table', { class: 'tablo' }, [
        el('caption', { class: 'gizli-erisim', text: 'Aşı türleri' }),
        el('thead', {}, [el('tr', {}, [
          el('th', { scope: 'col', text: 'Aşı' }),
          el('th', { scope: 'col', text: 'Açıklama' }),
          el('th', { scope: 'col', text: 'Zorunlu olduğu türler' })
        ])]),
        el('tbody', {}, asiTurleri.map((a) => {
          const turler = zorunluOlduguTurler(a.id);
          return el('tr', {}, [
            el('td', { class: 'tablo-baslik-hucre', 'data-etiket': 'Aşı', text: a.ad }),
            el('td', { 'data-etiket': 'Açıklama', text: a.aciklama || '—' }),
            el('td', { 'data-etiket': 'Zorunlu olduğu türler' }, [turler.length
              ? el('div', { class: 'rozet-grubu' }, turler.map((ad) => el('span', { class: 'rozet rozet-bilgi', text: ad })))
              : el('span', { class: 'metin-ikincil', text: 'İsteğe bağlı' })])
          ]);
        }))
      ])
    ]),
    el('p', { class: 'form-yardim', style: { marginTop: '12px' }, text: 'Aşı türünü düzenleme ve silme backend\'de henüz yok.' })
  ]);
}

function asiTuruEkleAc() {
  const formId = 'asi-turu-ekle';
  const af = el('form', { id: formId, novalidate: true }, [
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-ad`, text: 'Aşı adı' }),
      el('input', { id: `${formId}-ad`, name: 'ad', type: 'text', maxlength: '50', autocomplete: 'off', required: true, placeholder: 'Ör. Lösemi' })
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-aciklama` }, ['Açıklama ', istegeBagli()]),
      el('textarea', { id: `${formId}-aciklama`, name: 'aciklama', rows: '2', maxlength: '500', placeholder: 'Ör. Yıllık tekrarlanır.' })
    ]),
    el('p', { class: 'form-yardim', text: 'Eklenen aşı tabloya yeni satır olarak gelir; hangi türlerde zorunlu olacağını oradan işaretle.' })
  ]);
  const vazgec = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Vazgeç' });
  const kaydet2 = el('button', { class: 'btn btn-ana', type: 'submit', form: formId, text: 'Ekle' });
  const modal = modalAc(af, { baslik: 'Yeni aşı türü', alt: [vazgec, kaydet2] });
  vazgec.addEventListener('click', modal.kapat);
  af.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    formHatalariniTemizle(af);
    const ad = af.elements.ad.value.trim();
    const aciklama = af.elements.aciklama.value.trim();
    if (ad.length < 2) {
      formHatalariniGoster(af, { ad: 'Aşı adı en az 2 karakter olmalı.' });
      return;
    }
    await butonBekle(kaydet2, async () => {
      try {
        const yeni = await apiPost('/api/vaccinations/turler', aciklama ? { ad, aciklama } : { ad });
        modal.kapat();
        toast(`${yeni.ad} eklendi. Tabloda zorunlu olduğu türleri işaretleyip kaydet.`, 'basari', 6000);
        // Kaydedilmemiş işaretler korunur; yeni aşı satırı boş eklenir
        asiTurleri = [...asiTurleri, yeni].sort((x, y) => x.ad.localeCompare(y.ad, 'tr'));
        tabloyuCiz();
        asiListesiniCiz();
        sutunuVurgula();
      } catch (hata) {
        if (hata instanceof ApiHatasi && hata.durum === 409) formHatalariniGoster(af, { ad: hata.message });
        else if (hata instanceof ApiHatasi && hata.durum === 400) formHatalariniGoster(af, hata.alanlar, Object.keys(hata.alanlar).length ? '' : hata.message);
        else formHatalariniGoster(af, {}, hataMetni(hata));
      }
    });
  });
}
