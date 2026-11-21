// =============================================================================
// layout.js – Üst menü, acil bandı, alt bilgi, panel alt menüsü, yönetim menüsü
// =============================================================================
import { el, ikon, icerikDegistir } from './dom.js';
import { apiGet } from './api.js';
import { mevcutKullanici, gorevliMi, sistemYoneticisiMi, cikisYap, girisAdresi } from './auth.js';
import { kurumSeciciyiYerlestir } from './kurum.js';
import { cekmeceAc, toast } from './ui.js';

// -----------------------------------------------------------------------------
// "İçeriğe geç" bağlantısı (klavye kullanıcıları menüyü atlayabilsin)
// -----------------------------------------------------------------------------
function atlamaBaglantisiEkle() {
  const ana = document.getElementById('icerik');
  if (!ana || document.querySelector('.atla-baglanti')) return;
  if (!ana.hasAttribute('tabindex')) ana.setAttribute('tabindex', '-1');
  document.body.prepend(el('a', { class: 'atla-baglanti', href: '#icerik', text: 'İçeriğe geç' }));
}

// -----------------------------------------------------------------------------
// Panel üst alanları (her ikisinde de kurum seçici bulunur)
// -----------------------------------------------------------------------------

/**
 * Panel ana ekranının koyu üst alanı: "Görevli paneli", selamlama, kurum seçici.
 *   panelSelamAlaniniYerlestir(kullanici)   → #ust-menu kabına
 */
export async function panelSelamAlaniniYerlestir(kullanici, kap = null) {
  if (!kap) atlamaBaglantisiEkle();
  const hedef = kap || document.getElementById('ust-menu');
  if (!hedef) return;
  const secici = el('div');
  icerikDegistir(hedef, el('header', { class: 'panel-ust' }, [
    el('div', { class: 'panel-ust-ic' }, [
      el('div', { style: { minWidth: 0 } }, [
        el('p', { class: 'panel-ust-etiket', text: 'Görevli paneli' }),
        el('h1', { text: `Merhaba, ${String(kullanici?.ad_soyad || '').split(' ')[0]}` }),
        secici
      ]),
      el('a', { class: 'btn btn-ikon', href: '/index.html', 'aria-label': 'Siteye dön', title: 'Siteye dön' }, [ikon('cikis', 'ikon-buyuk')])
    ])
  ]));
  await kurumSeciciyiYerlestir(secici);
}

/**
 * Alt sayfaların beyaz üst çubuğu: geri düğmesi, başlık, sağda ek metin/düğme ve
 * altında kurum seçici.
 *   panelUstCubugunuYerlestir({ baslik: 'Yeni hayvan', geri: '/panel/index.html', ek: '~30 sn' })
 */
export async function panelUstCubugunuYerlestir({ baslik, geri = '/panel/index.html', ek = null, kap = null } = {}) {
  if (!kap) atlamaBaglantisiEkle();
  const hedef = kap || document.getElementById('ust-menu');
  if (!hedef) return;
  const secici = el('div');
  const ekOge = typeof ek === 'string' ? el('span', { class: 'ust-cubuk-ek', text: ek }) : ek;
  icerikDegistir(hedef, el('header', { class: 'ust-cubuk' }, [
    el('div', { class: 'ust-cubuk-ic' }, [
      geri && el('a', { class: 'btn btn-ikon btn-sade', href: geri, 'aria-label': 'Geri' }, [ikon('geri', 'ikon-buyuk')]),
      el('h1', { text: baslik }),
      ekOge
    ]),
    el('div', { class: 'ust-cubuk-kurum' }, [secici])
  ]));
  await kurumSeciciyiYerlestir(secici);
}

