from datetime import date

from app.extensions import db


class InventoryTransaction(db.Model):
    __tablename__ = "inventory_transactions"

    id = db.Column(db.Integer, primary_key=True)
    feed_type_id = db.Column(db.Integer, db.ForeignKey("feed_types.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, default=date.today)
    transaction_type = db.Column(
        db.Enum("purchase", "feeding", "adjustment", name="inventory_transaction_type"),
        nullable=False,
    )
    quantity_change = db.Column(db.Float, nullable=False)
    unit_cost = db.Column(db.Float, nullable=True)
    bag_weight = db.Column(db.Float, nullable=True)
    bag_price = db.Column(db.Float, nullable=True)
    cost_per_lb = db.Column(db.Float, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    feed_type = db.relationship("FeedType", back_populates="inventory_transactions")
