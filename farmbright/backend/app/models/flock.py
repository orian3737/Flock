from sqlalchemy.sql import func

from app.extensions import db


class Flock(db.Model):
    __tablename__ = "flocks"

    id = db.Column(db.Integer, primary_key=True)
    breed_id = db.Column(db.Integer, db.ForeignKey("breeds.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    designation = db.Column(
        db.Enum("layer", "breeder", "meat", "mixed", name="flock_designation"),
        nullable=False,
    )
    pen_name = db.Column(db.String(120), nullable=True)
    current_headcount = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    breed = db.relationship("Breed", back_populates="flocks")
    casualty_logs = db.relationship("CasualtyLog", back_populates="flock", cascade="all, delete-orphan")
    feed_assignments = db.relationship("FeedAssignment", back_populates="flock", cascade="all, delete-orphan")
    feeding_events = db.relationship("FeedingEvent", back_populates="flock", cascade="all, delete-orphan")
    production_logs = db.relationship("ProductionLog", back_populates="flock", cascade="all, delete-orphan")
    breeding_logs = db.relationship(
        "BreedingLog",
        back_populates="flock",
        cascade="all, delete-orphan",
        foreign_keys="BreedingLog.flock_id",
    )
    financial_records = db.relationship("FinancialRecord", back_populates="flock", cascade="all, delete-orphan")
    revenues = db.relationship("Revenue", back_populates="flock", cascade="all, delete-orphan")
