// =============================================================================
// sayfalar/randevu-al.js – Onaylanmış başvuru için teslim alma randevusu
// Önümüzdeki 14 günün saatleri gün sekmeleri + saat ızgarası olarak gösterilir.
// Planlanmış randevu varsa bilgisi ve "Değiştir / İptal et" seçenekleri gösterilir.
// Backend bir başvuruya tek randevu tutar; iptal edilen randevu yeni saatle yeniden açılır.
// =============================================================================
import { el, ikon, icerikDegistir, sayiParametresi, telLinki } from '../dom.js';
import { apiGet, apiPost, apiPut, ApiHatasi } from '../api.js';
import { girisGerekli } from '../auth.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir } from '../layout.js';
import {
  hataGoster, hataMetni, toast, onayIste, butonBekle, bugunIso, gunEkle, tarihFormatla,
  saatFormatla, gunAdi, tarihNesnesi, etiket
} from '../ui.js';
import { hayvanOzetSatiri, ekmekKirintisi, sayfaMesaji, randevuOzeti } from '../kartlar.js';

const GUN_SAYISI = 14;
const AYLAR_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const kap = document.getElementById('randevu-icerik');
const basvuruId = sayiParametresi('basvuru');

ustMenuyuYerlestir({ acilBant: false });
altBilgiyiYerlestir();
yukle();

const ekmek = () => ekmekKirintisi([['Anasayfa', '/index.html'], ['Hesabım', '/hesabim.html#basvurular'], ['Teslim alma randevusu']]);

function mesajGoster(secenekler) {
  const eylemler = secenekler.eylemler || [el('a', { class: 'btn btn-ana', href: '/hesabim.html#basvurular', text: 'Başvurularım' })];
  icerikDegistir(kap, [ekmek(), sayfaMesaji({ ikonAdi: 'takvim', ...secenekler, eylemler })]);
}

function iskelet() {
  icerikDegistir(kap, el('div', { 'aria-hidden': 'true' }, [
    el('div', { class: 'iskelet iskelet-baslik' }),
    el('div', { class: 'iskelet', style: { height: '96px', borderRadius: '18px', margin: '16px 0' } }),
    el('div', { class: 'iskelet', style: { height: '260px', borderRadius: '18px' } })
  ]));
}

async function yukle() {
  const kullanici = await girisGerekli().catch((hata) => {
    hataGoster(kap, hataMetni(hata), yukle);
    return undefined;
  });
  if (!kullanici) return;

  if (!basvuruId) {
    mesajGoster({ baslik: 'Başvuru seçilmedi', aciklama: 'Randevu almak için Hesabım sayfasındaki onaylanmış başvurundan "Teslim alma randevusu al" düğmesini kullan.' });
    return;
  }

  iskelet();
  let basvuru;
  let randevu;
  try {
    const [basvurular, randevular] = await Promise.all([
      apiGet('/api/applications/me'),
      apiGet('/api/appointments/me')
    ]);
    basvuru = basvurular.find((b) => b.id === basvuruId);
    randevu = randevuOzeti(randevular.find((r) => r.basvuru_id === basvuruId));
    // Adres ve telefon için kurumun tam bilgisi
    const kurumId = basvuru?.hayvan?.kurum?.id;
    if (basvuru && kurumId) {
      basvuru.kurum = await apiGet(`/api/institutions/${kurumId}`).catch(() => basvuru.hayvan.kurum);
    }
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), yukle);
    return;
  }

  if (!basvuru) {
    mesajGoster({ baslik: 'Başvuru bulunamadı', aciklama: 'Bu başvuru sana ait değil ya da kaldırılmış.' });
    return;
  }

  const hayvanAdi = basvuru.hayvan?.ad || 'Hayvan';
  if (basvuru.durum === 'beklemede') {
    mesajGoster({ baslik: 'Başvurun henüz değerlendiriliyor', aciklama: `${hayvanAdi} için başvurun onaylandığında buradan teslim alma randevusu alabileceksin.` });
    return;
  }
  if (basvuru.durum !== 'onaylandi') {
    mesajGoster({ baslik: `Başvurun ${etiket('basvuru_durum', basvuru.durum).toLocaleLowerCase('tr')}`, aciklama: 'Randevu yalnızca onaylanmış başvurular için alınabilir.', tur: 'hata' });
    return;
  }

  if (randevu?.durum === 'tamamlandi') {
    mesajGoster({
      baslik: `${hayvanAdi} teslim edildi`,
      aciklama: 'Yeni dostunla mutlu günler! Aşı karnesini Hesabım > Sahiplendiklerim bölümünde görebilirsin.',
      ikonAdi: 'kalp',
      eylemler: [el('a', { class: 'btn btn-ana', href: '/hesabim.html#sahiplendiklerim', text: 'Sahiplendiklerim' })]
    });
    return;
  }

  if (randevu?.durum === 'planlandi') mevcutRandevuGoster(basvuru, randevu);
  else saatSeciciGoster(basvuru);
}


