// =============================================================================
// sayfalar/ihtiyaclar.js – Açık ihtiyaçlar, destek sözü modalı, son karşılananlar
// ?destek=<id> ile gelinirse (ör. anasayfadan) ilgili ihtiyacın modalı açılır.
// =============================================================================
import { el, ikon, icerikDegistir, sayiParametresi, secimParametresi } from '../dom.js';
import { apiGet, apiPost, ApiHatasi } from '../api.js';
import { mevcutKullanici } from '../auth.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir } from '../layout.js';
import {
  yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, modalAc, toast,
  formHatalariniGoster, formHatalariniTemizle, butonBekle, ihtiyacOranlari, sayiFormatla, etiket
} from '../ui.js';
import { ihtiyacKarti } from '../kartlar.js';

const TURLER = ['mama', 'ilac', 'malzeme', 'diger'];
const TAM_SAYI_BIRIMLERI = ['adet', 'kutu', 'paket', 'şişe', 'tane'];

const form = document.getElementById('ihtiyac-filtre');
const liste = document.getElementById('acik-ihtiyaclar');
const karsilananlar = document.getElementById('karsilananlar');
const sonucSayisi = document.getElementById('sonuc-sayisi');

const durum = {
  tur: secimParametresi('tur', TURLER, ''),
  kurum: sayiParametresi('kurum')
};
let destekId = sayiParametresi('destek');
let istekNo = 0;

ustMenuyuYerlestir();
altBilgiyiYerlestir();
baslat();

async function baslat() {
  try {
    const kurumlar = await apiGet('/api/institutions');
    form.elements.kurum.append(...kurumlar.map((k) => el('option', { value: k.id, text: k.ad })));
    if (durum.kurum && !kurumlar.some((k) => k.id === durum.kurum)) durum.kurum = null;
  } catch {
    // Kurum listesi olmadan da ihtiyaçlar gösterilebilir
  }
  form.querySelectorAll('input[name="tur"]').forEach((g) => { g.checked = g.value === durum.tur; });
  form.elements.kurum.value = durum.kurum ? String(durum.kurum) : '';

  form.addEventListener('submit', (olay) => olay.preventDefault());
  form.addEventListener('change', () => {
    durum.tur = form.querySelector('input[name="tur"]:checked')?.value || '';
    durum.kurum = form.elements.kurum.value ? Number(form.elements.kurum.value) : null;
    urlyeYaz();
    listele();
  });

  await listele();
  karsilananlariYukle();
  if (destekId) istenenDestegiAc();
}

function urlyeYaz() {
  const p = new URLSearchParams();
  if (durum.tur) p.set('tur', durum.tur);
  if (durum.kurum) p.set('kurum', durum.kurum);
  if (destekId) p.set('destek', destekId);
  window.history.replaceState(null, '', `${window.location.pathname}${p.toString() ? `?${p}` : ''}`);
}

async function listele() {
  const no = ++istekNo;
  yukleniyorGoster(liste, 3, 'metin');
  try {
    const ihtiyaclar = await apiGet('/api/needs', { durum: 'acik', kurum_id: durum.kurum, tur: durum.tur });
    if (no !== istekNo) return;
    sonucSayisi.textContent = `${sayiFormatla(ihtiyaclar.length)} açık ihtiyaç (aciliyete göre sıralı)`;
    if (!ihtiyaclar.length) {
      const filtreVar = durum.tur || durum.kurum;
      bosDurumGoster(liste, filtreVar
        ? { baslik: 'Bu filtrelere uyan açık ihtiyaç yok', aciklama: 'Farklı bir tür veya kurum seçmeyi dene.', ikon: 'ihtiyac' }
        : { baslik: 'Şu an açık ihtiyaç yok', aciklama: 'Kurumlar yeni bir ihtiyaç yayınladığında burada göreceksin.', ikon: 'ihtiyac' },
      filtreVar ? { metin: 'Filtreleri temizle', tikla: temizle } : null);
      liste.firstElementChild.style.gridColumn = '1 / -1';
      return;
    }
    icerikDegistir(liste, ihtiyaclar.map((n) => ihtiyacKarti(n, { destekTikla: destekModaliAc })));
  } catch (hata) {
    if (no !== istekNo) return;
    sonucSayisi.textContent = 'İhtiyaçlar yüklenemedi';
    hataGoster(liste, hataMetni(hata), listele);
    liste.firstElementChild.style.gridColumn = '1 / -1';
  }
}

