// =============================================================================
// sayfalar/panel-hayvan-duzenle.js – Hayvan düzenleme: dolu form, fotoğraf
// yönetimi (ekle, sil, kapak yap), aşı geçmişi. Kaydedilmemiş değişiklik varken
// sayfadan çıkılırsa uyarı verilir.
// =============================================================================
import { el, ikon, icerikDegistir, sayiParametresi } from '../dom.js';
import { apiGet, apiPut, apiPatch, apiDelete, apiUpload, ApiHatasi } from '../api.js';
import { gorevliGerekli, yetkiVarMi, yetkisizGoster } from '../auth.js';
import { aktifKurum, aktifKurumuDegistir, KURUM_DEGISTI_OLAYI } from '../kurum.js';
import { panelUstCubugunuYerlestir, panelMenusunuYerlestir } from '../layout.js';
import {
  hataGoster, hataMetni, toast, onayIste, formHatalariniGoster, formHatalariniTemizle,
  butonBekle, etiket, etiketRozeti, bugunIso, yasMetni
} from '../ui.js';
import { asiKarnesiTablosu, sayfaMesaji } from '../kartlar.js';
import { fotografKucult, EN_FAZLA_FOTOGRAF } from '../fotograf.js';

const ELLE_SECILEBILIR = ['barinakta', 'tedavide'];
const kap = document.getElementById('duzenle-icerik');
const hayvanId = sayiParametresi('id');

let hayvan = null;
let turler = [];
let ilkDurum = '';    // formun kaydedilmiş hâli (değişiklik takibi)
let kaydediliyor = false;
let form = null;

baslat();

async function baslat() {
  const kullanici = await gorevliGerekli().catch((hata) => {
    hataGoster(kap, hataMetni(hata), () => window.location.reload());
    return null;
  });
  if (!kullanici) return;
  await panelUstCubugunuYerlestir({ baslik: 'Hayvanı düzenle', geri: '/panel/hayvanlar.html' });
  panelMenusunuYerlestir('hayvanlar');

  if (!hayvanId) {
    icerikDegistir(kap, sayfaMesaji({ baslik: 'Hayvan seçilmedi', eylemler: [el('a', { class: 'btn btn-ana', href: '/panel/hayvanlar.html', text: 'Hayvanlar' })] }));
    return;
  }

  icerikDegistir(kap, el('div', { 'aria-hidden': 'true' }, [
    el('div', { class: 'iskelet', style: { height: '160px', borderRadius: '18px' } }),
    el('div', { class: 'iskelet', style: { height: '360px', borderRadius: '18px', marginTop: '16px' } })
  ]));

  try {
    [hayvan, turler] = await Promise.all([apiGet(`/api/animals/${hayvanId}`), apiGet('/api/hayvan-turleri')]);
  } catch (hata) {
    if (hata instanceof ApiHatasi && hata.durum === 404) {
      icerikDegistir(kap, sayfaMesaji({ baslik: 'Hayvan bulunamadı', aciklama: 'Kayıt silinmiş olabilir.', eylemler: [el('a', { class: 'btn btn-ana', href: '/panel/hayvanlar.html', text: 'Hayvanlar' })] }));
    } else {
      hataGoster(kap, hataMetni(hata), baslat);
    }
    return;
  }

  // Hayvan kullanıcının başka bir kurumundaysa aktif kurum ona geçirilir
  if (!yetkiVarMi(hayvan.kurum.id)) {
    yetkisizGoster('Bu hayvan görevli olduğun kurumlardan birine ait değil.');
    return;
  }
  const aktif = await aktifKurum();
  if (aktif && aktif.kurum_id !== hayvan.kurum.id) {
    await aktifKurumuDegistir(hayvan.kurum.id);
    toast(`Aktif kurum ${hayvan.kurum.ad} olarak değiştirildi.`, 'bilgi');
  }
  // Bundan sonra kurum değiştirilirse bu hayvan o kuruma ait olmayacağı için listeye dönülür
  window.addEventListener(KURUM_DEGISTI_OLAYI, () => {
    window.location.href = '/panel/hayvanlar.html';
  });

  window.addEventListener('beforeunload', (olay) => {
    if (degistiMi() && !kaydediliyor) {
      olay.preventDefault();
      olay.returnValue = '';
    }
  });

  document.title = `${hayvan.ad} – Düzenle – PatiPortal`;
  ciz();
}

