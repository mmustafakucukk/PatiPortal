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
| `400` | Geçersiz istek veya doğrulama hatası (`alanlar` dolu döner) |
| `401` | Oturum açılmamış (frontend giriş sayfasına yönlendirir) |
| `403` | Rol veya kurum yetkisi yetersiz / hesap pasif |
| `404` | Kaynak bulunamadı |
| `409` | Çakışma (ör. aynı hayvana ikinci beklemede başvuru) |
| `429` | İstek hız sınırı (rate-limit) aşıldı |
| `500` | Beklenmeyen sunucu hatası |

---

## 2. Erişim Katmanları (Roller)

1. **Ziyaretçi (Oturumsuz):** Herkese açık sayfalar, hayvan/ihtiyaç listesi, kamu istatistikleri.
2. **Kayıtlı Kullanıcı (`ziyaretci`):** Başvuru yapma, geçmiş başvurularını ve sahiplendiği hayvanları görme, teslim alma randevusu alma.
3. **Barınak / Kurum Görevlisi (`gorevli`):** Sadece `Kurum Görevlileri` tablosunda yetkili olduğu kurumun hayvan, aşı, ihtiyaç, başvuru ve teslimat işlemlerini yönetir.
4. **Sistem Yöneticisi (`admin`):** Tüm kurumları, görevli atamalarını ve kullanıcı hesaplarını yönetir.

---

## 3. Kimlik Doğrulama (`/api/auth`) — Bölüm 3

| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Herkes | Kayıt olur. KVKK onayı zorunludur, şifre en az 8 karakterdir, rol varsayılan `ziyaretci` atanır. |
| `POST` | `/api/auth/login` | Herkes | E-posta ve şifre ile oturum açar (dakikada en fazla 5 deneme). |
| `POST` | `/api/auth/logout` | Giriş yapmış | Aktif oturumu kapatır. |
| `GET` | `/api/auth/me` | Giriş yapmış | Oturum açan kullanıcının profilini, rolünü ve (görevliyse) yetkili olduğu kurum listesini döner (`auth.js` bunu kullanır). |
| `GET` | `/api/auth/csrf-token` | Herkes | `POST/PUT/PATCH/DELETE` isteklerinde `X-CSRFToken` başlığında gönderilecek token'ı döner. |

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

**`GET /api/auth/me` Örnek Yanıt (`veri`):**
```json
{
  "id": 12,
  "ad_soyad": "Ayşe Kaya",
  "email": "ayse@barinak.org",
  "rol": "gorevli",
  "yetkili_kurumlar": [
    { "id": 1, "ad": "Konya Merkez Barınağı" }
  ]
}
```

---

## 4. Kullanıcı ve Kurum Yönetimi — Bölüm 3

### Kullanıcılar (`/api/users`)
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | Admin | Tüm kullanıcıları listeler (`rol`, `aktif` filtresi destekler). |
| `POST` | `/api/users` | Admin | Yeni görevli veya yönetici hesabı oluşturur. |
| `PUT` | `/api/users/<id>` | Admin | Rol değiştirir veya hesabı pasifleştirir (`aktif: false`). |
| `DELETE` | `/api/users/me` | Giriş yapmış | KVKK kapsamında kullanıcının kendi hesabını ve kişisel verilerini siler. |

### Kurumlar ve Görevli Atama (`/api/institutions`)
| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/institutions` | Herkes | Kayıtlı barınak/klinikleri listeler. |
| `POST` | `/api/institutions` | Admin | Yeni barınak/klinik ekler. |
| `PUT` | `/api/institutions/<id>` | Admin | Kurum bilgilerini günceller. |
| `POST` | `/api/institutions/<id>/staff` | Admin | Bir kullanıcıyı ilgili kuruma görevli olarak atar (`Kurum Görevlileri`). |
| `DELETE` | `/api/institutions/<id>/staff/<user_id>` | Admin | Görevlinin o kurumdaki yetkisini kaldırır. |

---

## 5. Sahiplendirme Başvuruları (`/api/applications`) — Bölüm 3

| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/applications` | Giriş yapmış | Hayvan için sahiplenme başvurusu oluşturur. |
| `GET` | `/api/applications/me` | Giriş yapmış | Kullanıcının kendi başvurularını ve durumlarını listeler. |
| `GET` | `/api/applications?durum=...` | Görevli (kurum) | Görevlinin yetkili olduğu kurumdaki başvuruları listeler. |
| `GET` | `/api/applications/<id>` | Görevli (kurum) | Başvuru detayını ve başvuranın iletişim bilgisini döner (telefon sadece yetkiliye görünür). |
| `PUT` | `/api/applications/<id>/onayla` | Görevli (kurum) | Başvuruyu onaylar. |
| `PUT` | `/api/applications/<id>/reddet` | Görevli (kurum) | Opsiyonel `degerlendirme_notu` ile başvuruyu reddeder. |

**İş Kuralları:**
- `sahiplendirildi` veya `tedavide` durumundaki hayvana başvuru yapılamaz.
- Aynı kullanıcı aynı hayvana aynı anda sadece bir `beklemede` başvuru yapabilir.
- Başvuru onaylandığında hayvanın durumu güncellenir ve aynı hayvana ait diğer `beklemede` başvurular `"Hayvan başka bir aileye sahiplendirildi"` notuyla otomatik reddedilir.
- Her başvuru oluşturma, onaylama ve reddetme işlemi `İşlem Kayıtları` tablosuna loglanır.

---

## 6. Teslim Alma Saatleri, Randevular ve Sahiplendirme Kayıtları — Bölüm 3

| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/institutions/<id>/pickup-slots` | Herkes | Kurumun müsait teslim alma tarih/saatlerini listeler. |
| `POST` | `/api/institutions/<id>/pickup-slots` | Görevli (kurum) | Kurum için yeni teslim alma saati ekler. |
| `DELETE` | `/api/pickup-slots/<slot_id>` | Görevli (kurum) | Uygun teslim alma saatini kaldırır. |
| `POST` | `/api/appointments` | Giriş yapmış | Onaylanmış başvurusu için teslim alma randevusu oluşturur. |
| `GET` | `/api/appointments/me` | Giriş yapmış | Kullanıcının kendi teslim alma randevularını listeler. |
| `GET` | `/api/appointments` | Görevli (kurum) | Kuruma gelen teslim alma randevularını listeler. |
| `PUT` | `/api/appointments/<id>/iptal` | Giriş yapmış / Görevli | Randevuyu iptal eder. |
| `POST` | `/api/adoptions/complete` | Görevli (kurum) | Hayvanın teslim edildiğini kaydeder (`Sahiplendirme Kayıtları`), hayvan durumunu `sahiplendirildi` yapar ve işlem kaydı oluşturur. |
| `GET` | `/api/adoptions/me` | Giriş yapmış | Kullanıcının sahiplendiği hayvanları listeler (Kullanıcı sekmesi). |

---

## 7. İstatistikler (`/api/stats`) — Bölüm 3

| Metot | Endpoint | Yetki | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/stats/public` | Herkes | Anasayfa sayaçları: barınaktaki ve sahiplendirilen hayvan sayısı. |
| `GET` | `/api/stats` | Görevli | Panel özeti: toplam hayvan, bekleyen başvuru, açık ihtiyaç, bu hafta aşısı gelenler, aylık başvuru ve sahiplendirme sayıları. |

---

## 8. Hayvanlar, Fotoğraflar, Aşılar ve İhtiyaçlar — Bölüm 4 (Samet)
*(Samet kendi endpoint sözleşmelerini bu bölümün altına ekleyecek.)*