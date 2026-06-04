from flask import Flask

from app.extensions import db, login_manager, mail, migrate
from app.routes.health import health_bp
from config import config_by_name


def create_app(config_name="development"):
    app = Flask(__name__)
    app.config.from_object(config_by_name.get(config_name, config_by_name["development"]))

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    mail.init_app(app)

    app.register_blueprint(health_bp)

    return app
