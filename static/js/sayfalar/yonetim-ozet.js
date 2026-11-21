// =============================================================================
// sayfalar/yonetim-ozet.js – Sistem yönetimi özeti
// Kurum, kullanıcı, hayvan ve bu ayki sahiplendirme sayıları; süreç durumu.
// Son işlem kayıtları: backend'de listeleme uç noktası olmadığı için bilgi gösterilir.
// =============================================================================
import { el, ikon, icerikDegistir } from '../dom.js';
import { apiGet } from '../api.js';
import { yonetimSayfasi } from '../yonetim.js';
import { hataGoster, hataMetni, sayiFormatla } from '../ui.js';

baslat();

async function baslat() {
  const kullanici = await yonetimSayfasi('ozet');
  if (!kullanici) return;
  sayaclariYukle();
  sonIslemler();
}

function iskelet(kap, adet) {
  icerikDegistir(kap, Array.from({ length: adet }, () => el('div', { class: 'sayac', 'aria-hidden': 'true' }, [
    el('span', { class: 'iskelet', style: { width: '56px', height: '34px' } }),
    el('span', { class: 'iskelet iskelet-metin' })
  ])));
}

function sayac({ deger, etiket, alt = '', href = null, sinif = '' }) {
  return el(href ? 'a' : 'div', { class: ['sayac', sinif], href }, [
    el('span', { class: 'sayac-deger', text: sayiFormatla(deger ?? 0) }),
    el('span', { class: 'sayac-etiket', text: etiket }),
    alt && el('span', { class: 'sayac-etiket metin-kucuk', style: { marginTop: '2px', fontSize: '13px' }, text: alt })
  ]);
}

async function sayaclariYukle() {
  const ana = document.getElementById('sayaclar');
  const surec = document.getElementById('surec-sayaclari');
  iskelet(ana, 4);
  iskelet(surec, 4);
  try {
    // Admin için istatistik tüm kurumları kapsar
    const [kurumlar, kullanicilar, ist] = await Promise.all([
      apiGet('/api/institutions'),
      apiGet('/api/users'),
      apiGet('/api/stats')
    ]);
    const say = (dizi, kosul) => dizi.filter(kosul).length;
    const aktifKurum = say(kurumlar, (k) => k.aktif !== false);
    const pasifKurum = kurumlar.length - aktifKurum;
    const barinak = say(kurumlar, (k) => k.tur === 'barinak');

    icerikDegistir(ana, [
      sayac({
        deger: kurumlar.length, etiket: 'Kurum', href: '/yonetim/kurumlar.html',
        alt: `${barinak} barınak · ${kurumlar.length - barinak} klinik${pasifKurum ? ` · ${pasifKurum} pasif` : ''}`
      }),
      sayac({
        deger: kullanicilar.length, etiket: 'Kullanıcı', href: '/yonetim/kullanicilar.html',
        alt: `${say(kullanicilar, (k) => k.rol === 'gorevli')} görevli · ${say(kullanicilar, (k) => k.rol === 'admin')} yönetici`
      }),
      sayac({
        deger: ist.toplam_hayvan, etiket: 'Hayvan',
        alt: `${sayiFormatla(ist.barinaktaki_hayvan)} yuva arıyor · ${sayiFormatla(ist.sahiplendirilen_hayvan)} yuvasında`
      }),
      sayac({ deger: ist.aylik_sahiplendirme, etiket: 'Bu ay sahiplendirme', sinif: 'sayac-basari', alt: `${sayiFormatla(ist.aylik_basvuru)} başvuru bu ay` })
    ]);

    icerikDegistir(surec, [
      sayac({ deger: ist.bekleyen_basvuru, etiket: 'Bekleyen başvuru', sinif: 'sayac-uyari' }),
      sayac({ deger: ist.tedavideki_hayvan, etiket: 'Tedavideki hayvan', sinif: 'sayac-bilgi' }),
      sayac({ deger: ist.acik_ihtiyac, etiket: 'Açık ihtiyaç', sinif: 'sayac-acil', href: '/ihtiyaclar.html' }),
      sayac({ deger: ist.geciken_asi, etiket: 'Geciken aşı', sinif: ist.geciken_asi ? 'sayac-acil' : '', alt: `${sayiFormatla(ist.bu_hafta_asisi_gelen)} aşı bu hafta` })
    ]);
  } catch (hata) {
    hataGoster(ana, hataMetni(hata), sayaclariYukle);
    ana.firstElementChild.style.gridColumn = '1 / -1';
    icerikDegistir(surec, []);
  }
}

function sonIslemler() {
  icerikDegistir(document.getElementById('son-islemler'), el('div', { class: 'uyari-kutusu uyari-kutusu-bilgi' }, [
    ikon('bilgi'),
    el('div', { class: 'uyari-kutusu-metin' }, [
      el('strong', { text: 'İşlem kayıtları henüz listelenemiyor' }),
      el('p', { text: 'Backend işlemleri kaydediyor ama bu kayıtları okumak için bir uç nokta yok. Uç nokta eklendiğinde son 10 işlem burada görünecek.' })
    ])
  ]));
}