// -----------------------------------------------------------------------------
// Bekleyen randevu
// -----------------------------------------------------------------------------
function randevuDetayi(basvuru, saat) {
  const kurum = basvuru.kurum || {};
  const hucre = (baslik, deger) => el('div', {}, [el('dt', { text: baslik }), el('dd', { text: deger || '—' })]);
  return el('dl', { class: 'bilgi-tablosu' }, [
    hucre('Tarih', `${tarihFormatla(saat.tarih)} ${gunAdi(saat.tarih)}`),
    hucre('Saat', `${saatFormatla(saat.baslangic_saati)} – ${saatFormatla(saat.bitis_saati)}`),
    hucre('Kurum', kurum.ad),
    hucre('Adres', kurum.adres)
  ]);
}

function kimlikNotu() {
  return el('div', { class: 'uyari-kutusu uyari-kutusu-bilgi' }, [
    ikon('bilgi'),
    el('div', { class: 'uyari-kutusu-metin' }, [el('p', { text: 'Kimliğini yanında getir. Gelemeyeceksen randevunu iptal et ki saat başkasına açılsın.' })])
  ]);
}

function mevcutRandevuGoster(basvuru, randevu) {
  const degistir = el('button', { class: 'btn btn-ana', type: 'button', text: 'Saati değiştir' });
  const iptal = el('button', { class: 'btn btn-tehlike', type: 'button', text: 'Randevuyu iptal et' });

  icerikDegistir(kap, [
    ekmek(),
    el('h1', { text: 'Teslim alma randevun' }),
    el('p', { class: 'sayfa-giris', text: `${basvuru.hayvan?.ad || 'Hayvan'} için planlanmış bir randevun var.` }),
    el('div', { class: 'kart yigin', style: { gap: '16px' } }, [
      hayvanOzetSatiri(basvuru.hayvan),
      randevuDetayi(basvuru, randevu),
      kimlikNotu(),
      el('div', { class: 'satir' }, [degistir, iptal])
    ])
  ]);

  degistir.addEventListener('click', () => saatSeciciGoster(basvuru, { mevcut: randevu }));
  iptal.addEventListener('click', async () => {
    const onay = await onayIste(`${tarihFormatla(randevu.tarih)} ${saatFormatla(randevu.baslangic_saati)} randevun iptal edilecek. Daha sonra yeni bir saat seçebilirsin.`, {
      baslik: 'Randevu iptal edilsin mi?', onayMetni: 'İptal et', iptalMetni: 'Vazgeç', tehlike: true
    });
    if (!onay) return;
    await butonBekle(iptal, async () => {
      try {
        await apiPut(`/api/appointments/${randevu.id}/iptal`);
        toast('Randevun iptal edildi.', 'bilgi');
        yukle();
      } catch (hata) {
        toast(hataMetni(hata), 'hata');
      }
    });
  });
}

