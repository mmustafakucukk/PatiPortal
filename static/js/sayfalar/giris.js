// =============================================================================
// sayfalar/giris.js – Giriş: e-posta, şifre, "şifreyi göster", ?donus= yönlendirmesi
// =============================================================================
import { apiPost, ApiHatasi } from '../api.js';
import { mevcutKullanici, girisSonrasiAdres, oturumOnbelleginiTemizle } from '../auth.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir } from '../layout.js';
import { formHatalariniGoster, formHatalariniTemizle, butonBekle, sifreGosterBagla, toast, hataMetni, epostaGecerliMi } from '../ui.js';

const form = document.getElementById('giris-formu');
const donus = new URLSearchParams(window.location.search).get('donus');

ustMenuyuYerlestir({ acilBant: false });
altBilgiyiYerlestir();
sifreGosterBagla(document.getElementById('sifre-goster'), form.elements.sifre);

// Kayıt bağlantısı aynı dönüş adresini taşır
if (donus) {
  document.getElementById('kayit-baglantisi').href = `/kayit.html?donus=${encodeURIComponent(donus)}`;
  document.getElementById('giris-aciklama').textContent = 'Devam etmek için giriş yapman gerekiyor.';
}

// Zaten giriş yapılmışsa doğrudan yönlendir
mevcutKullanici().then((kullanici) => {
  if (kullanici) window.location.replace(girisSonrasiAdres(kullanici, donus));
}).catch(() => {});

form.addEventListener('submit', async (olay) => {
  olay.preventDefault();
  formHatalariniTemizle(form);
  const email = form.elements.email.value.trim();
  const sifre = form.elements.sifre.value;

  const hatalar = {};
  if (!email) hatalar.email = 'E-posta adresinizi girin.';
  else if (!epostaGecerliMi(email)) hatalar.email = 'Geçerli bir e-posta adresi girin.';
  if (!sifre) hatalar.sifre = 'Şifrenizi girin.';
  if (Object.keys(hatalar).length) {
    formHatalariniGoster(form, hatalar);
    return;
  }

  await butonBekle(form.querySelector('[type="submit"]'), async () => {
    try {
      const kullanici = await apiPost('/api/auth/login', { email, sifre });
      oturumOnbelleginiTemizle();
      toast(`Hoş geldin, ${kullanici.ad_soyad.split(' ')[0]}!`, 'basari');
      window.location.href = girisSonrasiAdres(kullanici, donus);
    } catch (hata) {
      if (hata instanceof ApiHatasi && [400, 401, 403, 429].includes(hata.durum)) {
        formHatalariniGoster(form, hata.alanlar, hata.durum === 400 ? '' : hata.message);
      } else {
        formHatalariniGoster(form, {}, hataMetni(hata));
      }
    }
  });
});
