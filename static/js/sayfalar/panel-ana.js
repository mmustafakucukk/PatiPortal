// =============================================================================
// sayfalar/panel-ana.js – Görevli paneli ana ekranı
// Özet kutuları, gecikmiş aşı uyarısı, bugünkü teslimler, bu hafta yapılacak aşılar.
// Not: /api/stats ve aşı listeleri kurum filtresi almaz; görevlinin tüm kurumlarını
// kapsar. Bugünkü teslimler aktif kuruma göre istemcide süzülür.
// =============================================================================
import { el, ikon, icerikDegistir, telLinki } from '../dom.js';
import { apiGet } from '../api.js';
import { gorevliGerekli } from '../auth.js';
import { aktifKurum, kullaniciKurumlari, KURUM_DEGISTI_OLAYI } from '../kurum.js';
import { panelSelamAlaniniYerlestir, panelMenusunuYerlestir } from '../layout.js';
import {
  yukleniyorGoster, hataGoster, hataMetni, etiketRozeti, saatFormatla, goreceliGun,
  tarihFormatla, gunFarki, bugunIso, sayiFormatla
} from '../ui.js';
import { FOTOGRAF_YOK_KUCUK, kapakUrl } from '../kartlar.js';

const SAYACLAR = [
  { anahtar: 'bekleyen_basvuru', etiket: 'Bekleyen başvuru', sinif: 'sayac-uyari', href: '/panel/basvurular.html' },
  { anahtar: 'bugunku_randevu', etiket: 'Bugünkü randevu', sinif: '', href: '/panel/randevular.html' },
  { anahtar: 'acik_ihtiyac', etiket: 'Açık ihtiyaç', sinif: 'sayac-acil', href: '/panel/ihtiyaclar.html' },
  { anahtar: 'bu_hafta_asisi_gelen', etiket: 'Bu hafta aşı', sinif: 'sayac-bilgi', href: '/panel/asi.html' }
];

let kurum = null;
let cokKurumlu = false;
let kullaniciRol = '';
baslat();

async function baslat() {
  const kullanici = await gorevliGerekli().catch((hata) => {
    hataGoster(document.getElementById('icerik'), hataMetni(hata), () => window.location.reload());
    return null;
  });
  if (!kullanici) return;
  kullaniciRol = kullanici.rol;
  await panelSelamAlaniniYerlestir(kullanici);
  panelMenusunuYerlestir('ana');
  kurum = await aktifKurum();
  if (!kurum) {
    hataGoster(document.getElementById('icerik'), 'Hesabınıza bağlı bir kurum bulunamadı.');
    return;
  }
  cokKurumlu = (await kullaniciKurumlari()).length > 1;
  document.title = `${kurum.ad} – Görevli paneli – PatiPortal`;
  window.addEventListener(KURUM_DEGISTI_OLAYI, (olay) => {
    kurum = olay.detail;
    document.title = `${kurum.ad} – Görevli paneli – PatiPortal`;
    yukle();
  });
  yukle();
}

function yukle() {
  sayaclariYukle();
  gecikmisleriYukle();
  teslimleriYukle();
  asilariYukle();
}

async function sayaclariYukle() {
  const kap = document.getElementById('sayaclar');
  icerikDegistir(kap, SAYACLAR.map(() => el('div', { class: 'sayac', 'aria-hidden': 'true' }, [
    el('span', { class: 'iskelet', style: { width: '44px', height: '34px' } }),
    el('span', { class: 'iskelet iskelet-metin' })
  ])));
  try {
    const [istatistik, randevular] = await Promise.all([
      apiGet('/api/stats'),
      apiGet('/api/appointments', { durum: 'planlandi' })
    ]);
    const bugun = bugunIso();
    const veri = {
      ...istatistik,
      bugunku_randevu: randevular.filter((r) => r.teslim_saati?.tarih === bugun).length
    };
    icerikDegistir(kap, [
      ...SAYACLAR.map((s) => el('a', { class: ['sayac', s.sinif], href: s.href }, [
        el('span', { class: 'sayac-deger', text: sayiFormatla(veri[s.anahtar] ?? 0) }),
        el('span', { class: 'sayac-etiket', text: s.etiket })
      ])),
      cokKurumlu && el('p', { class: 'form-yardim', style: { gridColumn: '1 / -1', margin: 0 }, text: kullaniciRol === 'admin' ? 'Sayılar tüm kurumların toplamıdır.' : 'Sayılar görevli olduğun tüm kurumların toplamıdır.' })
    ]);
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), sayaclariYukle);
    kap.firstElementChild.style.gridColumn = '1 / -1';
  }
}

