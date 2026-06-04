from app.extensions import db


class FeedType(db.Model):
    __tablename__ = "feed_types"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    unit = db.Column(db.Enum("lbs", "kg", name="feed_unit"), nullable=False)
    cost_per_unit = db.Column(db.Float, nullable=False, default=0.0)
    par_level = db.Column(db.Float, nullable=False, default=0.0)
    current_on_hand = db.Column(db.Float, nullable=False, default=0.0)

    user = db.relationship("User", back_populates="feed_types")
    feed_assignments = db.relationship("FeedAssignment", back_populates="feed_type", cascade="all, delete-orphan")
    feeding_events = db.relationship("FeedingEvent", back_populates="feed_type", cascade="all, delete-orphan")
    inventory_transactions = db.relationship(
        "InventoryTransaction",
        back_populates="feed_type",
        cascade="all, delete-orphan",
    )
    alerts = db.relationship("Alert", back_populates="feed_type", cascade="all, delete-orphan")
