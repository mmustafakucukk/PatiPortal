// =============================================================================
// sayfalar/panel-teslim-saatleri.js – Teslim alma saatleri (kurumun tüm görevlileri)
// Haftalık takvim, toplu ekleme (tarih aralığı, günler, saat aralığı, 30/60 dk)
// → önizleme → kaydet (API tek tek ekler; saatler sırayla gönderilir).
// Tek saat silme; planlanmış randevusu olan saat silinemez.
// =============================================================================
import { el, ikon, icerikDegistir } from '../dom.js';
import { apiGet, apiPost, apiDelete, ApiHatasi } from '../api.js';
import { panelSayfasi } from '../panel.js';
import {
  yukleniyorGoster, hataGoster, hataMetni, toast, onayIste, butonBekle, formHatalariniGoster,
  formHatalariniTemizle, bugunIso, gunEkle, gunFarki, tarihNesnesi, tarihFormatla, gunAdi, kisaTarih, sayiFormatla
} from '../ui.js';

const EN_FAZLA_GUN = 60;
const EN_FAZLA_SAAT = 200;
const form = document.getElementById('saat-formu');
const onizlemeKabi = document.getElementById('onizleme');
const takvim = document.getElementById('takvim');
let sayfa = null;
let haftaBasi = haftaninPazartesisi(bugunIso());
let saatlerSozu = null; // kurumun bugün ve sonrasındaki saatleri + dolu saat kimlikleri

baslat();

function haftaninPazartesisi(iso) {
  const gun = tarihNesnesi(iso).getDay(); // 0 = Pazar
  return gunEkle(iso, gun === 0 ? -6 : 1 - gun);
}
const dakika = (saat) => {
  const [s, d] = saat.split(':').map(Number);
  return s * 60 + d;
};
const saatMetni = (dk) => `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`;

async function baslat() {
  sayfa = await panelSayfasi({
    baslik: 'Teslim saatleri', menu: 'teslim-saatleri',
    kurumDegisince: () => { saatlerSozu = null; takvimiYukle(); }
  });
  if (!sayfa) return;
  const bugun = bugunIso();
  form.elements.baslangic_tarihi.value = bugun;
  form.elements.baslangic_tarihi.min = bugun;
  form.elements.bitis_tarihi.value = gunEkle(bugun, 13);
  form.elements.bitis_tarihi.min = bugun;
  form.addEventListener('submit', onizle);
  form.addEventListener('input', () => icerikDegistir(onizlemeKabi, []));
  document.getElementById('onceki-hafta').addEventListener('click', () => haftaDegistir(-7));
  document.getElementById('sonraki-hafta').addEventListener('click', () => haftaDegistir(7));
  takvimiYukle();
}

/**
 * API kurumun bugün ve sonrasındaki aktif saatlerini döner (tarih aralığı filtresi yok).
 * Planlanmış randevusu olan saatler randevu listesinden işaretlenir.
 */
function saatleriGetir(yenile = false) {
  if (!saatlerSozu || yenile) {
    const kurumId = sayfa.kurum.kurum_id;
    saatlerSozu = Promise.all([
      apiGet(`/api/institutions/${kurumId}/pickup-slots`),
      apiGet('/api/appointments', { durum: 'planlandi' }).catch(() => [])
    ]).then(([saatler, randevular]) => {
      const dolu = new Set(randevular.map((r) => r.teslim_saati_id));
      return saatler.map((s) => ({ ...s, dolu: dolu.has(s.id) }));
    });
    saatlerSozu.catch(() => { saatlerSozu = null; });
  }
  return saatlerSozu;
}

function haftaDegistir(gun) {
  haftaBasi = gunEkle(haftaBasi, gun);
  takvimiYukle();
}

// -----------------------------------------------------------------------------
// Haftalık takvim
// -----------------------------------------------------------------------------
async function takvimiYukle() {
  const bitis = gunEkle(haftaBasi, 6);
  const fark = gunFarki(haftaninPazartesisi(bugunIso()), haftaBasi);
  document.getElementById('hafta-baslik').textContent = fark === 0
    ? `Bu hafta · ${kisaTarih(haftaBasi)} – ${kisaTarih(bitis)}`
    : `${kisaTarih(haftaBasi)} – ${kisaTarih(bitis)} ${tarihNesnesi(bitis).getFullYear()}`;
  yukleniyorGoster(takvim, 2, 'metin');
  try {
    const saatler = await saatleriGetir();
    const bugun = bugunIso();
    icerikDegistir(takvim, el('div', { class: 'hafta-takvimi' }, Array.from({ length: 7 }, (_, i) => {
      const tarih = gunEkle(haftaBasi, i);
      const gunSaatleri = saatler.filter((s) => s.tarih === tarih);
      return el('section', { class: ['takvim-gunu', tarih === bugun && 'bugun', tarih < bugun && 'gecmis'], 'aria-label': `${tarihFormatla(tarih)} ${gunAdi(tarih)}` }, [
        el('h3', { text: `${gunAdi(tarih, true)} ${kisaTarih(tarih)}${tarih === bugun ? ' · Bugün' : ''}` }),
        gunSaatleri.length
          ? el('ul', { class: 'slot-listesi' }, gunSaatleri.map(slotCipi))
          : el('p', { class: 'metin-kucuk metin-ikincil', style: { margin: 0 }, text: tarih < bugun ? 'Geçti' : 'Saat yok' })
      ]);
    })));
  } catch (hata) {
    hataGoster(takvim, hataMetni(hata), takvimiYukle);
  }
}