function temizle() {
  durum.tur = '';
  durum.kurum = null;
  form.reset();
  urlyeYaz();
  listele();
}

async function karsilananlariYukle() {
  yukleniyorGoster(karsilananlar, 3, 'metin');
  try {
    const ihtiyaclar = await apiGet('/api/needs', { durum: 'karsilandi' });
    if (!ihtiyaclar.length) {
      bosDurumGoster(karsilananlar, { baslik: 'Henüz karşılanan ihtiyaç yok', ikon: 'kalp' });
      karsilananlar.firstElementChild.style.gridColumn = '1 / -1';
      return;
    }
    icerikDegistir(karsilananlar, ihtiyaclar.slice(0, 6).map((n) => ihtiyacKarti(n, { destekButonu: false })));
  } catch (hata) {
    hataGoster(karsilananlar, hataMetni(hata), karsilananlariYukle);
    karsilananlar.firstElementChild.style.gridColumn = '1 / -1';
  }
}

/** ?destek=<id> ile gelindiyse ihtiyacı bulup modalı açar. */
async function istenenDestegiAc() {
  try {
    const acik = await apiGet('/api/needs', { durum: 'acik' });
    const ihtiyac = acik.find((n) => n.id === destekId);
    if (ihtiyac) {
      destekModaliAc(ihtiyac);
    } else {
      toast('Bu ihtiyaç karşılanmış ya da artık açık değil.', 'bilgi');
      destekId = null;
      urlyeYaz();
    }
  } catch (hata) {
    toast(hataMetni(hata), 'hata');
  }
}

