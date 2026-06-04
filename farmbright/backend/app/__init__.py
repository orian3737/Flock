from flask import Flask

from app.extensions import db, login_manager, mail, migrate
from app.routes.dashboard import dashboard_bp
from app.routes.export import export_bp
from app.routes.financials import financials_bp
from app.routes.health import health_bp
from app.routes.inventory import inventory_bp
from app.routes.onboarding import onboarding_bp
from app.routes.scale_house import scale_house_bp
from app.routes.users import users_bp
from config import config_by_name


def create_app(config_name="development"):
    app = Flask(__name__)
    app.config.from_object(config_by_name.get(config_name, config_by_name["development"]))

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    mail.init_app(app)

    with app.app_context():
        from app import models  # noqa: F401

    app.register_blueprint(dashboard_bp)
    app.register_blueprint(export_bp)
    app.register_blueprint(financials_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(onboarding_bp)
    app.register_blueprint(scale_house_bp)
    app.register_blueprint(users_bp)

    return app
