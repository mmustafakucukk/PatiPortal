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
3. **Barınak / Kurum Görevlisi (`gorevli`):** Sadece `Kurum Görevlileri` tablosunda yetkili olduğu kurumun hayvan, aşı, ihtiyaç, başvuru ve teslimat işlemlerini yönetir. `gorev_tanimi: "yonetici"` olan görevliler kendi kurumlarının görevli listesini de yönetebilir.
4. **Sistem Yöneticisi (`admin`):** Tüm kurumları, görevli atamalarını, işlem kayıtlarını ve kullanıcı hesaplarını yönetir.

---

## 3. Kimlik Doğrulama (`/api/auth`) — Bölüm 3

| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Herkes | Kayıt olur ve otomatik olarak oturum açar (dakikada en fazla 10 istek). KVKK onayı zorunludur, şifre en az 8 karakterdir, rol varsayılan `ziyaretci` atanır. Aynı e-posta varsa `409`. |
| `POST` | `/api/auth/login` | Herkes | E-posta ve şifre ile oturum açar (dakikada en fazla 5 deneme). Hatalı bilgide `401`, pasif hesapta `403`, sınır aşımında `429`. |
| `POST` | `/api/auth/logout` | Giriş yapmış | Aktif oturumu kapatır. |
| `GET` | `/api/auth/me` | Giriş yapmış | Oturum açan kullanıcının profilini, rolünü ve yetkili olduğu kurum listesini (`gorev_tanimi` dahil) döner (`auth.js` bunu kullanır). |
| `PUT` | `/api/auth/password` | Giriş yapmış | Mevcut şifreyi doğrulayarak şifre değiştirir: `{"mevcut_sifre": "...", "yeni_sifre": "..."}`. Mevcut şifre yanlışsa `400`. |
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
    { "id": 1, "ad": "Konya Merkez Barınağı", "gorev_tanimi": "yonetici" }
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
| `PUT` | `/api/users/me` | Giriş yapmış | Kendi profil bilgilerini (`ad_soyad`, `telefon`) kısmi olarak günceller. |
| `PUT` | `/api/users/<id>` | Admin | Kısmi güncelleme (`ad_soyad`, `telefon`, `rol`, `aktif`). Admin kendi hesabını pasifleştiremez veya kendi `admin` rolünü kaldıramaz (`400`). Görevli rolünden çıkarılan kullanıcının kurum atamaları otomatik temizlenir. |
| `DELETE` | `/api/users/me` | Giriş yapmış | KVKK kapsamında kullanıcının hesabını kapatır ve oturumu sonlandırır. Bağlı başvuru/randevu/sahiplendirme kaydı yoksa kalıcı siler; varsa kişisel verileri (`ad_soyad`, `email`, `telefon`, şifre) anonimleştirir. |

