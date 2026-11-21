# PatiPortal REST API Sözleşmesi

Tüm backend endpoint'leri JSON döndürür; frontend bu API'yi `fetch` ile tüketir. Bu dosya ortak sözleşmedir, alan adı veya URL değişiklikleri ekipte ortak kararlaştırılır.

---

## 1. Ortak Yanıt Formatı ve HTTP Kodları

**Başarılı yanıt:**
```json
{
  "basarili": true,
  "veri": {}
}
```

**Hatalı yanıt:**
```json
{
  "basarili": false,
  "hata": "Anlaşılır hata mesajı",
  "alanlar": {
    "email": ["Geçerli bir e-posta adresi giriniz."]
  }
}
```
*(Alan bazlı doğrulama hatası yoksa `alanlar` anahtarı dönmez.)*

| Kod | Anlamı |
| :--- | :--- |
| `200` / `201` | Başarılı işlem / Yeni kayıt oluşturuldu |
| `400` | Geçersiz istek, CSRF hatası veya doğrulama hatası (`alanlar` dolu döner) |
| `401` | Oturum açılmamış (frontend giriş sayfasına yönlendirir) |
| `403` | Rol veya kurum yetkisi yetersiz / hesap pasif |
| `404` | Kaynak bulunamadı |
| `409` | Çakışma (ör. kayıtlı e-posta, aynı hayvana ikinci beklemede başvuru) |
| `429` | İstek hız sınırı (rate-limit) aşıldı |
| `500` | Beklenmeyen sunucu hatası |

---

## 2. Erişim Katmanları (Roller)

1. **Ziyaretçi (Oturumsuz):** Herkese açık sayfalar, hayvan/ihtiyaç/kurum listesi, kamu istatistikleri.
2. **Kayıtlı Kullanıcı (`ziyaretci`):** Başvuru yapma, geçmiş başvurularını ve sahiplendiği hayvanları görme, teslim alma randevusu alma.
3. **Barınak / Kurum Görevlisi (`gorevli`):** Sadece `Kurum Görevlileri` tablosunda yetkili olduğu kurumun hayvan, aşı, ihtiyaç, başvuru ve teslimat işlemlerini yönetir.
4. **Sistem Yöneticisi (`admin`):** Tüm kurumları, görevli atamalarını ve kullanıcı hesaplarını yönetir.

---

## 3. Kimlik Doğrulama (`/api/auth`) — Bölüm 3

| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Herkes | Kayıt olur (dakikada en fazla 10 istek). KVKK onayı zorunludur, şifre en az 8 karakterdir, rol varsayılan `ziyaretci` atanır. Aynı e-posta varsa `409`. |
| `POST` | `/api/auth/login` | Herkes | E-posta ve şifre ile oturum açar (dakikada en fazla 5 deneme). Hatalı bilgide `401`, pasif hesapta `403`, sınır aşımında `429`. |
| `POST` | `/api/auth/logout` | Giriş yapmış | Aktif oturumu kapatır. |
| `GET` | `/api/auth/me` | Giriş yapmış | Oturum açan kullanıcının profilini, rolünü ve yetkili olduğu kurum listesini döner (`auth.js` bunu kullanır). |
| `GET` | `/api/auth/csrf-token` | Herkes | `POST/PUT/PATCH/DELETE` isteklerinde `X-CSRFToken` başlığında gönderilecek `{"csrf_token": "..."}` değerini döner. |

**`POST /api/auth/register` İstek Gövdesi:**
```json
{
  "ad_soyad": "Ahmet Yılmaz",
  "email": "ahmet@ornek.com",
  "telefon": "05551234567",
  "sifre": "GucluSifre123",
  "kvkk_onay": true
}
```

**`POST /api/auth/login` İstek Gövdesi:**
```json
{
  "email": "ayse@barinak.org",
  "sifre": "GucluSifre123"
}
```

**`GET /api/auth/me` / `login` / `register` Örnek Yanıt (`veri`):**
```json
{
  "id": 12,
  "ad_soyad": "Ayşe Kaya",
  "email": "ayse@barinak.org",
  "telefon": "05551234567",
  "rol": "gorevli",
  "aktif": true,
  "yetkili_kurumlar": [
    { "id": 1, "ad": "Konya Merkez Barınağı" }
  ],
  "olusturma_tarihi": "2026-11-20T14:50:00"
}
```

