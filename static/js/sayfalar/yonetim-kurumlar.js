// =============================================================================
// sayfalar/yonetim-kurumlar.js – Kurum yönetimi
// Liste (arama, tür, durum), ekle/düzenle modalı (ad, tür, adres, telefon,
// e-posta), aktif/pasif, kurum görevlileri (listele, ata, kaldır).
// Backend'de kurum silme yok: kurum pasifleştirilir (sitede görünmez).
// =============================================================================
import { el, ikon, icerikDegistir, telLinki } from '../dom.js';
import { apiGet, apiPost, apiPut, apiDelete, ApiHatasi } from '../api.js';
import { yonetimSayfasi, islemMenusu } from '../yonetim.js';
import {
  yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, toast, onayIste, modalAc, butonBekle,
  formHatalariniGoster, formHatalariniTemizle, etiketRozeti, debounce, sayiFormatla, tarihFormatla, epostaGecerliMi, istegeBagli
} from '../ui.js';

const form = document.getElementById('filtre');
const liste = document.getElementById('kurum-listesi');
const sonucSayisi = document.getElementById('sonuc-sayisi');
let kurumlar = [];
let istekNo = 0;

baslat();

async function baslat() {
  const kullanici = await yonetimSayfasi('kurumlar');
  if (!kullanici) return;
  const ekle = el('button', { class: 'btn btn-ana', type: 'button' }, [ikon('arti'), 'Kurum ekle']);
  ekle.addEventListener('click', () => kurumFormuAc(null));
  icerikDegistir(document.getElementById('baslik-eylem'), ekle);

  form.addEventListener('submit', (olay) => olay.preventDefault());
  form.addEventListener('change', (olay) => { if (olay.target.name !== 'q') yukle(); });
  form.elements.q.addEventListener('input', debounce(ciz, 250));
  yukle();
}

async function yukle() {
  const no = ++istekNo;
  yukleniyorGoster(liste, 3, 'liste');
  try {
    const sonuc = await apiGet('/api/institutions', { tur: form.elements.tur.value, aktif: form.elements.aktif.value });
    if (no !== istekNo) return;
    kurumlar = sonuc;
    ciz();
  } catch (hata) {
    if (no !== istekNo) return;
    sonucSayisi.textContent = '';
    hataGoster(liste, hataMetni(hata), yukle);
  }
}

function ciz() {
  const aranan = form.elements.q.value.trim().toLocaleLowerCase('tr');
  const gosterilecek = aranan
    ? kurumlar.filter((k) => `${k.ad} ${k.adres || ''}`.toLocaleLowerCase('tr').includes(aranan))
    : kurumlar;
  const pasif = gosterilecek.filter((k) => k.aktif === false).length;
  sonucSayisi.textContent = `${sayiFormatla(gosterilecek.length)} kurum${pasif ? ` · ${pasif} pasif` : ''}`;
  if (!gosterilecek.length) {
    bosDurumGoster(liste, { baslik: 'Bu filtrelere uyan kurum yok', ikon: 'bina' }, { metin: 'Kurum ekle', tikla: () => kurumFormuAc(null) });
    return;
  }
  icerikDegistir(liste, el('div', { class: 'tablo-kap' }, [
    el('table', { class: 'tablo' }, [
      el('caption', { class: 'gizli-erisim', text: 'Kurumlar' }),
      el('thead', {}, [el('tr', {}, [
        el('th', { scope: 'col', text: 'Kurum' }),
        el('th', { scope: 'col', text: 'İletişim' }),
        el('th', { scope: 'col', text: 'Durum' }),
        el('th', { scope: 'col' }, [el('span', { class: 'gizli-erisim', text: 'İşlemler' })])
      ])]),
      el('tbody', {}, gosterilecek.map(satir))
    ])
  ]));
}

