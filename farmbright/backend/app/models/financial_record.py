from datetime import date

from app.extensions import db


class FinancialRecord(db.Model):
    __tablename__ = "financial_records"

    id = db.Column(db.Integer, primary_key=True)
    flock_id = db.Column(db.Integer, db.ForeignKey("flocks.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, default=date.today)
    total_feed_cost = db.Column(db.Float, nullable=False, default=0.0)
    total_revenue = db.Column(db.Float, nullable=False, default=0.0)
    net_pl = db.Column(db.Float, nullable=False, default=0.0)
    cost_per_bird = db.Column(db.Float, nullable=False, default=0.0)
    revenue_source = db.Column(
        db.Enum("egg_sales", "meat_sales", "other", name="revenue_source"),
        nullable=False,
    )

    flock = db.relationship("Flock", back_populates="financial_records")