---

## 4. Kullanıcı ve Kurum Yönetimi — Bölüm 3

### Kullanıcılar (`/api/users`)
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | Admin | Tüm kullanıcıları listeler. Filtreler: `rol` (`ziyaretci`/`gorevli`/`admin`), `aktif` (`true`/`false`), `arama` (ad soyad veya e-posta). |
| `POST` | `/api/users` | Admin | Yeni görevli veya yönetici hesabı oluşturur (`ad_soyad`*, `email`*, `telefon`*, `sifre`*, `rol` [varsayılan `gorevli`]). Aynı e-posta `409`. |
| `PUT` | `/api/users/<id>` | Admin | Kısmi güncelleme (`ad_soyad`, `telefon`, `rol`, `aktif`). Admin kendi hesabını pasifleştiremez veya kendi `admin` rolünü kaldıramaz (`400`). Görevli rolünden çıkarılan kullanıcının kurum atamaları otomatik temizlenir. |
| `DELETE` | `/api/users/me` | Giriş yapmış | KVKK kapsamında kullanıcının hesabını kapatır ve oturumu sonlandırır. Bağlı başvuru/randevu/sahiplendirme kaydı yoksa kalıcı siler; varsa kişisel verileri (`ad_soyad`, `email`, `telefon`, şifre) anonimleştirir. |

### Kurumlar ve Görevli Atama (`/api/institutions`)
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/institutions` | Herkes | Kurumları listeler. Filtreler: `tur` (`barinak`/`klinik`), `aktif` (`true`/`false`, sadece admin; diğer kullanıcılar yalnız aktif kurumları görür). |
| `GET` | `/api/institutions/<id>` | Herkes | Kurum detayı (pasif kurumlar sadece admin tarafından görüntülenir, diğerlerine `404`). |
| `POST` | `/api/institutions` | Admin | Yeni barınak/klinik ekler: `ad`*, `tur` (`barinak`/`klinik`, varsayılan `barinak`), `adres`, `telefon`, `email`. |
| `PUT` | `/api/institutions/<id>` | Admin | Kısmi güncelleme (`ad`, `tur`, `adres`, `telefon`, `email`, `aktif`). |
| `GET` | `/api/institutions/<id>/staff` | Admin | Kuruma atanmış görevlileri listeler (`id`, `kurum_id`, `user_id`, `ad_soyad`, `email`, `gorev_tanimi`, `baslangic_tarihi`). |
| `POST` | `/api/institutions/<id>/staff` | Admin | Kuruma görevli atar: `{"user_id": 5, "gorev_tanimi": "gorevli"}` (`gorev_tanimi` opsiyonel, varsayılan `"gorevli"`). Yalnızca `gorevli` rolündeki kullanıcılar atanabilir (`400`); zaten atanmışsa `409`. |
| `DELETE` | `/api/institutions/<id>/staff/<user_id>` | Admin | Görevlinin o kurumdaki yetkisini kaldırır (atanmamışsa `404`). |

---

## 5. Sahiplendirme Başvuruları (`/api/applications`) — Bölüm 3

| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/applications` | Giriş yapmış | Sahiplenme başvurusu oluşturur: `animal_id`*, `ev_tipi`*, `aciklama`*, `kvkk_onay: true`*, `onceki_deneyim` (opsiyonel). |
| `GET` | `/api/applications/me` | Giriş yapmış | Kullanıcının kendi başvurularını ve durumlarını listeler. |
| `GET` | `/api/applications` | Görevli (kurum) | Yetkili olunan kurumlardaki başvuruları listeler. Filtreler: `durum` (`beklemede`/`onaylandi`/`reddedildi`), `animal_id`, `kurum_id`. Listede başvuranın telefonu dönmez. |
| `GET` | `/api/applications/<id>` | Görevli (kurum) | Başvuru detayı (yetkili görevli/admin için `basvuran.telefon` dahildir). |
| `PUT` | `/api/applications/<id>/onayla` | Görevli (kurum) | Beklemedeki başvuruyu onaylar (`beklemede` değilse `409`). |
| `PUT` | `/api/applications/<id>/reddet` | Görevli (kurum) | Opsiyonel `{"degerlendirme_notu": "..."}` ile beklemedeki başvuruyu reddeder. Hayvan durumunu değiştirmez. |