// -----------------------------------------------------------------------------
// Saat seçici
// -----------------------------------------------------------------------------
function simdiSaat() {
  const t = new Date();
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

async function saatSeciciGoster(basvuru, { mevcut = null } = {}) {
  iskelet();
  const kurumId = basvuru.hayvan?.kurum?.id ?? basvuru.kurum?.id;
  const bugun = bugunIso();
  let saatler;
  try {
    // API bugün ve sonrasındaki aktif saatleri döner; kapasite bilgisi yoktur
    saatler = await apiGet(`/api/institutions/${kurumId}/pickup-slots`);
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), () => saatSeciciGoster(basvuru, { mevcut }));
    return;
  }

  const simdi = simdiSaat();
  const uygunMu = (s) => !(s.tarih === bugun && s.baslangic_saati <= simdi) && s.id !== mevcut?.saat_id;
  const gunler = Array.from({ length: GUN_SAYISI }, (_, i) => {
    const tarih = gunEkle(bugun, i);
    const gunSaatleri = saatler.filter((s) => s.tarih === tarih);
    return { tarih, saatler: gunSaatleri, uygun: gunSaatleri.filter(uygunMu).length };
  });

  const ust = [
    ekmek(),
    el('h1', { text: mevcut ? 'Randevu saatini değiştir' : 'Teslim alma randevusu al' }),
    el('p', { class: 'sayfa-giris', text: `${basvuru.hayvan?.ad || 'Hayvan'} için ${basvuru.kurum?.ad || 'kurum'} tarafından belirlenen saatlerden birini seç.` }),
    mevcut && el('div', { class: 'uyari-kutusu uyari-kutusu-bilgi', style: { marginBottom: '16px' } }, [
      ikon('bilgi'),
      el('div', { class: 'uyari-kutusu-metin' }, [el('p', { text: `Şu anki randevun: ${tarihFormatla(mevcut.tarih)} ${saatFormatla(mevcut.baslangic_saati)}. Yeni saati onaylarsan eski randevun iptal edilir.` })])
    ]),
    el('div', { class: 'kart', style: { marginBottom: '16px' } }, [hayvanOzetSatiri(basvuru.hayvan)])
  ];

  if (!gunler.some((g) => g.uygun > 0)) {
    const tel = telLinki(basvuru.kurum?.telefon);
    icerikDegistir(kap, [
      ...ust,
      el('div', { class: 'bos-durum' }, [
        el('span', { class: 'bos-durum-ikon' }, [ikon('takvim')]),
        el('h2', { style: { fontSize: '19px', margin: 0 }, text: 'Önümüzdeki 14 gün için boş saat yok' }),
        el('p', { text: 'Kurum yeni teslim saatleri ekleyince burada görünecek. Acele bir durum varsa kurumu arayabilirsin.' }),
        tel && el('a', { class: 'btn btn-cerceve', href: tel }, [ikon('telefon'), basvuru.kurum.telefon]),
        mevcut && el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Mevcut randevuna dön', onClick: () => mevcutRandevuGoster(basvuru, mevcut) })
      ])
    ]);
    return;
  }

  let seciliGun = gunler.find((g) => g.uygun > 0).tarih;
  let seciliSaat = null;

  const gunSekmeleri = el('div', { class: 'saat-gunler', role: 'tablist', 'aria-label': 'Teslim günü' });
  const izgara = el('div', { class: 'saat-izgara', id: 'saat-izgara', role: 'radiogroup', 'aria-label': 'Teslim saati' });
  const izgaraBasligi = el('h2', { class: 'alt-baslik', style: { marginTop: 0 }, id: 'saat-baslik' });
  const ozetKabi = el('div', { 'aria-live': 'polite' });

  const gunleriCiz = () => {
    icerikDegistir(gunSekmeleri, gunler.map((g) => {
      const t = tarihNesnesi(g.tarih);
      const secili = g.tarih === seciliGun;
      const dugme = el('button', {
        class: 'saat-gun', type: 'button', role: 'tab',
        'aria-selected': secili ? 'true' : 'false', 'aria-controls': 'saat-izgara',
        tabindex: secili ? '0' : '-1', disabled: g.uygun === 0,
        'aria-label': `${tarihFormatla(g.tarih)} ${gunAdi(g.tarih)}, ${g.uygun ? `${g.uygun} boş saat` : 'boş saat yok'}`,
        dataset: { tarih: g.tarih }
      }, [
        el('span', { class: 'saat-gun-ad', text: gunAdi(g.tarih, true) }),
        el('span', { class: 'saat-gun-no', text: String(t.getDate()) }),
        el('span', { class: 'saat-gun-ay', text: AYLAR_KISA[t.getMonth()] })
      ]);
      dugme.addEventListener('click', () => gunSec(g.tarih));
      return dugme;
    }));
  };

  // Ok tuşlarıyla gün sekmeleri arasında gezinme
  gunSekmeleri.addEventListener('keydown', (olay) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(olay.key)) return;
    const uygunlar = gunler.filter((g) => g.uygun > 0).map((g) => g.tarih);
    const sira = uygunlar.indexOf(seciliGun);
    let yeni = sira;
    if (olay.key === 'ArrowRight') yeni = Math.min(uygunlar.length - 1, sira + 1);
    if (olay.key === 'ArrowLeft') yeni = Math.max(0, sira - 1);
    if (olay.key === 'Home') yeni = 0;
    if (olay.key === 'End') yeni = uygunlar.length - 1;
    olay.preventDefault();
    gunSec(uygunlar[yeni]);
    gunSekmeleri.querySelector(`[data-tarih="${uygunlar[yeni]}"]`)?.focus();
  });

  const saatleriCiz = () => {
    const gun = gunler.find((g) => g.tarih === seciliGun);
    izgaraBasligi.textContent = `${tarihFormatla(seciliGun)} ${gunAdi(seciliGun)} – teslim saatleri`;
    icerikDegistir(izgara, gun.saatler.map((s) => {
      const uygun = uygunMu(s);
      let altMetin = `– ${saatFormatla(s.bitis_saati)}`;
      if (s.id === mevcut?.saat_id) altMetin = 'Mevcut randevun';
      else if (!uygun) altMetin = 'Geçti';
      const girdi = el('input', {
        type: 'radio', name: 'saat', value: s.id, disabled: !uygun, checked: seciliSaat?.id === s.id,
        'aria-label': `${saatFormatla(s.baslangic_saati)} – ${saatFormatla(s.bitis_saati)}${uygun ? '' : `, ${altMetin}`}`
      });
      girdi.addEventListener('change', () => {
        seciliSaat = s;
        ozetCiz();
      });
      return el('label', {}, [girdi, el('span', {}, [
        el('strong', { text: saatFormatla(s.baslangic_saati) }),
        el('small', { text: altMetin })
      ])]);
    }));
  };

  const gunSec = (tarih) => {
    if (tarih === seciliGun) return;
    seciliGun = tarih;
    seciliSaat = null;
    gunleriCiz();
    saatleriCiz();
    ozetCiz();
  };

  const ozetCiz = () => {
    if (!seciliSaat) {
      icerikDegistir(ozetKabi, el('p', { class: 'form-yardim', style: { marginTop: '16px' }, text: 'Özet ve onay için bir saat seç.' }));
      return;
    }
    const onayla = el('button', { class: 'btn btn-ana btn-buyuk btn-blok', type: 'button', text: mevcut ? 'Yeni saati onayla' : 'Randevuyu onayla' });
    onayla.addEventListener('click', () => butonBekle(onayla, () => randevuyuOnayla(basvuru, seciliSaat, mevcut)));
    icerikDegistir(ozetKabi, el('section', { class: 'kart yigin', style: { gap: '16px', marginTop: '16px' }, 'aria-labelledby': 'ozet-baslik' }, [
      el('h2', { id: 'ozet-baslik', style: { fontSize: '20px', margin: 0 }, text: 'Randevu özeti' }),
      el('dl', { class: 'bilgi-tablosu' }, [
        el('div', {}, [el('dt', { text: 'Hayvan' }), el('dd', { text: basvuru.hayvan?.ad || '—' })]),
        el('div', {}, [el('dt', { text: 'Kurum' }), el('dd', { text: basvuru.kurum?.ad || '—' })]),
        el('div', {}, [el('dt', { text: 'Tarih' }), el('dd', { text: `${tarihFormatla(seciliSaat.tarih)} ${gunAdi(seciliSaat.tarih)}` })]),
        el('div', {}, [el('dt', { text: 'Saat' }), el('dd', { text: `${saatFormatla(seciliSaat.baslangic_saati)} – ${saatFormatla(seciliSaat.bitis_saati)}` })]),
        el('div', { style: { gridColumn: '1 / -1' } }, [el('dt', { text: 'Adres' }), el('dd', { text: basvuru.kurum?.adres || '—' })])
      ]),
      kimlikNotu(),
      onayla
    ]));
  };

  icerikDegistir(kap, [
    ...ust,
    el('div', { class: 'kart' }, [
      el('div', { class: 'saat-secici' }, [gunSekmeleri, el('div', { role: 'tabpanel', 'aria-labelledby': 'saat-baslik' }, [izgaraBasligi, izgara])])
    ]),
    ozetKabi,
    mevcut && el('button', { class: 'btn btn-cerceve btn-blok', type: 'button', style: { marginTop: '12px' }, text: 'Vazgeç, mevcut randevumu koru', onClick: () => mevcutRandevuGoster(basvuru, mevcut) })
  ]);
  gunleriCiz();
  saatleriCiz();
  ozetCiz();
}

