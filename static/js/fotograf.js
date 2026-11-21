// =============================================================================
// fotograf.js – Fotoğrafları göndermeden önce küçültme ve önizleme listesi
// En uzun kenar 1600px, JPEG kalitesi 0.85 (FRONTEND_GOREV.md 8.2/2)
// =============================================================================
import { el, ikon, icerikDegistir } from './dom.js';

export const EN_UZUN_KENAR = 1600;
export const JPEG_KALITESI = 0.85;
export const EN_FAZLA_FOTOGRAF = 10;

function resimYukle(dosya) {
  return new Promise((coz, reddet) => {
    const url = URL.createObjectURL(dosya);
    const resim = new Image();
    resim.onload = () => {
      URL.revokeObjectURL(url);
      coz(resim);
    };
    resim.onerror = () => {
      URL.revokeObjectURL(url);
      reddet(new Error('Görsel okunamadı'));
    };
    resim.src = url;
  });
}

/**
 * Görseli canvas ile küçültür ve JPEG'e çevirir. Telefon fotoğraflarının yönü
 * (EXIF) korunur. Görsel zaten küçükse yalnızca JPEG'e çevrilir.
 *   const jpeg = await fotografKucult(dosya)  → File (image/jpeg)
 */
export async function fotografKucult(dosya, sira = 1) {
  if (!dosya || !dosya.type.startsWith('image/')) throw new Error('Yalnızca görsel dosyaları eklenebilir.');
  let kaynak;
  try {
    kaynak = await createImageBitmap(dosya, { imageOrientation: 'from-image' });
  } catch {
    kaynak = await resimYukle(dosya);
  }
  const genislik = kaynak.width || kaynak.naturalWidth;
  const yukseklik = kaynak.height || kaynak.naturalHeight;
  if (!genislik || !yukseklik) throw new Error('Görsel boyutu okunamadı.');
  const oran = Math.min(1, EN_UZUN_KENAR / Math.max(genislik, yukseklik));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(genislik * oran);
  canvas.height = Math.round(yukseklik * oran);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // saydam PNG'ler JPEG'de siyah görünmesin
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(kaynak, 0, 0, canvas.width, canvas.height);
  if (typeof kaynak.close === 'function') kaynak.close();
  const blob = await new Promise((coz) => canvas.toBlob(coz, 'image/jpeg', JPEG_KALITESI));
  if (!blob) throw new Error('Görsel dönüştürülemedi.');
  return new File([blob], `fotograf-${sira}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

/**
 * Seçilen fotoğrafları tutan, küçülten ve önizleyen küçük bileşen.
 *   const secici = fotografSecici({ girdi, liste, degisince })
 *   secici.dosyalar()   → küçültülmüş File dizisi (ilk eleman kapak)
 *   secici.temizle()
 */
export function fotografSecici({ girdi, liste, degisince = () => {}, hataBildir = () => {} }) {
  let ogeler = []; // { id, dosya, url, hazir }
  let sayac = 0;

  const ciz = () => {
    icerikDegistir(liste, ogeler.map((o, i) => el('li', { class: o.hazir ? null : 'foto-isleniyor' }, [
      o.hazir
        ? el('img', { src: o.url, alt: `Seçilen fotoğraf ${i + 1}` })
        : el('span', { class: 'donen', role: 'status', 'aria-label': 'Fotoğraf hazırlanıyor' }),
      i === 0 && o.hazir && el('span', { class: 'rozet rozet-notr', text: 'Kapak' }),
      el('button', {
        class: 'btn btn-ikon', type: 'button', 'aria-label': `${i + 1}. fotoğrafı kaldır`,
        onClick: () => kaldir(o.id)
      }, [ikon('kapat', 'ikon-kucuk')])
    ])));
    liste.hidden = ogeler.length === 0;
    degisince(ogeler.length);
  };

  const kaldir = (id) => {
    const o = ogeler.find((x) => x.id === id);
    if (o?.url) URL.revokeObjectURL(o.url);
    ogeler = ogeler.filter((x) => x.id !== id);
    ciz();
    girdi.focus();
  };

  girdi.addEventListener('change', async () => {
    const secilenler = Array.from(girdi.files || []);
    girdi.value = ''; // aynı dosya tekrar seçilebilsin
    const yer = EN_FAZLA_FOTOGRAF - ogeler.length;
    if (secilenler.length > yer) hataBildir(`En fazla ${EN_FAZLA_FOTOGRAF} fotoğraf eklenebilir.`);
    const yeniler = secilenler.slice(0, Math.max(0, yer)).map((dosya) => ({ id: ++sayac, kaynak: dosya, dosya: null, url: null, hazir: false }));
    ogeler.push(...yeniler);
    ciz();
    for (const o of yeniler) {
      try {
        o.dosya = await fotografKucult(o.kaynak, o.id);
        o.url = URL.createObjectURL(o.dosya);
        o.hazir = true;
      } catch (hata) {
        ogeler = ogeler.filter((x) => x.id !== o.id);
        hataBildir(`${o.kaynak.name} eklenemedi: ${hata.message}`);
      }
      ciz();
    }
  });

  return {
    dosyalar: () => ogeler.filter((o) => o.hazir).map((o) => o.dosya),
    isleniyor: () => ogeler.some((o) => !o.hazir),
    temizle: () => {
      ogeler.forEach((o) => o.url && URL.revokeObjectURL(o.url));
      ogeler = [];
      ciz();
    }
  };
}
