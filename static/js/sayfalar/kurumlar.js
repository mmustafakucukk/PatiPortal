// =============================================================================
// sayfalar/kurumlar.js – Barınak ve klinik listesi (tür filtresi, ad/adres araması)
// =============================================================================
import { icerikDegistir, secimParametresi } from '../dom.js';
import { apiGet } from '../api.js';
import { ustMenuyuYerlestir, altBilgiyiYerlestir } from '../layout.js';
import { yukleniyorGoster, hataGoster, bosDurumGoster, hataMetni, debounce, sayiFormatla } from '../ui.js';
import { kurumKarti } from '../kartlar.js';

const form = document.getElementById('kurum-filtre');
const liste = document.getElementById('kurum-listesi');
const sonucSayisi = document.getElementById('sonuc-sayisi');

const p = new URLSearchParams(window.location.search);
const durum = {
  tur: secimParametresi('tur', ['barinak', 'klinik'], ''),
  q: (p.get('q') || '').slice(0, 50)
};
let istekNo = 0;

ustMenuyuYerlestir();
altBilgiyiYerlestir();
baslat();

async function baslat() {
  form.querySelectorAll('input[name="tur"]').forEach((g) => { g.checked = g.value === durum.tur; });
  form.elements.q.value = durum.q;

  form.addEventListener('submit', (olay) => olay.preventDefault());
  form.addEventListener('change', (olay) => {
    if (olay.target.name === 'q') return;
    durum.tur = form.querySelector('input[name="tur"]:checked')?.value || '';
    urlyeYaz();
    listele();
  });
  form.elements.q.addEventListener('input', debounce(() => {
    durum.q = form.elements.q.value.trim().slice(0, 50);
    urlyeYaz();
    listele();
  }, 300));

  listele();
}

function urlyeYaz() {
  const yeni = new URLSearchParams();
  if (durum.tur) yeni.set('tur', durum.tur);
  if (durum.q) yeni.set('q', durum.q);
  window.history.replaceState(null, '', `${window.location.pathname}${yeni.toString() ? `?${yeni}` : ''}`);
}

async function listele() {
  const no = ++istekNo;
  yukleniyorGoster(liste, 4, 'metin');
  try {
    const kurumlar = await apiGet('/api/institutions', { tur: durum.tur, aktif: 'true' });
    if (no !== istekNo) return;
    // Arama istemci tarafında yapılır (API yalnızca tür filtresi tanımlıyor)
    const aranan = durum.q.toLocaleLowerCase('tr');
    const sonuc = aranan
      ? kurumlar.filter((k) => `${k.ad} ${k.adres || ''}`.toLocaleLowerCase('tr').includes(aranan))
      : kurumlar;

    const barinak = sonuc.filter((k) => k.tur === 'barinak').length;
    sonucSayisi.textContent = `${sayiFormatla(barinak)} barınak, ${sayiFormatla(sonuc.length - barinak)} klinik`;

    if (!sonuc.length) {
      const filtreVar = durum.tur || durum.q;
      bosDurumGoster(liste, { baslik: 'Bu filtrelere uyan kurum yok', aciklama: 'Farklı bir arama veya tür seçmeyi dene.', ikon: 'bina' },
        filtreVar ? { metin: 'Filtreleri temizle', tikla: temizle } : null);
      liste.firstElementChild.style.gridColumn = '1 / -1';
      return;
    }
    icerikDegistir(liste, sonuc.map(kurumKarti));
  } catch (hata) {
    if (no !== istekNo) return;
    sonucSayisi.textContent = 'Kurumlar yüklenemedi';
    hataGoster(liste, hataMetni(hata), listele);
    liste.firstElementChild.style.gridColumn = '1 / -1';
  }
}

function temizle() {
  durum.tur = '';
  durum.q = '';
  form.reset();
  urlyeYaz();
  listele();
}
