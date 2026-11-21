// =============================================================================
// sayfalar/yonetim-hayvan-turleri.js – Hayvan türleri
// Liste (zorunlu aşılar, hayvan sayısı) ve yeni tür ekleme.
// Backend'de tür adını değiştirme ve silme yok; bu düğmeler gösterilmez.
// Zorunlu aşılar Aşı türleri sayfasındaki gereklilik tablosundan düzenlenir.
// =============================================================================
import { el, ikon, icerikDegistir } from '../dom.js';
import { apiGet, apiPost, ApiHatasi, sayfaliYanit } from '../api.js';
import { yonetimSayfasi } from '../yonetim.js';
import {
  yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, toast, modalAc, butonBekle,
  formHatalariniGoster, formHatalariniTemizle, sayiFormatla
} from '../ui.js';

const liste = document.getElementById('tur-listesi');

baslat();

async function baslat() {
  const kullanici = await yonetimSayfasi('hayvan-turleri');
  if (!kullanici) return;
  const ekle = el('button', { class: 'btn btn-ana', type: 'button' }, [ikon('arti'), 'Tür ekle']);
  ekle.addEventListener('click', turEkleAc);
  icerikDegistir(document.getElementById('baslik-eylem'), ekle);
  yukle();
}

/** Türdeki hayvan sayısı (tüm durumlar; admin için API durum filtresi uygulamaz). */
async function hayvanSayisi(turId) {
  try {
    return sayfaliYanit(await apiGet('/api/animals', { tur_id: turId, limit: 1 })).toplam;
  } catch {
    return null;
  }
}

async function yukle(vurgulanacakId = null) {
  yukleniyorGoster(liste, 3, 'liste');
  try {
    const turler = await apiGet('/api/hayvan-turleri');
    if (!turler.length) {
      bosDurumGoster(liste, { baslik: 'Henüz hayvan türü yok', aciklama: 'Hayvan eklemek için önce en az bir tür tanımla.', ikon: 'pati' }, { metin: 'Tür ekle', tikla: turEkleAc });
      return;
    }
    const sayilar = await Promise.all(turler.map((t) => hayvanSayisi(t.id)));
    icerikDegistir(liste, [
      el('div', { class: 'tablo-kap' }, [
        el('table', { class: 'tablo' }, [
          el('caption', { class: 'gizli-erisim', text: 'Hayvan türleri' }),
          el('thead', {}, [el('tr', {}, [
            el('th', { scope: 'col', text: 'Tür' }),
            el('th', { scope: 'col', text: 'Zorunlu aşılar' }),
            el('th', { scope: 'col', class: 'tablo-sayi', text: 'Hayvan' }),
            el('th', { scope: 'col' }, [el('span', { class: 'gizli-erisim', text: 'İşlemler' })])
          ])]),
          el('tbody', {}, turler.map((t, i) => el('tr', { id: `tur-${t.id}`, style: t.id === vurgulanacakId ? { background: 'var(--basari-zemin)' } : null }, [
            el('td', { class: 'tablo-baslik-hucre', 'data-etiket': 'Tür', text: t.ad }),
            el('td', { 'data-etiket': 'Zorunlu aşılar' }, [t.zorunlu_asilar.length
              ? el('div', { class: 'rozet-grubu' }, t.zorunlu_asilar.map((a) => el('span', { class: 'rozet rozet-bilgi', text: a.ad })))
              : el('span', { class: 'rozet rozet-uyari', text: 'Tanımlanmadı' })]),
            el('td', { class: 'tablo-sayi', 'data-etiket': 'Hayvan', text: sayilar[i] === null ? '—' : sayiFormatla(sayilar[i]) }),
            el('td', {}, [el('div', { class: 'tablo-eylem' }, [
              el('a', { class: 'btn btn-cerceve', href: `/yonetim/asi-turleri.html#tur-${t.id}` }, [ikon('asi'), 'Zorunlu aşılar', el('span', { class: 'gizli-erisim', text: `: ${t.ad}` })])
            ])])
          ])))
        ])
      ]),
      el('p', { class: 'form-yardim', style: { marginTop: '12px' }, text: 'Tür adını değiştirme ve tür silme backend\'de henüz yok. Yanlış eklenen tür için ekiple iletişime geç.' })
    ]);
    if (vurgulanacakId) document.getElementById(`tur-${vurgulanacakId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch (hata) {
    hataGoster(liste, hataMetni(hata), () => yukle());
  }
}

function turEkleAc() {
  const formId = 'tur-ekle';
  const tf = el('form', { id: formId, novalidate: true }, [
    el('div', { class: 'form-alan' }, [
      el('label', { for: `${formId}-ad`, text: 'Tür adı' }),
      el('input', { id: `${formId}-ad`, name: 'ad', type: 'text', maxlength: '30', autocomplete: 'off', required: true, placeholder: 'Ör. Tavşan', 'aria-describedby': `${formId}-yardim` }),
      el('p', { class: 'form-yardim', id: `${formId}-yardim`, text: 'Tür hemen hayvan ekleme ekranında ve filtrelerde görünür. Ardından zorunlu aşılarını seçebilirsin.' })
    ])
  ]);
  const vazgec = el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Vazgeç' });
  const kaydet = el('button', { class: 'btn btn-ana', type: 'submit', form: formId, text: 'Ekle' });
  const modal = modalAc(tf, { baslik: 'Yeni hayvan türü', alt: [vazgec, kaydet] });
  vazgec.addEventListener('click', modal.kapat);
  tf.addEventListener('submit', async (olay) => {
    olay.preventDefault();
    formHatalariniTemizle(tf);
    const ad = tf.elements.ad.value.trim();
    if (ad.length < 2) {
      formHatalariniGoster(tf, { ad: 'Tür adı en az 2 karakter olmalı.' });
      return;
    }
    await butonBekle(kaydet, async () => {
      try {
        const tur = await apiPost('/api/hayvan-turleri', { ad });
        modal.kapat();
        sonrakiAdimiGoster(tur);
        yukle(tur.id);
      } catch (hata) {
        if (hata instanceof ApiHatasi && hata.durum === 409) formHatalariniGoster(tf, { ad: hata.message });
        else if (hata instanceof ApiHatasi && hata.durum === 400) formHatalariniGoster(tf, hata.alanlar, Object.keys(hata.alanlar).length ? '' : hata.message);
        else formHatalariniGoster(tf, {}, hataMetni(hata));
      }
    });
  });
}

/** Yeni türden sonra zorunlu aşıları seçmeye yönlendirir. */
function sonrakiAdimiGoster(tur) {
  const kap = el('div', { class: 'uyari-kutusu uyari-kutusu-basari', role: 'status', style: { marginBottom: '16px' } }, [
    ikon('onay'),
    el('div', { class: 'uyari-kutusu-metin yigin', style: { gap: '8px' } }, [
      el('strong', { text: `${tur.ad} eklendi` }),
      el('p', { text: 'Şimdi bu tür için zorunlu aşıları seç; aşı giriş ekranında üstte ve "zorunlu" olarak görünürler.' }),
      el('div', {}, [el('a', { class: 'btn btn-ana', href: `/yonetim/asi-turleri.html#tur-${tur.id}` }, [ikon('asi'), 'Zorunlu aşıları seç'])])
    ])
  ]);
  document.querySelector('.yonetim-baslik').after(kap);
  toast(`${tur.ad} türü eklendi.`, 'basari');
}
