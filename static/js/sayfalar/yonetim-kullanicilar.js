// =============================================================================
// sayfalar/yonetim-kullanicilar.js – Kullanıcı yönetimi
// Arama (API), rol ve durum filtresi; rol değiştirme, pasifleştirme,
// görevlinin kurumları (ata / kaldır), yeni görevli veya yönetici hesabı.
// Kendi hesabının rolü ve durumu bu ekrandan değiştirilemez (backend de engeller).
// =============================================================================
import { el, ikon, icerikDegistir, secimParametresi } from '../dom.js';
import { apiGet, apiPost, apiPut, apiDelete, ApiHatasi } from '../api.js';
import { yonetimSayfasi, islemMenusu } from '../yonetim.js';
import {
  yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, toast, onayIste, modalAc, butonBekle,
  formHatalariniGoster, formHatalariniTemizle, etiket, etiketRozeti, debounce, sayiFormatla, tarihFormatla, epostaGecerliMi, telefonGecerliMi, istegeBagli
} from '../ui.js';

const ROLLER = ['ziyaretci', 'gorevli', 'admin'];
const ROL_ACIKLAMALARI = {
  ziyaretci: 'Başvuru yapar, randevu alır, destek sözü verir.',
  gorevli: 'Atandığı kurumların panelini kullanır.',
  admin: 'Tüm kurumları ve sistem yönetimini kullanır.'
};

const form = document.getElementById('filtre');
const liste = document.getElementById('kullanici-listesi');
const sonucSayisi = document.getElementById('sonuc-sayisi');
let ben = null;
let istekNo = 0;
let kurumlarSozu = null;

baslat();

async function baslat() {
  ben = await yonetimSayfasi('kullanicilar');
  if (!ben) return;
  const ekle = el('button', { class: 'btn btn-ana', type: 'button' }, [ikon('arti'), 'Yeni kullanıcı']);
  ekle.addEventListener('click', yeniKullaniciAc);
  icerikDegistir(document.getElementById('baslik-eylem'), ekle);

  form.elements.rol.value = secimParametresi('rol', ROLLER, '');
  form.addEventListener('submit', (olay) => olay.preventDefault());
  form.addEventListener('change', (olay) => { if (olay.target.name !== 'q') { urlyeYaz(); yukle(); } });
  form.elements.q.addEventListener('input', debounce(yukle, 300));
  yukle();
}

function urlyeYaz() {
  const p = new URLSearchParams();
  if (form.elements.rol.value) p.set('rol', form.elements.rol.value);
  window.history.replaceState(null, '', `${window.location.pathname}${p.toString() ? `?${p}` : ''}`);
}

/** Tüm kurumlar (pasifler dahil); kurum atama modalında kullanılır. */
function kurumlar() {
  if (!kurumlarSozu) {
    kurumlarSozu = apiGet('/api/institutions');
    kurumlarSozu.catch(() => { kurumlarSozu = null; });
  }
  return kurumlarSozu;
}

async function yukle() {
  const no = ++istekNo;
  yukleniyorGoster(liste, 4, 'liste');
  try {
    const kullanicilar = await apiGet('/api/users', {
      arama: form.elements.q.value.trim().slice(0, 100),
      rol: form.elements.rol.value,
      aktif: form.elements.aktif.value
    });
    if (no !== istekNo) return;
    const pasif = kullanicilar.filter((k) => !k.aktif).length;
    sonucSayisi.textContent = `${sayiFormatla(kullanicilar.length)} kullanıcı${pasif ? ` · ${pasif} pasif` : ''}`;
    if (!kullanicilar.length) {
      bosDurumGoster(liste, { baslik: 'Bu filtrelere uyan kullanıcı yok', ikon: 'kullanicilar' });
      return;
    }
    icerikDegistir(liste, el('div', { class: 'tablo-kap' }, [
      el('table', { class: 'tablo' }, [
        el('caption', { class: 'gizli-erisim', text: 'Kullanıcılar' }),
        el('thead', {}, [el('tr', {}, [
          el('th', { scope: 'col', text: 'Kullanıcı' }),
          el('th', { scope: 'col', text: 'Rol' }),
          el('th', { scope: 'col', text: 'Kurumlar' }),
          el('th', { scope: 'col', text: 'Durum' }),
          el('th', { scope: 'col' }, [el('span', { class: 'gizli-erisim', text: 'İşlemler' })])
        ])]),
        el('tbody', {}, kullanicilar.map(satir))
      ])
    ]));
  } catch (hata) {
    if (no !== istekNo) return;
    sonucSayisi.textContent = '';
    hataGoster(liste, hataMetni(hata), yukle);
  }
}

