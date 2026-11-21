// =============================================================================
// sayfalar/panel-basvurular.js – Sahiplenme başvuruları (basvurular.png)
// Sekmeler: Bekleyen / Onaylanan / Reddedilen (sayılarıyla). Detay modalı,
// not yazılan "Reddet" modalı, uyarılı "Onayla". Onaylananlarda randevu durumu ve
// "Teslim et" (sahiplendirmeyi tamamlar). ?hayvan=<id> ile tek hayvanın başvuruları.
// =============================================================================
import { el, ikon, icerikDegistir, telLinki, sayiParametresi } from '../dom.js';
import { apiGet, apiPut, apiPost, ApiHatasi } from '../api.js';
import { panelSayfasi } from '../panel.js';
import {
  yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, toast, onayIste, modalAc, butonBekle,
  formHatalariniGoster, etiket, etiketRozeti, kisaTarih, tarihFormatla, saatFormatla
} from '../ui.js';
import { FOTOGRAF_YOK, kapakUrl } from '../kartlar.js';

const SEKMELER = {
  bekleyen: { durumlar: ['beklemede'], ad: 'Bekleyen' },
  onaylanan: { durumlar: ['onaylandi'], ad: 'Onaylanan' },
  reddedilen: { durumlar: ['reddedildi'], ad: 'Reddedilen' }
};
const hayvanFiltresi = sayiParametresi('hayvan');
const teslimEdilenler = new Set(); // bu oturumda teslim edilen başvuru kimlikleri
const liste = document.getElementById('basvuru-listesi');
let sayfa = null;
let basvurular = [];
let aktifSekme = Object.keys(SEKMELER).includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'bekleyen';

baslat();

async function baslat() {
  sayfa = await panelSayfasi({ baslik: 'Sahiplenme başvuruları', menu: 'basvurular', kurumDegisince: yukle });
  if (!sayfa) return;
  const cubuk = document.getElementById('sekme-cubugu');
  cubuk.hidden = false;
  const sekmeler = document.getElementById('basvuru-sekmeleri');
  sekmeler.addEventListener('click', (olay) => {
    const dugme = olay.target.closest('[data-sekme]');
    if (dugme) sekmeSec(dugme.dataset.sekme);
  });
  sekmeler.addEventListener('keydown', (olay) => {
    const adlar = Object.keys(SEKMELER);
    const sira = adlar.indexOf(aktifSekme);
    const yeni = olay.key === 'ArrowRight' ? adlar[(sira + 1) % 3] : olay.key === 'ArrowLeft' ? adlar[(sira + 2) % 3] : null;
    if (!yeni) return;
    olay.preventDefault();
    sekmeSec(yeni);
    document.getElementById(`sekme-${yeni}`).focus();
  });
  sekmeleriGuncelle();
  yukle();
}

function sekmeSec(ad) {
  aktifSekme = ad;
  window.history.replaceState(null, '', `#${ad}`);
  sekmeleriGuncelle();
  ciz();
}

function sekmeleriGuncelle() {
  for (const [ad, s] of Object.entries(SEKMELER)) {
    const dugme = document.getElementById(`sekme-${ad}`);
    const sayi = basvurular.filter((b) => s.durumlar.includes(b.durum)).length;
    dugme.textContent = basvurular.length || ad !== 'bekleyen' ? `${s.ad} (${sayi})` : s.ad;
    dugme.setAttribute('aria-selected', String(ad === aktifSekme));
    dugme.tabIndex = ad === aktifSekme ? 0 : -1;
  }
  liste.setAttribute('aria-labelledby', `sekme-${aktifSekme}`);
}

async function yukle() {
  yukleniyorGoster(liste, 3, 'liste');
  try {
    const [liste2, randevular] = await Promise.all([
      apiGet('/api/applications', { kurum_id: sayfa.kurum.kurum_id, animal_id: hayvanFiltresi }),
      apiGet('/api/appointments').catch(() => [])
    ]);
    // Başvuru yanıtında randevu yok; başvuru kimliğiyle eşleştirilir
    for (const b of liste2) {
      const r = randevular.find((x) => x.basvuru_id === b.id);
      b.randevu = r ? { ...r, tarih: r.teslim_saati?.tarih, baslangic_saati: r.teslim_saati?.baslangic_saati } : null;
    }
    basvurular = liste2;
    sekmeleriGuncelle();
    ciz();
  } catch (hata) {
    hataGoster(liste, hataMetni(hata), yukle);
  }
}