function slotCipi(s) {
  const dolu = s.dolu;
  const sil = el('button', { class: 'btn btn-ikon', type: 'button', 'aria-label': `${tarihFormatla(s.tarih)} ${s.baslangic_saati} saatini sil` }, [ikon('cop', 'ikon-kucuk')]);
  sil.addEventListener('click', () => saatSil(s, sil));
  return el('li', { class: ['slot-cip', dolu && 'dolu'] }, [
    el('span', {}, [
      `${s.baslangic_saati}–${s.bitis_saati}`,
      el('small', { text: dolu ? 'Randevu var' : 'Boş' })
    ]),
    sil
  ]);
}

async function saatSil(s, dugme) {
  if (s.dolu) {
    toast(`${tarihFormatla(s.tarih)} ${s.baslangic_saati} saatinde randevu var, silinemez. Önce randevunun iptal edilmesi gerekir.`, 'uyari', 6000);
    return;
  }
  const onay = await onayIste(`${tarihFormatla(s.tarih)} ${gunAdi(s.tarih)} ${s.baslangic_saati}–${s.bitis_saati} teslim saati silinecek.`, {
    baslik: 'Saat silinsin mi?', onayMetni: 'Sil', tehlike: true
  });
  if (!onay) return;
  await butonBekle(dugme, async () => {
    try {
      await apiDelete(`/api/pickup-slots/${s.id}`);
      toast('Teslim saati silindi.', 'basari');
      saatlerSozu = null;
      takvimiYukle();
    } catch (hata) {
      toast(hataMetni(hata), 'hata', hata instanceof ApiHatasi && hata.durum === 409 ? 7000 : 4000);
    }
  });
}

// -----------------------------------------------------------------------------
// Toplu ekleme: önizleme ve kaydetme
// -----------------------------------------------------------------------------
function formuOku() {
  const v = form.elements;
  return {
    bas: v.baslangic_tarihi.value,
    bit: v.bitis_tarihi.value,
    gunler: Array.from(form.querySelectorAll('input[name="gunler"]:checked')).map((g) => Number(g.value)),
    saatBas: v.baslangic_saati.value,
    saatBit: v.bitis_saati.value,
    sure: Number(form.querySelector('input[name="sure"]:checked')?.value || 30)
  };
}

function dogrula(d) {
  const bugun = bugunIso();
  const h = {};
  if (!d.bas) h.baslangic_tarihi = 'İlk günü seç.';
  else if (d.bas < bugun) h.baslangic_tarihi = 'Geçmiş bir güne saat eklenemez.';
  if (!d.bit) h.bitis_tarihi = 'Son günü seç.';
  else if (d.bas && d.bit < d.bas) h.bitis_tarihi = 'Son gün, ilk günden önce olamaz.';
  else if (d.bas && gunFarki(d.bas, d.bit) >= EN_FAZLA_GUN) h.bitis_tarihi = `En fazla ${EN_FAZLA_GUN} günlük aralık seçilebilir.`;
  if (!d.gunler.length) h.gunler = 'En az bir gün seç.';
  if (!d.saatBas) h.baslangic_saati = 'Başlangıç saatini gir.';
  if (!d.saatBit) h.bitis_saati = 'Bitiş saatini gir.';
  else if (d.saatBas && dakika(d.saatBit) - dakika(d.saatBas) < d.sure) h.bitis_saati = `Bitiş, başlangıçtan en az ${d.sure} dakika sonra olmalı.`;
  return h;
}

function saatleriUret(d) {
  const sonuc = [];
  const bugun = bugunIso();
  const simdi = new Date();
  const simdiDk = simdi.getHours() * 60 + simdi.getMinutes();
  for (let tarih = d.bas; tarih <= d.bit; tarih = gunEkle(tarih, 1)) {
    if (!d.gunler.includes(tarihNesnesi(tarih).getDay())) continue;
    for (let dk = dakika(d.saatBas); dk + d.sure <= dakika(d.saatBit); dk += d.sure) {
      if (tarih === bugun && dk <= simdiDk) continue; // bugün geçmiş saatler atlanır
      sonuc.push({ tarih, baslangic_saati: saatMetni(dk), bitis_saati: saatMetni(dk + d.sure) });
    }
  }
  return sonuc;
}

