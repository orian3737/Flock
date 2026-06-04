from sqlalchemy.sql import func

from app.extensions import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    supabase_uid = db.Column(db.String(128), nullable=False, unique=True, index=True)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    farm_name = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    animal_classes = db.relationship("AnimalClass", back_populates="user", cascade="all, delete-orphan")
    feed_types = db.relationship("FeedType", back_populates="user", cascade="all, delete-orphan")
    alerts = db.relationship("Alert", back_populates="user", cascade="all, delete-orphan")
