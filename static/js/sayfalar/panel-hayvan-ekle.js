// =============================================================================
// sayfalar/panel-hayvan-ekle.js – Hızlı hayvan ekleme (30 saniyede kayıt hedefi)
// Fotoğraf (çek/seç, küçült), ad, tür, cinsiyet, yaklaşık yaş; isteğe bağlı detaylar.
// Kayıt: önce hayvan, sonra fotoğraflar. Fotoğraf yüklemesi başarısız olursa
// hayvan kaydı korunur ve tekrar deneme sunulur.
// =============================================================================
import { el, ikon, icerikDegistir } from '../dom.js';
import { apiGet, apiPost, apiUpload, ApiHatasi } from '../api.js';
import { gorevliGerekli } from '../auth.js';
import { aktifKurum, KURUM_DEGISTI_OLAYI } from '../kurum.js';
import { panelUstCubugunuYerlestir } from '../layout.js';
import {
  hataGoster, hataMetni, toast, formHatalariniGoster, formHatalariniTemizle,
  yasSecimindenAy, yasMetni, etiket, bugunIso
} from '../ui.js';
import { fotografSecici } from '../fotograf.js';

const form = document.getElementById('hayvan-formu');
const sonucKabi = document.getElementById('sonuc');
const kaydetDugmesi = document.getElementById('kaydet');
const fotoAlani = document.getElementById('foto-alani');
const fotoBaslik = document.getElementById('foto-baslik');
const turKabi = document.getElementById('tur-secim');
const digerKabi = document.getElementById('diger-turler');
const digerTurKabi = document.getElementById('diger-tur-secim');
const yasYilAlani = document.getElementById('yas-yil-alani');

let kurum = null;
let turler = [];
let sonTur = null;          // "Bir tane daha ekle"de tür seçimi korunur
let degisti = false;        // kaydedilmemiş değişiklik uyarısı için
let baslangicZamani = null; // "x saniyede kaydedildi"
let gonderiliyor = false;

const secici = fotografSecici({
  girdi: form.elements.fotograf_sec,
  liste: document.getElementById('foto-onizleme'),
  degisince: (sayi) => {
    fotoAlani.classList.toggle('foto-yukle-kucuk', sayi > 0);
    fotoBaslik.textContent = sayi > 0 ? `Fotoğraf ekle (${sayi} seçili)` : 'Fotoğraf çek veya seç';
    if (sayi > 0) degisikligiIsaretle();
  },
  hataBildir: (mesaj) => toast(mesaj, 'uyari')
});

baslat();

async function baslat() {
  const kullanici = await gorevliGerekli().catch((hata) => {
    hataGoster(document.getElementById('icerik'), hataMetni(hata), () => window.location.reload());
    return null;
  });
  if (!kullanici) return;
  await panelUstCubugunuYerlestir({ baslik: 'Yeni hayvan', geri: '/panel/index.html', ek: '~30 sn' });
  kurum = await aktifKurum();
  if (!kurum) {
    hataGoster(document.getElementById('icerik'), 'Hesabınıza bağlı bir kurum bulunamadı.');
    return;
  }
  window.addEventListener(KURUM_DEGISTI_OLAYI, (olay) => {
    kurum = olay.detail;
    toast(`Hayvan ${kurum.ad} kurumuna eklenecek.`, 'bilgi');
  });

  await turleriYukle();

  form.addEventListener('input', degisikligiIsaretle);
  form.addEventListener('change', degisikligiIsaretle);
  form.elements.yas.addEventListener('change', () => {
    yasYilAlani.hidden = form.elements.yas.value !== 'yil';
    if (!yasYilAlani.hidden) form.elements.yas_yil.focus();
  });
  form.elements.dogum_tarihi.max = bugunIso();
  form.addEventListener('submit', kaydet);

  // Kaydedilmemiş değişiklikle sayfadan çıkılırsa tarayıcı uyarı verir
  window.addEventListener('beforeunload', (olay) => {
    if (degisti && !gonderiliyor) {
      olay.preventDefault();
      olay.returnValue = '';
    }
  });
}

