// =============================================================================
// sayfalar/panel-ihtiyaclar.js – Kurumun ihtiyaçları ve destek talepleri
// "Yeni ihtiyaç" formu (#yeni ile açık gelir), açık ihtiyaçlar, her ihtiyacın
// destek talepleri ("Teslim edildi" / "İptal"), karşılandı işaretleme, destek
// sözü olmayan ihtiyacı silme.
// =============================================================================
import { el, ikon, icerikDegistir, telLinki } from '../dom.js';
import { apiGet, apiPost, apiPatch, apiDelete, ApiHatasi } from '../api.js';
import { panelSayfasi } from '../panel.js';
import {
  yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, toast, onayIste, butonBekle,
  formHatalariniGoster, formHatalariniTemizle, etiket, etiketRozeti, ihtiyacOranlari,
  sayiFormatla, tarihFormatla
} from '../ui.js';

const form = document.getElementById('ihtiyac-formu');
const yeniBolum = document.getElementById('yeni');
const liste = document.getElementById('acik-ihtiyaclar');
const karsilananlar = document.getElementById('karsilananlar');
let sayfa = null;

baslat();

async function baslat() {
  const yeniDugme = el('button', { class: 'btn btn-ana', type: 'button' }, [ikon('arti'), 'Yeni']);
  sayfa = await panelSayfasi({ baslik: 'İhtiyaçlar', menu: 'ihtiyaclar', ek: yeniDugme, kurumDegisince: yukle });
  if (!sayfa) return;
  yeniDugme.addEventListener('click', yeniFormuAc);
  if (window.location.hash === '#yeni') yeniFormuAc();
  window.addEventListener('hashchange', () => { if (window.location.hash === '#yeni') yeniFormuAc(); });
  form.addEventListener('submit', ihtiyacEkle);
  document.getElementById('karsilananlar-bolumu').addEventListener('toggle', (olay) => {
    if (olay.target.open) karsilananlariYukle();
  });
  yukle();
}

function yeniFormuAc() {
  yeniBolum.open = true;
  yeniBolum.scrollIntoView({ block: 'start', behavior: 'smooth' });
  form.querySelector('input[name="tur"]').focus({ preventScroll: true });
}

function yukle() {
  listele();
  if (document.getElementById('karsilananlar-bolumu').open) karsilananlariYukle();
}

// -----------------------------------------------------------------------------
// Yeni ihtiyaç
// -----------------------------------------------------------------------------
async function ihtiyacEkle(olay) {
  olay.preventDefault();
  formHatalariniTemizle(form);
  const v = form.elements;
  const secili = (ad) => form.querySelector(`input[name="${ad}"]:checked`)?.value || '';
  const govde = {
    kurum_id: sayfa.kurum.kurum_id,
    tur: secili('tur'),
    baslik: v.baslik.value.trim(),
    aciklama: v.aciklama.value.trim() || null,
    miktar: Number(String(v.miktar.value).replace(',', '.')),
    birim: v.birim.value.trim(),
    aciliyet: secili('aciliyet')
  };
  const hatalar = {};
  if (!govde.tur) hatalar.tur = 'Türü seç.';
  if (govde.baslik.length < 3) hatalar.baslik = 'Başlık en az 3 karakter olmalı.';
  if (!Number.isFinite(govde.miktar) || govde.miktar <= 0) hatalar.miktar = 'Miktar 0\'dan büyük olmalı.';
  if (!govde.birim) hatalar.birim = 'Birim gir (kg, adet, kutu…).';
  if (!govde.aciliyet) hatalar.aciliyet = 'Aciliyeti seç.';
  if (Object.keys(hatalar).length) {
    formHatalariniGoster(form, hatalar);
    return;
  }
  await butonBekle(form.querySelector('[type="submit"]'), async () => {
    try {
      const ihtiyac = await apiPost('/api/needs', govde);
      toast(`"${ihtiyac.baslik}" yayınlandı. Sitede ve anasayfada görünüyor.`, 'basari');
      form.reset();
      yeniBolum.open = false;
      if (window.location.hash === '#yeni') window.history.replaceState(null, '', window.location.pathname);
      listele();
    } catch (hata) {
      if (hata instanceof ApiHatasi && hata.durum === 400) formHatalariniGoster(form, hata.alanlar, Object.keys(hata.alanlar).length ? '' : hata.message);
      else formHatalariniGoster(form, {}, hataMetni(hata));
    }
  });
}

// -----------------------------------------------------------------------------
// Açık ihtiyaçlar ve destek talepleri
// -----------------------------------------------------------------------------
async function listele() {
  yukleniyorGoster(liste, 2, 'metin');
  try {
    const ihtiyaclar = await apiGet('/api/needs', { durum: 'acik', kurum_id: sayfa.kurum.kurum_id });
    if (!ihtiyaclar.length) {
      bosDurumGoster(liste, { baslik: 'Açık ihtiyaç yok', aciklama: 'Bir ihtiyaç yayınladığında burada destek taleplerini takip edebilirsin.', ikon: 'ihtiyac' },
        { metin: 'Yeni ihtiyaç', tikla: yeniFormuAc });
      return;
    }
    const destekler = await Promise.all(ihtiyaclar.map((n) => apiGet(`/api/needs/${n.id}/pledges`).catch(() => null)));
    icerikDegistir(liste, ihtiyaclar.map((n, i) => ihtiyacKarti(n, destekler[i])));
  } catch (hata) {
    hataGoster(liste, hataMetni(hata), listele);
  }
}

