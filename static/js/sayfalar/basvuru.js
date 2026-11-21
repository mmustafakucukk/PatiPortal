// =============================================================================
// sayfalar/basvuru.js – Sahiplenme başvurusu (giriş gerekli)
// =============================================================================
import { el, ikon, icerikDegistir, sayiParametresi } from '../dom.js';
import { apiGet, apiPost, ApiHatasi } from '../api.js';
import { girisGerekli } from '../auth.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir } from '../layout.js';
import {
  hataGoster, hataMetni, formHatalariniGoster, formHatalariniTemizle, butonBekle,
  belirtmeHali, etiket, tarihFormatla, istegeBagli
} from '../ui.js';
import { hayvanOzetSatiri, ekmekKirintisi, sayfaMesaji, kurumAdi } from '../kartlar.js';

const ACIKLAMA_MIN = 10;
const ACIKLAMA_MAX = 2000;
const EV_TIPLERI = ['Apartman', 'Bahçeli ev', 'Müstakil ev', 'Diğer'];
const kap = document.getElementById('basvuru-icerik');
const hayvanId = sayiParametresi('hayvan');

ustMenuyuYerlestir({ acilBant: false });
altBilgiyiYerlestir();
yukle();

async function yukle() {
  const kullanici = await girisGerekli().catch((hata) => {
    hataGoster(kap, hataMetni(hata), yukle);
    return undefined;
  });
  if (!kullanici) return; // giriş sayfasına yönlendirildi veya hata gösterildi

  if (!hayvanId) {
    mesajGoster({ baslik: 'Başvuru yapılacak hayvan seçilmedi', aciklama: 'Başvurmak istediğin dostu hayvanlar sayfasından seçebilirsin.' });
    return;
  }

  icerikDegistir(kap, el('div', { 'aria-hidden': 'true' }, [
    el('div', { class: 'iskelet iskelet-baslik' }),
    el('div', { class: 'iskelet', style: { height: '96px', borderRadius: '18px', margin: '16px 0' } }),
    el('div', { class: 'iskelet', style: { height: '320px', borderRadius: '18px' } })
  ]));

  let hayvan;
  let basvurular;
  try {
    [hayvan, basvurular] = await Promise.all([
      apiGet(`/api/animals/${hayvanId}`),
      apiGet('/api/applications/me')
    ]);
  } catch (hata) {
    if (hata instanceof ApiHatasi && hata.durum === 404) {
      mesajGoster({ baslik: 'Bu dostumuzu bulamadık', aciklama: 'Hayvan kaldırılmış ya da bağlantı hatalı olabilir.' });
    } else {
      hataGoster(kap, hataMetni(hata), yukle);
    }
    return;
  }

  document.title = `${hayvan.ad} için başvuru – PatiPortal`;

  const mevcut = basvurular.find((b) => b.hayvan_id === hayvan.id && ['beklemede', 'onaylandi'].includes(b.durum));
  if (mevcut) {
    mesajGoster({
      baslik: `${hayvan.ad} için zaten bir başvurun var`,
      aciklama: `${tarihFormatla(mevcut.basvuru_tarihi)} tarihli başvurunun durumu: ${etiket('basvuru_durum', mevcut.durum)}. Gelişmeleri Hesabım sayfasından takip edebilirsin.`,
      ikonAdi: 'belge',
      eylemler: [el('a', { class: 'btn btn-ana', href: '/hesabim.html#basvurular', text: 'Başvurularım' })]
    }, hayvan);
    return;
  }

  if (hayvan.durum !== 'barinakta') {
    const aciklamalar = {
      sahiplendirildi: 'Bu dostumuz yuvasını buldu.',
      tedavide: 'Bu dostumuzun tedavisi sürüyor; tedavisi bitince başvurulara açılacak.'
    };
    mesajGoster({
      baslik: 'Bu dostumuz şu an başvuru kabul etmiyor',
      aciklama: aciklamalar[hayvan.durum] || '',
      eylemler: [el('a', { class: 'btn btn-ana', href: '/hayvanlar.html', text: 'Diğer dostlara göz at' })]
    }, hayvan);
    return;
  }

  formuCiz(hayvan, kullanici);
}