function ciz() {
  const gosterilecek = basvurular.filter((b) => SEKMELER[aktifSekme].durumlar.includes(b.durum));
  if (!gosterilecek.length) {
    const metinler = {
      bekleyen: ['Bekleyen başvuru yok', 'Yeni başvurular geldiğinde burada göreceksin.'],
      onaylanan: ['Onaylanmış başvuru yok', 'Onayladığın başvurular ve randevu durumları burada görünür.'],
      reddedilen: ['Reddedilen başvuru yok', '']
    };
    bosDurumGoster(liste, { baslik: metinler[aktifSekme][0], aciklama: metinler[aktifSekme][1], ikon: 'belge' });
    return;
  }
  icerikDegistir(liste, el('ul', { class: 'hesap-listesi' }, gosterilecek.map((b) => el('li', {}, [basvuruKarti(b)]))));
}

function ozetMetni(b) {
  const deneyim = (b.onceki_deneyim || '').trim();
  return [
    b.ev_tipi,
    deneyim ? `Deneyim: ${deneyim.length > 60 ? `${deneyim.slice(0, 60)}…` : deneyim}` : 'Deneyim belirtilmedi'
  ].filter(Boolean).join(' · ');
}

function teslimEdildiMi(b) {
  return b.randevu?.durum === 'tamamlandi' || teslimEdilenler.has(b.id);
}

function randevuMetni(b) {
  const r = b.randevu;
  if (teslimEdildiMi(b)) return ['basari', r?.tarih ? `Teslim edildi (randevu: ${tarihFormatla(r.tarih)})` : 'Teslim edildi'];
  if (r?.durum === 'planlandi') return ['bilgi', `Randevu: ${tarihFormatla(r.tarih)} ${saatFormatla(r.baslangic_saati)}`];
  if (r?.durum === 'iptal') return ['uyari', `${tarihFormatla(r.tarih)} randevusu iptal edildi · yeni saat bekleniyor`];
  return ['bilgi', 'Başvuranın teslim saati seçmesi bekleniyor'];
}

function basvuruKarti(b) {
  const basvuran = b.basvuran?.ad_soyad || 'Başvuran';
  const detay = el('button', { class: 'btn btn-cerceve', type: 'button' }, ['Detay', el('span', { class: 'gizli-erisim', text: `: ${basvuran}` })]);
  detay.addEventListener('click', () => detayAc(b));

  let alt;
  if (b.durum === 'beklemede') {
    const reddet = el('button', { class: 'btn btn-tehlike', type: 'button' }, ['Reddet', el('span', { class: 'gizli-erisim', text: `: ${basvuran}` })]);
    const onayla = el('button', { class: 'btn btn-ana', type: 'button' }, ['Onayla', el('span', { class: 'gizli-erisim', text: `: ${basvuran}` })]);
    reddet.addEventListener('click', () => reddetAc(b));
    onayla.addEventListener('click', () => onaylaIste(b, onayla));
    alt = el('div', { class: 'btn-grup' }, [detay, reddet, onayla]);
  } else if (b.durum === 'onaylandi') {
    const [tur, metin] = randevuMetni(b);
    let teslim = null;
    if (!teslimEdildiMi(b)) {
      teslim = el('button', { class: 'btn btn-ana', type: 'button' }, ['Teslim et', el('span', { class: 'gizli-erisim', text: `: ${b.hayvan?.ad || ''}, ${basvuran}` })]);
      teslim.addEventListener('click', () => teslimAc(b));
    }
    alt = el('div', { class: 'yigin', style: { gap: '10px' } }, [
      el('div', { class: `uyari-kutusu uyari-kutusu-${tur}` }, [ikon('takvim'), el('div', { class: 'uyari-kutusu-metin' }, [el('p', { text: metin })])]),
      el('div', { class: 'btn-grup' }, [detay, teslim])
    ]);
  } else {
    alt = el('div', { class: 'yigin', style: { gap: '10px' } }, [
      b.degerlendirme_notu && el('p', { class: 'metin-kucuk metin-ikincil', style: { margin: 0 }, text: `Not: ${b.degerlendirme_notu}` }),
      el('div', {}, [detay])
    ]);
  }

  return el('article', { class: 'kart hesap-karti', style: { gap: '12px' } }, [
    el('div', { class: 'hesap-karti-ust' }, [
      el('div', { class: 'ozet-hayvan' }, [
        el('img', { src: kapakUrl(b.hayvan) || FOTOGRAF_YOK, alt: '', width: '64', height: '64' }),
        el('div', { class: 'ozet-hayvan-metin' }, [
          el('span', { class: 'ozet-hayvan-ad', style: { fontFamily: 'var(--font-govde)', fontWeight: 600 }, text: basvuran }),
          el('span', { class: 'ozet-hayvan-alt', text: `${b.hayvan?.ad || '—'} için · ${kisaTarih(b.basvuru_tarihi)}` })
        ])
      ]),
      b.durum !== 'beklemede' && etiketRozeti('basvuru_durum', b.durum)
    ]),
    el('p', { class: 'basvuru-ozeti', text: ozetMetni(b) }),
    alt
  ]);
}

