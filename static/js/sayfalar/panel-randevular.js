// =============================================================================
// sayfalar/panel-randevular.js – Günlük teslim randevuları
// Gün seçici (bugün varsayılan, önceki/sonraki gün), saat sırasıyla randevular,
// "Teslim et" (onay + not → POST /api/adoptions/complete) ve "İptal et".
// Uç nokta tarih/kurum filtresi almaz: gün ve aktif kurum istemcide süzülür.
// Tamamlananlar ve iptaller soluk.
// =============================================================================
import { el, ikon, icerikDegistir, telLinki } from '../dom.js';
import { apiGet, apiPost, apiPut } from '../api.js';
import { panelSayfasi } from '../panel.js';
import {
  yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, toast, onayIste, modalAc, butonBekle,
  formHatalariniGoster, etiketRozeti, saatFormatla, tarihFormatla, gunAdi, goreceliGun, bugunIso, gunEkle
} from '../ui.js';
import { hayvanOzetSatiri } from '../kartlar.js';

const liste = document.getElementById('randevu-listesi');
const gunSecimi = document.getElementById('gun-secimi');
const gunBaslik = document.getElementById('gun-baslik');
const gunOzeti = document.getElementById('gun-ozeti');
let sayfa = null;
let tarih = /^\d{4}-\d{2}-\d{2}$/.test(new URLSearchParams(window.location.search).get('tarih') || '')
  ? new URLSearchParams(window.location.search).get('tarih')
  : bugunIso();

baslat();

async function baslat() {
  sayfa = await panelSayfasi({ baslik: 'Randevular', menu: 'randevular', kurumDegisince: yukle });
  if (!sayfa) return;
  document.getElementById('gun-gezinti').hidden = false;
  document.getElementById('onceki-gun').addEventListener('click', () => gunSec(gunEkle(tarih, -1)));
  document.getElementById('sonraki-gun').addEventListener('click', () => gunSec(gunEkle(tarih, 1)));
  gunSecimi.addEventListener('change', () => { if (gunSecimi.value) gunSec(gunSecimi.value); });
  gunSec(tarih);
}

function gunSec(yeni) {
  tarih = yeni;
  gunSecimi.value = tarih;
  const gorece = goreceliGun(tarih);
  gunBaslik.textContent = ['Bugün', 'Yarın', 'Dün'].includes(gorece) ? `${gorece}, ${tarihFormatla(tarih)}` : `${tarihFormatla(tarih)} ${gunAdi(tarih)}`;
  const adres = new URL(window.location.href);
  if (tarih === bugunIso()) adres.searchParams.delete('tarih');
  else adres.searchParams.set('tarih', tarih);
  window.history.replaceState(null, '', adres);
  yukle();
}

async function yukle() {
  const istenen = tarih;
  yukleniyorGoster(liste, 3, 'liste');
  gunOzeti.textContent = '';
  try {
    const tumu = await apiGet('/api/appointments');
    if (istenen !== tarih) return; // bu arada gün değişti
    const randevular = tumu
      .filter((r) => r.teslim_saati?.tarih === istenen && r.hayvan?.kurum?.id === sayfa.kurum.kurum_id)
      .map((r) => ({ ...r, baslangic_saati: r.teslim_saati.baslangic_saati, bitis_saati: r.teslim_saati.bitis_saati }))
      .sort((a, b) => a.baslangic_saati.localeCompare(b.baslangic_saati) || a.id - b.id);
    const bekleyen = randevular.filter((r) => r.durum === 'planlandi').length;
    gunOzeti.textContent = randevular.length
      ? `${randevular.length} randevu · ${bekleyen} teslim bekliyor`
      : '';
    if (!randevular.length) {
      bosDurumGoster(liste, { baslik: 'Bu gün için randevu yok', aciklama: 'Önceki veya sonraki güne geçebilirsin.', ikon: 'takvim' });
      return;
    }
    icerikDegistir(liste, el('ul', { class: 'hesap-listesi' }, randevular.map((r) => el('li', {}, [randevuKarti(r)]))));
  } catch (hata) {
    hataGoster(liste, hataMetni(hata), yukle);
  }
}

