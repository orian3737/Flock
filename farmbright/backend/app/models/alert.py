from sqlalchemy.sql import func

from app.extensions import db


class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    feed_type_id = db.Column(db.Integer, db.ForeignKey("feed_types.id"), nullable=True, index=True)
    alert_type = db.Column(db.Enum("low_feed", name="alert_type"), nullable=False)
    message = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    user = db.relationship("User", back_populates="alerts")
    feed_type = db.relationship("FeedType", back_populates="alerts")
