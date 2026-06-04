from datetime import date

from app.extensions import db


class BreedingLog(db.Model):
    __tablename__ = "breeding_logs"

    id = db.Column(db.Integer, primary_key=True)
    flock_id = db.Column(db.Integer, db.ForeignKey("flocks.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, default=date.today)
    male_id = db.Column(db.Integer, db.ForeignKey("flocks.id"), nullable=True)
    female_id = db.Column(db.Integer, db.ForeignKey("flocks.id"), nullable=True)
    outcome_notes = db.Column(db.Text, nullable=True)
    expected_hatch_date = db.Column(db.Date, nullable=True)

    flock = db.relationship("Flock", back_populates="breeding_logs", foreign_keys=[flock_id])
    male = db.relationship("Flock", foreign_keys=[male_id])
    female = db.relationship("Flock", foreign_keys=[female_id])