function degisikligiIsaretle() {
  degisti = true;
  if (!baslangicZamani) baslangicZamani = Date.now();
}

// -----------------------------------------------------------------------------
// Tür seçimi: 3 veya daha az tür varsa hepsi; fazlaysa ilk ikisi + "Diğer"
// -----------------------------------------------------------------------------
async function turleriYukle() {
  try {
    // API ada göre sıralı döner; en eski türler (Kedi, Köpek…) öne alınsın diye kimliğe göre sıralanır
    turler = (await apiGet('/api/hayvan-turleri')).sort((x, y) => x.id - y.id);
  } catch (hata) {
    icerikDegistir(turKabi, el('div', { style: { gridColumn: '1 / -1' } }, [
      el('p', { class: 'form-hata', text: `Türler yüklenemedi: ${hataMetni(hata)}` }),
      el('button', { class: 'baglanti', type: 'button', text: 'Tekrar dene', onClick: turleriYukle })
    ]));
    return;
  }
  const radyo = (ad, deger, metin) => el('label', {}, [
    el('input', { type: 'radio', name: ad, value: deger, required: ad === 'tur' }),
    el('span', { text: metin })
  ]);
  const anaTurler = turler.length <= 3 ? turler : turler.slice(0, 2);
  const digerleri = turler.length <= 3 ? [] : turler.slice(2);
  icerikDegistir(turKabi, [
    ...anaTurler.map((t) => radyo('tur', t.id, t.ad)),
    digerleri.length > 0 && radyo('tur', 'diger', 'Diğer')
  ]);
  icerikDegistir(digerTurKabi, digerleri.map((t) => radyo('tur_diger', t.id, t.ad)));

  turKabi.addEventListener('change', () => {
    digerKabi.hidden = form.querySelector('input[name="tur"]:checked')?.value !== 'diger';
  });
  turSeciminiUygula(sonTur);
}

function turSeciminiUygula(turId) {
  form.querySelectorAll('input[name="tur"], input[name="tur_diger"]').forEach((g) => { g.checked = false; });
  digerKabi.hidden = true;
  if (!turId) return;
  const ana = form.querySelector(`input[name="tur"][value="${turId}"]`);
  if (ana) {
    ana.checked = true;
    return;
  }
  const diger = form.querySelector(`input[name="tur_diger"][value="${turId}"]`);
  if (diger) {
    form.querySelector('input[name="tur"][value="diger"]').checked = true;
    diger.checked = true;
    digerKabi.hidden = false;
  }
}

function seciliTur() {
  const ana = form.querySelector('input[name="tur"]:checked')?.value;
  if (!ana) return null;
  if (ana !== 'diger') return Number(ana);
  const diger = form.querySelector('input[name="tur_diger"]:checked')?.value;
  return diger ? Number(diger) : 'diger';
}

// -----------------------------------------------------------------------------
// Kayıt
// -----------------------------------------------------------------------------
function dogrula() {
  const hatalar = {};
  const ad = form.elements.ad.value.trim();
  const tur = seciliTur();
  if (ad.length < 2) hatalar.ad = 'Adını yaz (en az 2 harf).';
  if (!tur) hatalar.tur = 'Türünü seç.';
  else if (tur === 'diger') hatalar.tur_diger = 'Listeden bir tür seç.';
  if (!form.querySelector('input[name="cinsiyet"]:checked')) hatalar.cinsiyet = 'Cinsiyetini seç (bilmiyorsan "Bilinmiyor").';
  if (form.elements.yas.value === 'yil' && !form.elements.dogum_tarihi.value) {
    const yil = Number(String(form.elements.yas_yil.value).replace(',', '.'));
    if (!Number.isFinite(yil) || yil <= 0 || yil > 30) hatalar.yas_yil = 'Yaklaşık yaşı 0,5 ile 30 arasında gir.';
  }
  const dogum = form.elements.dogum_tarihi.value;
  if (dogum && dogum > bugunIso()) hatalar.dogum_tarihi = 'Doğum tarihi gelecekte olamaz.';
  return hatalar;
}

