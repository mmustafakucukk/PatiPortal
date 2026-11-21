// =============================================================================
// sayfalar/bilesenler.js – _bilesenler.html çalışan örnekleri
// =============================================================================
import { el, ikon, icerikDegistir } from '../dom.js';
import { apiGet, apiPost, ApiHatasi, sayfaliYanit } from '../api.js';
import { mevcutKullanici, gorevliMi, sistemYoneticisiMi } from '../auth.js';
import { aktifKurum, kullaniciKurumlari, kurumSeciciyiYerlestir, KURUM_DEGISTI_OLAYI } from '../kurum.js';
import { hayvanKarti } from '../kartlar.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir, panelMenusunuYerlestir, yonetimMenusunuYerlestir } from '../layout.js';
import {
  toast, modalAc, onayIste, cekmeceAc, yukleniyorGoster, hataGoster, bosDurumGoster,
  formHatalariniGoster, formHatalariniTemizle, tarihFormatla, saatFormatla, tarihSaatFormatla,
  yasMetni, yasSecimindenTarih, asiDurumu, etiket, etiketRozeti, goreceliGun, kisaTarih, ayYil,
  bugunIso, gunEkle, ihtiyacOranlari, butonBekle, hataMetni
} from '../ui.js';

ustMenuyuYerlestir();
altBilgiyiYerlestir();
rolBolumu();
panelOrnekleri();
yonetimMenusunuYerlestir('kurumlar');
katmanOrnekleri();
formOrnegi();
durumOrnekleri();
bicimTablosu();
document.getElementById('api-sinama').addEventListener('click', (olay) => butonBekle(olay.currentTarget, apiSina));

// -----------------------------------------------------------------------------
async function rolBolumu() {
  const bilgiKabi = document.getElementById('rol-bilgi');
  try {
    const kullanici = await mevcutKullanici();
    const kurumlar = kullanici ? await kullaniciKurumlari() : [];
    icerikDegistir(bilgiKabi, [
      el('p', { style: { margin: 0 } }, [
        el('strong', { text: 'Oturumdaki kullanıcı: ' }),
        kullanici ? `${kullanici.ad_soyad} (${kullanici.email})` : 'Giriş yapılmamış',
        kullanici ? ` · ${etiket('rol', kullanici.rol)}` : ''
      ]),
      kurumlar.length > 0 && el('div', { class: 'satir' }, kurumlar.map((k) =>
        el('span', { class: 'rozet rozet-notr', text: k.ad })
      )),
      el('p', { class: 'form-yardim', style: { margin: 0 } }, [
        'Rol değiştirmek için çıkış yapıp başka bir hesapla ',
        el('a', { href: '/giris.html?donus=%2F_bilesenler.html', text: 'giriş yapın' }), '.'
      ])
    ]);
  } catch (hata) {
    hataGoster(bilgiKabi, hataMetni(hata), rolBolumu);
  }
}

// -----------------------------------------------------------------------------
async function panelOrnekleri() {
  const selam = document.getElementById('demo-selam');
  const seciciKabi = document.getElementById('demo-kurum-secici');
  const aktifMetin = document.getElementById('demo-aktif-kurum');
  const menuKabi = document.getElementById('demo-panel-menu');

  try {
    const kullanici = await mevcutKullanici();
    selam.textContent = kullanici ? `Merhaba, ${kullanici.ad_soyad.split(' ')[0]}` : 'Merhaba';
    if (!gorevliMi(kullanici) && !sistemYoneticisiMi(kullanici)) {
      aktifMetin.textContent = kullanici
        ? `${kullanici.ad_soyad} hiçbir kurumda görevli değil; gerçek panel sayfaları bu kullanıcıya "erişiminiz yok" mesajı gösterir.`
        : 'Giriş yapılmamış; gerçek panel sayfaları giriş sayfasına yönlendirir.';
      panelMenusunuYerlestir('ana', menuKabi);
      return;
    }
    await kurumSeciciyiYerlestir(seciciKabi);
    const goster = (kurum) => {
      aktifMetin.textContent = kurum ? `Aktif kurum: ${kurum.ad}${kurum.tur ? ` (${etiket('kurum_tur', kurum.tur)})` : ''}.` : 'Kurum yok.';
    };
    goster(await aktifKurum());
    window.addEventListener(KURUM_DEGISTI_OLAYI, (olay) => {
      goster(olay.detail);
      toast(`Aktif kurum: ${olay.detail.ad}`, 'bilgi');
    });
    panelMenusunuYerlestir('ana', menuKabi);
  } catch (hata) {
    aktifMetin.textContent = hataMetni(hata);
  }
}

