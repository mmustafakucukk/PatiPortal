// =============================================================================
// sayfalar/kurum.js – Kurum detayı: iletişim bilgileri, yuva arayan hayvanlar,
// açık ihtiyaçlar
// =============================================================================
import { el, ikon, icerikDegistir, sayiParametresi, telLinki } from '../dom.js';
import { apiGet, ApiHatasi, sayfaliYanit } from '../api.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir } from '../layout.js';
import { yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, etiketRozeti, sayiFormatla } from '../ui.js';
import { KURUM_YOK, hayvanKarti, ihtiyacKarti, ekmekKirintisi } from '../kartlar.js';

const GOSTERILECEK_HAYVAN = 8;
const bilgiKabi = document.getElementById('kurum-bilgi');
const kurumId = sayiParametresi('id');

ustMenuyuYerlestir();
altBilgiyiYerlestir();
yukle();

function bulunamadi() {
  document.title = 'Kurum bulunamadı – PatiPortal';
  icerikDegistir(bilgiKabi, el('div', { style: { paddingBottom: '56px' } }, [
    ekmekKirintisi([['Anasayfa', '/index.html'], ['Kurumlar', '/kurumlar.html'], ['Bulunamadı']]),
    el('div', { class: 'bos-durum' }, [
      el('span', { class: 'bos-durum-ikon' }, [ikon('bina')]),
      el('h1', { style: { fontSize: '22px', margin: 0 }, text: 'Bu kurumu bulamadık' }),
      el('p', { text: 'Kurum kaldırılmış ya da bağlantı hatalı olabilir.' }),
      el('a', { class: 'btn btn-ana', href: '/kurumlar.html', text: 'Tüm kurumlar' })
    ])
  ]));
}

async function yukle() {
  if (!kurumId) {
    bulunamadi();
    return;
  }
  icerikDegistir(bilgiKabi, el('div', { class: 'kart', 'aria-hidden': 'true' }, [
    el('div', { class: 'iskelet iskelet-baslik' }),
    el('div', { class: 'iskelet iskelet-metin' }),
    el('div', { class: 'iskelet iskelet-metin iskelet-metin-kisa' })
  ]));
  let kurum;
  try {
    kurum = await apiGet(`/api/institutions/${kurumId}`);
  } catch (hata) {
    if (hata instanceof ApiHatasi && hata.durum === 404) bulunamadi();
    else hataGoster(bilgiKabi, hataMetni(hata), yukle);
    return;
  }
  document.title = `${kurum.ad} – PatiPortal`;
  kurumBilgisi(kurum);
  hayvanlariYukle(kurum);
  ihtiyaclariYukle(kurum);
}

function kurumBilgisi(k) {
  const tel = telLinki(k.telefon);
  const harita = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${k.ad} ${k.adres || ''}`.trim())}`;
  icerikDegistir(bilgiKabi, [
    ekmekKirintisi([['Anasayfa', '/index.html'], ['Kurumlar', '/kurumlar.html'], [k.ad]]),
    el('section', { class: 'kart kurum-baslik', 'aria-labelledby': 'kurum-adi' }, [
      el('img', { class: 'kurum-baslik-logo', src: KURUM_YOK, alt: '', width: '88', height: '88' }),
      el('div', {}, [
        el('div', { class: 'satir', style: { marginBottom: '8px' } }, [etiketRozeti('kurum_tur', k.tur, 'rozet-buyuk')]),
        el('h1', { id: 'kurum-adi', text: k.ad }),
        k.aciklama && el('p', { class: 'detay-metin', text: k.aciklama }),
        el('ul', { class: 'bilgi-listesi' }, [
          k.adres && el('li', {}, [ikon('konum'), el('span', {}, [
            k.adres, ' ',
            el('a', { href: harita, target: '_blank', rel: 'noopener noreferrer' }, ['Haritada aç', el('span', { class: 'gizli-erisim', text: ' (yeni sekmede açılır)' })])
          ])]),
          k.telefon && el('li', {}, [ikon('telefon'), tel ? el('a', { href: tel, text: k.telefon }) : k.telefon]),
          k.email && el('li', {}, [ikon('belge'), el('a', { href: `mailto:${k.email}`, text: k.email })])
        ])
      ])
    ])
  ]);
}

async function hayvanlariYukle(k) {
  const bolum = document.getElementById('kurum-hayvanlar-bolum');
  const kap = document.getElementById('kurum-hayvanlar');
  const sayi = document.getElementById('kurum-hayvan-sayisi');
  const link = document.getElementById('kurum-tum-hayvanlar');
  bolum.hidden = false;
  link.href = `/hayvanlar.html?kurum=${encodeURIComponent(k.id)}`;
  yukleniyorGoster(kap, 4);
  try {
    const sayfa = sayfaliYanit(await apiGet('/api/animals', { kurum_id: k.id, durum: 'barinakta', limit: GOSTERILECEK_HAYVAN }));
    sayi.textContent = `${k.ad} bünyesinde ${sayiFormatla(sayfa.toplam)} hayvan yuva arıyor.`;
    link.hidden = sayfa.toplam <= GOSTERILECEK_HAYVAN;
    link.textContent = `Tümünü gör (${sayiFormatla(sayfa.toplam)})`;
    if (!sayfa.kayitlar.length) {
      bosDurumGoster(kap, { baslik: 'Şu an yuva arayan hayvan yok', aciklama: 'Bu kurumda sahiplendirilmeyi bekleyen hayvan bulunmuyor.' }, { metin: 'Diğer kurumlardaki dostlar', href: '/hayvanlar.html' });
      kap.firstElementChild.style.gridColumn = '1 / -1';
      return;
    }
    icerikDegistir(kap, sayfa.kayitlar.map((h) => hayvanKarti(h, { kurumGoster: false })));
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), () => hayvanlariYukle(k));
    kap.firstElementChild.style.gridColumn = '1 / -1';
  }
}

async function ihtiyaclariYukle(k) {
  const bolum = document.getElementById('kurum-ihtiyaclar-bolum');
  const kap = document.getElementById('kurum-ihtiyaclar');
  bolum.hidden = false;
  yukleniyorGoster(kap, 2, 'metin');
  try {
    const ihtiyaclar = await apiGet('/api/needs', { durum: 'acik', kurum_id: k.id });
    if (!ihtiyaclar.length) {
      bosDurumGoster(kap, { baslik: 'Açık ihtiyaç yok', aciklama: 'Bu kurumun şu an bekleyen bir ihtiyacı bulunmuyor.', ikon: 'ihtiyac' });
      kap.firstElementChild.style.gridColumn = '1 / -1';
      return;
    }
    icerikDegistir(kap, ihtiyaclar.map((n) => ihtiyacKarti(n, { kurumGoster: false })));
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), () => ihtiyaclariYukle(k));
    kap.firstElementChild.style.gridColumn = '1 / -1';
  }
}
