// =============================================================================
// sayfalar/hesabim.js – Hesabım: başvurular (zaman çizelgesi), randevular,
// sahiplendiklerim (aşı karnesi), destek sözleri, profil. Sekme URL'de (#basvurular).
// =============================================================================
import { el, ikon, icerikDegistir } from '../dom.js';
import { apiGet, apiPut, apiDelete } from '../api.js';
import { girisGerekli, cikisYap, oturumOnbelleginiTemizle } from '../auth.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir } from '../layout.js';
import {
  yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, toast, onayIste, butonBekle,
  etiket, etiketRozeti, tarihFormatla, saatFormatla, kisaTarih, gunAdi, bugunIso, gunFarki, sayiFormatla
} from '../ui.js';
import { hayvanOzetSatiri, asiKarnesiTablosu, dikkatGerekenAsilar, uyariKutusu, randevuOzeti } from '../kartlar.js';
import { kullaniciKurumlari } from '../kurum.js';

// Backend'de uç noktası olmayan işlemler. Eklendiğinde ilgili düğmeler buradan açılır.
const BEKLEYEN_OZELLIKLER = {
  basvuruIptal: false, // bekleyen başvuruyu iptal
  profilGuncelle: false // ad / telefon güncelleme
};

const SEKMELER = ['basvurular', 'randevular', 'sahiplendiklerim', 'destekler', 'profil'];
const yuklenenler = new Set();
let kullanici = null;

const yukleyiciler = {
  basvurular: basvurulariYukle,
  randevular: randevulariYukle,
  sahiplendiklerim: sahiplendiklerimiYukle,
  destekler: destekleriYukle,
  profil: profiliGoster
};

ustMenuyuYerlestir({ acilBant: false });
altBilgiyiYerlestir();
baslat();

async function baslat() {
  try {
    kullanici = await girisGerekli();
  } catch (hata) {
    hataGoster(document.getElementById('icerik'), hataMetni(hata), () => window.location.reload());
    return;
  }
  if (!kullanici) return;
  document.getElementById('selam').textContent = `Merhaba ${kullanici.ad_soyad.split(' ')[0]}! Başvurularını, randevularını ve sahiplendiğin dostlarını buradan takip edebilirsin.`;

  const sekmeler = document.getElementById('hesap-sekmeleri');
  sekmeler.addEventListener('click', (olay) => {
    const dugme = olay.target.closest('[data-sekme]');
    if (dugme) sekmeAc(dugme.dataset.sekme, true);
  });
  sekmeler.addEventListener('keydown', (olay) => {
    const sira = SEKMELER.indexOf(aktifSekme());
    let yeni = null;
    if (olay.key === 'ArrowRight') yeni = SEKMELER[(sira + 1) % SEKMELER.length];
    if (olay.key === 'ArrowLeft') yeni = SEKMELER[(sira - 1 + SEKMELER.length) % SEKMELER.length];
    if (olay.key === 'Home') yeni = SEKMELER[0];
    if (olay.key === 'End') yeni = SEKMELER[SEKMELER.length - 1];
    if (!yeni) return;
    olay.preventDefault();
    sekmeAc(yeni, true);
    document.getElementById(`sekme-${yeni}`).focus();
  });
  window.addEventListener('hashchange', () => sekmeAc(hashtenSekme(), false));
  sekmeAc(hashtenSekme(), false);
}

function hashtenSekme() {
  const ad = window.location.hash.slice(1);
  return SEKMELER.includes(ad) ? ad : 'basvurular';
}

function aktifSekme() {
  return document.querySelector('#hesap-sekmeleri [aria-selected="true"]')?.dataset.sekme || 'basvurular';
}

function sekmeAc(ad, adresiGuncelle) {
  for (const s of SEKMELER) {
    const secili = s === ad;
    const dugme = document.getElementById(`sekme-${s}`);
    dugme.setAttribute('aria-selected', String(secili));
    dugme.tabIndex = secili ? 0 : -1;
    document.getElementById(`panel-${s}`).hidden = !secili;
  }
  if (adresiGuncelle) window.history.replaceState(null, '', `#${ad}`);
  if (!yuklenenler.has(ad)) {
    yuklenenler.add(ad);
    yukleyiciler[ad]();
  }
}