async function randevuyuOnayla(basvuru, saat, mevcut) {
  try {
    // Saat değiştirmede önce eski randevu iptal edilir (API bir başvuruya tek aktif randevu izin veriyor)
    if (mevcut) await apiPut(`/api/appointments/${mevcut.id}/iptal`);
  } catch (hata) {
    toast(`Eski randevu iptal edilemedi: ${hataMetni(hata)}`, 'hata');
    return;
  }
  try {
    const randevu = await apiPost('/api/appointments', { application_id: basvuru.id, slot_id: saat.id });
    basariGoster(basvuru, randevuOzeti(randevu));
  } catch (hata) {
    const ek = mevcut ? ' Eski randevun iptal edildi; lütfen yeni bir saat seç.' : '';
    toast(`${hataMetni(hata)}${ek}`, 'hata', 8000);
    if (hata instanceof ApiHatasi && (hata.durum === 400 || hata.durum === 409)) {
      // Saat kaldırılmış olabilir: güncel saatlerle yeniden çiz
      saatSeciciGoster(basvuru);
    }
  }
}

function basariGoster(basvuru, randevu) {
  document.title = 'Randevun alındı – PatiPortal';
  icerikDegistir(kap, [
    ekmek(),
    el('div', { class: 'kart yigin', role: 'status', style: { gap: '16px' } }, [
      el('div', { class: 'uyari-kutusu uyari-kutusu-basari' }, [
        ikon('onay'),
        el('div', { class: 'uyari-kutusu-metin' }, [
          el('strong', { text: 'Randevun alındı!' }),
          el('p', { text: `${basvuru.hayvan?.ad || 'Yeni dostun'} seni bekliyor.` })
        ])
      ]),
      randevuDetayi(basvuru, randevu),
      kimlikNotu(),
      el('div', { class: 'satir' }, [
        el('a', { class: 'btn btn-ana', href: '/hesabim.html#randevular', text: 'Randevularım' }),
        el('a', { class: 'btn btn-cerceve', href: '/index.html', text: 'Anasayfa' })
      ])
    ])
  ]);
}
