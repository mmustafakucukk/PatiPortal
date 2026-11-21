// =============================================================================
// sayfalar/anasayfa.js – Anasayfa: sayaçlar, öne çıkan hayvanlar, acil ihtiyaçlar
// =============================================================================
import { el, icerikDegistir } from '../dom.js';
import { apiGet, sayfaliYanit } from '../api.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir } from '../layout.js';
import { yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, sayiFormatla } from '../ui.js';
import { hayvanKarti, ihtiyacKarti } from '../kartlar.js';

const SAYACLAR = [
  { anahtar: 'barinaktaki_hayvan', etiket: 'Yuva bekleyen dost' },
  { anahtar: 'sahiplendirilen_hayvan', etiket: 'Portal üzerinden sahiplenildi' },
  { anahtar: 'aktif_kurum', etiket: 'Barınak ve klinik' },
  { anahtar: 'acik_ihtiyac', etiket: 'Karşılanmayı bekleyen ihtiyaç', sinif: 'sayac-acil' }
];

ustMenuyuYerlestir();
altBilgiyiYerlestir();
sayaclariYukle();
hayvanlariYukle();
ihtiyaclariYukle();

async function sayaclariYukle() {
  const kap = document.getElementById('sayaclar');
  icerikDegistir(kap, SAYACLAR.map(() => el('li', { 'aria-hidden': 'true' }, [
    el('span', { class: 'iskelet', style: { width: '64px', height: '38px' } }),
    el('span', { class: 'iskelet iskelet-metin', style: { width: '80%' } })
  ])));
  try {
    // Açık ihtiyaç sayısı genel istatistikte yok; açık ihtiyaç listesinden sayılır
    const [istatistik, ihtiyaclar] = await Promise.all([
      apiGet('/api/stats/public'),
      apiGet('/api/needs', { durum: 'acik' })
    ]);
    const veri = { ...istatistik, acik_ihtiyac: ihtiyaclar.length };
    icerikDegistir(kap, SAYACLAR.map((s) => el('li', { class: s.sinif }, [
      el('span', { class: 'sayac-deger', text: sayiFormatla(veri[s.anahtar] ?? 0) }),
      el('span', { class: 'sayac-etiket', text: s.etiket })
    ])));
  } catch (hata) {
    icerikDegistir(kap, el('li', { style: { gridColumn: '1 / -1' } }, [
      el('p', { class: 'metin-ikincil', style: { margin: 0 }, text: `Sayılar yüklenemedi: ${hataMetni(hata)}` }),
      el('button', { class: 'baglanti', type: 'button', onClick: sayaclariYukle, text: 'Tekrar dene' })
    ]));
  }
}

async function hayvanlariYukle() {
  const kap = document.getElementById('one-cikanlar');
  yukleniyorGoster(kap, 6);
  try {
    // Görevli giriş yapmışsa da yalnızca yuva arayanlar gösterilir
    const sayfa = sayfaliYanit(await apiGet('/api/animals', { durum: 'barinakta', limit: 6 }));
    const link = document.getElementById('tumunu-gor');
    link.textContent = `Tümünü gör (${sayiFormatla(sayfa.toplam)})`;
    if (!sayfa.kayitlar.length) {
      bosDurumGoster(kap, { baslik: 'Şu an yuva arayan hayvan yok', aciklama: 'Yeni dostlar eklendiğinde burada görünecek.' });
      return;
    }
    icerikDegistir(kap, sayfa.kayitlar.map((h) => hayvanKarti(h)));
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), hayvanlariYukle);
  }
}

async function ihtiyaclariYukle() {
  const kap = document.getElementById('acil-ihtiyaclar');
  yukleniyorGoster(kap, 3, 'metin');
  try {
    // API açık ihtiyaçları aciliyete göre sıralı döner
    const ihtiyaclar = await apiGet('/api/needs', { durum: 'acik' });
    if (!ihtiyaclar.length) {
      bosDurumGoster(kap, { baslik: 'Şu an açık ihtiyaç yok', aciklama: 'Kurumlar yeni bir ihtiyaç yayınladığında burada göreceksin.', ikon: 'ihtiyac' });
      return;
    }
    icerikDegistir(kap, ihtiyaclar.slice(0, 3).map((n) => ihtiyacKarti(n)));
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), ihtiyaclariYukle);
  }
}