// -----------------------------------------------------------------------------
function ciz() {
  form = formOlustur();
  icerikDegistir(kap, [
    el('div', { class: 'satir', style: { justifyContent: 'space-between', marginBottom: '12px' } }, [
      el('div', {}, [
        el('h2', { style: { fontSize: '24px', margin: 0 }, text: hayvan.ad }),
        el('span', { class: 'metin-ikincil metin-kucuk', text: `${hayvan.kurum?.ad || ''} · ${hayvan.dogum_tarihi ? yasMetni(hayvan.dogum_tarihi) : 'Yaşı bilinmiyor'}` })
      ]),
      el('a', { class: 'baglanti', href: `/hayvan.html?id=${hayvan.id}`, target: '_blank', rel: 'noopener' }, ['Profili gör', el('span', { class: 'gizli-erisim', text: ' (yeni sekmede açılır)' })])
    ]),
    fotografBolumu(),
    el('section', { class: 'kart panel-bolum', 'aria-labelledby': 'bilgi-baslik' }, [
      el('h2', { id: 'bilgi-baslik', style: { fontSize: '20px' }, text: 'Bilgiler' }),
      form
    ]),
    asiBolumu()
  ]);
  ilkDurum = formDurumu();
  fotograflariCiz();
  asiKarnesiniYukle();
}

function alan(etiketMetni, girdi, yardim = null) {
  return el('div', { class: 'form-alan' }, [
    el('label', { for: girdi.id, text: etiketMetni }),
    girdi,
    yardim && el('p', { class: 'form-yardim', text: yardim })
  ]);
}

function formOlustur() {
  const h = hayvan;
  const durumAlani = ELLE_SECILEBILIR.includes(h.durum)
    ? alan('Durum', el('select', { id: 'durum', name: 'durum' }, ELLE_SECILEBILIR.map((d) => el('option', { value: d, selected: d === h.durum, text: etiket('durum', d) }))))
    : el('div', { class: 'form-alan' }, [
      el('span', { class: 'form-etiket', text: 'Durum' }),
      el('div', {}, [etiketRozeti('durum', h.durum, 'rozet-buyuk')]),
      el('p', { class: 'form-yardim', text: 'Bu durum başvuru onayıyla oluşur, elle değiştirilemez.' })
    ]);

  const f = el('form', { id: 'duzenle-formu', novalidate: true }, [
    alan('Adı', el('input', { id: 'ad', name: 'ad', type: 'text', maxlength: '50', value: h.ad, required: true, autocomplete: 'off' })),
    alan('Tür', el('select', { id: 'tur_id', name: 'tur_id', required: true }, turler.map((t) => el('option', { value: t.id, selected: t.id === h.tur?.id, text: t.ad })))),
    el('fieldset', { class: 'form-alan' }, [
      el('legend', { class: 'form-etiket', text: 'Cinsiyet' }),
      el('div', { class: 'secim-grubu' }, [['disi', 'Dişi'], ['erkek', 'Erkek'], ['bilinmiyor', 'Bilinmiyor']].map(([d, m]) => el('label', {}, [
        el('input', { type: 'radio', name: 'cinsiyet', value: d, checked: h.cinsiyet === d }), el('span', { text: m })
      ])))
    ]),
    alan('Doğum tarihi', el('input', { id: 'dogum_tarihi', name: 'dogum_tarihi', type: 'date', value: h.dogum_tarihi || '', max: bugunIso() }), 'Yaklaşık yaşla eklendiyse tahmini tarihtir. Bilinmiyorsa boş bırak.'),
    alan('Cins', el('input', { id: 'cins', name: 'cins', type: 'text', maxlength: '50', value: h.cins || '', autocomplete: 'off' })),
    el('div', { class: 'form-alan' }, [
      el('label', { class: 'secim-kutusu' }, [el('input', { type: 'checkbox', name: 'kisirlastirildi', checked: !!h.kisirlastirildi }), 'Kısırlaştırıldı'])
    ]),
    durumAlani,
    alan('Sağlık durumu', el('textarea', { id: 'saglik_durumu', name: 'saglik_durumu', rows: '3', maxlength: '2000', value: h.saglik_durumu || '' })),
    alan('Karakteri', el('textarea', { id: 'karakter_notu', name: 'karakter_notu', rows: '4', maxlength: '1000', value: h.karakter_notu || '' }), 'İlk cümle profilde özet olarak görünür.'),
    el('div', { class: 'alt-eylem' }, [
      el('button', { class: 'btn btn-ana btn-buyuk btn-blok', type: 'submit', text: 'Değişiklikleri kaydet' })
    ])
  ]);
  f.addEventListener('submit', kaydet);
  return f;
}