### Kurumlar ve Görevli Atama (`/api/institutions`)
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/institutions` | Herkes | Kurumları listeler. Filtreler: `tur` (`barinak`/`klinik`), `il`, `ilce`, `aktif` (`true`/`false`, sadece admin; diğer kullanıcılar yalnız aktif kurumları görür). |
| `GET` | `/api/institutions/<id>` | Herkes | Kurum detayı (`il`, `ilce`, `adres`, `telefon`, `email`, `aktif`). Pasif kurumlar sadece admin tarafından görüntülenir, diğerlerine `404`. |
| `POST` | `/api/institutions` | Admin | Yeni barınak/klinik ekler: `ad`*, `tur` (`barinak`/`klinik`, varsayılan `barinak`), `il`, `ilce`, `adres`, `telefon`, `email`. |
| `PUT` | `/api/institutions/<id>` | Admin | Kısmi güncelleme (`ad`, `tur`, `il`, `ilce`, `adres`, `telefon`, `email`, `aktif`). |
| `DELETE` | `/api/institutions/<id>` | Admin | Kurumu siler. Bağlı hayvan, ihtiyaç veya teslim saati varsa silinemez (`409`); pasifleştirilmelidir. |
| `GET` | `/api/institutions/<id>/staff` | Admin / Kurum Yöneticisi | Kuruma atanmış görevlileri listeler (`id`, `kurum_id`, `user_id`, `ad_soyad`, `email`, `gorev_tanimi`, `baslangic_tarihi`). |
| `POST` | `/api/institutions/<id>/staff` | Admin / Kurum Yöneticisi | Kuruma görevli atar: `user_id` **veya** `email` ve opsiyonel `gorev_tanimi` (varsayılan `"gorevli"`). Ziyaretçi kullanıcı atanırsa rolü otomatik `gorevli` yapılır. Admin atanamaz (`400`), pasif kullanıcı veya mevcut atama `409`. `gorev_tanimi: "yonetici"` ataması yalnızca sistem yöneticisi tarafından yapılabilir (`403`). |
| `DELETE` | `/api/institutions/<id>/staff/<user_id>` | Admin / Kurum Yöneticisi | Görevlinin o kurumdaki yetkisini kaldırır (atanmamışsa `404`). Kurum yöneticisi kendini veya başka bir kurum yöneticisini çıkaramaz (`400`/`403`). |

---

## 5. Sahiplendirme Başvuruları (`/api/applications`) — Bölüm 3

| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/applications` | Giriş yapmış | Sahiplenme başvurusu oluşturur: `animal_id`*, `ev_tipi`*, `aciklama`*, `kvkk_onay: true`*, `onceki_deneyim` (opsiyonel, `null` kabul eder). |
| `GET` | `/api/applications/me` | Giriş yapmış | Kullanıcının kendi başvurularını, durumlarını ve varsa bağlı teslim randevusu özetini (`randevu`) listeler. |
| `GET` | `/api/applications` | Görevli (kurum) | Yetkili olunan kurumlardaki başvuruları listeler. Filtreler: `durum` (`beklemede`/`onaylandi`/`reddedildi`/`iptal`), `animal_id`, `kurum_id`. Listede başvuranın telefonu dönmez. |
| `GET` | `/api/applications/<id>` | Görevli (kurum) | Başvuru detayı (yetkili görevli/admin için `basvuran.telefon` ve varsa `randevu` dahildir). |
| `PUT` | `/api/applications/<id>/onayla` | Görevli (kurum) | Beklemedeki başvuruyu onaylar (`beklemede` değilse `409`). Hayvanı `rezerve` durumuna alır. |
| `PUT` | `/api/applications/<id>/reddet` | Görevli (kurum) | Opsiyonel `{"degerlendirme_notu": "..."}` (`null` kabul eder) ile beklemedeki başvuruyu reddeder. Hayvan durumunu değiştirmez. |
| `PUT` | `/api/applications/<id>/iptal` | Giriş yapmış | Kullanıcı kendi `beklemede` veya henüz teslim edilmemiş `onaylandi` başvurusunu iptal eder (`iptal`). Başkasının başvurusu `403`; teslim edilmiş veya zaten kapalıysa `409`. Onaylı başvuru iptal edilince varsa planlı randevu iptal edilir ve `rezerve` durumundaki hayvan tekrar `barinakta` olur. |

**İş Kuralları:**
- `barinakta` dışındaki (`tedavide`, `rezerve`, `sahiplendirildi`) hayvana başvuru yapılamaz (`409`).
- Aynı kullanıcı aynı hayvana aynı anda sadece bir `beklemede` başvuru yapabilir (`409`); reddedilirse veya iptal edilirse yeniden başvurabilir.
- Başvuru onaylandığında hayvanın durumu `rezerve` yapılır (fiziksel teslimde `sahiplendirildi` olur) ve aynı hayvana ait diğer `beklemede` başvurular `"Hayvan başka bir aileye sahiplendirildi"` notuyla otomatik reddedilir.
- Her başvuru oluşturma, onaylama, reddetme ve iptal işlemi `İşlem Kayıtları` tablosuna loglanır.