async function gecikmisleriYukle() {
  const kap = document.getElementById('gecikmis-asilar');
  try {
    const liste = await apiGet('/api/vaccinations/gecikmis');
    kap.hidden = liste.length === 0;
    if (!liste.length) return;
    const bugun = bugunIso();
    icerikDegistir(kap, el('div', { class: 'uyari-kutusu uyari-kutusu-acil', role: 'alert' }, [
      ikon('uyari'),
      el('div', { class: 'uyari-kutusu-metin' }, [
        el('strong', { text: `${liste.length} gecikmiş aşı var` }),
        el('ul', { style: { margin: '4px 0 0', paddingLeft: '18px' } }, liste.map((a) => el('li', {}, [
          el('a', { href: `/panel/asi.html?hayvan=${a.hayvan_id}&asi=${a.asi_turu.id}`, text: `${a.hayvan?.ad || 'Hayvan'} – ${a.asi_turu.ad}` }),
          ` (${-gunFarki(bugun, a.sonraki_tarih)} gün gecikti)`
        ])))
      ])
    ]));
  } catch {
    kap.hidden = true; // ana içerik bozulmasın; aşı listesi ayrıca hata gösterir
  }
}

async function teslimleriYukle() {
  const kap = document.getElementById('bugunku-teslimler');
  yukleniyorGoster(kap, 2, 'liste');
  try {
    // Uç nokta tarih/kurum filtresi almaz: bugün ve aktif kurum istemcide süzülür
    const bugun = bugunIso();
    const randevular = await apiGet('/api/appointments');
    const gosterilecek = randevular
      .filter((r) => r.durum !== 'iptal' && r.teslim_saati?.tarih === bugun && r.hayvan?.kurum?.id === kurum.kurum_id)
      .sort((a, b) => a.teslim_saati.baslangic_saati.localeCompare(b.teslim_saati.baslangic_saati));
    if (!gosterilecek.length) {
      icerikDegistir(kap, el('p', { class: 'metin-ikincil', style: { margin: 0 }, text: 'Bugün için teslim randevusu yok.' }));
      return;
    }
    icerikDegistir(kap, el('ul', { class: 'liste' }, gosterilecek.map((r) => {
      const tel = telLinki(r.basvuran?.telefon);
      return el('li', { class: 'liste-satiri', style: r.durum === 'planlandi' ? null : { opacity: 0.6 } }, [
        el('img', { class: 'kucuk-foto', src: kapakUrl(r.hayvan) || FOTOGRAF_YOK_KUCUK, alt: '' }),
        el('span', { class: 'liste-satiri-metin' }, [
          el('span', { class: 'liste-satiri-baslik', text: `${saatFormatla(r.teslim_saati.baslangic_saati)} · ${r.hayvan?.ad || '—'}` }),
          el('span', { class: 'liste-satiri-alt', text: r.basvuran?.ad_soyad || '' })
        ]),
        r.durum === 'planlandi' && tel
          ? el('a', { class: 'btn btn-ikon', href: tel, 'aria-label': `${r.basvuran.ad_soyad} kişisini ara` }, [ikon('telefon')])
          : etiketRozeti('randevu_durum', r.durum)
      ]);
    })));
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), teslimleriYukle);
  }
}

async function asilariYukle() {
  const kap = document.getElementById('haftalik-asilar');
  yukleniyorGoster(kap, 3, 'liste');
  try {
    const asilar = await apiGet('/api/vaccinations/yaklasan', { gun: 7 });
    if (!asilar.length) {
      icerikDegistir(kap, el('p', { class: 'metin-ikincil', style: { margin: 0 }, text: 'Bu hafta yapılacak aşı yok.' }));
      return;
    }
    icerikDegistir(kap, el('ul', { class: 'liste' }, asilar.map((a) => el('li', { class: 'liste-satiri' }, [
      el('img', { class: 'kucuk-foto', src: kapakUrl(a.hayvan) || FOTOGRAF_YOK_KUCUK, alt: '' }),
      el('span', { class: 'liste-satiri-metin' }, [
        el('span', { class: 'liste-satiri-baslik', text: a.hayvan?.ad || '—' }),
        el('span', { class: 'liste-satiri-alt', title: tarihFormatla(a.sonraki_tarih), text: `${a.asi_turu.ad} · ${goreceliGun(a.sonraki_tarih)}` })
      ]),
      el('a', { class: 'btn btn-cerceve-ana', href: `/panel/asi.html?hayvan=${a.hayvan_id}&asi=${a.asi_turu.id}` }, [
        'İşaretle', el('span', { class: 'gizli-erisim', text: `: ${a.hayvan?.ad || ''}, ${a.asi_turu.ad}` })
      ])
    ]))));
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), asilariYukle);
  }
}