function ihtiyacKarti(n, destekler) {
  const o = ihtiyacOranlari(n);
  const birim = n.birim || '';
  // Teslim edilen miktar destek taleplerinden hesaplanır
  const teslim = (destekler || []).filter((d) => d.durum === 'teslim_edildi').reduce((t, d) => t + Number(d.miktar), 0);
  const karsilandiOneri = !!n.karsilanmis_olabilir;
  const karsilandiDugmesi = el('button', { class: ['btn', karsilandiOneri ? 'btn-ana' : 'btn-cerceve'], type: 'button' }, [ikon('onay'), 'Karşılandı olarak işaretle']);
  karsilandiDugmesi.addEventListener('click', () => karsilandiIsaretle(n, karsilandiDugmesi, karsilandiOneri));
  // Destek sözü olmayan ihtiyaç silinebilir (sözü olan silinemez, karşılandı yapılır)
  const silDugmesi = Array.isArray(destekler) && destekler.length === 0
    && el('button', { class: 'btn btn-tehlike', type: 'button' }, [ikon('cop'), 'Sil', el('span', { class: 'gizli-erisim', text: `: ${n.baslik}` })]);
  if (silDugmesi) silDugmesi.addEventListener('click', () => ihtiyacSil(n, silDugmesi));

  const bekleyen = (destekler || []).filter((d) => d.durum === 'soz_verildi').length;
  return el('article', { class: 'kart yigin', style: { gap: '10px' }, 'aria-labelledby': `ihtiyac-${n.id}` }, [
    el('div', { class: 'ihtiyac-karti-ust' }, [
      el('span', { class: 'ihtiyac-karti-tur', text: `${etiket('ihtiyac_tur', n.tur)} · ${tarihFormatla(n.olusturma_tarihi)}` }),
      etiketRozeti('aciliyet', n.aciliyet)
    ]),
    el('h3', { class: 'ihtiyac-karti-baslik', id: `ihtiyac-${n.id}`, text: n.baslik }),
    n.aciklama && el('p', { class: 'ihtiyac-karti-metin', text: n.aciklama }),
    el('div', {
      class: ['ilerleme', o.kalan === 0 && 'ilerleme-tamam'], role: 'progressbar',
      'aria-label': `${n.baslik} karşılanma durumu`, 'aria-valuemin': '0', 'aria-valuemax': String(o.miktar), 'aria-valuenow': String(Math.min(o.soz, o.miktar)),
      'aria-valuetext': `${o.soz} ${birim} için söz verildi, ${teslim} ${birim} teslim edildi, gereken ${o.miktar} ${birim}`
    }, [
      el('span', { class: 'ilerleme-teslim', style: { width: `${o.sozOrani}%` } })
    ]),
    el('p', { class: 'ilerleme-metin', text: `Gereken ${sayiFormatla(o.miktar)} ${birim} · Söz ${sayiFormatla(o.soz)} · Teslim edilen ${sayiFormatla(teslim)} · Kalan ${sayiFormatla(o.kalan)}` }),
    karsilandiOneri && el('div', { class: 'uyari-kutusu uyari-kutusu-basari' }, [
      ikon('onay'),
      el('div', { class: 'uyari-kutusu-metin' }, [el('p', { text: 'Söz verilen miktar ihtiyacı karşılıyor. Teslimler tamamlanınca karşılandı olarak işaretleyebilirsin.' })])
    ]),
    el('h4', { class: 'alt-baslik', text: `Destek talepleri${destekler ? ` (${destekler.length})` : ''}${bekleyen ? ` · ${bekleyen} teslim bekliyor` : ''}` }),
    destekListesi(n, destekler),
    el('div', { class: 'btn-grup' }, [karsilandiDugmesi, silDugmesi])
  ]);
}