/** Bir işlemden sonra diğer sekmelerin verisi de değişmiş olabilir. */
function sekmeleriYenile(...adlar) {
  for (const ad of adlar) {
    if (ad === aktifSekme()) yukleyiciler[ad]();
    else yuklenenler.delete(ad);
  }
}

const panel = (ad) => document.getElementById(`panel-${ad}`);


/** Kurum adresleri (randevu kartında gösterilir); yüklenemezse boş kalır. */
let kurumlarSozu = null;
function kurumHaritasi() {
  if (!kurumlarSozu) {
    kurumlarSozu = apiGet('/api/institutions')
      .then((liste) => new Map(liste.map((k) => [k.id, k])))
      .catch(() => new Map());
  }
  return kurumlarSozu;
}
const randevuMetni = (r) => `${tarihFormatla(r.tarih)} ${gunAdi(r.tarih)}, ${saatFormatla(r.baslangic_saati)}`;


// -----------------------------------------------------------------------------
// Başvurularım
// -----------------------------------------------------------------------------
async function basvurulariYukle() {
  const kap = panel('basvurular');
  yukleniyorGoster(kap, 2, 'liste');
  try {
    const [basvurular, randevular, sahiplendirmeler] = await Promise.all([
      apiGet('/api/applications/me'),
      apiGet('/api/appointments/me'),
      apiGet('/api/adoptions/me')
    ]);
    // Başvuru yanıtında randevu ve teslim yok; başvuru kimliğiyle eşleştirilir
    for (const b of basvurular) {
      const r = randevular.find((x) => x.basvuru_id === b.id);
      b.randevu = r ? randevuOzeti(r) : null;
      b.teslim = sahiplendirmeler.find((x) => x.basvuru_id === b.id) || null;
    }
    if (!basvurular.length) {
      bosDurumGoster(kap, { baslik: 'Henüz başvurun yok', aciklama: 'Yuva arayan dostlarımıza göz at; birini sahiplenmek istersen profilinden başvurabilirsin.', ikon: 'belge' },
        { metin: 'Hayvanlara göz at', href: '/hayvanlar.html' });
      return;
    }
    icerikDegistir(kap, el('ul', { class: 'hesap-listesi' }, basvurular.map((b) => el('li', {}, [basvuruKarti(b)]))));
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), basvurulariYukle);
  }
}

function zamanCizelgesi(b) {
  const r = b.randevu;
  const teslim = b.teslim;
  const adim = (durum, baslik, tarih = '') => el('li', {
    class: durum ? `zc-${durum}` : null,
    'aria-current': durum === 'aktif' ? 'step' : null
  }, [
    el('span', { class: 'zc-nokta' }, durum === 'tamam' ? [ikon('onay')] : durum === 'hata' ? [ikon('kapat')] : []),
    el('span', { class: 'zc-baslik', text: baslik }),
    tarih && el('span', { class: 'zc-tarih', text: tarih }),
    durum && el('span', { class: 'gizli-erisim', text: { tamam: ' (tamamlandı)', aktif: ' (sıradaki adım)', hata: ' (sonlandı)' }[durum] })
  ]);

  const adimlar = [adim('tamam', 'Başvuru', tarihFormatla(b.basvuru_tarihi))];
  if (b.durum === 'beklemede') adimlar.push(adim('aktif', 'Onay', 'Bekleniyor'));
  else if (b.durum === 'onaylandi') adimlar.push(adim('tamam', 'Onay', tarihFormatla(b.degerlendirme_tarihi)));
  else adimlar.push(adim('hata', 'Reddedildi', tarihFormatla(b.degerlendirme_tarihi)));

  if (b.durum === 'onaylandi' && r && (r.durum === 'planlandi' || r.durum === 'tamamlandi')) {
    adimlar.push(adim('tamam', 'Randevu', `${kisaTarih(r.tarih)} · ${saatFormatla(r.baslangic_saati)}`));
  } else if (b.durum === 'onaylandi' && teslim) {
    adimlar.push(adim('tamam', 'Randevu', 'Randevusuz teslim'));
  } else if (b.durum === 'onaylandi') {
    adimlar.push(adim('aktif', 'Randevu', 'Saat seç'));
  } else {
    adimlar.push(adim(null, 'Randevu'));
  }

  if (teslim) adimlar.push(adim('tamam', 'Teslim', tarihFormatla(teslim.teslim_tarihi)));
  else if (b.durum === 'onaylandi' && r?.durum === 'planlandi') adimlar.push(adim('aktif', 'Teslim', 'Randevu günü'));
  else adimlar.push(adim(null, 'Teslim'));

  return el('ol', { class: 'zaman-cizelgesi', 'aria-label': `${b.hayvan?.ad || 'Hayvan'} başvuru süreci` }, adimlar);
}