**`GET /api/applications/<id>` Örnek Yanıt (`veri`):**
```json
{
  "id": 4,
  "hayvan_id": 7,
  "kullanici_id": 15,
  "ev_tipi": "Bahçeli ev",
  "onceki_deneyim": "Daha önce 5 yıl kedi baktım.",
  "aciklama": "Sıcak ve güvenli bir yuva sunmak istiyorum.",
  "durum": "onaylandi",
  "degerlendirme_notu": null,
  "basvuru_tarihi": "2026-11-20T15:10:00",
  "degerlendirme_tarihi": "2026-11-21T10:00:00",
  "hayvan": {
    "id": 7,
    "ad": "Pamuk",
    "tur": "Kedi",
    "durum": "rezerve",
    "kapak_fotografi": null,
    "kurum": { "id": 1, "ad": "Konya Merkez Barınağı", "tur": "barinak" }
  },
  "basvuran": {
    "id": 15,
    "ad_soyad": "Ayşe Yılmaz",
    "email": "ayse@ornek.com",
    "telefon": "05551234567"
  },
  "randevu": {
    "id": 2,
    "teslim_saati_id": 5,
    "durum": "planlandi",
    "not_metni": null,
    "olusturma_tarihi": "2026-11-21T11:30:00",
    "tarih": "2026-11-25",
    "baslangic_saati": "10:00",
    "bitis_saati": "10:30"
  }
}
```
*(Liste yanıtlarında `basvuran.telefon` alanı yer almaz; randevusu yoksa `randevu: null` döner.)*

---

## 6. Teslim Alma Saatleri, Randevular ve Sahiplendirme Kayıtları — Bölüm 3

| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/institutions/<id>/pickup-slots` | Herkes | Kurumun bugün ve sonrası için aktif teslim alma tarih/saatlerini listeler (`kapasite`, `dolu_sayisi`, `kalan_kapasite`, `dolu` alanları dahil). |
| `POST` | `/api/institutions/<id>/pickup-slots` | Görevli (kurum) | Yeni teslim saati ekler: `{"tarih": "2026-11-25", "baslangic_saati": "10:00", "bitis_saati": "12:00", "kapasite": 1}` (`kapasite`: 1–50, varsayılan 1). Geçmiş tarih veya ters saat aralığı `400`. |
| `POST` | `/api/institutions/<id>/pickup-slots/bulk` | Görevli (kurum) | Toplu teslim saati ekler (en fazla 200 saat). Çakışan veya geçmiş saatler atlanır. Yanıt: `{"eklenenler": [...], "eklenen_sayisi": 12, "atlanan_sayisi": 2}`. |
| `DELETE` | `/api/pickup-slots/<slot_id>` | Görevli (kurum) | Teslim saatini kaldırır. Aktif (`planlandi`) randevusu varsa `409`; geçmiş randevusu varsa pasifleştirilir (`aktif: false`), yoksa silinir. |
| `POST` | `/api/appointments` | Giriş yapmış | Onaylı başvuru için teslim randevusu oluşturur: `{"application_id": 4, "slot_id": 2, "not_metni": "..."}` (`not_metni` opsiyonel, `null` kabul eder). Kapasitesi dolu saate `409`. `iptal` veya `gelmedi` randevusu olan başvuru yeni saatle yeniden randevu alabilir. |
| `GET` | `/api/appointments/me` | Giriş yapmış | Kullanıcının kendi teslim alma randevularını listeler. |
| `GET` | `/api/appointments` | Görevli (kurum) | Kuruma gelen randevuları listeler. Filtreler: `kurum_id` (başka kurum `403`), `tarih` (`YYYY-AA-GG`), `durum` (`planlandi`/`tamamlandi`/`iptal`/`gelmedi`). `basvuran.telefon` dahildir. |
| `PUT` | `/api/appointments/<id>/iptal` | Giriş yapmış / Görevli (kurum) | Planlanmış (`planlandi`) randevuyu iptal eder (diğer durumlarda `409`). |
| `PUT` | `/api/appointments/<id>/gelmedi` | Görevli (kurum) | Planlanmış (`planlandi`) randevuyu `gelmedi` olarak işaretler (diğer durumlarda `409`). |
| `POST` | `/api/adoptions/complete` | Görevli (kurum) | Teslimatı tamamlar: `{"application_id": 4, "teslim_notu": "..."}` (`teslim_notu` opsiyonel, `null` kabul eder). `Sahiplendirme Kayıtları` kaydı oluşturur, varsa planlı randevuyu `tamamlandi` yapar, hayvan durumunu `sahiplendirildi` yapar ve loglar. |
| `GET` | `/api/adoptions` | Görevli (kurum) | Kurumun sahiplendirme kayıtlarını listeler (`?kurum_id=`, başka kurum `403`; `sahiplenen.telefon` dahildir). |
| `GET` | `/api/adoptions/me` | Giriş yapmış | Kullanıcının sahiplendiği hayvanları ve her hayvanın `asi_karnesi` bilgisini listeler (Kullanıcı sekmesi). |

**`POST /api/institutions/<id>/pickup-slots/bulk` İki Kabul Edilen İstek Biçimi:**
```json
{
  "baslangic_tarihi": "2026-11-25",
  "bitis_tarihi": "2026-12-01",
  "gunler": [1, 2, 3, 4, 5],
  "baslangic_saati": "10:00",
  "bitis_saati": "16:00",
  "sure": 30,
  "kapasite": 2
}
```
*(Alternatif: `{"saatler": [{"tarih": "2026-11-25", "baslangic_saati": "10:00", "bitis_saati": "10:30", "kapasite": 1}]}`. `gunler` değerleri: `0=Pazar, 1=Pazartesi ... 6=Cumartesi`.)*

---

## 7. İstatistikler ve İşlem Kayıtları — Bölüm 3

### 7.1 İstatistikler (`/api/stats`)
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/stats/public` | Herkes | Anasayfa sayaçları: barınaktaki hayvan, sahiplendirilen hayvan, aktif kurum ve açık ihtiyaç sayısı. |
| `GET` | `/api/stats` | Görevli | Panel özeti (`?kurum_id=` ile tek kuruma daraltılabilir; görevli başka kurumu isterse `403`). |

