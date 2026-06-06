import os

from flask import Flask
from apscheduler.schedulers.background import BackgroundScheduler

from app.extensions import db, login_manager, mail, migrate
from app.routes.dashboard import dashboard_bp
from app.routes.export import export_bp
from app.routes.financials import financials_bp
from app.routes.flocks import flocks_bp
from app.routes.health import health_bp
from app.routes.inventory import inventory_bp
from app.routes.onboarding import onboarding_bp
from app.routes.scale_house import scale_house_bp
from app.routes.users import users_bp
from config import config_by_name

_scheduler = None


def create_app(config_name=None):
    app = Flask(__name__)
    config_name = config_name or os.getenv("FLASK_ENV", "development")
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
    app.register_blueprint(flocks_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(onboarding_bp)
    app.register_blueprint(scale_house_bp)
    app.register_blueprint(users_bp)

    if not app.config.get("TESTING"):
        start_scheduler(app)

    return app


def start_scheduler(app):
    global _scheduler
    if _scheduler and _scheduler.running:
        return

    from app.services.financial_service import aggregate_daily_financials

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        func=lambda: aggregate_daily_financials(app),
        trigger="cron",
        hour=0,
        minute=5,
        id="nightly_financial_aggregation",
        replace_existing=True,
    )
    _scheduler.start()