function govdeOlustur() {
  const v = form.elements;
  // Doğum tarihi biliniyorsa o, bilinmiyorsa yaklaşık yaş (ay) gönderilir; ikisi birden gönderilmez
  const govde = {
    kurum_id: kurum.kurum_id,
    ad: v.ad.value.trim(),
    tur_id: seciliTur(),
    cinsiyet: form.querySelector('input[name="cinsiyet"]:checked').value,
    cins: v.cins.value.trim() || null,
    kisirlastirildi: v.kisirlastirildi.checked,
    saglik_durumu: v.saglik_durumu.value.trim() || null,
    karakter_notu: v.karakter_notu.value.trim() || null
  };
  if (v.dogum_tarihi.value) {
    govde.dogum_tarihi = v.dogum_tarihi.value;
  } else if (v.yas.value !== 'bilinmiyor') {
    const secim = v.yas.value === 'yil' ? Number(String(v.yas_yil.value).replace(',', '.')) : v.yas.value;
    const ay = yasSecimindenAy(secim);
    if (ay !== null) govde.yaklasik_yas_ay = ay;
  }
  return govde;
}

async function kaydet(olay) {
  olay.preventDefault();
  if (gonderiliyor) return;
  formHatalariniTemizle(form);

  const hatalar = dogrula();
  if (Object.keys(hatalar).length) {
    if (hatalar.dogum_tarihi) document.getElementById('detaylar').open = true;
    formHatalariniGoster(form, hatalar);
    return;
  }
  if (secici.isleniyor()) {
    toast('Fotoğraflar hazırlanıyor, birkaç saniye bekleyip tekrar dene.', 'uyari');
    return;
  }

  gonderiliyor = true;
  kaydetDugmesi.disabled = true;
  kaydetDugmesi.setAttribute('aria-busy', 'true');
  kaydetDugmesi.textContent = 'Kaydediliyor…';

  const govde = govdeOlustur();
  const dosyalar = secici.dosyalar();
  let hayvan;
  try {
    hayvan = await apiPost('/api/animals', govde);
  } catch (hata) {
    gonderiliyor = false;
    dugmeyiSifirla();
    if (hata instanceof ApiHatasi && hata.durum === 400) {
      formHatalariniGoster(form, hata.alanlar, Object.keys(hata.alanlar).length ? '' : hata.message);
    } else {
      formHatalariniGoster(form, {}, `Hayvan kaydedilemedi: ${hataMetni(hata)}`);
    }
    return;
  }

  // Hayvan kaydedildi; artık sayfadan çıkış uyarısı gerekmez
  degisti = false;
  sonTur = govde.tur_id;
  const sure = baslangicZamani ? Math.round((Date.now() - baslangicZamani) / 1000) : null;

  let fotoHatasi = null;
  if (dosyalar.length) {
    kaydetDugmesi.textContent = 'Fotoğraflar yükleniyor…';
    fotoHatasi = await fotograflariYukle(hayvan.id, dosyalar);
  }
  gonderiliyor = false;
  sonucGoster(hayvan, govde, dosyalar, fotoHatasi, sure);
}

async function fotograflariYukle(hayvanId, dosyalar) {
  const veri = new FormData();
  dosyalar.forEach((d) => veri.append('fotograflar', d, d.name));
  try {
    await apiUpload(`/api/animals/${hayvanId}/photos`, veri);
    return null;
  } catch (hata) {
    return hataMetni(hata);
  }
}

function dugmeyiSifirla() {
  kaydetDugmesi.disabled = false;
  kaydetDugmesi.removeAttribute('aria-busy');
  kaydetDugmesi.textContent = 'Kaydet';
}