async function onizle(olay) {
  olay.preventDefault();
  formHatalariniTemizle(form);
  const d = formuOku();
  const hatalar = dogrula(d);
  if (Object.keys(hatalar).length) {
    formHatalariniGoster(form, hatalar);
    return;
  }
  const uretilen = saatleriUret(d);
  if (!uretilen.length) {
    formHatalariniGoster(form, {}, 'Seçimlere uyan saat oluşmadı. Günleri ve saat aralığını kontrol et.');
    return;
  }
  if (uretilen.length > EN_FAZLA_SAAT) {
    formHatalariniGoster(form, {}, `${sayiFormatla(uretilen.length)} saat oluşuyor; tek seferde en fazla ${EN_FAZLA_SAAT} eklenebilir. Aralığı daralt.`);
    return;
  }

  let mevcut = [];
  try {
    mevcut = await saatleriGetir(true);
  } catch {
    // Kontrol yapılamazsa tüm saatler gönderilir
  }
  const varMi = (s) => mevcut.some((m) => m.tarih === s.tarih && m.baslangic_saati === s.baslangic_saati);
  const yeniler = uretilen.filter((s) => !varMi(s));
  const tekrarlar = uretilen.length - yeniler.length;

  // Günlere göre gruplu önizleme
  const gruplar = new Map();
  for (const s of uretilen) {
    if (!gruplar.has(s.tarih)) gruplar.set(s.tarih, []);
    gruplar.get(s.tarih).push(s);
  }

  const kaydet = el('button', { class: 'btn btn-ana btn-blok', type: 'button', disabled: !yeniler.length, text: yeniler.length ? `${sayiFormatla(yeniler.length)} saati kaydet` : 'Eklenecek yeni saat yok' });
  kaydet.addEventListener('click', () => butonBekle(kaydet, () => kaydetIslemi(yeniler, d)));

  icerikDegistir(onizlemeKabi, el('div', { class: 'yigin', style: { gap: '12px' } }, [
    el('div', { class: 'uyari-kutusu uyari-kutusu-bilgi' }, [
      ikon('takvim'),
      el('div', { class: 'uyari-kutusu-metin' }, [
        el('strong', { text: `${sayiFormatla(yeniler.length)} yeni teslim saati oluşacak` }),
        el('p', { text: `${gruplar.size} gün · ${d.sure} dakikalık${tekrarlar ? ` · ${tekrarlar} saat zaten var, atlanacak` : ''}` })
      ])
    ]),
    el('ul', { class: 'onizleme-ozet', 'aria-label': 'Oluşacak saatler' }, [...gruplar.entries()].map(([tarih, liste]) => el('li', {}, [
      el('strong', { text: `${gunAdi(tarih, true)} ${tarihFormatla(tarih)}: ` }),
      ...liste.flatMap((s, i) => [i ? ', ' : '', el('span', { class: varMi(s) ? 'var' : null, text: s.baslangic_saati })])
    ]))),
    kaydet
  ]));
}

async function kaydetIslemi(yeniler, d) {
  // API toplu ekleme sunmuyor: saatler sırayla tek tek gönderilir
  const yol = `/api/institutions/${sayfa.kurum.kurum_id}/pickup-slots`;
  const durumMetni = el('p', { class: 'form-yardim', role: 'status' });
  onizlemeKabi.appendChild(durumMetni);
  let eklenen = 0;
  let ilkHata = null;
  for (const s of yeniler) {
    durumMetni.textContent = `${eklenen + 1} / ${yeniler.length} ekleniyor…`;
    try {
      await apiPost(yol, s);
      eklenen += 1;
    } catch (hata) {
      ilkHata = hata;
      break;
    }
  }
  saatlerSozu = null;
  haftaBasi = haftaninPazartesisi(d.bas);
  takvimiYukle();
  if (!ilkHata) {
    toast(`${sayiFormatla(eklenen)} teslim saati eklendi. Kullanıcılar artık bu saatleri seçebilir.`, 'basari', 6000);
    icerikDegistir(onizlemeKabi, []);
    document.getElementById('toplu-ekle').open = false;
    return;
  }
  durumMetni.remove();
  const ayrinti = ilkHata instanceof ApiHatasi ? `${ilkHata.message} ${Object.values(ilkHata.alanlar).join(' ')}`.trim() : hataMetni(ilkHata);
  formHatalariniGoster(form, {}, `${sayiFormatla(eklenen)} saat eklendi, sonrakiler eklenemedi: ${ayrinti} Önizlemeyi yeniden açıp kalanları ekleyebilirsin.`);
}
