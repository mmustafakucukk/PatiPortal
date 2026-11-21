// =============================================================================
// sayfalar/hayvan.js – Hayvan profili: galeri, bilgiler, kurum, sahiplenme
// butonu ve aşı karnesi
// =============================================================================
import { el, ikon, icerikDegistir, sayiParametresi, telLinki } from '../dom.js';
import { apiGet, ApiHatasi } from '../api.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir } from '../layout.js';
import {
  hataGoster, bosDurumGoster, hataMetni, etiket, etiketRozeti, yasMetni, ayYil,
  belirtmeHali
} from '../ui.js';
import { FOTOGRAF_YOK, KURUM_YOK, asiRozeti, ekmekKirintisi, asiKarnesiTablosu, turAdi } from '../kartlar.js';

const kap = document.getElementById('hayvan-detay');
const hayvanId = sayiParametresi('id');

ustMenuyuYerlestir();
altBilgiyiYerlestir();
yukle();

function iskeletGoster() {
  icerikDegistir(kap, el('div', { 'aria-hidden': 'true' }, [
    el('div', { class: 'iskelet iskelet-metin', style: { width: '200px', marginBottom: '20px' } }),
    el('div', { class: 'detay-duzeni' }, [
      el('div', {}, [el('div', { class: 'iskelet galeri-ana' })]),
      el('div', {}, [
        el('div', { class: 'iskelet iskelet-metin', style: { width: '45%' } }),
        el('div', { class: 'iskelet', style: { height: '48px', width: '50%', margin: '12px 0 16px' } }),
        el('div', { class: 'iskelet iskelet-metin' }),
        el('div', { class: 'iskelet', style: { height: '140px', marginTop: '20px', borderRadius: '18px' } }),
        el('div', { class: 'iskelet', style: { height: '110px', marginTop: '20px', borderRadius: '18px' } })
      ])
    ]),
    el('span', { class: 'gizli-erisim', role: 'status', text: 'Hayvan bilgileri yükleniyor…' })
  ]));
}

function bulunamadi() {
  document.title = 'Hayvan bulunamadı – PatiPortal';
  icerikDegistir(kap, el('div', { style: { paddingBlock: '24px 56px' } }, [
    ekmekKirintisi([['Anasayfa', '/index.html'], ['Hayvanlar', '/hayvanlar.html'], ['Bulunamadı']]),
    el('div', { class: 'bos-durum' }, [
      el('span', { class: 'bos-durum-ikon' }, [ikon('pati')]),
      el('h1', { style: { fontSize: '22px', margin: 0 }, text: 'Bu dostumuzu bulamadık' }),
      el('p', { text: 'Aradığın hayvan kaldırılmış ya da bağlantı hatalı olabilir. Yuva arayan diğer dostlarımıza göz atabilirsin.' }),
      el('a', { class: 'btn btn-ana', href: '/hayvanlar.html', text: 'Hayvanlara göz at' })
    ])
  ]));
}

async function yukle() {
  if (!hayvanId) {
    bulunamadi();
    return;
  }
  iskeletGoster();
  let hayvan;
  try {
    hayvan = await apiGet(`/api/animals/${hayvanId}`);
  } catch (hata) {
    if (hata instanceof ApiHatasi && hata.durum === 404) bulunamadi();
    else hataGoster(kap, hataMetni(hata), yukle);
    return;
  }
  document.title = `${hayvan.ad} – PatiPortal`;
  ciz(hayvan);
  asiKarnesiniYukle(hayvan);
}

// -----------------------------------------------------------------------------
function ciz(h) {
  const { ozet, devami } = aciklamayiBol(h.karakter_notu);
  icerikDegistir(kap, [
    ekmekKirintisi([['Anasayfa', '/index.html'], ['Hayvanlar', '/hayvanlar.html'], [h.ad]]),
    el('div', { class: 'detay-duzeni' }, [
      galeri(h),
      el('div', {}, [
        el('div', { class: 'detay-rozetler' }, rozetler(h)),
        el('h1', { class: 'detay-baslik', text: h.ad }),
        ozet && el('p', { class: 'detay-ozet', text: ozet }),
        bilgiTablosu(h),
        h.saglik_durumu && [el('h2', { class: 'alt-baslik', text: 'Sağlık durumu' }), el('p', { class: 'detay-metin', text: h.saglik_durumu })],
        devami && [el('h2', { class: 'alt-baslik', text: 'Karakteri' }), el('p', { class: 'detay-metin', text: devami })],
        sahiplenmeKarti(h),
        kurumKarti(h)
      ])
    ]),
    el('section', { class: 'kart asi-karnesi', 'aria-labelledby': 'karne-baslik', id: 'asi-karnesi' }, [
      el('div', { class: 'kart-baslik' }, [
        el('h2', { id: 'karne-baslik', text: 'Aşı karnesi' }),
        el('p', { text: 'Kayıtlar kurum görevlileri tarafından girilir.' })
      ]),
      el('div', { id: 'karne-icerik' })
    ])
  ]);
}