function destekListesi(n, destekler) {
  if (destekler === null) return el('p', { class: 'form-hata', text: 'Destek talepleri yüklenemedi.' });
  if (!destekler.length) return el('p', { class: 'metin-ikincil metin-kucuk', style: { margin: 0 }, text: 'Henüz destek sözü verilmedi.' });
  return el('ul', { class: 'destek-listesi' }, destekler.map((d) => {
    const tel = telLinki(d.telefon);
    const eylemler = d.durum === 'soz_verildi' && el('div', { class: 'btn-grup' }, [
      el('button', { class: 'btn btn-ana', type: 'button', onClick: (o) => destekDurumu(n, d, 'teslim_edildi', o.currentTarget) }, ['Teslim edildi', el('span', { class: 'gizli-erisim', text: `: ${d.ad_soyad}` })]),
      el('button', { class: 'btn btn-tehlike', type: 'button', onClick: (o) => destekDurumu(n, d, 'iptal', o.currentTarget) }, ['İptal', el('span', { class: 'gizli-erisim', text: `: ${d.ad_soyad}` })])
    ]);
    return el('li', { class: 'destek-satiri' }, [
      el('div', { class: 'destek-satiri-ust' }, [
        el('strong', { text: d.ad_soyad || '—' }),
        etiketRozeti('destek_durum', d.durum)
      ]),
      el('div', { class: 'metin-kucuk metin-ikincil satir', style: { gap: '4px 12px' } }, [
        el('span', {}, [el('strong', { style: { color: 'var(--metin)' }, text: `${sayiFormatla(d.miktar)} ${n.birim}` })]),
        el('span', { text: tarihFormatla(d.tarih) }),
        tel && el('a', { href: tel, class: 'baglanti', style: { minHeight: '32px' } }, [ikon('telefon', 'ikon-kucuk'), d.telefon])
      ]),
      d.aciklama && el('p', { class: 'metin-kucuk', style: { margin: 0 }, text: `“${d.aciklama}”` }),
      eylemler
    ]);
  }));
}

async function destekDurumu(n, d, durum, dugme) {
  if (durum === 'iptal') {
    const onay = await onayIste(`${d.ad_soyad} kişisinin ${sayiFormatla(d.miktar)} ${n.birim} destek sözü iptal edilecek.`, {
      baslik: 'Destek sözü iptal edilsin mi?', onayMetni: 'İptal et', iptalMetni: 'Vazgeç', tehlike: true
    });
    if (!onay) return;
  }
  await butonBekle(dugme, async () => {
    try {
      await apiPatch(`/api/pledges/${d.id}/durum`, { durum });
      toast(durum === 'teslim_edildi' ? `${sayiFormatla(d.miktar)} ${n.birim} teslim edildi.` : 'Destek sözü iptal edildi.', 'basari');
      await listele();
    } catch (hata) {
      toast(hataMetni(hata), 'hata');
    }
  });
}

async function karsilandiIsaretle(n, dugme, karsilandi) {
  const onay = await onayIste(
    karsilandi
      ? `"${n.baslik}" karşılandı olarak işaretlenecek ve açık ihtiyaçlardan kalkacak.`
      : `"${n.baslik}" için gereken miktarın tamamına henüz söz verilmedi. Yine de karşılandı olarak işaretlensin mi?`,
    { baslik: 'Karşılandı olarak işaretle', onayMetni: 'İşaretle' }
  );
  if (!onay) return;
  await butonBekle(dugme, async () => {
    try {
      await apiPatch(`/api/needs/${n.id}/karsilandi`);
      toast(`"${n.baslik}" karşılandı.`, 'basari');
      yukle();
    } catch (hata) {
      toast(hataMetni(hata), 'hata');
    }
  });
}

async function ihtiyacSil(n, dugme) {
  const onay = await onayIste(`"${n.baslik}" kalıcı olarak silinecek.`, { baslik: 'İhtiyaç silinsin mi?', onayMetni: 'Sil', tehlike: true });
  if (!onay) return;
  await butonBekle(dugme, async () => {
    try {
      await apiDelete(`/api/needs/${n.id}`);
      toast(`"${n.baslik}" silindi.`, 'basari');
      listele();
    } catch (hata) {
      toast(hata instanceof ApiHatasi && hata.durum === 409 ? `${hata.message} Karşılandı olarak işaretleyebilirsin.` : hataMetni(hata), 'hata', 7000);
    }
  });
}

async function karsilananlariYukle() {
  yukleniyorGoster(karsilananlar, 2, 'liste');
  try {
    const liste2 = await apiGet('/api/needs', { durum: 'karsilandi', kurum_id: sayfa.kurum.kurum_id });
    if (!liste2.length) {
      icerikDegistir(karsilananlar, el('p', { class: 'metin-ikincil', style: { margin: 0 }, text: 'Henüz karşılanan ihtiyaç yok.' }));
      return;
    }
    icerikDegistir(karsilananlar, el('ul', { class: 'liste' }, liste2.map((n) => el('li', { class: 'liste-satiri' }, [
      el('span', { class: 'liste-satiri-metin' }, [
        el('span', { class: 'liste-satiri-baslik', text: n.baslik }),
        el('span', { class: 'liste-satiri-alt', text: `${sayiFormatla(n.toplam_soz)} / ${sayiFormatla(n.miktar)} ${n.birim} söz verildi · ${tarihFormatla(n.kapanma_tarihi)}` })
      ]),
      etiketRozeti('ihtiyac_durum', 'karsilandi')
    ]))));
  } catch (hata) {
    hataGoster(karsilananlar, hataMetni(hata), karsilananlariYukle);
  }
}
