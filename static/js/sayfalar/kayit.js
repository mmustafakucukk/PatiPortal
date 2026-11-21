// =============================================================================
// sayfalar/kayit.js – Kayıt: canlı şifre kontrolü, KVKK onayı, sunucu alan hataları
// =============================================================================
import { apiPost, ApiHatasi } from '../api.js';
import { mevcutKullanici, girisSonrasiAdres, oturumOnbelleginiTemizle } from '../auth.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir } from '../layout.js';
import { formHatalariniGoster, formHatalariniTemizle, butonBekle, sifreGosterBagla, toast, hataMetni, epostaGecerliMi, telefonGecerliMi } from '../ui.js';

const SIFRE_MIN = 8;
const form = document.getElementById('kayit-formu');
const donus = new URLSearchParams(window.location.search).get('donus');

ustMenuyuYerlestir({ acilBant: false });
altBilgiyiYerlestir();
sifreGosterBagla(document.getElementById('sifre-goster'), form.elements.sifre);

if (donus) document.getElementById('giris-baglantisi').href = `/giris.html?donus=${encodeURIComponent(donus)}`;

mevcutKullanici().then((kullanici) => {
  if (kullanici) window.location.replace(girisSonrasiAdres(kullanici, donus));
}).catch(() => {});

// Canlı şifre kontrolü
const uzunlukKurali = document.querySelector('[data-kural="uzunluk"]');
const eslesmeKurali = document.querySelector('[data-kural="eslesme"]');
function kurallariGuncelle() {
  const sifre = form.elements.sifre.value;
  const tekrar = form.elements.sifre_tekrar.value;
  uzunlukKurali.classList.toggle('tamam', sifre.length >= SIFRE_MIN);
  uzunlukKurali.textContent = sifre.length >= SIFRE_MIN ? 'En az 8 karakter: tamam' : `En az 8 karakter (${sifre.length}/8)`;
  const eslesiyor = tekrar.length > 0 && sifre === tekrar;
  eslesmeKurali.classList.toggle('tamam', eslesiyor);
  eslesmeKurali.textContent = eslesiyor ? 'Şifreler aynı' : 'Şifreler aynı olmalı';
}
form.elements.sifre.addEventListener('input', kurallariGuncelle);
form.elements.sifre_tekrar.addEventListener('input', kurallariGuncelle);
kurallariGuncelle();

function istemciDogrulama(v) {
  const hatalar = {};
  if (v.ad_soyad.length < 2) hatalar.ad_soyad = 'Ad soyad en az 2 karakter olmalı.';
  if (!epostaGecerliMi(v.email)) hatalar.email = 'Geçerli bir e-posta adresi girin.';
  if (!telefonGecerliMi(v.telefon)) hatalar.telefon = 'Geçerli bir cep telefonu girin (ör. 0555 123 45 67).';
  if (v.sifre.length < SIFRE_MIN) hatalar.sifre = 'Şifre en az 8 karakter olmalı.';
  if (v.sifre !== v.sifre_tekrar) hatalar.sifre_tekrar = 'Şifreler aynı değil.';
  if (!v.kvkk_onay) hatalar.kvkk_onay = 'Devam etmek için KVKK metnini onaylamalısın.';
  return hatalar;
}

form.addEventListener('submit', async (olay) => {
  olay.preventDefault();
  formHatalariniTemizle(form);
  const v = {
    ad_soyad: form.elements.ad_soyad.value.trim(),
    email: form.elements.email.value.trim(),
    telefon: form.elements.telefon.value.trim(),
    sifre: form.elements.sifre.value,
    sifre_tekrar: form.elements.sifre_tekrar.value,
    kvkk_onay: form.elements.kvkk_onay.checked
  };
  const hatalar = istemciDogrulama(v);
  if (Object.keys(hatalar).length) {
    formHatalariniGoster(form, hatalar);
    return;
  }

  await butonBekle(form.querySelector('[type="submit"]'), async () => {
    try {
      await apiPost('/api/auth/register', {
        ad_soyad: v.ad_soyad, email: v.email, telefon: v.telefon, sifre: v.sifre, kvkk_onay: v.kvkk_onay
      });
    } catch (hata) {
      if (hata instanceof ApiHatasi && hata.durum === 400) formHatalariniGoster(form, hata.alanlar, Object.keys(hata.alanlar).length ? '' : hata.message);
      else if (hata instanceof ApiHatasi && hata.durum === 409) formHatalariniGoster(form, { email: hata.message });
      else formHatalariniGoster(form, {}, hataMetni(hata));
      return;
    }
    // Kayıt oturum açmaz; aynı bilgilerle giriş yapılır
    try {
      const kullanici = await apiPost('/api/auth/login', { email: v.email, sifre: v.sifre });
      oturumOnbelleginiTemizle();
      toast('Hesabın oluşturuldu, hoş geldin!', 'basari');
      window.location.href = girisSonrasiAdres(kullanici, donus);
    } catch {
      toast('Hesabın oluşturuldu. Şimdi giriş yapabilirsin.', 'basari', 6000);
      window.location.href = `/giris.html${donus ? `?donus=${encodeURIComponent(donus)}` : ''}`;
    }
  });
});