function basvuruKarti(b) {
  const r = b.randevu;
  const parcalar = [];

  if (b.durum === 'onaylandi') {
    if (b.teslim) {
      parcalar.push(uyariKutusu('basari', 'kalp', 'Teslim edildi', `${b.hayvan?.ad || 'Dostun'} artık seninle. Aşı karnesini Sahiplendiklerim bölümünde görebilirsin.`));
      parcalar.push(el('div', { class: 'hesap-karti-eylemler' }, [
        el('button', { class: 'btn btn-cerceve', type: 'button', text: 'Sahiplendiklerim', onClick: () => sekmeAc('sahiplendiklerim', true) })
      ]));
    } else if (r?.durum === 'planlandi') {
      parcalar.push(uyariKutusu('bilgi', 'takvim', 'Teslim alma randevun', `${randevuMetni(r)} · ${b.hayvan?.kurum?.ad || ''}`));
      parcalar.push(el('div', { class: 'hesap-karti-eylemler' }, [
        el('a', { class: 'btn btn-cerceve', href: `/randevu-al.html?basvuru=${b.id}`, text: 'Randevuyu görüntüle / değiştir' })
      ]));
    } else {
      if (r?.durum === 'iptal') parcalar.push(uyariKutusu('uyari', 'uyari', null, `${tarihFormatla(r.tarih)} tarihli randevun iptal edildi. Yeni bir saat seçebilirsin.`));
      parcalar.push(uyariKutusu('basari', 'onay', 'Başvurun onaylandı!', 'Şimdi kurumun uygun saatlerinden birini seçerek teslim alma randevusu al.'));
      parcalar.push(el('a', { class: 'btn btn-ana btn-buyuk btn-blok', href: `/randevu-al.html?basvuru=${b.id}` }, [ikon('takvim'), 'Teslim alma randevusu al']));
    }
  } else if (b.durum === 'reddedildi') {
    parcalar.push(uyariKutusu('acil', 'bilgi', 'Görevli notu', b.degerlendirme_notu || 'Başvurun bu sefer olumlu sonuçlanmadı. Yuva arayan diğer dostlarımıza göz atabilirsin.'));
  } else if (b.durum === 'beklemede') {
    const notId = `basvuru-iptal-not-${b.id}`;
    parcalar.push(el('div', { class: 'hesap-karti-eylemler' }, [
      el('button', {
        class: 'btn btn-tehlike', type: 'button', text: 'Başvuruyu iptal et',
        disabled: !BEKLEYEN_OZELLIKLER.basvuruIptal, 'aria-describedby': notId
      })
    ]));
    parcalar.push(el('p', { class: 'form-yardim', id: notId, text: 'Görevli başvurunu değerlendirince sana haber verilecek. Başvuru iptali yakında eklenecek.' }));
  }

  return el('article', { class: 'kart hesap-karti' }, [
    el('div', { class: 'hesap-karti-ust' }, [
      hayvanOzetSatiri(b.hayvan || {}, {
        link: !!b.hayvan,
        ek: el('span', { class: 'ozet-hayvan-alt', text: `Başvuru tarihi: ${tarihFormatla(b.basvuru_tarihi)}` })
      }),
      etiketRozeti('basvuru_durum', b.durum, 'rozet-buyuk')
    ]),
    zamanCizelgesi(b),
    ...parcalar
  ]);
}