function formDurumu() {
  const v = form.elements;
  return JSON.stringify({
    ad: v.ad.value.trim(), tur_id: v.tur_id.value,
    cinsiyet: form.querySelector('input[name="cinsiyet"]:checked')?.value || '',
    dogum_tarihi: v.dogum_tarihi.value,
    cins: v.cins.value.trim(), kisir: v.kisirlastirildi.checked,
    durum: v.durum ? v.durum.value : hayvan.durum,
    saglik: v.saglik_durumu.value.trim(), karakter: v.karakter_notu.value.trim()
  });
}

function degistiMi() {
  return !!form && formDurumu() !== ilkDurum;
}

async function kaydet(olay) {
  olay.preventDefault();
  formHatalariniTemizle(form);
  const v = form.elements;
  const hatalar = {};
  if (v.ad.value.trim().length < 2) hatalar.ad = 'Ad en az 2 karakter olmalı.';
  if (!form.querySelector('input[name="cinsiyet"]:checked')) hatalar.cinsiyet = 'Cinsiyet seçin.';
  if (v.dogum_tarihi.value && v.dogum_tarihi.value > bugunIso()) hatalar.dogum_tarihi = 'Doğum tarihi gelecekte olamaz.';
  if (Object.keys(hatalar).length) {
    formHatalariniGoster(form, hatalar);
    return;
  }
  if (!degistiMi()) {
    toast('Değişiklik yok.', 'bilgi');
    return;
  }

  kaydediliyor = true;
  await butonBekle(form.querySelector('[type="submit"]'), async () => {
    try {
      hayvan = await apiPut(`/api/animals/${hayvan.id}`, {
        ad: v.ad.value.trim(),
        tur_id: Number(v.tur_id.value),
        cinsiyet: form.querySelector('input[name="cinsiyet"]:checked').value,
        dogum_tarihi: v.dogum_tarihi.value || null,
        cins: v.cins.value.trim() || null,
        kisirlastirildi: v.kisirlastirildi.checked,
        saglik_durumu: v.saglik_durumu.value.trim() || null,
        karakter_notu: v.karakter_notu.value.trim() || null
      });
      if (v.durum && v.durum.value !== hayvan.durum) {
        const yeni = await apiPatch(`/api/animals/${hayvan.id}/durum`, { durum: v.durum.value });
        hayvan.durum = yeni.durum;
      }
      ilkDurum = formDurumu();
      document.title = `${hayvan.ad} – Düzenle – PatiPortal`;
      toast('Değişiklikler kaydedildi.', 'basari');
    } catch (hata) {
      if (hata instanceof ApiHatasi && hata.durum === 400) formHatalariniGoster(form, hata.alanlar, Object.keys(hata.alanlar).length ? '' : hata.message);
      else formHatalariniGoster(form, {}, hataMetni(hata));
    }
  });
  kaydediliyor = false;
}