**İş Kuralları:**
- `sahiplendirildi` veya `tedavide` durumundaki hayvana başvuru yapılamaz (`409`).
- Aynı kullanıcı aynı hayvana aynı anda sadece bir `beklemede` başvuru yapabilir (`409`); reddedilirse yeniden başvurabilir.
- Başvuru onaylandığında hayvanın durumu `sahiplendirildi` yapılır ve aynı hayvana ait diğer `beklemede` başvurular `"Hayvan başka bir aileye sahiplendirildi"` notuyla otomatik reddedilir.
- Her başvuru oluşturma, onaylama ve reddetme işlemi `İşlem Kayıtları` tablosuna loglanır.

**`GET /api/applications/<id>` Örnek Yanıt (`veri`):**
```json
{
  "id": 4,
  "hayvan_id": 7,
  "kullanici_id": 15,
  "ev_tipi": "Bahçeli ev",
  "onceki_deneyim": "Daha önce 5 yıl kedi baktım.",
  "aciklama": "Sıcak ve güvenli bir yuva sunmak istiyorum.",
  "durum": "beklemede",
  "degerlendirme_notu": null,
  "basvuru_tarihi": "2026-11-20T15:10:00",
  "degerlendirme_tarihi": null,
  "hayvan": {
    "id": 7,
    "ad": "Pamuk",
    "tur": "Kedi",
    "durum": "barinakta",
    "kapak_fotografi": null,
    "kurum": { "id": 1, "ad": "Konya Merkez Barınağı", "tur": "barinak" }
  },
  "basvuran": {
    "id": 15,
    "ad_soyad": "Ayşe Yılmaz",
    "email": "ayse@ornek.com",
    "telefon": "05551234567"
  }
}
```
*(Liste yanıtlarında `basvuran.telefon` alanı yer almaz.)*

---

## 6. Teslim Alma Saatleri, Randevular ve Sahiplendirme Kayıtları — Bölüm 3

| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/institutions/<id>/pickup-slots` | Herkes | Kurumun bugün ve sonrası için aktif teslim alma tarih/saatlerini listeler. |
| `POST` | `/api/institutions/<id>/pickup-slots` | Görevli (kurum) | Yeni teslim saati ekler: `{"tarih": "2026-11-25", "baslangic_saati": "10:00", "bitis_saati": "12:00"}`. Geçmiş tarih veya ters saat aralığı `400`. |
| `DELETE` | `/api/pickup-slots/<slot_id>` | Görevli (kurum) | Teslim saatini kaldırır. Aktif (`planlandi`) randevusu varsa `409`; geçmiş randevusu varsa pasifleştirilir (`aktif: false`), yoksa silinir. |
| `POST` | `/api/appointments` | Giriş yapmış | Onaylı başvuru için teslim randevusu oluşturur: `{"application_id": 4, "slot_id": 2, "not_metni": "..."}` (`not_metni` opsiyonel). İptal edilmiş randevusu olan başvuru yeni saatle yeniden randevu alabilir. |
| `GET` | `/api/appointments/me` | Giriş yapmış | Kullanıcının kendi teslim alma randevularını listeler. |
| `GET` | `/api/appointments` | Görevli (kurum) | Kuruma gelen randevuları listeler (`?durum=planlandi\|tamamlandi\|iptal`), `basvuran.telefon` dahil. |
| `PUT` | `/api/appointments/<id>/iptal` | Giriş yapmış / Görevli (kurum) | Planlanmış (`planlandi`) randevuyu iptal eder (diğer durumlarda `409`). |
| `POST` | `/api/adoptions/complete` | Görevli (kurum) | Teslimatı tamamlar: `{"application_id": 4, "teslim_notu": "..."}` (`teslim_notu` opsiyonel). `Sahiplendirme Kayıtları` kaydı oluşturur, varsa planlı randevuyu `tamamlandi` yapar, hayvan durumunu `sahiplendirildi` olarak doğrular ve loglar. |
| `GET` | `/api/adoptions/me` | Giriş yapmış | Kullanıcının sahiplendiği hayvanları listeler (Kullanıcı sekmesi). |

---

## 7. İstatistikler (`/api/stats`) — Bölüm 3

| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/stats/public` | Herkes | Anasayfa sayaçları: barınaktaki hayvan, sahiplendirilen hayvan ve aktif kurum sayısı. |
| `GET` | `/api/stats` | Görevli | Panel özeti (görevli sadece kendi kurumlarını, admin tüm kurumları görür). |