function satir(k) {
  const pasif = k.aktif === false;
  const tel = telLinki(k.telefon);
  const gorevliler = el('button', { class: 'btn btn-cerceve', type: 'button' }, [ikon('kullanicilar'), 'Görevliler', el('span', { class: 'gizli-erisim', text: `: ${k.ad}` })]);
  gorevliler.addEventListener('click', () => gorevlileriAc(k));
  const diger = islemMenusu(k.ad, [
    { metin: 'Bilgileri düzenle', ikon: 'duzenle', tikla: () => kurumFormuAc(k) },
    { metin: 'Görevlileri yönet', ikon: 'kullanicilar', tikla: () => gorevlileriAc(k) },
    pasif
      ? { metin: 'Aktifleştir', ikon: 'onay', tikla: (d) => durumDegistir(k, d) }
      : { metin: 'Pasifleştir', ikon: 'kapat', tehlike: true, tikla: (d) => durumDegistir(k, d) }
  ]);
  return el('tr', { class: pasif ? 'soluk' : null }, [
    el('td', { class: 'tablo-baslik-hucre', 'data-etiket': 'Kurum' }, [
      el('div', { class: 'hucre-iki-satir' }, [
        el('span', {}, [k.ad, ' ', etiketRozeti('kurum_tur', k.tur)]),
        el('small', { text: k.adres || 'Adres girilmedi' })
      ])
    ]),
    el('td', { 'data-etiket': 'İletişim' }, [el('div', { class: 'hucre-iki-satir' }, [
      k.telefon ? (tel ? el('a', { href: tel, class: 'tek-satir', text: k.telefon }) : el('span', { class: 'tek-satir', text: k.telefon })) : el('span', { text: '—' }),
      k.email && el('small', { text: k.email })
    ])]),
    el('td', { 'data-etiket': 'Durum' }, [pasif
      ? el('span', { class: 'rozet rozet-notr', text: 'Pasif' })
      : el('span', { class: 'rozet rozet-basari', text: 'Aktif' })]),
    el('td', {}, [el('div', { class: 'tablo-eylem' }, [gorevliler, diger])])
  ]);
}

// -----------------------------------------------------------------------------
// Ekle / düzenle
// -----------------------------------------------------------------------------
function alan(id, etiketMetni, girdi, yardim = null) {
  return el('div', { class: 'form-alan' }, [
    el('label', { for: id }, etiketMetni),
    girdi,
    yardim && el('p', { class: 'form-yardim', text: yardim })
  ]);
}

function kurumFormuAc(k) {
  const formId = `kurum-formu-${k?.id || 'yeni'}`;
  const istegeBagli = (m) => [m, ' ', istegeBagli()];
  const kf = el('form', { id: formId, novalidate: true }, [
    alan(`${formId}-ad`, 'Kurum adı', el('input', { id: `${formId}-ad`, name: 'ad', type: 'text', maxlength: '150', required: true, value: k?.ad || '', autocomplete: 'off' })),
    el('fieldset', { class: 'form-alan' }, [
      el('legend', { class: 'form-etiket', text: 'Tür' }),
      el('div', { class: 'secim-grubu' }, [['barinak', 'Barınak'], ['klinik', 'Klinik']].map(([d, m]) => el('label', {}, [
        el('input', { type: 'radio', name: 'tur', value: d, checked: (k?.tur || 'barinak') === d }), el('span', { text: m })
      ])))
    ]),
    alan(`${formId}-adres`, istegeBagli('Adres'), el('textarea', { id: `${formId}-adres`, name: 'adres', rows: '2', maxlength: '500', value: k?.adres || '', placeholder: 'Mahalle, cadde, ilçe / il' }),
      'İl ve ilçeyi adresin içine yaz; ayrı alan yok. Haritada bu adres aranır.'),
    el('div', { class: 'form-satir' }, [
      alan(`${formId}-telefon`, istegeBagli('Telefon'), el('input', { id: `${formId}-telefon`, name: 'telefon', type: 'tel', maxlength: '20', value: k?.telefon || '', placeholder: '0332 000 00 00' })),
      alan(`${formId}-email`, istegeBagli('E-posta'), el('input', { id: `${formId}-email`, name: 'email', type: 'email', maxlength: '120', value: k?.email || '' }))
    ])
  ]);
  const vazgec = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Vazgeç' });
  const kaydet = el('button', { class: 'btn btn-ana', type: 'submit', form: formId, text: k ? 'Kaydet' : 'Kurumu ekle' });
  const modal = modalAc(kf, { baslik: k ? 'Kurumu düzenle' : 'Yeni kurum', alt: [vazgec, kaydet], genis: true });
  vazgec.addEventListener('click', modal.kapat);

  kf.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    formHatalariniTemizle(kf);
    const v = kf.elements;
    const govde = {
      ad: v.ad.value.trim(),
      tur: kf.querySelector('input[name="tur"]:checked')?.value || 'barinak',
      adres: v.adres.value.trim() || null,
      telefon: v.telefon.value.trim() || null,
      email: v.email.value.trim() || null
    };
    const hatalar = {};
    if (govde.ad.length < 2) hatalar.ad = 'Kurum adı en az 2 karakter olmalı.';
    if (govde.adres && govde.adres.length < 5) hatalar.adres = 'Adres en az 5 karakter olmalı.';
    if (govde.telefon && govde.telefon.replace(/\D/g, '').length < 7) hatalar.telefon = 'Geçerli bir telefon numarası gir.';
    if (govde.email && !epostaGecerliMi(govde.email)) hatalar.email = 'Geçerli bir e-posta adresi gir.';
    if (Object.keys(hatalar).length) {
      formHatalariniGoster(kf, hatalar);
      return;
    }
    await butonBekle(kaydet, async () => {
      try {
        if (k) await apiPut(`/api/institutions/${k.id}`, govde);
        else await apiPost('/api/institutions', govde);
        modal.kapat();
        toast(k ? `${govde.ad} güncellendi.` : `${govde.ad} eklendi.`, 'basari');
        yukle();
      } catch (hata) {
        if (hata instanceof ApiHatasi && hata.durum === 400) formHatalariniGoster(kf, hata.alanlar, Object.keys(hata.alanlar).length ? '' : hata.message);
        else formHatalariniGoster(kf, {}, hataMetni(hata));
      }
    });
  });
}

