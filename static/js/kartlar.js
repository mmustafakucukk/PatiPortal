// =============================================================================
// kartlar.js – Birden fazla sayfada kullanılan kart ve liste parçaları
// (hayvan kartı, ihtiyaç kartı, kurum kartı, sayfalama, sayfa başlığı)
// =============================================================================
import { el, ikon } from './dom.js';
import { etiket, etiketRozeti, yasMetni, ihtiyacOranlari, sayiFormatla, tarihFormatla, asiDurumu } from './ui.js';

export const FOTOGRAF_YOK = '/static/img/fotograf-yok.svg';
/** Küçük görseller (≤ 72px) için yazısız yer tutucu. */
export const FOTOGRAF_YOK_KUCUK = '/static/img/fotograf-yok-kucuk.svg';
export const KURUM_YOK = '/static/img/kurum-yok.svg';

/** Tür adı: liste/detayda { id, ad }, başka kayıtların içinde düz metin gelir. */
export const turAdi = (h) => (h?.tur && typeof h.tur === 'object' ? h.tur.ad : h?.tur) || '';
/** Kapak fotoğrafı adresi ('kucuk' | 'buyuk'); yoksa null. */
export const kapakUrl = (h, boyut = 'kucuk') => h?.kapak_fotografi?.[`url_${boyut}`] || null;
/** Hayvanın kurum adı. */
export const kurumAdi = (h) => h?.kurum?.ad || '';

/** Hayvanın kısa bilgi satırı: "Kedi · Dişi · 2 yaş · Kısırlaştırılmış" */
export function hayvanBilgiMetni(h, { kisir = true } = {}) {
  return [
    turAdi(h),
    h.cinsiyet && h.cinsiyet !== 'bilinmiyor' ? etiket('cinsiyet', h.cinsiyet) : null,
    h.dogum_tarihi ? yasMetni(h.dogum_tarihi) : null,
    kisir && h.kisirlastirildi ? 'Kısırlaştırılmış' : null
  ].filter(Boolean).join(' · ');
}

/** Aşı durumu rozeti (API asilari_tam göndermezse rozet gösterilmez). */
export function asiRozeti(h, ekSinif = '') {
  if (h.asilari_tam === undefined || h.asilari_tam === null) return null;
  return h.asilari_tam
    ? el('span', { class: ['rozet', 'rozet-basari', ekSinif], text: 'Aşıları tam' })
    : el('span', { class: ['rozet', 'rozet-uyari', ekSinif], text: 'Aşı bekliyor' });
}

/**
 * Hayvan kartı (bağlantı).
 *   hayvanKarti(h, { kurumGoster: false })
 */
export function hayvanKarti(h, { kurumGoster = true, kisir = true } = {}) {
  const surecte = h.durum && h.durum !== 'barinakta';
  const foto = kapakUrl(h);
  return el('a', { class: ['hayvan-karti', surecte && 'hayvan-karti-soluk'], href: `/hayvan.html?id=${encodeURIComponent(h.id)}` }, [
    el('div', { class: 'hayvan-karti-foto' }, [
      el('img', {
        src: foto || FOTOGRAF_YOK,
        alt: foto ? `${h.ad} fotoğrafı` : '',
        loading: 'lazy', decoding: 'async', width: '600', height: '400'
      }),
      surecte && etiketRozeti('durum', h.durum)
    ]),
    el('div', { class: 'hayvan-karti-govde' }, [
      el('div', { class: 'hayvan-karti-ust' }, [
        el('h3', { class: 'hayvan-karti-ad', text: h.ad }),
        asiRozeti(h)
      ]),
      el('span', { class: 'hayvan-karti-bilgi', text: hayvanBilgiMetni(h, { kisir }) || '—' }),
      kurumGoster && kurumAdi(h) && el('span', { class: 'hayvan-karti-kurum' }, [ikon('bina'), kurumAdi(h)])
    ])
  ]);
}

/**
 * İhtiyaç kartı. Söz verilen miktarı gösteren ilerleme çubuğu.
 *   ihtiyacKarti(n, { kurumGoster: true })
 *   ihtiyacKarti(n, { destekTikla: (n) => modalAc(...) })  → bağlantı yerine buton
 */