**`GET /api/stats/public` Örnek Yanıt (`veri`):**
```json
{
  "barinaktaki_hayvan": 24,
  "sahiplendirilen_hayvan": 18,
  "aktif_kurum": 3
}
```

**`GET /api/stats` Örnek Yanıt (`veri`):**
```json
{
  "toplam_hayvan": 30,
  "barinaktaki_hayvan": 12,
  "tedavideki_hayvan": 3,
  "sahiplendirilen_hayvan": 15,
  "bekleyen_basvuru": 4,
  "acik_ihtiyac": 2,
  "bu_hafta_asisi_gelen": 5,
  "geciken_asi": 1,
  "aylik_basvuru": 9,
  "aylik_sahiplendirme": 6
}
```

---

## 8. Hayvanlar, Fotoğraflar, Aşılar ve İhtiyaçlar — Bölüm 4 (Samet)

**Yetki sütunu:** *Görevli (kurum)* = görevli veya admin; görevli sadece `Kurum Görevlileri` tablosunda bağlı olduğu kurumun kayıtlarını değiştirebilir (aksi halde `403`). Okuma uçları herkese açıktır.

**Güncelleme (`PUT`) kuralı:** Sadece gönderilen alanlar değişir. Zorunlu alanlar `null` yapılamaz, isteğe bağlı alanlara `null` gönderilirse değer silinir.

**Kayıt ekleme ve `kurum_id`:** Görevli tek bir kuruma bağlıysa hayvan/ihtiyaç eklerken `kurum_id` göndermesine gerek yoktur; birden çok kurumu varsa veya admin ise zorunludur.

### 8.1 Hayvanlar (`/api/animals`)
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/animals` | Herkes | Liste + sayfalama. Halk sadece `barinakta` olanları görür; görevli `durum` filtresiyle hepsini görebilir. |
| `GET` | `/api/animals/<id>` | Herkes | Detay (fotoğraflar, sağlık/karakter notu, kurum iletişim bilgisi). |
| `POST` | `/api/animals` | Görevli (kurum) | Ekleme. Hızlı ekleme için sadece `ad`, `tur_id`, `cinsiyet` zorunlu. |
| `PUT` | `/api/animals/<id>` | Görevli (kurum) | Güncelleme. |
| `PATCH` | `/api/animals/<id>/durum` | Görevli (kurum) | `{"durum": "tedavide"}` |
| `DELETE` | `/api/animals/<id>` | Görevli (kurum) | Siler; fotoğraf dosyaları ve aşı kayıtları da silinir. Başvurusu veya sahiplendirme kaydı olan hayvan silinemez (`409`). |

**Liste filtreleri:** `tur_id`, `cinsiyet` (`erkek`/`disi`/`bilinmiyor`), `yas_min`, `yas_max` (yıl; doğum tarihi bilinmeyenler yaş filtresine girmez), `asilar_tam` (`true`/`false`), `kisir` (`true`/`false`), `kurum_id`, `arama` (ad veya cins), `durum` (sadece görevli), `sayfa` (varsayılan 1), `limit` (en fazla 50, varsayılan 12).

**Ekleme alanları:** `ad`*, `tur_id`*, `cinsiyet`*, `kurum_id`, `cins`, `dogum_tarihi` (YYYY-AA-GG, gelecekte olamaz) **veya** `yaklasik_yas_ay`, `kisirlastirildi`, `saglik_durumu`, `karakter_notu`, `durum` (varsayılan `barinakta`).

**`GET /api/animals?tur_id=1&asilar_tam=true` Örnek Yanıt (`veri`):**
```json
{
  "kayitlar": [{
    "id": 7, "ad": "Pamuk", "tur": {"id": 1, "ad": "Kedi"}, "cins": null,
    "cinsiyet": "disi", "dogum_tarihi": "2025-10-16", "yas": 1, "yas_metni": "1 yaşında",
    "kisirlastirildi": true, "durum": "barinakta", "asilari_tam": true,
    "kurum": {"id": 1, "ad": "Konya Merkez Barınağı", "tur": "barinak"},
    "kapak_fotografi": {"id": 3, "kapak_mi": true, "sira": 0,
      "url_buyuk": "/uploads/hayvanlar/9f2c..._buyuk.webp",
      "url_kucuk": "/uploads/hayvanlar/9f2c..._kucuk.webp"}
  }],
  "sayfalama": {"sayfa": 1, "limit": 12, "toplam": 1, "sayfa_sayisi": 1}
}
```
Doğum tarihi bilinmeyen hayvanda `yas: null`, `yas_metni: "Bilinmiyor"`; fotoğrafı olmayan hayvanda `kapak_fotografi: null` döner.

**Bölüm 3 için:** Başvuru onayında / teslimde hayvan durumu `app/services/hayvan_servisi.py → hayvan_durumunu_degistir(hayvan, "sahiplendirildi")` ile değiştirilir. Fonksiyon işlem kaydı yazar ama **commit etmez**; çağıran taraf kendi işlemiyle birlikte commit eder.

### 8.2 Fotoğraflar
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/animals/<id>/photos` | Görevli (kurum) | `multipart/form-data`, alan adı **`fotograflar`** (birden çok dosya olabilir). |
| `PUT` | `/api/photos/<id>/kapak` | Görevli (kurum) | Kapak fotoğrafı yapar. |
| `DELETE` | `/api/photos/<id>` | Görevli (kurum) | Siler; silinen kapaksa sıradaki fotoğraf kapak olur. |
| `GET` | `/uploads/hayvanlar/<dosya>` | Herkes | Resim dosyası (`url_buyuk` / `url_kucuk`). |