// -----------------------------------------------------------------------------
// Fotoğraflar
// -----------------------------------------------------------------------------
function fotografBolumu() {
  const girdi = el('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, 'aria-label': 'Fotoğraf ekle' });
  girdi.addEventListener('change', () => fotografEkle(girdi));
  return el('section', { class: 'kart', 'aria-labelledby': 'foto-baslik' }, [
    el('div', { class: 'kart-baslik' }, [
      el('h2', { id: 'foto-baslik', text: 'Fotoğraflar' }),
      el('label', { class: 'dosya-sec' }, [girdi, el('span', { class: 'btn btn-cerceve-ana', 'aria-hidden': 'true' }, [ikon('kamera'), 'Ekle'])])
    ]),
    el('div', { id: 'foto-listesi', 'aria-live': 'polite' })
  ]);
}

function fotograflariCiz() {
  const liste = document.getElementById('foto-listesi');
  const fotolar = [...(hayvan.fotograflar || [])].sort((a, b) => (b.kapak_mi - a.kapak_mi) || (a.sira - b.sira) || (a.id - b.id));
  if (!fotolar.length) {
    icerikDegistir(liste, el('p', { class: 'metin-ikincil', style: { margin: 0 }, text: 'Henüz fotoğraf yok. İlk eklenen fotoğraf kapak olur.' }));
    return;
  }
  icerikDegistir(liste, el('ul', { class: 'foto-yonetim' }, fotolar.map((f, i) => {
    const kapakYap = !f.kapak_mi && el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Kapak yap', 'aria-label': `${i + 1}. fotoğrafı kapak yap` });
    const sil = el('button', { class: 'btn btn-tehlike', type: 'button', 'aria-label': `${i + 1}. fotoğrafı sil` }, [ikon('cop')]);
    if (kapakYap) kapakYap.addEventListener('click', () => butonBekle(kapakYap, () => fotografIslemi(() => apiPut(`/api/photos/${f.id}/kapak`), 'Kapak fotoğrafı değişti.')));
    sil.addEventListener('click', async () => {
      if (!(await onayIste('Bu fotoğraf kalıcı olarak silinecek.', { baslik: 'Fotoğraf silinsin mi?', onayMetni: 'Sil', tehlike: true }))) return;
      await butonBekle(sil, () => fotografIslemi(() => apiDelete(`/api/photos/${f.id}`), 'Fotoğraf silindi.'));
    });
    return el('li', {}, [
      el('div', { class: 'foto-yonetim-gorsel' }, [
        el('img', { src: f.url_kucuk, alt: `${hayvan.ad} – fotoğraf ${i + 1}`, loading: 'lazy' }),
        f.kapak_mi && el('span', { class: 'rozet rozet-basari', text: 'Kapak' })
      ]),
      el('div', { class: 'btn-grup' }, [kapakYap || el('span', { class: 'form-yardim', style: { flex: 1, alignSelf: 'center' }, text: 'Kapak fotoğrafı' }), sil])
    ]);
  })));
}

/** Kapak/sil işleminden sonra güncel fotoğraf listesi hayvan detayından okunur. */
async function fotografIslemi(istek, basariMesaji) {
  try {
    await istek();
    hayvan.fotograflar = (await apiGet(`/api/animals/${hayvan.id}`)).fotograflar;
    fotograflariCiz();
    toast(basariMesaji, 'basari');
  } catch (hata) {
    toast(hataMetni(hata), 'hata');
  }
}

async function fotografEkle(girdi) {
  const secilenler = Array.from(girdi.files || []);
  girdi.value = '';
  if (!secilenler.length) return;
  const yer = EN_FAZLA_FOTOGRAF - (hayvan.fotograflar || []).length;
  if (yer <= 0) {
    toast(`En fazla ${EN_FAZLA_FOTOGRAF} fotoğraf olabilir. Önce bir fotoğraf silin.`, 'uyari');
    return;
  }
  const liste = document.getElementById('foto-listesi');
  liste.setAttribute('aria-busy', 'true');
  const kapatToast = toast('Fotoğraflar hazırlanıyor ve yükleniyor…', 'bilgi', 0);
  try {
    const veri = new FormData();
    let i = 0;
    for (const dosya of secilenler.slice(0, yer)) {
      try {
        veri.append('fotograflar', await fotografKucult(dosya, ++i));
      } catch (hata) {
        toast(`${dosya.name} eklenemedi: ${hata.message}`, 'uyari');
      }
    }
    if (!veri.has('fotograflar')) return;
    await apiUpload(`/api/animals/${hayvan.id}/photos`, veri);
    const guncel = await apiGet(`/api/animals/${hayvan.id}`);
    hayvan.fotograflar = guncel.fotograflar;
    fotograflariCiz();
    toast('Fotoğraflar eklendi.', 'basari');
  } catch (hata) {
    toast(`Fotoğraflar yüklenemedi: ${hataMetni(hata)}`, 'hata');
  } finally {
    kapatToast();
    liste.removeAttribute('aria-busy');
  }
}

// -----------------------------------------------------------------------------
// Aşı geçmişi
// -----------------------------------------------------------------------------
function asiBolumu() {
  return el('section', { class: 'kart panel-bolum', 'aria-labelledby': 'asi-gecmis-baslik', style: { marginBottom: '16px' } }, [
    el('div', { class: 'kart-baslik' }, [
      el('h2', { id: 'asi-gecmis-baslik', text: 'Aşı geçmişi' }),
      el('a', { class: 'btn btn-cerceve-ana', href: `/panel/asi.html?hayvan=${hayvan.id}` }, [ikon('arti'), 'Aşı ekle'])
    ]),
    el('div', { id: 'asi-gecmisi' })
  ]);
}

async function asiKarnesiniYukle() {
  const kap2 = document.getElementById('asi-gecmisi');
  icerikDegistir(kap2, [el('div', { class: 'iskelet iskelet-metin' }), el('div', { class: 'iskelet iskelet-metin iskelet-metin-kisa' })]);
  try {
    const karne = await apiGet(`/api/animals/${hayvan.id}/vaccinations`);
    icerikDegistir(kap2, asiKarnesiTablosu(hayvan.ad, karne) || el('p', { class: 'metin-ikincil', style: { margin: 0 }, text: 'Henüz aşı kaydı yok.' }));
  } catch (hata) {
    hataGoster(kap2, hataMetni(hata), asiKarnesiniYukle);
  }
}