function satir(k) {
  const kendisi = k.id === ben.id;
  const kurumlarHucresi = k.rol === 'gorevli'
    ? (k.yetkili_kurumlar.length
      ? el('div', { class: 'rozet-grubu' }, k.yetkili_kurumlar.map((x) => el('span', { class: 'rozet rozet-notr', text: x.ad })))
      : el('span', { class: 'rozet rozet-uyari', text: 'Kurum atanmadı' }))
    : el('span', { class: 'metin-ikincil', text: k.rol === 'admin' ? 'Tüm kurumlar' : '—' });

  let eylemler;
  if (kendisi) {
    eylemler = el('span', { class: 'form-yardim', text: 'Kendi hesabın' });
  } else {
    eylemler = el('div', { class: 'tablo-eylem' }, [islemMenusu(k.ad_soyad, [
      { metin: 'Rolü değiştir', ikon: 'kullanici', tikla: () => rolDegistirAc(k) },
      k.rol === 'gorevli' && { metin: 'Kurum atamaları', ikon: 'bina', tikla: () => kurumAtamaAc(k) },
      k.aktif
        ? { metin: 'Pasifleştir', ikon: 'kapat', tehlike: true, tikla: (d) => durumDegistir(k, d) }
        : { metin: 'Aktifleştir', ikon: 'onay', tikla: (d) => durumDegistir(k, d) }
    ])]);
  }

  return el('tr', { class: k.aktif ? null : 'soluk' }, [
    el('td', { class: 'tablo-baslik-hucre', 'data-etiket': 'Kullanıcı' }, [el('div', { class: 'hucre-iki-satir' }, [
      el('span', { text: k.ad_soyad }),
      el('small', { text: k.email }),
      k.telefon && el('small', { text: k.telefon })
    ])]),
    el('td', { 'data-etiket': 'Rol' }, [etiketRozeti('rol', k.rol)]),
    el('td', { 'data-etiket': 'Kurumlar' }, [kurumlarHucresi]),
    el('td', { 'data-etiket': 'Durum' }, [el('div', { class: 'hucre-iki-satir' }, [
      el('span', {}, [k.aktif ? el('span', { class: 'rozet rozet-basari', text: 'Aktif' }) : el('span', { class: 'rozet rozet-notr', text: 'Pasif' })]),
      k.olusturma_tarihi && el('small', { text: `Kayıt: ${tarihFormatla(k.olusturma_tarihi)}` })
    ])]),
    el('td', {}, [eylemler])
  ]);
}

// -----------------------------------------------------------------------------
// Rol ve durum
// -----------------------------------------------------------------------------
function rolSecimi(ad, secili) {
  return el('fieldset', { class: 'form-alan' }, [
    el('legend', { class: 'form-etiket', text: 'Rol' }),
    el('div', { class: 'yigin', style: { gap: '8px' } }, ROLLER.map((r) => el('label', { class: 'secim-kutusu secim-kutusu-ust' }, [
      el('input', { type: 'radio', name: ad, value: r, checked: r === secili }),
      el('span', {}, [el('strong', { text: etiket('rol', r) }), el('br'), el('small', { class: 'metin-ikincil', text: ROL_ACIKLAMALARI[r] })])
    ])))
  ]);
}