// -----------------------------------------------------------------------------
function katmanOrnekleri() {
  const mesajlar = {
    basari: 'Pamuk kaydedildi.',
    hata: 'Bağlantı kurulamadı, tekrar deneyin.',
    uyari: 'Kaydedilmemiş değişiklikler var.',
    bilgi: 'Aktif kurum: Merkez Barınak'
  };
  document.querySelectorAll('[data-toast]').forEach((buton) => {
    buton.addEventListener('click', () => toast(mesajlar[buton.dataset.toast], buton.dataset.toast));
  });

  document.getElementById('demo-modal').addEventListener('click', () => {
    const vazgec = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Kapat' });
    const modal = modalAc([
      el('p', { text: 'Modal Esc tuşuyla, kapat düğmesiyle veya arka plana tıklayarak kapanır. Tab tuşu odağı modal içinde tutar.' }),
      el('div', { class: 'form-alan' }, [
        el('label', { for: 'modal-not', text: 'Örnek alan' }),
        el('input', { id: 'modal-not', type: 'text', placeholder: 'Odak buraya gelir' })
      ])
    ], { baslik: 'Örnek modal', alt: [vazgec] });
    vazgec.addEventListener('click', modal.kapat);
  });

  document.getElementById('demo-onay').addEventListener('click', async () => {
    const sonuc = await onayIste('Elif Yıldız\'ın Pamuk için yaptığı başvuru onaylanacak.', {
      baslik: 'Başvuruyu onayla',
      onayMetni: 'Onayla',
      uyari: 'Hayvan sahiplendirildi olarak işaretlenecek ve bu hayvana ait diğer bekleyen başvurular otomatik reddedilecek.'
    });
    toast(sonuc ? 'Onaylandı (örnek, kayıt değişmedi).' : 'Vazgeçildi.', sonuc ? 'basari' : 'bilgi');
  });

  document.getElementById('demo-cekmece').addEventListener('click', () => {
    const uygula = el('button', { class: 'btn btn-ana', type: 'button', text: 'Uygula' });
    const cekmece = cekmeceAc([
      el('fieldset', { class: 'form-alan' }, [
        el('legend', { class: 'form-etiket', text: 'Tür' }),
        el('div', { class: 'secim-grubu secim-grubu-hap' }, ['Hepsi', 'Kedi', 'Köpek'].map((ad, i) =>
          el('label', {}, [el('input', { type: 'radio', name: 'cekmece-tur', checked: i === 0 }), el('span', { text: ad })])
        ))
      ]),
      el('fieldset', { class: 'form-alan' }, [
        el('legend', { class: 'form-etiket', text: 'Sağlık' }),
        el('label', { class: 'secim-kutusu' }, [el('input', { type: 'checkbox' }), 'Aşıları tam']),
        el('label', { class: 'secim-kutusu' }, [el('input', { type: 'checkbox' }), 'Kısırlaştırılmış'])
      ])
    ], { baslik: 'Filtreler', alt: [uygula] });
    uygula.addEventListener('click', cekmece.kapat);
  });
}