// -----------------------------------------------------------------------------
// Detay modalı
// -----------------------------------------------------------------------------
async function detayAc(ozet) {
  let b = ozet;
  try {
    b = await apiGet(`/api/applications/${ozet.id}`);
  } catch (hata) {
    toast(`Güncel detay alınamadı: ${hataMetni(hata)}`, 'uyari');
  }
  const k = b.basvuran || {};
  const tel = telLinki(k.telefon);
  const hucre = (baslik, deger) => el('div', {}, [el('dt', { text: baslik }), el('dd', {}, [deger || '—'])]);
  const icerik = [
    el('dl', { class: 'bilgi-tablosu' }, [
      hucre('Başvuran', k.ad_soyad),
      hucre('Telefon', tel ? el('a', { href: tel, text: k.telefon }) : k.telefon),
      el('div', { style: { gridColumn: '1 / -1' } }, [el('dt', { text: 'E-posta' }), el('dd', {}, [k.email ? el('a', { href: `mailto:${k.email}`, text: k.email }) : '—'])]),
      hucre('Hayvan', b.hayvan ? el('a', { href: `/hayvan.html?id=${b.hayvan.id}`, target: '_blank', rel: 'noopener', text: b.hayvan.ad }) : '—'),
      hucre('Başvuru tarihi', tarihFormatla(b.basvuru_tarihi)),
      hucre('Ev tipi', b.ev_tipi)
    ]),
    el('h3', { class: 'alt-baslik', text: 'Önceki deneyim' }),
    el('p', { class: 'detay-metin', text: b.onceki_deneyim || 'Belirtilmedi' }),
    el('h3', { class: 'alt-baslik', text: 'Neden sahiplenmek istiyor?' }),
    el('p', { class: 'detay-metin', text: b.aciklama || '—' }),
    b.durum !== 'beklemede' && el('p', { class: 'metin-kucuk', style: { marginTop: '12px' } }, [
      'Durum: ', etiketRozeti('basvuru_durum', b.durum),
      b.degerlendirme_notu ? ` · Not: ${b.degerlendirme_notu}` : ''
    ])
  ];
  let alt = null;
  let modal;
  if (b.durum === 'beklemede') {
    const reddet = el('button', { class: 'btn btn-tehlike', type: 'button', text: 'Reddet' });
    const onayla = el('button', { class: 'btn btn-ana', type: 'button', text: 'Onayla' });
    reddet.addEventListener('click', () => { modal.kapat(); reddetAc(b); });
    onayla.addEventListener('click', () => { modal.kapat(); onaylaIste(b, null); });
    alt = [reddet, onayla];
  }
  modal = modalAc(icerik, { baslik: 'Başvuru detayı', genis: true, alt });
}

// -----------------------------------------------------------------------------
// Onayla / Reddet
// -----------------------------------------------------------------------------
async function onaylaIste(b, dugme) {
  const diger = basvurular.filter((x) => x.hayvan_id === b.hayvan_id && x.id !== b.id && x.durum === 'beklemede').length;
  const onay = await onayIste(`${b.basvuran?.ad_soyad || 'Başvuranın'} ${b.hayvan?.ad || 'hayvan'} için yaptığı başvuru onaylanacak.`, {
    baslik: 'Başvuruyu onayla',
    onayMetni: 'Onayla',
    uyari: `Hayvan "sahiplendirildi" olarak işaretlenecek ve bu hayvana ait diğer bekleyen başvurular otomatik reddedilecek.${diger ? ` (${diger} başvuru)` : ''}`
  });
  if (!onay) return;
  const islem = async () => {
    try {
      await apiPut(`/api/applications/${b.id}/onayla`);
      const ek = diger ? ` ${diger} başvuru otomatik reddedildi.` : '';
      toast(`Başvuru onaylandı; ${b.hayvan?.ad || 'hayvan'} sahiplendirildi olarak işaretlendi.${ek} Başvuran artık teslim saati seçebilir.`, 'basari', 7000);
      await yukle();
    } catch (hata) {
      toast(hataMetni(hata), 'hata');
    }
  };
  if (dugme) await butonBekle(dugme, islem);
  else await islem();
}