**`GET /api/stats/public` Örnek Yanıt (`veri`):**
```json
{
  "barinaktaki_hayvan": 24,
  "sahiplendirilen_hayvan": 18,
  "aktif_kurum": 3,
  "acik_ihtiyac": 5
}
```

**`GET /api/stats` Örnek Yanıt (`veri`):**
```json
{
  "toplam_hayvan": 30,
  "barinaktaki_hayvan": 12,
  "tedavideki_hayvan": 3,
  "rezerve_hayvan": 2,
  "sahiplendirilen_hayvan": 13,
  "bekleyen_basvuru": 4,
  "acik_ihtiyac": 2,
  "bu_hafta_asisi_gelen": 5,
  "geciken_asi": 1,
  "aylik_basvuru": 9,
  "aylik_sahiplendirme": 6
}
```

### 7.2 İşlem Kayıtları (`/api/audit-logs`)
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/audit-logs` | Admin | Sistemdeki işlem kayıtlarını en yeniden eskiye sayfalı olarak listeler. |

**Filtreler:** `baslangic` (`YYYY-AA-GG`), `bitis` (`YYYY-AA-GG`), `kullanici_id`, `kurum_id`, `islem_turu`, `hedef_tablo`, `sayfa` (varsayılan 1), `limit` (1–100, varsayılan 20).

**`GET /api/audit-logs` Örnek Yanıt (`veri`):**
```json
{
  "kayitlar": [{
    "id": 42,
    "kullanici_id": 2,
    "kullanici": {
      "id": 2,
      "ad_soyad": "Zeynep Kaya",
      "email": "gorevli@patiportal.local",
      "rol": "gorevli"
    },
    "islem_turu": "basvuru_onaylandi",
    "hedef_tablo": "sahiplendirme_basvurulari",
    "hedef_id": 4,
    "detay": "Başvuru #4 onaylandı (Hayvan #7 - Pamuk)",
    "tarih": "2026-11-22T10:15:00"
  }],
  "sayfalama": { "sayfa": 1, "limit": 20, "toplam": 42, "sayfa_sayisi": 3 }
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

**Liste filtreleri:** `tur_id`, `cinsiyet` (`erkek`/`disi`/`bilinmiyor`), `yas_min`, `yas_max` (yıl; doğum tarihi bilinmeyenler yaş filtresine girmez), `asilar_tam` (`true`/`false`), `kisir` (`true`/`false`), `kurum_id`, `il` (kurum adresinde aranır; kurumda ayrı il alanı yok), `arama` (ad veya cins), `durum` (sadece görevli), `siralama`, `sayfa` (varsayılan 1), `limit` (en fazla 50, varsayılan 12).

**Sıralama (`siralama`):** `yeni` (varsayılan, en son eklenen önce) · `eski` (en uzun süredir bekleyen önce) · `ad` (A→Z) · `genc` (en genç önce) · `yasli` (en yaşlı önce). Yaş sıralamalarında doğum tarihi bilinmeyenler sonda yer alır. Geçersiz değer `400` döner.

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

**Bölüm 3 için:** Başvuru onayında / teslimde hayvan durumu `app/services/hayvan_servisi.py → hayvan_durumunu_degistir(hayvan, "rezerve" / "sahiplendirildi")` ile değiştirilir. Fonksiyon işlem kaydı yazar ama **commit etmez**; çağıran taraf kendi işlemiyle birlikte commit eder.

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
| `GET` | `/api/vaccinations/yaklasan?gun=7&kurum_id=1` | Görevli | Önümüzdeki N günde (1–90) dozu gelenler. Görevli sadece kendi kurumlarını görür; `kurum_id` ile tek kuruma daraltılır (başka kurum → `403`). |
| `GET` | `/api/vaccinations/gecikmis?kurum_id=1` | Görevli | Dozu gecikmiş olanlar (`kurum_id` isteğe bağlı). |
| `GET` | `/api/vaccinations/turler?hayvan_turu_id=1` | Herkes | Aşı türleri (açılır liste). `hayvan_turu_id` verilirse her türde `zorunlu: true/false` ve `tekrar_araligi_gun` (sonraki doz önerisi için). |
| `POST` | `/api/vaccinations/turler` | Admin | `{"ad": "Lösemi", "aciklama": "..."}` |
| `PUT` | `/api/vaccinations/turler/<id>` | Admin | Düzenleme (`ad`, `aciklama`; sadece gönderilenler değişir). Aynı ad varsa `409`. |
| `DELETE` | `/api/vaccinations/turler/<id>` | Admin | Silme. Aşı herhangi bir hayvana uygulanmışsa `409`. Türlerin zorunlu aşı listesinden de çıkar. |

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
Yaklaşan/gecikmiş listelerindeki her kayıtta ayrıca `hayvan` özeti bulunur; özette hayvanın `kurum` bilgisi de vardır.

**Sonraki doz önerisi:** Aşı eklerken `sonraki_tarih` boş (veya `null`) gönderilirse ve hayvanın türü için bu aşının tekrar aralığı tanımlıysa (8.5), sonraki doz `uygulama_tarihi + tekrar_araligi_gun` olarak otomatik yazılır. Elle girilen tarih değiştirilmez.

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
| `PATCH` | `/api/pledges/<id>/iptal` | Giriş yapmış | Kullanıcı **kendi hesabıyla verdiği** sözü iptal eder. Başkasının sözü → `403`; zaten iptal veya teslim edilmiş → `409`. Giriş yapmadan verilen sözü görevli iptal eder. |
| `GET` | `/api/pledges/me` | Giriş yapmış | Kullanıcının kendi destek sözleri (Kullanıcı sekmesi). Her sözdeki `ihtiyac` özetinde `birim` de bulunur. |

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
| `GET` | `/api/hayvan-turleri` | Herkes | Türler ve her türün `zorunlu_asilar` listesi, tekrar aralıklarıyla (filtre açılır listesi için). |
| `POST` | `/api/hayvan-turleri` | Admin | `{"ad": "Tavşan"}` |
| `PUT` | `/api/hayvan-turleri/<id>` | Admin | Ad değiştirme: `{"ad": "Kediler"}`. Aynı ad varsa `409`. |
| `DELETE` | `/api/hayvan-turleri/<id>` | Admin | Silme. O türde kayıtlı hayvan varsa `409`. |
| `PUT` | `/api/hayvan-turleri/<id>/zorunlu-asilar` | Admin | Türün zorunlu aşı listesini tamamen değiştirir. İki biçimden biri gönderilir (aşağıda). |

**Zorunlu aşılar ve tekrar aralığı:**
```json
{"asi_turu_idleri": [1, 2]}
{"asilar": [{"asi_turu_id": 1, "tekrar_araligi_gun": 365}, {"asi_turu_id": 2}]}
```
Birinci biçimde listede kalan aşıların tekrar aralığı korunur, yeni eklenenlerinki boş olur. İkinci biçimde aralık açıkça belirlenir (1–3650 gün, boş bırakılabilir). `GET` yanıtındaki `zorunlu_asilar` öğeleri: `{"id", "ad", "tekrar_araligi_gun"}`.