- Sadece JPG, PNG, WEBP; dosya başına en fazla 10 MB, tek seferde en fazla 10 dosya. Biri hatalıysa hiçbiri kaydedilmez.
- Dosya adı rastgele üretilir; telefonun yön bilgisine göre döndürülür, EXIF (konum dahil) silinir.
- İki boyut WEBP olarak kaydedilir: büyük ≤ 1200 px (detay), küçük ≤ 400 px (kart). Hayvanın ilk fotoğrafı otomatik kapak olur.

```js
const form = new FormData();
for (const dosya of input.files) form.append("fotograflar", dosya);
// apiUpload: fetch(`/api/animals/${id}/photos`, {method: "POST", body: form, headers: {"X-CSRFToken": token}})
```

### 8.3 Aşı Karnesi
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/animals/<id>/vaccinations` | Herkes | Aşı karnesi. |
| `POST` | `/api/animals/<id>/vaccinations` | Görevli (kurum) | `asi_turu_id`* ; `uygulama_tarihi` (varsayılan bugün, gelecekte olamaz), `sonraki_tarih` (uygulama tarihinden sonra), `uygulayan_kurum_id`, `aciklama`. |
| `PUT` | `/api/vaccinations/<id>` | Görevli (kurum) | Düzeltme. |
| `DELETE` | `/api/vaccinations/<id>` | Görevli (kurum) | Silme. |
| `POST` | `/api/vaccinations/<id>/belge` | Görevli (kurum) | `multipart`, alan adı **`belge`** (PDF/JPG/PNG/WEBP). |
| `GET` | `/api/vaccinations/<id>/belge` | Herkes | Belgeyi indirir. |
| `GET` | `/api/vaccinations/yaklasan?gun=7` | Görevli | Önümüzdeki N günde (1–90) dozu gelenler. Görevli sadece kendi kurumlarını görür. |
| `GET` | `/api/vaccinations/gecikmis` | Görevli | Dozu gecikmiş olanlar. |
| `GET` | `/api/vaccinations/turler?hayvan_turu_id=1` | Herkes | Aşı türleri (açılır liste). `hayvan_turu_id` verilirse her türde `zorunlu: true/false`. |
| `POST` | `/api/vaccinations/turler` | Admin | `{"ad": "Lösemi", "aciklama": "..."}` |

**Aşı durumu (`durum`):** `zamaninda` · `yaklasiyor` (≤ 7 gün) · `gecikti` · `tamamlandi` (sonraki doz yok ya da aynı aşının daha yeni dozu girilmiş).

**Aşıları tam:** Türü için zorunlu aşıların (Aşı Gereklilikleri tablosu) hepsi en az bir kez yapılmış **ve** gecikmiş doz yok. Listede rozet ve `asilar_tam` filtresi buna göre çalışır.

**`GET /api/animals/7/vaccinations` Örnek Yanıt (`veri`):**
```json
{
  "hayvan": {"id": 7, "ad": "Pamuk", "tur": "Kedi", "durum": "barinakta", "kapak_fotografi": null},
  "asilari_tam": false,
  "eksik_zorunlu_asilar": [{"id": 2, "ad": "Kuduz"}],
  "asilar": [{
    "id": 11, "hayvan_id": 7, "asi_turu": {"id": 1, "ad": "Karma"},
    "uygulama_tarihi": "2026-11-10", "sonraki_tarih": "2026-12-10",
    "uygulayan_kurum": {"id": 2, "ad": "Merkez Veteriner Kliniği", "tur": "klinik"},
    "belge_url": null, "aciklama": null, "durum": "zamaninda"
  }]
}
```
Yaklaşan/gecikmiş listelerindeki her kayıtta ayrıca `hayvan` özeti bulunur.

### 8.4 Acil İhtiyaçlar ve Destek Sözleri
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/needs?durum=acik` | Herkes | Aciliyete göre sıralı (yüksek → düşük). Filtre: `durum` (varsayılan `acik`), `kurum_id`, `tur`. |
| `GET` | `/api/needs/<id>` | Herkes | Detay. |
| `POST` | `/api/needs` | Görevli (kurum) | `tur`* (`mama`/`ilac`/`malzeme`/`diger`), `baslik`*, `miktar`* ; `birim` (varsayılan `adet`), `aciliyet` (`dusuk`/`orta`/`yuksek`, varsayılan `orta`), `aciklama`, `kurum_id`. |
| `PUT` | `/api/needs/<id>` | Görevli (kurum) | Güncelleme (kurum değiştirilemez). |
| `PATCH` | `/api/needs/<id>/karsilandi` | Görevli (kurum) | Kapatır (zaten kapalıysa `409`). |
| `DELETE` | `/api/needs/<id>` | Görevli (kurum) | Siler; destek sözü gelmişse silinemez (`409`), kapatılmalıdır. |
| `POST` | `/api/needs/<id>/pledges` | Herkes | Destek sözü: `ad_soyad`*, `telefon`*, `miktar`*, `kvkk_onay: true`*, `aciklama`. Giriş yapmış kullanıcının ad/telefonu boşsa hesabından alınır. Kapanmış ihtiyaca söz verilemez (`409`). Dakikada en fazla 10 istek. |
| `GET` | `/api/needs/<id>/pledges` | Görevli (kurum) | Gelen sözler, telefon dahil. |
| `PATCH` | `/api/pledges/<id>/durum` | Görevli (kurum) | `{"durum": "teslim_edildi"}` (veya `iptal`, `soz_verildi`). |
| `GET` | `/api/pledges/me` | Giriş yapmış | Kullanıcının kendi destek sözleri (Kullanıcı sekmesi). |