export function ihtiyacKarti(n, { kurumGoster = true, destekButonu = true, destekTikla = null } = {}) {
  const o = ihtiyacOranlari(n);
  const karsilandi = n.durum === 'karsilandi';
  const birim = n.birim || '';
  const metinler = [`${sayiFormatla(o.soz)} / ${sayiFormatla(o.miktar)} ${birim} için söz verildi`];
  if (o.kalan > 0 && !karsilandi) metinler.push(`${sayiFormatla(o.kalan)} ${birim} eksik`);

  return el('article', { class: ['ihtiyac-karti', karsilandi && 'ihtiyac-karti-karsilandi'] }, [
    el('div', { class: 'ihtiyac-karti-ust' }, [
      el('span', { class: 'ihtiyac-karti-tur', text: etiket('ihtiyac_tur', n.tur) }),
      karsilandi ? etiketRozeti('ihtiyac_durum', 'karsilandi') : etiketRozeti('aciliyet', n.aciliyet)
    ]),
    el('h3', { class: 'ihtiyac-karti-baslik', text: n.baslik }),
    kurumGoster && n.kurum?.ad && el('a', { class: 'ihtiyac-karti-kurum', href: `/kurum.html?id=${encodeURIComponent(n.kurum.id)}` }, [ikon('bina'), n.kurum.ad]),
    el('div', {
      class: ['ilerleme', (karsilandi || o.kalan === 0) && o.miktar > 0 && 'ilerleme-tamam'],
      role: 'progressbar',
      'aria-label': `${n.baslik} için söz verilen miktar`,
      'aria-valuemin': '0', 'aria-valuemax': String(o.miktar), 'aria-valuenow': String(Math.min(o.soz, o.miktar)),
      'aria-valuetext': metinler.join(', ')
    }, [
      el('span', { class: 'ilerleme-teslim', style: { width: `${o.sozOrani}%` } })
    ]),
    el('p', { class: 'ilerleme-metin', text: metinler.join(' · ') }),
    destekButonu && !karsilandi && (o.kalan > 0
      ? (destekTikla
        ? el('button', { class: 'btn btn-ana', type: 'button', onClick: () => destekTikla(n) }, ['Destek olacağım', el('span', { class: 'gizli-erisim', text: `: ${n.baslik}` })])
        : el('a', { class: 'btn btn-ana', href: `/ihtiyaclar.html?destek=${encodeURIComponent(n.id)}` }, ['Destek olacağım', el('span', { class: 'gizli-erisim', text: `: ${n.baslik}` })]))
      : el('p', { class: 'ilerleme-metin', text: 'Gereken miktarın tamamı için söz verildi, teşekkürler!' }))
  ]);
}

/**
 * Küçük hayvan özeti (başvuru formu, hesabım kartları):
 *   [foto] Pamuk · Kedi · Dişi · 2 yaş · Merkez Barınak
 */
export function hayvanOzetSatiri(h, { link = true, ek = null } = {}) {
  const ad = link
    ? el('a', { href: `/hayvan.html?id=${encodeURIComponent(h.id)}`, text: h.ad })
    : h.ad;
  return el('div', { class: 'ozet-hayvan' }, [
    el('img', { src: kapakUrl(h) || FOTOGRAF_YOK_KUCUK, alt: '', width: '72', height: '72' }),
    el('div', { class: 'ozet-hayvan-metin' }, [
      el('span', { class: 'ozet-hayvan-ad' }, [ad]),
      el('span', { class: 'ozet-hayvan-alt', text: [hayvanBilgiMetni(h, { kisir: false }) || turAdi(h), kurumAdi(h)].filter(Boolean).join(' · ') }),
      ek
    ])
  ]);
}

/**
 * Aşı karnesi tablosu. Kayıt yoksa null döner.
 *   asiKarnesiTablosu('Pamuk', karne)   // karne: GET /api/animals/<id>/vaccinations yanıtı
 *   karne = { asilar: [...], eksik_zorunlu_asilar: [{ id, ad }] }
 */