// -----------------------------------------------------------------------------
// Randevularım
// -----------------------------------------------------------------------------
async function randevulariYukle() {
  const kap = panel('randevular');
  yukleniyorGoster(kap, 2, 'liste');
  try {
    const [ham, kurumlar] = await Promise.all([apiGet('/api/appointments/me'), kurumHaritasi()]);
    const randevular = ham.map((r) => ({ ...randevuOzeti(r), kurum: kurumlar.get(r.hayvan?.kurum?.id) || r.hayvan?.kurum }));
    if (!randevular.length) {
      bosDurumGoster(kap, { baslik: 'Henüz randevun yok', aciklama: 'Başvurun onaylandığında Başvurularım bölümünden teslim alma randevusu alabilirsin.', ikon: 'takvim' });
      return;
    }
    const bugun = bugunIso();
    const sirala = (a, b) => `${a.tarih}T${a.baslangic_saati}`.localeCompare(`${b.tarih}T${b.baslangic_saati}`);
    const yaklasan = randevular.filter((r) => r.durum === 'planlandi' && r.tarih >= bugun).sort(sirala);
    const gecmis = randevular.filter((r) => !yaklasan.includes(r)).sort((a, b) => sirala(b, a));

    icerikDegistir(kap, [
      el('h2', { class: 'hesap-bolum-baslik', text: 'Yaklaşan randevular' }),
      yaklasan.length
        ? el('ul', { class: 'hesap-listesi' }, yaklasan.map((r) => el('li', {}, [randevuKarti(r)])))
        : el('p', { class: 'metin-ikincil', text: 'Yaklaşan randevun yok.' }),
      gecmis.length > 0 && el('h2', { class: 'hesap-bolum-baslik', text: 'Geçmiş randevular' }),
      gecmis.length > 0 && el('ul', { class: 'hesap-listesi' }, gecmis.map((r) => el('li', {}, [randevuKarti(r)])))
    ]);
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), randevulariYukle);
  }
}

function randevuKarti(r) {
  const bekliyor = r.durum === 'planlandi';
  const kalanGun = gunFarki(bugunIso(), r.tarih);
  const iptal = bekliyor && el('button', { class: 'btn btn-tehlike', type: 'button', text: 'İptal et' });
  if (iptal) {
    iptal.addEventListener('click', async () => {
      const onay = await onayIste(`${randevuMetni(r)} randevun iptal edilecek. Daha sonra yeni bir saat seçebilirsin.`, {
        baslik: 'Randevu iptal edilsin mi?', onayMetni: 'İptal et', iptalMetni: 'Vazgeç', tehlike: true
      });
      if (!onay) return;
      await butonBekle(iptal, async () => {
        try {
          await apiPut(`/api/appointments/${r.id}/iptal`);
          toast('Randevun iptal edildi.', 'bilgi');
          sekmeleriYenile('randevular', 'basvurular');
        } catch (hata) {
          toast(hataMetni(hata), 'hata');
        }
      });
    });
  }
  return el('article', { class: ['kart', 'hesap-karti', !bekliyor && 'soluk'] }, [
    el('div', { class: 'hesap-karti-ust' }, [
      hayvanOzetSatiri(r.hayvan || {}, { link: !!r.hayvan }),
      etiketRozeti('randevu_durum', r.durum, 'rozet-buyuk')
    ]),
    el('ul', { class: 'bilgi-listesi', style: { marginTop: 0 } }, [
      el('li', {}, [ikon('takvim'), el('span', {}, [
        el('strong', { text: randevuMetni(r) }),
        bekliyor && kalanGun !== null && kalanGun >= 0 && ` (${kalanGun === 0 ? 'bugün' : kalanGun === 1 ? 'yarın' : `${kalanGun} gün sonra`})`
      ])]),
      r.kurum?.adres && el('li', {}, [ikon('konum'), r.kurum.adres])
    ]),
    bekliyor && el('p', { class: 'form-yardim', text: 'Kimliğini yanında getir.' }),
    bekliyor && el('div', { class: 'hesap-karti-eylemler' }, [
      el('a', { class: 'btn btn-cerceve', href: `/randevu-al.html?basvuru=${r.basvuru_id}`, text: 'Saati değiştir' }),
      iptal
    ])
  ]);
}