// -----------------------------------------------------------------------------
function formOrnegi() {
  const form = document.getElementById('demo-form');
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    formHatalariniTemizle(form);
    const gonder = form.querySelector('[type="submit"]');
    await butonBekle(gonder, async () => {
      try {
        // Kayıt uç noktası sunucu doğrulamasını gösterir; veriler bilinçli olarak eksik
        await apiPost('/api/auth/register', {
          ad_soyad: 'Ör', email: form.elements.email.value, telefon: '', sifre: '123',
          kvkk_onay: form.elements.kvkk_onay.checked
        });
        toast('Beklenmedik şekilde başarılı oldu.', 'uyari');
      } catch (hata) {
        if (hata instanceof ApiHatasi && hata.durum === 400) {
          // ev_tipi bu uç noktada yok; istemci doğrulamasıyla eklenir, ad_soyad vb. genel kutuya düşer
          const alanlar = { ...hata.alanlar };
          if (!form.querySelector('[name="ev_tipi"]:checked')) alanlar.ev_tipi = 'Ev tipini seçin.';
          formHatalariniGoster(form, alanlar, hata.message);
        } else {
          toast(hataMetni(hata), 'hata');
        }
      }
    });
  });
  document.getElementById('demo-form-temizle').addEventListener('click', () => formHatalariniTemizle(form));
}

// -----------------------------------------------------------------------------
function durumOrnekleri() {
  const kap = document.getElementById('demo-durum-kabi');
  const goster = async (tur) => {
    if (tur === 'yukleniyor') yukleniyorGoster(kap, 3);
    else if (tur === 'hata') hataGoster(kap, 'Bağlantı kurulamadı, tekrar deneyin.', () => goster('veri'));
    else if (tur === 'bos') bosDurumGoster(kap, { baslik: 'Bu filtrelere uyan hayvan yok', aciklama: 'Filtreleri temizleyerek tüm yuva arayan dostları görebilirsin.' }, { metin: 'Filtreleri temizle', tikla: () => goster('veri') });
    else {
      yukleniyorGoster(kap, 3);
      try {
        const sayfa = sayfaliYanit(await apiGet('/api/animals', { limit: 3, durum: 'barinakta' }));
        icerikDegistir(kap, sayfa.kayitlar.map((h) => hayvanKarti(h)));
      } catch (hata) {
        hataGoster(kap, hataMetni(hata), () => goster('veri'));
      }
    }
  };
  document.querySelectorAll('[data-durum]').forEach((b) => b.addEventListener('click', () => goster(b.dataset.durum)));
  goster('veri');
}

// -----------------------------------------------------------------------------
function bicimTablosu() {
  const bugun = bugunIso();
  const ornekler = [
    ['tarihFormatla(\'2026-11-20\')', tarihFormatla('2026-11-20')],
    ['saatFormatla(\'14:30:00\')', saatFormatla('14:30:00')],
    ['tarihSaatFormatla(\'2026-11-20T09:05\')', tarihSaatFormatla('2026-11-20T09:05')],
    ['kisaTarih(\'2026-11-16\') · ayYil(\'2026-03-12\')', `${kisaTarih('2026-11-16')} · ${ayYil('2026-03-12')}`],
    ['goreceliGun(bugün / yarın / +3 / +10)', [0, 1, 3, 10].map((g) => goreceliGun(gunEkle(bugun, g))).join(' · ')],
    ['yasMetni(2 yıl önce)', yasMetni(yasSecimindenTarih(2))],
    ['yasMetni(6 ay önce)', yasMetni(yasSecimindenTarih('yavru'))],
    ['yasMetni(null)', yasMetni(null)],
    ['yasSecimindenTarih(\'genc\')', yasSecimindenTarih('genc')],
    ['asiDurumu(+30 / +5 / −5 gün / yok)', [...[30, 5, -5].map((g) => asiDurumu(gunEkle(bugun, g))), asiDurumu(null)]],
    ["etiket('durum', …)", ['barinakta', 'tedavide', 'sahiplendirildi'].map((d) => etiketRozeti('durum', d))],
    ["etiketRozeti('basvuru_durum', …)", ['beklemede', 'onaylandi', 'reddedildi'].map((d) => etiketRozeti('basvuru_durum', d))],
    ['ihtiyacOranlari({ miktar: 50, toplam_soz: 20 })', JSON.stringify(ihtiyacOranlari({ miktar: 50, toplam_soz: 20 }))]
  ];
  icerikDegistir(document.getElementById('bicim-tablosu'), ornekler.map(([cagri, sonuc]) => el('tr', {}, [
    el('td', { class: 'tablo-baslik-hucre', 'data-etiket': 'Çağrı' }, [el('code', { text: cagri })]),
    el('td', { 'data-etiket': 'Sonuç' }, Array.isArray(sonuc)
      ? [el('span', { class: 'satir', style: { justifyContent: 'flex-end' } }, sonuc.map((s) => (s instanceof Node ? s : el('code', { text: s }))))]
      : [el('code', { text: sonuc })])
  ])));
}