export function asiKarnesiTablosu(hayvanAdi, karne) {
  const asilar = [...(karne?.asilar || [])].sort((a, b) => a.uygulama_tarihi.localeCompare(b.uygulama_tarihi) || a.id - b.id);
  const eksikler = karne?.eksik_zorunlu_asilar || [];
  if (!asilar.length && !eksikler.length) return null;

  const satirlar = [
    ...asilar.map((a) => el('tr', {}, [
      el('td', { class: 'tablo-baslik-hucre', 'data-etiket': 'Aşı', text: a.asi_turu?.ad || '' }),
      el('td', { 'data-etiket': 'Yapıldığı tarih', text: tarihFormatla(a.uygulama_tarihi) }),
      el('td', { 'data-etiket': 'Uygulayan kurum', text: a.uygulayan_kurum?.ad || '—' }),
      el('td', { 'data-etiket': 'Sonraki doz', text: a.sonraki_tarih ? tarihFormatla(a.sonraki_tarih) : '—' }),
      el('td', { 'data-etiket': 'Durum' }, [etiketRozeti('asi_durum', a.durum || asiDurumu(a.sonraki_tarih))]),
      el('td', { 'data-etiket': 'Belge' }, [a.belge_url
        ? el('a', { href: a.belge_url, target: '_blank', rel: 'noopener noreferrer' }, ['Belgeyi gör', el('span', { class: 'gizli-erisim', text: ` (${a.asi_turu?.ad || 'aşı'}, yeni sekmede açılır)` })])
        : '—'])
    ])),
    ...eksikler.map((e) => el('tr', { class: 'soluk' }, [
      el('td', { class: 'tablo-baslik-hucre', 'data-etiket': 'Aşı', text: e.ad }),
      el('td', { 'data-etiket': 'Yapıldığı tarih', text: '—' }),
      el('td', { 'data-etiket': 'Uygulayan kurum', text: '—' }),
      el('td', { 'data-etiket': 'Sonraki doz', text: '—' }),
      el('td', { 'data-etiket': 'Durum' }, [etiketRozeti('asi_durum', 'yapilmadi')]),
      el('td', { 'data-etiket': 'Belge', text: '—' })
    ]))
  ];

  return el('div', { class: 'tablo-kap' }, [
    el('table', { class: 'tablo' }, [
      el('caption', { class: 'gizli-erisim', text: `${hayvanAdi} için aşı karnesi` }),
      el('thead', {}, [el('tr', {}, [
        el('th', { scope: 'col', text: 'Aşı' }),
        el('th', { scope: 'col', text: 'Yapıldığı tarih' }),
        el('th', { scope: 'col', text: 'Uygulayan kurum' }),
        el('th', { scope: 'col', text: 'Sonraki doz' }),
        el('th', { scope: 'col', text: 'Durum' }),
        el('th', { scope: 'col' }, [el('span', { class: 'gizli-erisim', text: 'Belge' })])
      ])]),
      el('tbody', {}, satirlar)
    ])
  ]);
}

/**
 * Karnedeki yaklaşan veya gecikmiş dozlar (backend durumuna göre).
 *   dikkatGerekenAsilar(karne) → [{ asi_turu, sonraki_tarih, durum, ... }]
 */
export function dikkatGerekenAsilar(karne) {
  return (karne?.asilar || [])
    .filter((a) => a.sonraki_tarih && (a.durum === 'yaklasiyor' || a.durum === 'gecikti'))
    .sort((a, b) => a.sonraki_tarih.localeCompare(b.sonraki_tarih));
}

/** Tam sayfa "bulunamadı / erişilemez" mesajı. */
export function sayfaMesaji({ baslik, aciklama, ikonAdi = 'pati', eylemler = [], tur = '' }) {
  return el('div', { class: ['bos-durum', tur === 'hata' && 'bos-durum-hata'] }, [
    el('span', { class: 'bos-durum-ikon' }, [ikon(ikonAdi)]),
    el('h1', { style: { fontSize: '22px', margin: 0 }, text: baslik }),
    aciklama && el('p', { text: aciklama }),
    eylemler.length > 0 && el('div', { class: 'satir', style: { justifyContent: 'center', marginTop: '8px' } }, eylemler)
  ]);
}