function rolDegistirAc(k) {
  const formId = `rol-${k.id}`;
  const uyari = el('div', { class: 'uyari-kutusu uyari-kutusu-uyari', hidden: true }, [
    ikon('uyari'),
    el('div', { class: 'uyari-kutusu-metin' }, [el('p', { text: `Görevli rolünden çıkınca ${k.ad_soyad} kişisinin kurum atamaları (${k.yetkili_kurumlar.map((x) => x.ad).join(', ')}) silinir.` })])
  ]);
  const rf = el('form', { id: formId, novalidate: true }, [
    el('p', { style: { marginTop: 0 }, text: `${k.ad_soyad} (${k.email})` }),
    rolSecimi('rol', k.rol),
    uyari
  ]);
  rf.addEventListener('change', () => {
    const yeni = rf.querySelector('input[name="rol"]:checked')?.value;
    uyari.hidden = !(k.rol === 'gorevli' && yeni !== 'gorevli' && k.yetkili_kurumlar.length);
  });
  const vazgec = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Vazgeç' });
  const kaydet = el('button', { class: 'btn btn-ana', type: 'submit', form: formId, text: 'Rolü kaydet' });
  const modal = modalAc(rf, { baslik: 'Rolü değiştir', alt: [vazgec, kaydet] });
  vazgec.addEventListener('click', modal.kapat);
  rf.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    const yeni = rf.querySelector('input[name="rol"]:checked')?.value;
    if (!yeni || yeni === k.rol) {
      modal.kapat();
      return;
    }
    await butonBekle(kaydet, async () => {
      try {
        await apiPut(`/api/users/${k.id}`, { rol: yeni });
        modal.kapat();
        toast(`${k.ad_soyad}: ${etiket('rol', yeni)}.${yeni === 'gorevli' ? ' Şimdi bir kuruma atayabilirsin.' : ''}`, 'basari', 6000);
        await yukle();
        if (yeni === 'gorevli') kurumAtamaAc({ ...k, rol: 'gorevli', yetkili_kurumlar: [] });
      } catch (hata) {
        formHatalariniGoster(rf, {}, hataMetni(hata));
      }
    });
  });
}

async function durumDegistir(k, dugme) {
  const pasiflestir = k.aktif;
  const onay = await onayIste(
    pasiflestir
      ? `${k.ad_soyad} pasifleştirilecek ve sisteme giriş yapamayacak. Kayıtları silinmez.`
      : `${k.ad_soyad} yeniden aktifleştirilecek ve giriş yapabilecek.`,
    { baslik: pasiflestir ? 'Kullanıcı pasifleştirilsin mi?' : 'Kullanıcı aktifleştirilsin mi?', onayMetni: pasiflestir ? 'Pasifleştir' : 'Aktifleştir', tehlike: pasiflestir }
  );
  if (!onay) return;
  await butonBekle(dugme, async () => {
    try {
      await apiPut(`/api/users/${k.id}`, { aktif: !pasiflestir });
      toast(pasiflestir ? `${k.ad_soyad} pasifleştirildi.` : `${k.ad_soyad} aktifleştirildi.`, 'basari');
      yukle();
    } catch (hata) {
      toast(hataMetni(hata), 'hata');
    }
  });
}