/** İlk cümle özet olarak, kalanı "Karakteri" bölümünde gösterilir. */
function aciklamayiBol(metin) {
  const temiz = String(metin || '').trim();
  if (!temiz) return { ozet: '', devami: '' };
  const eslesme = /^(.+?[.!?])\s+(.+)$/s.exec(temiz);
  return eslesme ? { ozet: eslesme[1], devami: eslesme[2] } : { ozet: temiz, devami: '' };
}

function rozetler(h) {
  const kurumTuru = h.kurum?.tur || null;
  return [
    asiRozeti(h, 'rozet-buyuk'),
    h.kisirlastirildi && el('span', { class: 'rozet rozet-buyuk rozet-bilgi', text: 'Kısırlaştırılmış' }),
    h.durum === 'barinakta' && kurumTuru && el('span', { class: 'rozet rozet-buyuk rozet-notr', text: kurumTuru === 'klinik' ? 'Klinikte' : 'Barınakta' }),
    h.durum !== 'barinakta' && etiketRozeti('durum', h.durum, 'rozet-buyuk')
  ];
}

function galeri(h) {
  // Kapak fotoğrafı önce gösterilir
  const sirali = [...(h.fotograflar || [])].sort((a, b) => (b.kapak_mi - a.kapak_mi) || (a.sira - b.sira) || (a.id - b.id));
  const fotograflar = sirali.length ? sirali : [{ id: 0, url_buyuk: null, url_kucuk: null }];
  const anaGorsel = el('img', {
    src: fotograflar[0].url_buyuk || FOTOGRAF_YOK,
    alt: fotograflar[0].url_buyuk ? `${h.ad} – fotoğraf 1` : `${h.ad} için fotoğraf yok`,
    width: '612', height: '440'
  });
  const kucukler = fotograflar.length > 1 && el('ul', { class: 'galeri-kucukler', 'aria-label': 'Fotoğraflar' }, fotograflar.map((f, i) => {
    const dugme = el('button', {
      class: 'galeri-kucuk', type: 'button',
      'aria-label': `${i + 1}. fotoğrafı göster`, 'aria-pressed': i === 0 ? 'true' : 'false'
    }, [el('img', { src: f.url_kucuk, alt: '', loading: 'lazy', width: '144', height: '92' })]);
    dugme.addEventListener('click', () => {
      anaGorsel.src = f.url_buyuk;
      anaGorsel.alt = `${h.ad} – fotoğraf ${i + 1}`;
      kucukler.querySelectorAll('.galeri-kucuk').forEach((d) => d.setAttribute('aria-pressed', d === dugme ? 'true' : 'false'));
    });
    return el('li', {}, [dugme]);
  }));
  return el('div', {}, [el('div', { class: 'galeri-ana' }, [anaGorsel]), kucukler]);
}

function bilgiTablosu(h) {
  const gelis = h.kurum?.tur === 'klinik' ? 'Kliniğe geliş' : 'Barınağa geliş';
  const hucre = (baslik, deger) => el('div', {}, [el('dt', { text: baslik }), el('dd', { text: deger })]);
  return el('dl', { class: 'bilgi-tablosu' }, [
    hucre('Tür / Cins', [turAdi(h), h.cins].filter(Boolean).join(' · ') || '—'),
    hucre('Cinsiyet', etiket('cinsiyet', h.cinsiyet)),
    hucre('Yaş', h.dogum_tarihi ? yasMetni(h.dogum_tarihi) : (h.yas_metni || 'Bilinmiyor')),
    hucre(gelis, h.olusturma_tarihi ? ayYil(h.olusturma_tarihi) : '—')
  ]);
}