function reddetAc(b) {
  const formId = `reddet-${b.id}`;
  const form = el('form', { id: formId, novalidate: true }, [
    el('p', { text: `${b.basvuran?.ad_soyad || 'Başvuranın'} ${b.hayvan?.ad || 'hayvan'} için yaptığı başvuru reddedilecek.` }),
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-not` }, ['Başvurana not ', el('span', { class: 'istege-bagli', text: '(isteğe bağlı)' })]),
      el('textarea', { id: `${formId}-not`, name: 'degerlendirme_notu', rows: '3', maxlength: '1000', placeholder: 'Ör. Bahçeli bir ev ihtiyacı var.', 'aria-describedby': `${formId}-yardim` }),
      el('p', { class: 'form-yardim', id: `${formId}-yardim`, text: 'Başvuran bu notu Hesabım sayfasında görür. Kibar ve kısa tut.' })
    ])
  ]);
  const vazgec = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Vazgeç' });
  const reddet = el('button', { class: 'btn btn-tehlike-dolu', type: 'submit', form: formId, text: 'Reddet' });
  const modal = modalAc(form, { baslik: 'Başvuruyu reddet', alt: [vazgec, reddet] });
  vazgec.addEventListener('click', modal.kapat);
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    await butonBekle(reddet, async () => {
      try {
        await apiPut(`/api/applications/${b.id}/reddet`, { degerlendirme_notu: form.elements.degerlendirme_notu.value.trim() });
        modal.kapat();
        toast('Başvuru reddedildi.', 'bilgi');
        await yukle();
      } catch (hata) {
        if (hata instanceof ApiHatasi && hata.durum === 400) formHatalariniGoster(form, hata.alanlar, hata.message);
        else formHatalariniGoster(form, {}, hataMetni(hata));
      }
    });
  });
}

// -----------------------------------------------------------------------------
// Teslim et (sahiplendirmeyi tamamlar; planlı randevu varsa tamamlandı yapılır)
// -----------------------------------------------------------------------------
function teslimAc(b) {
  const formId = `teslim-${b.id}`;
  const form = el('form', { id: formId, novalidate: true }, [
    el('p', { text: `${b.hayvan?.ad || 'Hayvan'}, ${b.basvuran?.ad_soyad || 'başvurana'} teslim edilecek. Kimliğini kontrol etmeyi unutma.` }),
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-not` }, ['Teslim notu ', el('span', { class: 'istege-bagli', text: '(isteğe bağlı)' })]),
      el('textarea', { id: `${formId}-not`, name: 'teslim_notu', rows: '2', maxlength: '1000', placeholder: 'Ör. Mama ve kum örneğiyle birlikte teslim edildi.' })
    ])
  ]);
  const vazgec = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Vazgeç' });
  const onayla = el('button', { class: 'btn btn-ana', type: 'submit', form: formId, text: 'Teslim edildi' });
  const modal = modalAc(form, { baslik: 'Teslimi onayla', alt: [vazgec, onayla] });
  vazgec.addEventListener('click', modal.kapat);
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    await butonBekle(onayla, async () => {
      try {
        await apiPost('/api/adoptions/complete', { application_id: b.id, teslim_notu: form.elements.teslim_notu.value.trim() || null });
        teslimEdilenler.add(b.id);
        modal.kapat();
        toast(`${b.hayvan?.ad || 'Hayvan'} teslim edildi. Yeni yuvasında mutlu olsun!`, 'basari', 6000);
        await yukle();
      } catch (hata) {
        if (hata instanceof ApiHatasi && hata.durum === 409) {
          // Sahiplendirme kaydı zaten varsa kart "teslim edildi" olarak güncellenir
          teslimEdilenler.add(b.id);
          modal.kapat();
          toast(hata.message, 'bilgi', 6000);
          ciz();
        } else {
          formHatalariniGoster(form, {}, hataMetni(hata));
        }
      }
    });
  });
}
