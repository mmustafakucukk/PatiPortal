import os
from flask import Flask, abort, send_from_directory
from config import CONFIG_MAP
from app.extensions import db, migrate, login_manager, limiter, csrf
from app.utils.responses import basarili_yanit, hata_yaniti


def create_app(ortam=None):
    secili_ortam = ortam or os.getenv("FLASK_ENV", "development")

    proje_koku = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    static_dizini = os.path.join(proje_koku, "static")
    pages_dizini = os.path.join(proje_koku, "pages")

    app = Flask(
        __name__,
        static_folder=static_dizini,
        static_url_path="/static",
    )
    app.json.ensure_ascii = False
    app.config.from_object(CONFIG_MAP.get(secili_ortam, CONFIG_MAP["development"]))

    # Eklentileri uygulamaya bağla
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    limiter.init_app(app)
    csrf.init_app(app)

    @login_manager.user_loader
    def kullanici_yukle(user_id):
        from sqlalchemy.orm import selectinload
        from app.models import Kullanici, KurumGorevlisi

        try:
            kid = int(user_id)
        except (TypeError, ValueError):
            return None
        return db.session.get(
            Kullanici,
            kid,
            options=[
                selectinload(Kullanici.kurum_gorevleri).joinedload(KurumGorevlisi.kurum)
            ],
        )

    # Yetkisiz isteklerde HTML yönlendirmesi yerine JSON 401 döndür
    @login_manager.unauthorized_handler
    def yetkisiz_erisim():
        return hata_yaniti("Bu işlem için giriş yapmanız gerekiyor.", 401)

    # Global hata yakalayıcılar (HTML yerine her zaman JSON)
    _hata_yakalayicilari_kaydet(app)

    # Blueprint'ler ilerleyen adımlarda buraya kaydedilecek
   # Bölüm 3 (Abdulhafız): kimlik doğrulama, kullanıcı ve kurum yönetimi
    from app.routes.auth import auth_bp
    from app.routes.users import users_bp
    from app.routes.institutions import institutions_bp

    for blueprint in (auth_bp, users_bp, institutions_bp):
        app.register_blueprint(blueprint)

    # Bölüm 4 (Samet): hayvanlar, fotoğraflar, aşılar, ihtiyaçlar, hayvan türleri
    from app.utils.hatalar import hata_yakalayicilarini_kaydet
    from app.routes.animals import animals_bp
    from app.routes.photos import photos_bp, uploads_bp
    from app.routes.vaccinations import vaccinations_bp
    from app.routes.needs import needs_bp
    from app.routes.species import species_bp

    hata_yakalayicilarini_kaydet(app)
    for blueprint in (animals_bp, photos_bp, uploads_bp, vaccinations_bp, needs_bp, species_bp):
        app.register_blueprint(blueprint)

    # Sağlık kontrolü (iskelet testi için)
    @app.get("/api/health")
    def saglik_kontrolu():
        return basarili_yanit({"durum": "calisiyor", "ortam": secili_ortam})

    # Frontend sayfalarını (pages/ ve pages/panel/) sun
    @app.get("/")
    def anasayfa():
        if os.path.exists(os.path.join(pages_dizini, "index.html")):
            return send_from_directory(pages_dizini, "index.html")
        return basarili_yanit({"mesaj": "PatiPortal API çalışıyor."})

    @app.get("/<path:dosya_yolu>")
    def sayfa_sun(dosya_yolu):
        if dosya_yolu.startswith("api/"):
            abort(404)
        tam_yol = os.path.join(pages_dizini, dosya_yolu)
        if os.path.isfile(tam_yol):
            return send_from_directory(pages_dizini, dosya_yolu)
        abort(404)

    return app


def _hata_yakalayicilari_kaydet(app):
    from flask_wtf.csrf import CSRFError

    @app.errorhandler(CSRFError)
    def csrf_hatasi(err):
        return hata_yaniti("Güvenlik doğrulaması (CSRF) başarısız. Sayfayı yenileyip tekrar deneyin.", 400)

    @app.errorhandler(400)
    def bad_request(err):
        return hata_yaniti("Geçersiz istek.", 400)

    @app.errorhandler(401)
    def unauthorized(err):
        return hata_yaniti("Kimlik doğrulama gerekli.", 401)

    @app.errorhandler(403)
    def forbidden(err):
        return hata_yaniti("Bu işlem için yetkiniz yok.", 403)

    @app.errorhandler(404)
    def not_found(err):
        return hata_yaniti("İstenen kaynak bulunamadı.", 404)

    @app.errorhandler(429)
    def too_many_requests(err):
        return hata_yaniti("Çok fazla istek gönderildi. Lütfen biraz bekleyin.", 429)

    @app.errorhandler(500)
    def internal_error(err):
        return hata_yaniti("Sunucu tarafında beklenmeyen bir hata oluştu.", 500)