function mesajGoster(secenekler, hayvan = null) {
  const eylemler = secenekler.eylemler || [el('a', { class: 'btn btn-ana', href: '/hayvanlar.html', text: 'Hayvanlara göz at' })];
  icerikDegistir(kap, [
    ekmekKirintisi([
      ['Anasayfa', '/index.html'], ['Hayvanlar', '/hayvanlar.html'],
      ...(hayvan ? [[hayvan.ad, `/hayvan.html?id=${hayvan.id}`]] : []), ['Başvuru']
    ]),
    sayfaMesaji({ ...secenekler, eylemler })
  ]);
}

// -----------------------------------------------------------------------------
function secimGrubu(ad, secenekler) {
  return el('div', { class: 'secim-grubu' }, secenekler.map(([deger, metin]) => el('label', {}, [
    el('input', { type: 'radio', name: ad, value: deger, required: true }),
    el('span', { text: metin })
  ])));
}

function formuCiz(hayvan, kullanici) {
  const sayac = el('p', { class: 'karakter-sayaci', id: 'aciklama-sayac', 'aria-live': 'polite' });
  const form = el('form', { id: 'basvuru-formu', novalidate: true }, [
    el('fieldset', { class: 'form-alan' }, [
      el('legend', { class: 'form-etiket' }, ['Ev tipi ', el('span', { class: 'zorunlu', 'aria-hidden': 'true', text: '*' })]),
      secimGrubu('ev_tipi', EV_TIPLERI.map((t) => [t, t]))
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { for: 'onceki_deneyim' }, ['Daha önce hayvan baktın mı? ', istegeBagli()]),
      el('textarea', {
        id: 'onceki_deneyim', name: 'onceki_deneyim', rows: '3', maxlength: '1000',
        placeholder: 'Ör. 5 yıl boyunca bir kedim oldu. Evde şu an başka hayvan yok.'
      })
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { for: 'aciklama' }, [`Neden ${belirtmeHali(hayvan.ad)} sahiplenmek istiyorsun? `, el('span', { class: 'zorunlu', 'aria-hidden': 'true', text: '*' })]),
      el('textarea', {
        id: 'aciklama', name: 'aciklama', rows: '5', maxlength: String(ACIKLAMA_MAX), required: true,
        placeholder: 'Evini, günlük düzenini ve ona nasıl bakacağını kısaca anlat.',
        'aria-describedby': 'aciklama-yardim aciklama-sayac'
      }),
      el('div', { class: 'satir', style: { justifyContent: 'space-between' } }, [
        el('p', { class: 'form-yardim', id: 'aciklama-yardim', text: `En az ${ACIKLAMA_MIN} karakter.` }),
        sayac
      ])
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { for: 'telefon', text: 'Telefon' }),
      el('input', { id: 'telefon', type: 'tel', value: kullanici.telefon || '', readonly: true, 'aria-describedby': 'telefon-yardim' }),
      el('p', { class: 'form-yardim', id: 'telefon-yardim', text: 'Telefon numaran profilinden alınır; kurum seninle bu numaradan iletişime geçer.' })
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { class: 'secim-kutusu secim-kutusu-ust' }, [
        el('input', { type: 'checkbox', name: 'kvkk_onay', required: true }),
        el('span', {}, [
          el('a', { href: '/kvkk.html', target: '_blank', rel: 'noopener', text: 'KVKK Aydınlatma Metni' }),
          '\'ni okudum; başvuru bilgilerimin ve telefonumun ilgili kurumla paylaşılmasını kabul ediyorum.'
        ])
      ])
    ]),
    el('button', { class: 'btn btn-ana btn-buyuk btn-blok', type: 'submit', text: 'Başvuruyu gönder' })
  ]);

  icerikDegistir(kap, [
    ekmekKirintisi([['Anasayfa', '/index.html'], ['Hayvanlar', '/hayvanlar.html'], [hayvan.ad, `/hayvan.html?id=${hayvan.id}`], ['Başvuru']]),
    el('h1', { text: 'Sahiplenme başvurusu' }),
    el('p', { class: 'sayfa-giris', text: 'Birkaç soruyla kendini ve evini tanıt. Görevli başvurunu değerlendirip seninle iletişime geçer; onaylanınca teslim alma randevusu alabilirsin.' }),
    el('div', { class: 'kart', style: { marginBottom: '20px' } }, [hayvanOzetSatiri(hayvan)]),
    el('div', { class: 'kart' }, [form])
  ]);

  const aciklama = form.elements.aciklama;
  const sayaciGuncelle = () => {
    const uzunluk = aciklama.value.trim().length;
    sayac.textContent = `${uzunluk} / ${ACIKLAMA_MIN}`;
    sayac.classList.toggle('tamam', uzunluk >= ACIKLAMA_MIN);
  };
  aciklama.addEventListener('input', sayaciGuncelle);
  sayaciGuncelle();

  form.addEventListener('submit', (olay) => gonder(olay, form, hayvan));
}