// -----------------------------------------------------------------------------
// Sonuç ekranı
// -----------------------------------------------------------------------------
function sonucGoster(hayvan, govde, dosyalar, fotoHatasi, sure) {
  form.hidden = true;
  window.scrollTo({ top: 0 });
  const turAdi = turler.find((t) => t.id === govde.tur_id)?.ad || '';
  const ozet = [kurum.ad, turAdi, etiket('cinsiyet', govde.cinsiyet), hayvan.dogum_tarihi ? yasMetni(hayvan.dogum_tarihi) : null]
    .filter(Boolean).join(' · ');

  const fotoDurumu = el('div');
  const fotoDurumunuCiz = (hata) => {
    if (!dosyalar.length) {
      icerikDegistir(fotoDurumu, el('p', { class: 'form-yardim', text: 'Fotoğraf eklenmedi. Daha sonra düzenleme ekranından ekleyebilirsin.' }));
    } else if (!hata) {
      icerikDegistir(fotoDurumu, el('p', { class: 'form-yardim', text: `${dosyalar.length} fotoğraf yüklendi.` }));
    } else {
      const tekrar = el('button', { class: 'btn btn-ana', type: 'button' }, [ikon('yenile'), 'Fotoğrafları tekrar yükle']);
      tekrar.addEventListener('click', async () => {
        tekrar.disabled = true;
        tekrar.setAttribute('aria-busy', 'true');
        const yeniHata = await fotograflariYukle(hayvan.id, dosyalar);
        fotoDurumunuCiz(yeniHata);
        toast(yeniHata ? `Yine yüklenemedi: ${yeniHata}` : 'Fotoğraflar yüklendi.', yeniHata ? 'hata' : 'basari');
      });
      icerikDegistir(fotoDurumu, el('div', { class: 'uyari-kutusu uyari-kutusu-uyari', role: 'alert' }, [
        ikon('uyari'),
        el('div', { class: 'uyari-kutusu-metin yigin', style: { gap: '8px' } }, [
          el('strong', { text: 'Hayvan kaydedildi ama fotoğraflar yüklenemedi' }),
          el('p', { text: `${hata} Kayıt kaybolmadı; fotoğrafları tekrar yükleyebilirsin.` }),
          tekrar
        ])
      ]));
    }
  };
  fotoDurumunuCiz(fotoHatasi);

  const birDaha = el('button', { class: 'btn btn-ana btn-buyuk btn-blok', type: 'button' }, [ikon('arti'), 'Bir tane daha ekle']);
  birDaha.addEventListener('click', yeniKayit);

  icerikDegistir(sonucKabi, el('div', { class: 'yigin', style: { gap: '16px', paddingBottom: '24px' } }, [
    el('div', { class: 'uyari-kutusu uyari-kutusu-basari', tabindex: '-1', id: 'sonuc-baslik' }, [
      ikon('onay'),
      el('div', { class: 'uyari-kutusu-metin' }, [
        el('strong', { text: `${hayvan.ad} kaydedildi` }),
        el('p', { text: ozet }),
        sure !== null && sure < 600 && el('p', { class: 'form-yardim', text: `${sure} saniyede kaydedildi.` })
      ])
    ]),
    fotoDurumu,
    birDaha,
    el('a', { class: 'btn btn-cerceve btn-buyuk btn-blok', href: `/panel/asi.html?hayvan=${hayvan.id}` }, [ikon('asi'), 'İlk aşısını gir']),
    el('a', { class: 'btn btn-cerceve btn-buyuk btn-blok', href: `/hayvan.html?id=${hayvan.id}` }, 'Hayvanı görüntüle'),
    el('a', { class: 'btn btn-cerceve btn-blok', href: `/panel/hayvan-duzenle.html?id=${hayvan.id}` }, [ikon('duzenle'), 'Düzenle'])
  ]));
  document.getElementById('sonuc-baslik').focus();
}

function yeniKayit() {
  form.reset();
  secici.temizle();
  formHatalariniTemizle(form);
  turSeciminiUygula(sonTur);
  yasYilAlani.hidden = true;
  document.getElementById('detaylar').open = false;
  dugmeyiSifirla();
  degisti = false;
  baslangicZamani = null;
  icerikDegistir(sonucKabi, []);
  form.hidden = false;
  window.scrollTo({ top: 0 });
  form.elements.ad.focus();
}
