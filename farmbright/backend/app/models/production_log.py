from datetime import date

from app.extensions import db


class ProductionLog(db.Model):
    __tablename__ = "production_logs"

    id = db.Column(db.Integer, primary_key=True)
    flock_id = db.Column(db.Integer, db.ForeignKey("flocks.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, default=date.today)
    egg_count = db.Column(db.Integer, nullable=True)
    water_consumed = db.Column(db.Float, nullable=True)
    avg_weight = db.Column(db.Float, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    flock = db.relationship("Flock", back_populates="production_logs")