function degerler(form) {
  const secili = (ad) => form.querySelector(`input[name="${ad}"]:checked`)?.value ?? null;
  return {
    ev_tipi: secili('ev_tipi'),
    onceki_deneyim: form.elements.onceki_deneyim.value.trim(),
    aciklama: form.elements.aciklama.value.trim(),
    kvkk_onay: form.elements.kvkk_onay.checked
  };
}

async function gonder(olay, form, hayvan) {
  olay.preventDefault();
  formHatalariniTemizle(form);
  const v = degerler(form);
  const hatalar = {};
  if (!v.ev_tipi) hatalar.ev_tipi = 'Ev tipini seç.';
  if (v.aciklama.length < ACIKLAMA_MIN) hatalar.aciklama = `En az ${ACIKLAMA_MIN} karakter yaz (şu an ${v.aciklama.length}).`;
  if (!v.kvkk_onay) hatalar.kvkk_onay = 'Devam etmek için KVKK metnini onaylamalısın.';
  if (Object.keys(hatalar).length) {
    formHatalariniGoster(form, hatalar);
    return;
  }

  await butonBekle(form.querySelector('[type="submit"]'), async () => {
    try {
      await apiPost('/api/applications', {
        animal_id: hayvan.id,
        ev_tipi: v.ev_tipi,
        onceki_deneyim: v.onceki_deneyim,
        aciklama: v.aciklama,
        kvkk_onay: true
      });
      tesekkurGoster(hayvan);
    } catch (hata) {
      if (hata instanceof ApiHatasi && hata.durum === 400) {
        formHatalariniGoster(form, hata.alanlar, Object.keys(hata.alanlar).length ? '' : hata.message);
      } else if (hata instanceof ApiHatasi && hata.durum === 409) {
        formHatalariniGoster(form, {}, hata.message);
      } else {
        formHatalariniGoster(form, {}, hataMetni(hata));
      }
    }
  });
}

function tesekkurGoster(hayvan) {
  document.title = 'Başvurun alındı – PatiPortal';
  icerikDegistir(kap, el('div', { class: 'bos-durum', role: 'status' }, [
    el('span', { class: 'bos-durum-ikon', style: { background: 'var(--basari-zemin)', color: 'var(--basari)' } }, [ikon('onay')]),
    el('h1', { style: { fontSize: '26px', margin: 0 }, text: 'Teşekkürler, başvurun alındı!' }),
    el('p', { text: `${hayvan.ad} için başvurun ${kurumAdi(hayvan) || 'kurum'} görevlisine iletildi. Değerlendirme genellikle 3 iş günü içinde yapılır. Başvurun onaylanınca Hesabım sayfasından teslim alma randevusu alabilirsin.` }),
    el('div', { class: 'satir', style: { justifyContent: 'center', marginTop: '8px' } }, [
      el('a', { class: 'btn btn-ana', href: '/hesabim.html#basvurular', text: 'Hesabım' }),
      el('a', { class: 'btn btn-cerceve', href: '/hayvanlar.html', text: 'Diğer dostlara göz at' })
    ])
  ]));
  kap.scrollIntoView({ block: 'start' });
}
