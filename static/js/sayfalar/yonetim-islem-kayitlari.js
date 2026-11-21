// =============================================================================
// sayfalar/yonetim-islem-kayitlari.js – İşlem kayıtları
// Backend işlemleri islem_kayitlari tablosuna yazıyor, ancak bu kayıtları
// listeleyen bir uç nokta (ör. GET /api/audit-logs) yok. Sayfa iskeleti hazır;
// filtreler pasif ve durum açıklanıyor. Uç nokta eklenince tablo, filtreler,
// sayfalama ve detay modalı bu dosyada bağlanacak.
// =============================================================================
import { el, ikon, icerikDegistir } from '../dom.js';
import { yonetimSayfasi } from '../yonetim.js';

baslat();

async function baslat() {
  const kullanici = await yonetimSayfasi('islem-kayitlari');
  if (!kullanici) return;
  icerikDegistir(document.getElementById('kayit-listesi'), [
    el('div', { class: 'uyari-kutusu uyari-kutusu-bilgi', role: 'status', style: { marginBottom: '16px' } }, [
      ikon('bilgi'),
      el('div', { class: 'uyari-kutusu-metin' }, [
        el('strong', { text: 'İşlem kayıtları henüz görüntülenemiyor' }),
        el('p', { text: 'Sistem; hayvan, aşı, başvuru, randevu, kurum ve kullanıcı işlemlerini kaydediyor. Ancak backend\'de bu kayıtları listeleyen bir uç nokta yok. Uç nokta eklendiğinde tarih, kullanıcı, kurum ve işlem türüne göre filtrelenebilen tablo burada açılacak.' })
      ])
    ]),
    el('div', { class: 'bos-durum' }, [
      el('span', { class: 'bos-durum-ikon' }, [ikon('liste')]),
      el('h3', { text: 'Gösterilecek kayıt yok' }),
      el('p', { text: 'Filtreler uç nokta eklenene kadar pasif.' })
    ])
  ]);
}