/** Kurum kartı (bağlantı). */
export function kurumKarti(k) {
  return el('a', { class: 'kurum-karti', href: `/kurum.html?id=${encodeURIComponent(k.id)}` }, [
    el('div', { class: 'kurum-karti-ust' }, [
      el('img', { class: 'kurum-karti-logo', src: KURUM_YOK, alt: '', width: '56', height: '56' }),
      el('div', {}, [
        el('h3', { class: 'kurum-karti-ad', text: k.ad }),
        etiketRozeti('kurum_tur', k.tur)
      ])
    ]),
    el('ul', { class: 'kurum-karti-bilgi' }, [
      k.adres && el('li', {}, [ikon('konum'), k.adres]),
      k.telefon && el('li', {}, [ikon('telefon'), k.telefon])
    ])
  ]);
}

/**
 * Sayfalama: Önceki 1 2 … 8 Sonraki
 *   sayfalama(3, 8, (sayfa) => yukle(sayfa))
 */
export function sayfalama(sayfa, sayfaSayisi, sec, etiketMetni = 'Sayfalar') {
  if (sayfaSayisi <= 1) return null;
  const numaralar = new Set([1, sayfaSayisi, sayfa - 1, sayfa, sayfa + 1]);
  const sirali = [...numaralar].filter((n) => n >= 1 && n <= sayfaSayisi).sort((a, b) => a - b);
  const ogeler = [];
  const dugme = (metin, hedef, ozellikler = {}) => el('button', {
    type: 'button', ...ozellikler,
    on: { click: () => sec(hedef) }
  }, [metin]);

  ogeler.push(el('li', {}, [dugme('Önceki', sayfa - 1, { disabled: sayfa <= 1, 'aria-label': 'Önceki sayfa' })]));
  let onceki = 0;
  for (const n of sirali) {
    if (n - onceki > 1) ogeler.push(el('li', {}, [el('span', { class: 'sayfalama-bosluk', 'aria-hidden': 'true', text: '…' })]));
    ogeler.push(el('li', {}, [dugme(String(n), n, {
      'aria-current': n === sayfa ? 'page' : null,
      'aria-label': `Sayfa ${n}`
    })]));
    onceki = n;
  }
  ogeler.push(el('li', {}, [dugme('Sonraki', sayfa + 1, { disabled: sayfa >= sayfaSayisi, 'aria-label': 'Sonraki sayfa' })]));
  return el('nav', { 'aria-label': etiketMetni }, [el('ul', { class: 'sayfalama' }, ogeler)]);
}

/** Ekmek kırıntısı: ekmekKirintisi([['Anasayfa', '/index.html'], ['Pamuk']]) */
export function ekmekKirintisi(parcalar) {
  return el('nav', { class: 'ekmek', 'aria-label': 'Konum' }, [
    el('ol', {}, parcalar.map(([metin, href], i) => el('li', {}, [
      href && i < parcalar.length - 1
        ? el('a', { href, text: metin })
        : el('span', { 'aria-current': 'page', text: metin })
    ])))
  ]);
}

/** Uyarı kutusu: uyariKutusu('basari', 'onay', 'Başlık', 'Açıklama') */
export function uyariKutusu(tur, ikonAdi, baslik, metin) {
  return el('div', { class: `uyari-kutusu uyari-kutusu-${tur}` }, [
    ikon(ikonAdi),
    el('div', { class: 'uyari-kutusu-metin' }, [baslik && el('strong', { text: baslik }), metin && el('p', { text: metin })])
  ]);
}

/**
 * API randevusunu düzleştirir: teslim saatinin tarih/saat alanları üst düzeye taşınır.
 *   { ...randevu, saat_id, tarih, baslangic_saati, bitis_saati, kurum_id }
 */
export function randevuOzeti(r) {
  if (!r) return null;
  return {
    ...r,
    saat_id: r.teslim_saati_id,
    tarih: r.teslim_saati?.tarih,
    baslangic_saati: r.teslim_saati?.baslangic_saati,
    bitis_saati: r.teslim_saati?.bitis_saati,
    kurum_id: r.teslim_saati?.kurum_id ?? r.hayvan?.kurum?.id
  };
}