// -----------------------------------------------------------------------------
// Destek sözü modalı
// -----------------------------------------------------------------------------
async function destekModaliAc(ihtiyac) {
  // Giriş zorunlu değil; giriş yapılmışsa ad ve telefon hesaptan doldurulur
  let kullanici = null;
  try {
    kullanici = await mevcutKullanici();
  } catch {
    kullanici = null;
  }

  destekId = ihtiyac.id;
  urlyeYaz();

  const o = ihtiyacOranlari(ihtiyac);
  const birim = ihtiyac.birim || '';
  const tamSayi = TAM_SAYI_BIRIMLERI.includes(birim.toLocaleLowerCase('tr'));
  const formId = `destek-formu-${ihtiyac.id}`;
  const kurumAdi = ihtiyac.kurum?.ad || 'Kurum';

  const destekFormu = el('form', { id: formId, novalidate: true }, [
    el('div', { class: 'uyari-kutusu uyari-kutusu-bilgi', style: { marginBottom: '18px' } }, [
      ikon('ihtiyac'),
      el('div', { class: 'uyari-kutusu-metin' }, [
        el('strong', { text: ihtiyac.baslik }),
        el('p', { text: `${kurumAdi} · ${etiket('ihtiyac_tur', ihtiyac.tur)} · ${sayiFormatla(o.kalan)} ${birim} daha gerekiyor` })
      ])
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-miktar`, text: `Ne kadar getirebilirsin? (${birim})` }),
      el('input', {
        id: `${formId}-miktar`, name: 'miktar', type: 'number', inputmode: tamSayi ? 'numeric' : 'decimal',
        min: tamSayi ? '1' : '0.1', max: String(o.kalan), step: tamSayi ? '1' : 'any', required: true,
        'aria-describedby': `${formId}-miktar-yardim`
      }),
      el('p', { class: 'form-yardim', id: `${formId}-miktar-yardim`, text: `En fazla ${sayiFormatla(o.kalan)} ${birim}.` })
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-ad`, text: 'Ad soyad' }),
      el('input', { id: `${formId}-ad`, name: 'ad_soyad', type: 'text', autocomplete: 'name', maxlength: '100', required: true, value: kullanici?.ad_soyad || '' })
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-telefon`, text: 'Telefon' }),
      el('input', {
        id: `${formId}-telefon`, name: 'telefon', type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: '20', required: true,
        placeholder: '05xx xxx xx xx', value: kullanici?.telefon || '', 'aria-describedby': `${formId}-telefon-yardim`
      }),
      el('p', { class: 'form-yardim', id: `${formId}-telefon-yardim`, text: 'Kurum teslim için seninle bu numaradan iletişime geçer.' })
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-not` }, ['Not ', el('span', { class: 'istege-bagli', text: '(isteğe bağlı)' })]),
      el('textarea', { id: `${formId}-not`, name: 'aciklama', maxlength: '500', rows: '3', placeholder: 'Ör. Cumartesi öğleden önce getirebilirim.' })
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { class: 'secim-kutusu secim-kutusu-ust' }, [
        el('input', { type: 'checkbox', name: 'kvkk_onay', required: true }),
        el('span', {}, [
          el('a', { href: '/kvkk.html', target: '_blank', rel: 'noopener', text: 'KVKK Aydınlatma Metni' }),
          "'ni okudum; ad ve telefonumun bu destek için kurumla paylaşılmasını kabul ediyorum."
        ])
      ])
    ])
  ]);

  const vazgec = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Vazgeç' });
  const gonder = el('button', { class: 'btn btn-ana', type: 'submit', form: formId, text: 'Söz ver' });
  const modal = modalAc(destekFormu, {
    baslik: 'Destek olacağım',
    alt: [vazgec, gonder],
    kapaninca: () => {
      destekId = null;
      urlyeYaz();
    }
  });
  vazgec.addEventListener('click', modal.kapat);

  destekFormu.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    formHatalariniTemizle(destekFormu);
    const f = destekFormu.elements;
    const miktar = Number(String(f.miktar.value).replace(',', '.'));
    const adSoyad = f.ad_soyad.value.trim();
    const telefon = f.telefon.value.trim();
    const aciklama = f.aciklama.value.trim();

    const hatalar = {};
    if (!Number.isFinite(miktar) || miktar <= 0) hatalar.miktar = 'Bir miktar girin.';
    else if (tamSayi && !Number.isInteger(miktar)) hatalar.miktar = `Miktar tam sayı olmalı (${birim}).`;
    else if (miktar > o.kalan) hatalar.miktar = `En fazla ${sayiFormatla(o.kalan)} ${birim} söz verebilirsin.`;
    if (adSoyad.length < 2) hatalar.ad_soyad = 'Adını ve soyadını gir.';
    if (telefon.replace(/\D/g, '').length < 10) hatalar.telefon = 'Geçerli bir telefon numarası gir.';
    if (!f.kvkk_onay.checked) hatalar.kvkk_onay = 'Devam etmek için KVKK metnini onaylamalısın.';
    if (Object.keys(hatalar).length) {
      formHatalariniGoster(destekFormu, hatalar);
      return;
    }

    await butonBekle(gonder, async () => {
      try {
        await apiPost(`/api/needs/${ihtiyac.id}/pledges`, {
          miktar, ad_soyad: adSoyad, telefon, aciklama: aciklama || null, kvkk_onay: true
        });
        modal.kapat();
        toast(kullanici
          ? `Teşekkürler! ${sayiFormatla(miktar)} ${birim} için sözün kaydedildi. Hesabım > Destek sözlerim'den takip edebilirsin.`
          : `Teşekkürler! ${sayiFormatla(miktar)} ${birim} için sözün kaydedildi. ${kurumAdi} seninle iletişime geçecek.`, 'basari', 7000);
        listele();
      } catch (e) {
        if (e instanceof ApiHatasi && e.durum === 400) formHatalariniGoster(destekFormu, e.alanlar, Object.keys(e.alanlar).length ? '' : e.message);
        else if (e instanceof ApiHatasi && e.durum === 409) {
          formHatalariniGoster(destekFormu, {}, e.message);
          listele();
        } else formHatalariniGoster(destekFormu, {}, hataMetni(e));
      }
    });
  });
}