// -----------------------------------------------------------------------------
// Görevlinin kurumları: işaretlenenler atanır, işareti kaldırılanlardan çıkarılır
// -----------------------------------------------------------------------------
async function kurumAtamaAc(k) {
  let tumu;
  try {
    tumu = await kurumlar();
  } catch (hata) {
    toast(hataMetni(hata), 'hata');
    return;
  }
  const mevcut = new Set(k.yetkili_kurumlar.map((x) => x.id));
  const formId = `kurum-ata-${k.id}`;
  const kf = el('form', { id: formId, novalidate: true }, [
    el('p', { style: { marginTop: 0 }, text: `${k.ad_soyad} hangi kurumlarda görevli olsun?` }),
    el('fieldset', { class: 'form-alan' }, [
      el('legend', { class: 'gizli-erisim', text: 'Kurumlar' }),
      el('div', { class: 'yigin', style: { gap: '4px' } }, tumu.map((x) => el('label', { class: 'secim-kutusu' }, [
        el('input', { type: 'checkbox', name: 'kurum', value: x.id, checked: mevcut.has(x.id) }),
        `${x.ad} (${etiket('kurum_tur', x.tur)}${x.aktif === false ? ', pasif' : ''})`
      ])))
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-gorev` }, ['Yeni atamalarda görev tanımı ', istegeBagli()]),
      el('input', { id: `${formId}-gorev`, name: 'gorev_tanimi', type: 'text', maxlength: '50', placeholder: 'Ör. Veteriner hekim' })
    ])
  ]);
  const vazgec = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Vazgeç' });
  const kaydet = el('button', { class: 'btn btn-ana', type: 'submit', form: formId, text: 'Kaydet' });
  const modal = modalAc(kf, { baslik: 'Kurum atamaları', alt: [vazgec, kaydet] });
  vazgec.addEventListener('click', modal.kapat);
  kf.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    formHatalariniTemizle(kf);
    const secili = new Set(Array.from(kf.querySelectorAll('input[name="kurum"]:checked')).map((g) => Number(g.value)));
    const eklenecek = [...secili].filter((id) => !mevcut.has(id));
    const cikacak = [...mevcut].filter((id) => !secili.has(id));
    if (!eklenecek.length && !cikacak.length) {
      modal.kapat();
      return;
    }
    const gorev = kf.elements.gorev_tanimi.value.trim();
    await butonBekle(kaydet, async () => {
      const hatalar = [];
      for (const id of eklenecek) {
        try {
          await apiPost(`/api/institutions/${id}/staff`, gorev ? { user_id: k.id, gorev_tanimi: gorev } : { user_id: k.id });
        } catch (hata) {
          hatalar.push(`${tumu.find((x) => x.id === id)?.ad}: ${hata instanceof ApiHatasi ? hata.message : hataMetni(hata)}`);
        }
      }
      for (const id of cikacak) {
        try {
          await apiDelete(`/api/institutions/${id}/staff/${k.id}`);
        } catch (hata) {
          hatalar.push(`${tumu.find((x) => x.id === id)?.ad}: ${hataMetni(hata)}`);
        }
      }
      if (hatalar.length) {
        formHatalariniGoster(kf, {}, `Bazı değişiklikler yapılamadı. ${hatalar.join(' · ')}`);
        yukle();
        return;
      }
      modal.kapat();
      toast(`${k.ad_soyad} kurum atamaları güncellendi.`, 'basari');
      yukle();
    });
  });
}

// -----------------------------------------------------------------------------
// Yeni kullanıcı (görevli veya yönetici hesabı)
// -----------------------------------------------------------------------------
async function yeniKullaniciAc() {
  const formId = 'yeni-kullanici';
  const tumKurumlar = await kurumlar().catch(() => []);
  const kurumAlani = el('div', { class: 'form-alan' }, [
    el('label', { for: `${formId}-kurum` }, ['Kuruma ata ', istegeBagli()]),
    el('select', { id: `${formId}-kurum`, name: 'kurum_id' }, [
      el('option', { value: '', text: 'Şimdi atama' }),
      ...tumKurumlar.filter((x) => x.aktif !== false).map((x) => el('option', { value: x.id, text: x.ad }))
    ])
  ]);
  const yf = el('form', { id: formId, novalidate: true }, [
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-ad`, text: 'Ad soyad' }),
      el('input', { id: `${formId}-ad`, name: 'ad_soyad', type: 'text', maxlength: '100', autocomplete: 'off', required: true })
    ]),
    el('div', { class: 'form-satir' }, [
      el('div', { class: 'form-alan' }, [
        el('label', { for: `${formId}-email`, text: 'E-posta' }),
        el('input', { id: `${formId}-email`, name: 'email', type: 'email', maxlength: '120', autocomplete: 'off', required: true })
      ]),
      el('div', { class: 'form-alan' }, [
        el('label', { for: `${formId}-telefon`, text: 'Telefon' }),
        el('input', { id: `${formId}-telefon`, name: 'telefon', type: 'tel', maxlength: '20', autocomplete: 'off', placeholder: '05xx xxx xx xx', required: true })
      ])
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-sifre`, text: 'Geçici şifre' }),
      el('input', { id: `${formId}-sifre`, name: 'sifre', type: 'password', minlength: '8', maxlength: '128', autocomplete: 'new-password', required: true, 'aria-describedby': `${formId}-sifre-yardim` }),
      el('p', { class: 'form-yardim', id: `${formId}-sifre-yardim`, text: 'En az 8 karakter. Kişiye güvenli bir yoldan ilet. Şifre değiştirme ekranı henüz yok.' })
    ]),
    rolSecimi('rol', 'gorevli'),
    kurumAlani
  ]);
  const kurumAlaniniGuncelle = () => { kurumAlani.hidden = yf.querySelector('input[name="rol"]:checked')?.value !== 'gorevli'; };
  yf.addEventListener('change', kurumAlaniniGuncelle);

  const vazgec = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Vazgeç' });
  const kaydet = el('button', { class: 'btn btn-ana', type: 'submit', form: formId, text: 'Hesabı oluştur' });
  const modal = modalAc(yf, { baslik: 'Yeni kullanıcı', alt: [vazgec, kaydet], genis: true });
  vazgec.addEventListener('click', modal.kapat);

  yf.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    formHatalariniTemizle(yf);
    const v = yf.elements;
    const govde = {
      ad_soyad: v.ad_soyad.value.trim(),
      email: v.email.value.trim(),
      telefon: v.telefon.value.trim(),
      sifre: v.sifre.value,
      rol: yf.querySelector('input[name="rol"]:checked')?.value || 'gorevli'
    };
    const hatalar = {};
    if (govde.ad_soyad.length < 2) hatalar.ad_soyad = 'Ad soyad en az 2 karakter olmalı.';
    if (!epostaGecerliMi(govde.email)) hatalar.email = 'Geçerli bir e-posta adresi gir.';
    if (!telefonGecerliMi(govde.telefon)) hatalar.telefon = 'Geçerli bir cep telefonu gir (ör. 0555 123 45 67).';
    if (govde.sifre.length < 8) hatalar.sifre = 'Şifre en az 8 karakter olmalı.';
    if (Object.keys(hatalar).length) {
      formHatalariniGoster(yf, hatalar);
      return;
    }
    const kurumId = govde.rol === 'gorevli' && v.kurum_id.value ? Number(v.kurum_id.value) : null;
    await butonBekle(kaydet, async () => {
      let yeni;
      try {
        yeni = await apiPost('/api/users', govde);
      } catch (hata) {
        if (hata instanceof ApiHatasi && (hata.durum === 400 || hata.durum === 409)) formHatalariniGoster(yf, hata.alanlar, Object.keys(hata.alanlar).length ? '' : hata.message);
        else formHatalariniGoster(yf, {}, hataMetni(hata));
        return;
      }
      let ek = '';
      if (kurumId) {
        try {
          await apiPost(`/api/institutions/${kurumId}/staff`, { user_id: yeni.id });
          ek = ` ${tumKurumlar.find((x) => x.id === kurumId)?.ad || 'Kurum'} kurumuna atandı.`;
        } catch (hata) {
          ek = ` Kuruma atanamadı: ${hataMetni(hata)}`;
        }
      }
      modal.kapat();
      toast(`${yeni.ad_soyad} (${etiket('rol', yeni.rol)}) oluşturuldu.${ek}`, ek.includes('atanamadı') ? 'uyari' : 'basari', 7000);
      yukle();
    });
  });
}
