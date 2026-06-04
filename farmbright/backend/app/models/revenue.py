from datetime import date

from app.extensions import db


class Revenue(db.Model):
    __tablename__ = "revenues"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    flock_id = db.Column(db.Integer, db.ForeignKey("flocks.id"), nullable=True, index=True)
    date = db.Column(db.Date, nullable=False, default=date.today, index=True)
    amount = db.Column(db.Float, nullable=False, default=0.0)
    source = db.Column(
        db.Enum("egg_sales", "meat_sales", "breeding_sales", "other", name="revenue_entry_source"),
        nullable=False,
    )
    notes = db.Column(db.Text, nullable=True)

    user = db.relationship("User", back_populates="revenues")
    flock = db.relationship("Flock", back_populates="revenues")