async function durumDegistir(k, dugme) {
  const pasiflestir = k.aktif !== false;
  const onay = await onayIste(
    pasiflestir
      ? `${k.ad} pasifleştirilecek. Pasif kurum sitede ve kurum listelerinde görünmez; kayıtları silinmez.`
      : `${k.ad} yeniden aktifleştirilecek ve sitede görünecek.`,
    {
      baslik: pasiflestir ? 'Kurum pasifleştirilsin mi?' : 'Kurum aktifleştirilsin mi?',
      onayMetni: pasiflestir ? 'Pasifleştir' : 'Aktifleştir',
      tehlike: pasiflestir,
      uyari: pasiflestir ? 'Backend\'de kurum silme yok; kurumu kaldırmak yerine pasifleştirirsin.' : ''
    }
  );
  if (!onay) return;
  await butonBekle(dugme, async () => {
    try {
      await apiPut(`/api/institutions/${k.id}`, { aktif: !pasiflestir });
      toast(pasiflestir ? `${k.ad} pasifleştirildi.` : `${k.ad} aktifleştirildi.`, 'basari');
      yukle();
    } catch (hata) {
      toast(hataMetni(hata), 'hata');
    }
  });
}

// -----------------------------------------------------------------------------
// Kurum görevlileri
// -----------------------------------------------------------------------------
function gorevlileriAc(k) {
  const listeKabi = el('div', { 'aria-live': 'polite' });
  const ekleKabi = el('div');
  const modal = modalAc([
    el('p', { class: 'form-yardim', style: { marginTop: 0 }, text: 'Görevliler bu kurumun panelinde hayvan, başvuru, aşı, ihtiyaç ve teslim işlemlerini yapabilir.' }),
    listeKabi,
    el('h3', { class: 'alt-baslik', text: 'Görevli ata' }),
    ekleKabi
  ], { baslik: `${k.ad} · Görevliler`, genis: true });

  let atananlar = [];

  const listele = async () => {
    yukleniyorGoster(listeKabi, 2, 'liste');
    try {
      atananlar = await apiGet(`/api/institutions/${k.id}/staff`);
      if (!atananlar.length) {
        icerikDegistir(listeKabi, el('p', { class: 'metin-ikincil', text: 'Bu kurumda henüz görevli yok.' }));
      } else {
        icerikDegistir(listeKabi, el('ul', { class: 'gorevli-listesi' }, atananlar.map((g) => {
          const kaldir = el('button', { class: 'btn btn-tehlike', type: 'button' }, ['Kaldır', el('span', { class: 'gizli-erisim', text: `: ${g.ad_soyad}` })]);
          kaldir.addEventListener('click', () => gorevliKaldir(k, g, kaldir, yenile));
          return el('li', {}, [
            el('div', { class: 'hucre-iki-satir' }, [
              el('strong', { text: g.ad_soyad }),
              el('small', { text: [g.email, g.gorev_tanimi, g.baslangic_tarihi && `${tarihFormatla(g.baslangic_tarihi)} tarihinden beri`].filter(Boolean).join(' · ') })
            ]),
            kaldir
          ]);
        })));
      }
    } catch (hata) {
      hataGoster(listeKabi, hataMetni(hata), listele);
    }
  };

  const ekleFormu = async () => {
    icerikDegistir(ekleKabi, el('div', { class: 'iskelet iskelet-metin' }));
    let adaylar = [];
    try {
      adaylar = await apiGet('/api/users', { rol: 'gorevli', aktif: 'true' });
    } catch (hata) {
      hataGoster(ekleKabi, hataMetni(hata), ekleFormu);
      return;
    }
    const atanmis = new Set(atananlar.map((g) => g.user_id));
    const uygun = adaylar.filter((u) => !atanmis.has(u.id));
    const formId = `gorevli-ata-${k.id}`;
    const yardim = el('p', { class: 'form-yardim', text: 'Yalnızca "görevli" rolündeki aktif kullanıcılar atanabilir. Bir kişiyi görevli yapmak için Kullanıcılar sayfasından rolünü değiştir ya da yeni görevli hesabı oluştur.' });
    if (!uygun.length) {
      icerikDegistir(ekleKabi, [
        el('p', { class: 'metin-ikincil', style: { margin: '0 0 8px' }, text: adaylar.length ? 'Tüm görevliler bu kuruma zaten atanmış.' : 'Sistemde görevli rolünde kullanıcı yok.' }),
        yardim,
        el('a', { class: 'btn btn-cerceve', href: '/yonetim/kullanicilar.html?rol=gorevli' }, [ikon('kullanicilar'), 'Kullanıcılar'])
      ]);
      return;
    }
    const af = el('form', { id: formId, novalidate: true }, [
      el('div', { class: 'form-satir' }, [
        alan(`${formId}-kisi`, 'Görevli', el('select', { id: `${formId}-kisi`, name: 'user_id', required: true }, [
          el('option', { value: '', text: 'Kişi seç' }),
          ...uygun.map((u) => el('option', { value: u.id, text: `${u.ad_soyad} (${u.email})` }))
        ])),
        alan(`${formId}-gorev`, ['Görev tanımı ', istegeBagli()],
          el('input', { id: `${formId}-gorev`, name: 'gorev_tanimi', type: 'text', maxlength: '50', placeholder: 'Ör. Veteriner hekim' }))
      ]),
      yardim,
      el('button', { class: 'btn btn-ana', type: 'submit' }, [ikon('arti'), 'Ata'])
    ]);
    af.addEventListener('submit', async (olay) => {
      olay.preventDefault();
      formHatalariniTemizle(af);
      if (!af.elements.user_id.value) {
        formHatalariniGoster(af, { user_id: 'Atanacak kişiyi seç.' });
        return;
      }
      const govde = { user_id: Number(af.elements.user_id.value) };
      const gorev = af.elements.gorev_tanimi.value.trim();
      if (gorev) govde.gorev_tanimi = gorev;
      await butonBekle(af.querySelector('[type="submit"]'), async () => {
        try {
          const atama = await apiPost(`/api/institutions/${k.id}/staff`, govde);
          toast(`${atama.ad_soyad} ${k.ad} kurumuna atandı.`, 'basari');
          yenile();
        } catch (hata) {
          if (hata instanceof ApiHatasi && (hata.durum === 400 || hata.durum === 409)) formHatalariniGoster(af, hata.alanlar, Object.keys(hata.alanlar).length ? '' : hata.message);
          else formHatalariniGoster(af, {}, hataMetni(hata));
        }
      });
    });
    icerikDegistir(ekleKabi, af);
  };

  async function yenile() {
    await listele();
    await ekleFormu();
  }
  yenile();
  return modal;
}

async function gorevliKaldir(k, g, dugme, sonra) {
  const onay = await onayIste(`${g.ad_soyad} kişisinin ${k.ad} yetkisi kaldırılacak. Hesabı silinmez; başka kurumlardaki yetkileri sürer.`, {
    baslik: 'Görevli kaldırılsın mı?', onayMetni: 'Kaldır', tehlike: true
  });
  if (!onay) return;
  await butonBekle(dugme, async () => {
    try {
      await apiDelete(`/api/institutions/${k.id}/staff/${g.user_id}`);
      toast(`${g.ad_soyad} kurumdan kaldırıldı.`, 'basari');
      sonra();
    } catch (hata) {
      toast(hataMetni(hata), 'hata');
    }
  });
}