// -----------------------------------------------------------------------------
// Sahiplendiklerim
// -----------------------------------------------------------------------------
async function sahiplendiklerimiYukle() {
  const kap = panel('sahiplendiklerim');
  yukleniyorGoster(kap, 1, 'liste');
  try {
    const kayitlar = await apiGet('/api/adoptions/me');
    // Aşı karnesi sahiplendirme yanıtında yok; her hayvan için ayrıca yüklenir
    await Promise.all(kayitlar.map(async (s) => {
      s.asi_karnesi = await apiGet(`/api/animals/${s.hayvan_id}/vaccinations`).catch(() => null);
    }));
    if (!kayitlar.length) {
      bosDurumGoster(kap, { baslik: 'Henüz sahiplendiğin bir dost yok', aciklama: 'Teslim alma tamamlandığında yeni dostun ve aşı karnesi burada görünür.', ikon: 'kalp' },
        { metin: 'Yuva arayan dostlar', href: '/hayvanlar.html' });
      return;
    }
    icerikDegistir(kap, el('ul', { class: 'hesap-listesi' }, kayitlar.map((s) => el('li', {}, [sahiplendirmeKarti(s)]))));
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), sahiplendiklerimiYukle);
  }
}

function sahiplendirmeKarti(s) {
  const h = s.hayvan || {};
  const dikkat = dikkatGerekenAsilar(s.asi_karnesi);
  const tablo = asiKarnesiTablosu(h.ad || 'Hayvan', s.asi_karnesi);
  return el('article', { class: 'kart hesap-karti' }, [
    el('div', { class: 'hesap-karti-ust' }, [
      hayvanOzetSatiri(h, {
        ek: el('span', { class: 'ozet-hayvan-alt', text: `Teslim tarihi: ${tarihFormatla(s.teslim_tarihi)}` })
      }),
      el('span', { class: 'rozet rozet-buyuk rozet-basari', text: 'Yuvasında' })
    ]),
    dikkat.length > 0 && uyariKutusu(dikkat.some((a) => a.durum === 'gecikti') ? 'acil' : 'uyari', 'asi', 'Aşı hatırlatması',
      dikkat.map((a) => {
        const fark = gunFarki(bugunIso(), a.sonraki_tarih);
        const ne = fark < 0 ? `${-fark} gün gecikti` : fark === 0 ? 'bugün' : `${fark} gün kaldı`;
        return `${a.asi_turu?.ad || 'Aşı'}: sonraki doz ${tarihFormatla(a.sonraki_tarih)} (${ne})`;
      }).join(' · ') + '. Veteriner randevunu planlamayı unutma.'),
    el('details', { class: 'acilir' }, [
      el('summary', {}, [el('span', { text: 'Aşı karnesi' })]),
      el('div', { class: 'acilir-icerik' }, [tablo || el('p', { class: 'metin-ikincil', text: s.asi_karnesi ? 'Henüz aşı kaydı yok.' : 'Aşı karnesi yüklenemedi.' })])
    ])
  ]);
}

// -----------------------------------------------------------------------------
// Destek sözlerim
// -----------------------------------------------------------------------------
async function destekleriYukle() {
  const kap = panel('destekler');
  yukleniyorGoster(kap, 2, 'liste');
  try {
    const destekler = await apiGet('/api/pledges/me');
    if (!destekler.length) {
      bosDurumGoster(kap, { baslik: 'Henüz destek sözün yok', aciklama: 'Kurumların acil mama, ilaç ve malzeme ihtiyaçlarına destek olabilirsin.', ikon: 'ihtiyac' },
        { metin: 'Acil ihtiyaçlar', href: '/ihtiyaclar.html' });
      return;
    }
    icerikDegistir(kap, [el('p', { class: 'form-yardim', text: 'Sözünü değiştirmek veya iptal etmek için ilgili kurumla iletişime geç.' }), el('div', { class: 'tablo-kap' }, [
      el('table', { class: 'tablo' }, [
        el('caption', { class: 'gizli-erisim', text: 'Destek sözlerim' }),
        el('thead', {}, [el('tr', {}, [
          el('th', { scope: 'col', text: 'İhtiyaç' }),
          el('th', { scope: 'col', text: 'Kurum' }),
          el('th', { scope: 'col', class: 'tablo-sayi', text: 'Miktar' }),
          el('th', { scope: 'col', text: 'Tarih' }),
          el('th', { scope: 'col', text: 'Durum' })
        ])]),
        el('tbody', {}, destekler.map(destekSatiri))
      ])
    ])]);
  } catch (hata) {
    hataGoster(kap, hataMetni(hata), destekleriYukle);
  }
}

