from datetime import date, datetime

from sqlalchemy import event, select, update
from sqlalchemy.ext.hybrid import hybrid_property

from app.extensions import db


class FeedingEvent(db.Model):
    __tablename__ = "feeding_events"

    id = db.Column(db.Integer, primary_key=True)
    flock_id = db.Column(db.Integer, db.ForeignKey("flocks.id"), nullable=False, index=True)
    feed_type_id = db.Column(db.Integer, db.ForeignKey("feed_types.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, default=date.today)
    timestamp = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    total_weight = db.Column(db.Float, nullable=False)
    cost_per_lb_at_time = db.Column(db.Float, nullable=True)
    input_method = db.Column(db.Enum("manual", "scale", name="feeding_input_method"), nullable=False)

    flock = db.relationship("Flock", back_populates="feeding_events")
    feed_type = db.relationship("FeedType", back_populates="feeding_events")

    @hybrid_property
    def weight_per_bird(self):
        headcount = self.flock.current_headcount if self.flock else 0
        return self.total_weight / headcount if headcount else 0.0

    @hybrid_property
    def cost_total(self):
        cost_per_unit = self.cost_per_lb_at_time
        if cost_per_unit is None:
            cost_per_unit = self.feed_type.cost_per_lb if self.feed_type else 0
        return self.total_weight * cost_per_unit

    @hybrid_property
    def cost_per_bird(self):
        headcount = self.flock.current_headcount if self.flock else 0
        return self.cost_total / headcount if headcount else 0.0


@event.listens_for(FeedingEvent, "before_insert")
def lock_feed_cost(mapper, connection, target):
    if target.cost_per_lb_at_time is not None:
        return

    from app.models.feed_type import FeedType

    feed_table = FeedType.__table__
    feed_row = connection.execute(
        select(feed_table.c.bag_weight, feed_table.c.bag_price, feed_table.c.cost_per_unit).where(
            feed_table.c.id == target.feed_type_id
        )
    ).first()
    if feed_row and feed_row.bag_weight and feed_row.bag_weight > 0:
        target.cost_per_lb_at_time = round(feed_row.bag_price / feed_row.bag_weight, 4)
    elif feed_row:
        target.cost_per_lb_at_time = feed_row.cost_per_unit


@event.listens_for(FeedingEvent, "after_insert")
def debit_feed_inventory(mapper, connection, target):
    from app.models.alert import Alert
    from app.models.feed_type import FeedType
    from app.models.inventory_transaction import InventoryTransaction

    feed_table = FeedType.__table__
    inventory_table = InventoryTransaction.__table__
    alert_table = Alert.__table__

    connection.execute(
        update(feed_table)
        .where(feed_table.c.id == target.feed_type_id)
        .values(current_on_hand=feed_table.c.current_on_hand - target.total_weight)
    )

    connection.execute(
        inventory_table.insert().values(
            feed_type_id=target.feed_type_id,
            date=target.date,
            transaction_type="feeding",
            quantity_change=-target.total_weight,
            unit_cost=target.cost_per_lb_at_time,
            cost_per_lb=target.cost_per_lb_at_time,
            notes=f"Auto-created from feeding event {target.id}",
        )
    )

    feed_row = connection.execute(
        select(
            feed_table.c.id,
            feed_table.c.user_id,
            feed_table.c.name,
            feed_table.c.par_level,
            feed_table.c.current_on_hand,
        ).where(feed_table.c.id == target.feed_type_id)
    ).first()

    if feed_row and feed_row.current_on_hand <= feed_row.par_level:
        connection.execute(
            alert_table.insert().values(
                user_id=feed_row.user_id,
                feed_type_id=feed_row.id,
                alert_type="low_feed",
                message=(
                    f"{feed_row.name} is at or below par level: "
                    f"{feed_row.current_on_hand} on hand, par {feed_row.par_level}."
                ),
                is_read=False,
            )
        )