// -----------------------------------------------------------------------------
async function apiSina() {
  const govde = document.getElementById('api-sonuclari');
  const kullanici = await mevcutKullanici();
  const kurum = await aktifKurum();
  const kurumId = kurum?.kurum_id ?? 1;
  const istekler = [
    ['/api/auth/me'],
    ['/api/institutions'], ['/api/institutions/1'], [`/api/institutions/${kurumId}/staff`],
    ['/api/hayvan-turleri'], ['/api/vaccinations/turler'],
    ['/api/animals', { limit: 50 }], ['/api/animals', { kurum_id: kurumId, limit: 50 }],
    ['/api/animals', { tur_id: 1, yas_max: 1 }], ['/api/animals', { asilar_tam: true }], ['/api/animals/1'], ['/api/animals/1/vaccinations'],
    ['/api/vaccinations/yaklasan', { gun: 7 }], ['/api/vaccinations/gecikmis'],
    ['/api/needs', { durum: 'acik' }], ['/api/needs/1/pledges'], ['/api/pledges/me'],
    ['/api/applications/me'], ['/api/applications', { durum: 'beklemede' }], ['/api/applications/1'],
    [`/api/institutions/${kurumId}/pickup-slots`],
    ['/api/appointments/me'], ['/api/appointments', { durum: 'planlandi' }],
    ['/api/adoptions/me'],
    ['/api/stats/public'], ['/api/stats'],
    ['/api/users']
  ];
  icerikDegistir(govde, []);
  for (const [yol, parametreler] of istekler) {
    const etiketMetni = `GET ${yol}${parametreler ? '?' + new URLSearchParams(parametreler) : ''}`;
    let sonucEl;
    try {
      const veri = await apiGet(yol, parametreler, { girisYonlendirmesi: false });
      let ozet;
      if (Array.isArray(veri)) ozet = `${veri.length} kayıt`;
      else if (veri && Array.isArray(veri.kayitlar)) {
        const sy = sayfaliYanit(veri);
        ozet = `${sy.kayitlar.length} / ${sy.toplam} kayıt (sayfa ${sy.sayfa}/${sy.sayfa_sayisi})`;
      } else if (veri && Array.isArray(veri.asilar)) ozet = `${veri.asilar.length} aşı, ${veri.eksik_zorunlu_asilar.length} eksik`;
      else ozet = JSON.stringify(veri).slice(0, 90);
      sonucEl = [el('span', { class: 'rozet rozet-basari', text: '200' }), ' ', ozet];
    } catch (hata) {
      const beklenen = hata.durum === 401 || hata.durum === 403;
      sonucEl = [el('span', { class: ['rozet', beklenen ? 'rozet-notr' : 'rozet-acil'], text: String(hata.durum || 'Hata') }), ' ', hata.message];
    }
    govde.appendChild(el('tr', {}, [
      el('td', { class: 'tablo-baslik-hucre', 'data-etiket': 'İstek' }, [el('code', { text: etiketMetni })]),
      el('td', { 'data-etiket': 'Sonuç' }, sonucEl)
    ]));
  }
  toast(`Sınama bitti (${kullanici ? kullanici.ad_soyad : 'ziyaretçi'}${sistemYoneticisiMi(kullanici) ? ', sistem yöneticisi' : ''}).`, 'basari');
}