function sahiplenmeKarti(h) {
  if (h.durum === 'barinakta') {
    return el('div', { class: 'cta-karti' }, [
      el('a', { class: 'btn btn-ana btn-buyuk btn-blok', href: `/basvuru.html?hayvan=${encodeURIComponent(h.id)}`, text: `${belirtmeHali(h.ad)} sahiplenmek istiyorum` }),
      el('p', { text: 'Başvurun görevliye iletilir, genellikle 3 iş günü içinde dönüş yapılır.' })
    ]);
  }
  const durumlar = {
    sahiplendirildi: ['basari', 'kalp', 'Yuvasını buldu', 'Bu dostumuz yeni ailesiyle birlikte. Desteğin için teşekkürler!'],
    tedavide: ['bilgi', 'bilgi', 'Tedavisi sürüyor', 'Tedavisi tamamlanınca sahiplenme başvurularına açılacak.']
  };
  const [tur, ikonAdi, baslik, aciklama] = durumlar[h.durum] || durumlar.tedavide;
  return el('div', { class: 'cta-karti' }, [
    el('div', { class: `uyari-kutusu uyari-kutusu-${tur}`, role: 'status' }, [
      ikon(ikonAdi),
      el('div', { class: 'uyari-kutusu-metin' }, [el('strong', { text: baslik }), el('p', { text: aciklama })])
    ]),
    el('a', { class: 'btn btn-cerceve btn-blok', href: '/hayvanlar.html', style: { marginTop: '12px' }, text: 'Diğer dostlara göz at' })
  ]);
}

function kurumKarti(h) {
  const k = h.kurum;
  if (!k) return null;
  const tel = telLinki(k.telefon);
  return el('section', { class: 'kurum-karti detay-kurum', 'aria-labelledby': 'kurum-baslik' }, [
    el('div', { class: 'kurum-karti-ust' }, [
      el('img', { class: 'kurum-karti-logo', src: KURUM_YOK, alt: '', width: '56', height: '56' }),
      el('div', {}, [
        el('p', { class: 'metin-ikincil metin-kucuk', style: { margin: 0 }, text: 'Bulunduğu kurum' }),
        el('h2', { class: 'kurum-karti-ad', id: 'kurum-baslik', text: k.ad }),
        etiketRozeti('kurum_tur', k.tur)
      ])
    ]),
    el('ul', { class: 'kurum-karti-bilgi' }, [
      k.adres && el('li', {}, [ikon('konum'), k.adres]),
      k.telefon && el('li', {}, [ikon('telefon'), tel ? el('a', { href: tel, text: k.telefon }) : k.telefon]),
      k.email && el('li', {}, [ikon('belge'), el('a', { href: `mailto:${k.email}`, text: k.email })])
    ]),
    el('div', { class: 'kurum-karti-alt' }, [
      el('a', { href: `/kurum.html?id=${encodeURIComponent(k.id)}` }, ['Kurum sayfasına git'])
    ])
  ]);
}

// -----------------------------------------------------------------------------
// Aşı karnesi
// -----------------------------------------------------------------------------
async function asiKarnesiniYukle(h) {
  const icerik = document.getElementById('karne-icerik');
  icerikDegistir(icerik, [
    el('div', { class: 'iskelet iskelet-metin' }), el('div', { class: 'iskelet iskelet-metin' }), el('div', { class: 'iskelet iskelet-metin iskelet-metin-kisa' }),
    el('span', { class: 'gizli-erisim', role: 'status', text: 'Aşı karnesi yükleniyor…' })
  ]);
  try {
    const karne = await apiGet(`/api/animals/${h.id}/vaccinations`);
    asiTablosu(icerik, h, karne);
  } catch (hata) {
    hataGoster(icerik, hataMetni(hata), () => asiKarnesiniYukle(h));
  }
}

function asiTablosu(icerik, h, karne) {
  const tablo = asiKarnesiTablosu(h.ad, karne);
  if (!tablo) {
    bosDurumGoster(icerik, { baslik: 'Henüz aşı kaydı yok', aciklama: `${h.ad} için girilmiş aşı kaydı bulunmuyor.`, ikon: 'asi' });
    return;
  }
  icerikDegistir(icerik, tablo);
}