Destek sözündeki telefon veritabanında şifreli saklanır; herkese açık yanıtlarda telefon dönmez.

**`GET /api/needs` Örnek Yanıt (`veri`):**
```json
[{
  "id": 1, "kurum": {"id": 1, "ad": "Konya Merkez Barınağı", "tur": "barinak"},
  "tur": "mama", "baslik": "Yavru kedi maması", "aciklama": null,
  "miktar": 20.0, "birim": "kg", "aciliyet": "yuksek", "durum": "acik",
  "toplam_soz": 5.0, "kalan": 15.0, "ilerleme_yuzde": 25, "karsilanmis_olabilir": false,
  "olusturma_tarihi": "2026-11-20T14:50:00", "kapanma_tarihi": null
}]
```
`toplam_soz` iptal edilmemiş sözlerin toplamıdır. Sözler ihtiyacı karşılarsa `karsilanmis_olabilir: true` olur; kapatma kararını görevli verir.

### 8.5 Hayvan Türleri (`/api/hayvan-turleri`)
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/hayvan-turleri` | Herkes | Türler ve her türün `zorunlu_asilar` listesi (filtre açılır listesi için). |
| `POST` | `/api/hayvan-turleri` | Admin | `{"ad": "Tavşan"}` |
| `PUT` | `/api/hayvan-turleri/<id>/zorunlu-asilar` | Admin | `{"asi_turu_idleri": [1, 2]}` – türün zorunlu aşı listesini tamamen değiştirir. |