// -----------------------------------------------------------------------------
// Üst menü
// -----------------------------------------------------------------------------
const GENEL_LINKLER = [
  { anahtar: 'hayvanlar', metin: 'Hayvanlar', href: '/hayvanlar.html' },
  { anahtar: 'kurumlar', metin: 'Kurumlar', href: '/kurumlar.html' },
  { anahtar: 'ihtiyaclar', metin: 'Acil İhtiyaçlar', href: '/ihtiyaclar.html' },
  { anahtar: 'nasil', metin: 'Nasıl Sahiplenirim?', href: '/index.html#nasil' }
];

/** Adres çubuğundaki yola göre üst menüde vurgulanacak bölüm. */
function aktifBolum(yol = window.location.pathname) {
  if (/^\/panel\//.test(yol)) return 'panel';
  if (/^\/yonetim\//.test(yol)) return 'yonetim';
  const dosya = yol.split('/').pop();
  const harita = {
    'hayvanlar.html': 'hayvanlar', 'hayvan.html': 'hayvanlar', 'basvuru.html': 'hayvanlar',
    'kurumlar.html': 'kurumlar', 'kurum.html': 'kurumlar',
    'ihtiyaclar.html': 'ihtiyaclar',
    'hesabim.html': 'hesabim', 'randevu-al.html': 'hesabim'
  };
  return harita[dosya] || null;
}

function kisaAd(adSoyad) {
  return String(adSoyad || '').trim().split(/\s+/)[0] || 'Hesabım';
}

function linkOlustur(link, aktif, sinif) {
  return el('a', {
    class: sinif,
    href: link.href,
    'aria-current': link.anahtar === aktif ? 'page' : null,
    text: link.metin
  });
}

/**
 * #ust-menu kabına üst menüyü ve (açık ihtiyaç varsa) acil bandını yerleştirir.
 *   ustMenuyuYerlestir()                    → herkese açık sayfalar
 *   ustMenuyuYerlestir({ acilBant: false }) → bandsız
 */
export async function ustMenuyuYerlestir({ acilBant = true, kap = null } = {}) {
  if (!kap) atlamaBaglantisiEkle();
  let hedef = kap || document.getElementById('ust-menu');
  if (!hedef) {
    hedef = el('div', { id: 'ust-menu' });
    document.body.prepend(hedef);
  }
  const aktif = aktifBolum();
  const menuId = `mobil-menu-${Math.random().toString(36).slice(2, 8)}`;

  const masaustuListe = el('ul', { class: 'ust-menu-linkler' });
  const mobilListe = el('ul');
  const eylemler = el('div', { class: 'ust-menu-eylem' });
  const mobilMenu = el('nav', { class: 'ust-menu-mobil', id: menuId, 'aria-label': 'Mobil menü', hidden: true }, [mobilListe]);
  const hamburger = el('button', {
    class: 'btn btn-ikon btn-sade ust-menu-hamburger', type: 'button',
    'aria-label': 'Menüyü aç', 'aria-expanded': 'false', 'aria-controls': menuId
  }, [ikon('menu', 'ikon-buyuk')]);

  const menuyuAyarla = (acik) => {
    mobilMenu.hidden = !acik;
    hamburger.setAttribute('aria-expanded', String(acik));
    hamburger.setAttribute('aria-label', acik ? 'Menüyü kapat' : 'Menüyü aç');
    icerikDegistir(hamburger, ikon(acik ? 'kapat' : 'menu', 'ikon-buyuk'));
  };
  hamburger.addEventListener('click', () => menuyuAyarla(mobilMenu.hidden));
  mobilMenu.addEventListener('click', (olay) => { if (olay.target.closest('a')) menuyuAyarla(false); });
  mobilMenu.addEventListener('keydown', (olay) => {
    if (olay.key === 'Escape') {
      menuyuAyarla(false);
      hamburger.focus();
    }
  });

  const header = el('header', { class: 'ust-menu' }, [
    el('div', { class: 'konteyner ust-menu-ic' }, [
      el('a', { class: 'logo', href: '/index.html', 'aria-label': 'PatiPortal anasayfa' }, [ikon('pati'), 'PatiPortal']),
      el('nav', { 'aria-label': 'Ana menü', class: 'ust-menu-nav' }, [masaustuListe]),
      el('div', { class: 'ust-menu-sag' }, [eylemler, hamburger])
    ]),
    mobilMenu
  ]);
  const bantKabi = el('div', { class: 'acil-bant-kap' });
  icerikDegistir(hedef, [header, bantKabi]);

  // Kullanıcı durumu belli olana kadar ziyaretçi menüsü gösterilir
  const ciz = (kullanici) => {
    const linkler = [...GENEL_LINKLER];
    if (gorevliMi(kullanici) || sistemYoneticisiMi(kullanici)) linkler.push({ anahtar: 'panel', metin: 'Panel', href: '/panel/index.html' });
    if (sistemYoneticisiMi(kullanici)) linkler.push({ anahtar: 'yonetim', metin: 'Yönetim', href: '/yonetim/index.html' });

    icerikDegistir(masaustuListe, linkler.map((l) => el('li', {}, [linkOlustur(l, aktif, 'ust-menu-link')])));

    const mobilOgeler = linkler.map((l) => el('li', {}, [linkOlustur(l, aktif, null)]));
    if (kullanici) {
      mobilOgeler.push(
        el('li', { class: 'ust-menu-mobil-ayrac', 'aria-hidden': 'true' }),
        el('li', {}, [el('a', { href: '/hesabim.html', 'aria-current': aktif === 'hesabim' ? 'page' : null }, [ikon('kullanici'), `Hesabım (${kullanici.ad_soyad})`])]),
        el('li', {}, [el('button', { type: 'button', class: 'ust-menu-mobil-buton', onClick: cikisIslemi }, [ikon('cikis'), 'Çıkış yap'])])
      );
    } else {
      mobilOgeler.push(
        el('li', { class: 'ust-menu-mobil-ayrac', 'aria-hidden': 'true' }),
        el('li', {}, [el('a', { href: '/kayit.html' }, [ikon('kullanici'), 'Kayıt ol'])])
      );
    }
    icerikDegistir(mobilListe, mobilOgeler);

    if (kullanici) {
      icerikDegistir(eylemler, el('div', { class: 'ust-menu-hesap' }, [
        el('a', {
          class: 'btn btn-cerceve-ana', href: '/hesabim.html',
          'aria-current': aktif === 'hesabim' ? 'page' : null,
          title: `Hesabım (${kullanici.ad_soyad})`
        }, [ikon('kullanici'), el('span', { text: kisaAd(kullanici.ad_soyad) }), el('span', { class: 'gizli-erisim', text: ' – Hesabım' })]),
        el('button', { class: 'btn btn-ikon btn-sade', type: 'button', 'aria-label': 'Çıkış yap', title: 'Çıkış yap', onClick: cikisIslemi }, [ikon('cikis')])
      ]));
    } else {
      icerikDegistir(eylemler, el('a', { class: 'btn btn-cerceve-ana', href: girisAdresi(), text: 'Giriş Yap' }));
    }
  };

  ciz(null);
  try {
    ciz(await mevcutKullanici());
  } catch {
    // Bağlantı hatasında ziyaretçi menüsü kalır
  }
  if (acilBant) acilBandiniYerlestir(bantKabi);
}

async function cikisIslemi() {
  try {
    await cikisYap();
  } catch {
    toast('Çıkış yapılamadı, tekrar deneyin.', 'hata');
  }
}

/** Açık ihtiyaç varsa en acil ikisini kırmızı bantta gösterir. */
async function acilBandiniYerlestir(kap) {
  let ihtiyaclar;
  try {
    ihtiyaclar = await apiGet('/api/needs', { durum: 'acik' });
  } catch {
    return; // Bant isteğe bağlıdır; hata sayfayı bozmasın
  }
  const eksikler = (ihtiyaclar || [])
    .map((n) => ({ ...n, kalan: Math.max(0, Number(n.kalan ?? n.miktar)) }))
    .filter((n) => n.kalan > 0);
  if (!eksikler.length) return;

  const ilkIki = eksikler.slice(0, 2);
  const parcalar = ilkIki.map((n) => `${n.baslik} (${n.kalan} ${n.birim})`);
  let mesaj = parcalar.join(' ve ');
  mesaj += eksikler.length > 2 ? ` ile ${eksikler.length - 2} ihtiyaç daha bekliyor.` : ' ihtiyacı bekliyor.';

  icerikDegistir(kap, el('div', { class: 'acil-bant', role: 'region', 'aria-label': 'Acil ihtiyaç duyurusu' }, [
    el('div', { class: 'konteyner acil-bant-ic' }, [
      el('span', { class: 'acil-bant-etiket', text: ilkIki.some((n) => n.aciliyet === 'yuksek') ? 'ACİL' : 'İHTİYAÇ' }),
      el('span', { text: mesaj }),
      el('a', { href: '/ihtiyaclar.html', text: 'Destek ol' })
    ])
  ]));
}

// -----------------------------------------------------------------------------
// Alt bilgi
// -----------------------------------------------------------------------------
export function altBilgiyiYerlestir(kap = null) {
  let hedef = kap || document.getElementById('alt-bilgi');
  if (!hedef) {
    hedef = el('div', { id: 'alt-bilgi' });
    document.body.appendChild(hedef);
  }
  icerikDegistir(hedef, el('footer', { class: 'alt-bilgi' }, [
    el('div', { class: 'konteyner alt-bilgi-ic' }, [
      el('div', {}, [
        el('p', { class: 'alt-bilgi-ad', text: 'PatiPortal' }),
        el('p', { text: 'Selçuk Üniversitesi · Topluma Hizmet Uygulamaları projesi' })
      ]),
      el('nav', { 'aria-label': 'Alt bilgi' }, [
        el('ul', {}, [
          el('li', {}, [el('a', { href: '/kvkk.html', text: 'KVKK Aydınlatma Metni' })]),
          el('li', {}, [el('a', { href: '/kvkk.html#iletisim', text: 'İletişim' })]),
          el('li', {}, [el('a', { href: girisAdresi('/panel/index.html'), text: 'Görevli Girişi' })])
        ])
      ])
    ])
  ]));
}

// -----------------------------------------------------------------------------
// Panel alt menüsü
// -----------------------------------------------------------------------------
const PANEL_ANA = [
  { anahtar: 'ana', metin: 'Ana sayfa', ikon: 'ev', href: '/panel/index.html' },
  { anahtar: 'hayvanlar', metin: 'Hayvanlar', ikon: 'pati', href: '/panel/hayvanlar.html' },
  { anahtar: 'basvurular', metin: 'Başvurular', ikon: 'belge', href: '/panel/basvurular.html' },
  { anahtar: 'randevular', metin: 'Randevular', ikon: 'takvim', href: '/panel/randevular.html' }
];
const PANEL_DAHA = [
  { anahtar: 'asi', metin: 'Aşı gir', ikon: 'asi', href: '/panel/asi.html' },
  { anahtar: 'ihtiyaclar', metin: 'İhtiyaçlar', ikon: 'ihtiyac', href: '/panel/ihtiyaclar.html' },
  { anahtar: 'teslim-saatleri', metin: 'Teslim saatleri', ikon: 'saat', href: '/panel/teslim-saatleri.html' }
];

/** "Daha fazla" çekmecesindeki bağlantılar. */
export async function panelDahaBaglantilari() {
  return PANEL_DAHA;
}

/**
 * Panelin altındaki sabit 5 sekmeli menüyü yerleştirir.
 *   panelMenusunuYerlestir('basvurular')
 * aktif: ana | hayvanlar | basvurular | randevular | asi | ihtiyaclar | teslim-saatleri
 * kap verilmezse menü sayfanın sonuna eklenir ve body'ye panel-sayfa sınıfı verilir.
 */
export function panelMenusunuYerlestir(aktif = 'ana', kap = null) {
  const dahaAktif = PANEL_DAHA.some((l) => l.anahtar === aktif);
  const dahaButonu = el('button', {
    type: 'button', 'aria-haspopup': 'dialog', 'aria-current': dahaAktif ? 'page' : null
  }, [ikon('daha'), 'Daha fazla']);

  dahaButonu.addEventListener('click', async () => {
    const baglantilar = await panelDahaBaglantilari();
    cekmeceAc(el('ul', { class: 'cekmece-menu' }, baglantilar.map((l) => el('li', {}, [
      el('a', { href: l.href, 'aria-current': l.anahtar === aktif ? 'page' : null }, [ikon(l.ikon), l.metin])
    ]))), { baslik: 'Daha fazla' });
  });

  const nav = el('nav', { class: 'panel-alt-menu', 'aria-label': 'Panel menüsü' }, [
    el('ul', {}, [
      ...PANEL_ANA.map((l) => el('li', {}, [
        el('a', { href: l.href, 'aria-current': l.anahtar === aktif ? 'page' : null }, [ikon(l.ikon), l.metin])
      ])),
      el('li', {}, [dahaButonu])
    ])
  ]);

  if (kap) {
    icerikDegistir(kap, nav);
  } else {
    document.querySelector('nav.panel-alt-menu[data-layout]')?.remove();
    nav.setAttribute('data-layout', '');
    document.body.appendChild(nav);
    document.body.classList.add('panel-sayfa');
  }
  return nav;
}

// -----------------------------------------------------------------------------
// Yönetim menüsü
// -----------------------------------------------------------------------------
const YONETIM_LINKLERI = [
  { anahtar: 'ozet', metin: 'Özet', ikon: 'grafik', href: '/yonetim/index.html' },
  { anahtar: 'kurumlar', metin: 'Kurumlar', ikon: 'bina', href: '/yonetim/kurumlar.html' },
  { anahtar: 'kullanicilar', metin: 'Kullanıcılar', ikon: 'kullanicilar', href: '/yonetim/kullanicilar.html' },
  { anahtar: 'hayvan-turleri', metin: 'Hayvan türleri', ikon: 'pati', href: '/yonetim/hayvan-turleri.html' },
  { anahtar: 'asi-turleri', metin: 'Aşı türleri', ikon: 'asi', href: '/yonetim/asi-turleri.html' },
  { anahtar: 'islem-kayitlari', metin: 'İşlem kayıtları', ikon: 'liste', href: '/yonetim/islem-kayitlari.html' }
];

/**
 * Yönetim menüsü: masaüstünde sol menü, mobilde üstte yatay kaydırmalı sekmeler.
 *   yonetimMenusunuYerlestir('kurumlar')   → #yonetim-menu kabına
 */
export function yonetimMenusunuYerlestir(aktif = 'ozet', kap = null) {
  const hedef = kap || document.getElementById('yonetim-menu');
  if (!hedef) return null;
  const nav = el('nav', { class: 'yonetim-menu', 'aria-label': 'Yönetim menüsü' }, [
    el('ul', {}, YONETIM_LINKLERI.map((l) => el('li', {}, [
      el('a', { href: l.href, 'aria-current': l.anahtar === aktif ? 'page' : null }, [ikon(l.ikon), l.metin])
    ])))
  ]);
  icerikDegistir(hedef, nav);
  // Mobilde aktif sekme görünür olsun (yalnızca yatay kaydırma; sayfa kaymaz)
  const liste = nav.querySelector('ul');
  const aktifLink = nav.querySelector('[aria-current="page"]');
  if (aktifLink && liste.scrollWidth > liste.clientWidth) {
    liste.scrollLeft = Math.max(0, aktifLink.offsetLeft - 16);
  }
  return nav;
}