function randevuKarti(r) {
  const kisi = r.basvuran || {};
  const tel = telLinki(kisi.telefon);
  const bekliyor = r.durum === 'planlandi';
  let eylemler = null;
  if (bekliyor) {
    const teslim = el('button', { class: 'btn btn-ana', type: 'button' }, ['Teslim et', el('span', { class: 'gizli-erisim', text: `: ${r.hayvan?.ad || ''}, ${kisi.ad_soyad || ''}` })]);
    const iptal = el('button', { class: 'btn btn-cerceve', type: 'button' }, ['İptal et', el('span', { class: 'gizli-erisim', text: `: ${kisi.ad_soyad || ''}` })]);
    teslim.addEventListener('click', () => teslimAc(r));
    iptal.addEventListener('click', () => iptalEt(r, iptal));
    eylemler = el('div', { class: 'btn-grup' }, [iptal, teslim]);
  }
  return el('article', { class: ['kart', 'randevu-karti', !bekliyor && 'soluk'] }, [
    el('div', { class: 'randevu-ust' }, [
      el('span', { class: 'randevu-saat' }, [
        saatFormatla(r.baslangic_saati),
        el('span', { class: 'metin-ikincil metin-kucuk', style: { fontFamily: 'var(--font-govde)', fontWeight: 400 }, text: ` – ${saatFormatla(r.bitis_saati)}` })
      ]),
      etiketRozeti('randevu_durum', r.durum)
    ]),
    el('div', { class: 'satir', style: { justifyContent: 'space-between' } }, [
      el('span', {}, [el('strong', { text: kisi.ad_soyad || '—' })]),
      tel ? el('a', { class: 'btn btn-cerceve-ana', href: tel }, [ikon('telefon'), kisi.telefon])
        : kisi.email && el('a', { class: 'baglanti', href: `mailto:${kisi.email}`, text: kisi.email })
    ]),
    r.hayvan && hayvanOzetSatiri(r.hayvan),
    r.not_metni && el('p', { class: 'metin-kucuk metin-ikincil', style: { margin: 0 }, text: `Not: ${r.not_metni}` }),
    eylemler
  ]);
}

function teslimAc(r) {
  const formId = `teslim-${r.id}`;
  const form = el('form', { id: formId, novalidate: true }, [
    el('p', { text: `${r.hayvan?.ad || 'Hayvan'}, ${r.basvuran?.ad_soyad || 'sahibine'} teslim edilecek.` }),
    el('div', { class: 'uyari-kutusu uyari-kutusu-bilgi', style: { marginBottom: '16px' } }, [
      ikon('bilgi'),
      el('div', { class: 'uyari-kutusu-metin' }, [el('p', { text: 'Kimliği kontrol et. Teslimden sonra sahiplendirme kaydı oluşur ve randevu tamamlanır.' })])
    ]),
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-not` }, ['Teslim notu ', el('span', { class: 'istege-bagli', text: '(isteğe bağlı)' })]),
      el('textarea', { id: `${formId}-not`, name: 'teslim_notu', rows: '2', maxlength: '1000', placeholder: 'Ör. Mama ve kum örneğiyle birlikte teslim edildi.' })
    ])
  ]);
  const vazgec = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Vazgeç' });
  const onayla = el('button', { class: 'btn btn-ana', type: 'submit', form: formId, text: 'Teslim et' });
  const modal = modalAc(form, { baslik: 'Teslim et', alt: [vazgec, onayla] });
  vazgec.addEventListener('click', modal.kapat);
  form.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    await butonBekle(onayla, async () => {
      try {
        await apiPost('/api/adoptions/complete', { application_id: r.basvuru_id, teslim_notu: form.elements.teslim_notu.value.trim() || null });
        modal.kapat();
        toast(`${r.hayvan?.ad || 'Hayvan'} teslim edildi. Yeni yuvasında mutlu olsun!`, 'basari', 6000);
        yukle();
      } catch (hata) {
        formHatalariniGoster(form, {}, hataMetni(hata));
      }
    });
  });
}

async function iptalEt(r, dugme) {
  const onay = await onayIste(`${r.basvuran?.ad_soyad || 'Kişi'} ${saatFormatla(r.baslangic_saati)} randevusu iptal edilecek (ör. gelmediyse). Başvuru onaylı kalır; kişi yeni bir saat seçebilir.`, {
    baslik: 'Randevu iptal edilsin mi?', onayMetni: 'İptal et', iptalMetni: 'Vazgeç', tehlike: true
  });
  if (!onay) return;
  await butonBekle(dugme, async () => {
    try {
      await apiPut(`/api/appointments/${r.id}/iptal`);
      toast('Randevu iptal edildi.', 'bilgi');
      yukle();
    } catch (hata) {
      toast(hataMetni(hata), 'hata');
    }
  });
}