function destekSatiri(d) {
  return el('tr', { class: d.durum === 'iptal' ? 'soluk' : null }, [
    el('td', { class: 'tablo-baslik-hucre', 'data-etiket': 'İhtiyaç', text: d.ihtiyac?.baslik || '—' }),
    el('td', { 'data-etiket': 'Kurum', text: d.ihtiyac?.kurum?.ad || '—' }),
    el('td', { class: 'tablo-sayi', 'data-etiket': 'Miktar', text: sayiFormatla(d.miktar) }),
    el('td', { 'data-etiket': 'Tarih', text: tarihFormatla(d.tarih) }),
    el('td', { 'data-etiket': 'Durum' }, [etiketRozeti('destek_durum', d.durum)])
  ]);
}

// -----------------------------------------------------------------------------
// Profil
// -----------------------------------------------------------------------------
async function profiliGoster() {
  const kap = panel('profil');
  const hucre = (baslik, deger) => el('div', {}, [el('dt', { text: baslik }), el('dd', { text: deger || '—' })]);
  const cikis = el('button', { class: 'btn btn-cerceve', type: 'button' }, [ikon('cikis'), 'Çıkış yap']);
  cikis.addEventListener('click', () => butonBekle(cikis, () => cikisYap().catch(() => toast('Çıkış yapılamadı, tekrar deneyin.', 'hata'))));
  const sil = el('button', { class: 'btn btn-tehlike', type: 'button', text: 'Hesabımı sil' });
  sil.addEventListener('click', () => hesabiSil(sil));

  const kurumlar = kullanici.rol === 'gorevli' ? await kullaniciKurumlari().catch(() => []) : [];

  icerikDegistir(kap, el('div', { class: 'kart yigin', style: { gap: '16px' } }, [
    el('dl', { class: 'bilgi-tablosu' }, [
      hucre('Ad soyad', kullanici.ad_soyad),
      hucre('Telefon', kullanici.telefon),
      el('div', { style: { gridColumn: '1 / -1' } }, [el('dt', { text: 'E-posta' }), el('dd', { text: kullanici.email })]),
      hucre('Hesap türü', etiket('rol', kullanici.rol)),
      kurumlar.length > 0 && hucre('Görevli olduğun kurumlar', kurumlar.map((k) => k.ad).join(', '))
    ]),
    !BEKLEYEN_OZELLIKLER.profilGuncelle && el('p', { class: 'form-yardim', text: 'Bilgilerini güncelleme yakında eklenecek. Şimdilik bir değişiklik için kurumlardan biriyle iletişime geçebilirsin.' }),
    el('div', { class: 'satir' }, [cikis, sil])
  ]));
}

async function hesabiSil(dugme) {
  const onay = await onayIste('Hesabın ve kişisel verilerin KVKK kapsamında silinecek. Bu işlem geri alınamaz.', {
    baslik: 'Hesabın silinsin mi?',
    onayMetni: 'Hesabımı sil',
    iptalMetni: 'Vazgeç',
    tehlike: true,
    uyari: 'Başvuru veya sahiplendirme kaydın varsa bu kayıtlar kimliğin silinerek saklanır; aynı hesapla tekrar giriş yapamazsın.'
  });
  if (!onay) return;
  await butonBekle(dugme, async () => {
    try {
      await apiDelete('/api/users/me');
      oturumOnbelleginiTemizle();
      toast('Hesabın silindi.', 'bilgi');
      window.location.href = '/index.html';
    } catch (hata) {
      toast(hataMetni(hata), 'hata');
    }
  });
}
