from datetime import date

from sqlalchemy import event, update
from sqlalchemy.sql import func

from app.extensions import db


class CasualtyLog(db.Model):
    __tablename__ = "casualty_logs"

    id = db.Column(db.Integer, primary_key=True)
    flock_id = db.Column(db.Integer, db.ForeignKey("flocks.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, default=date.today)
    change_amount = db.Column(db.Integer, nullable=False)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    flock = db.relationship("Flock", back_populates="casualty_logs")


@event.listens_for(CasualtyLog, "after_insert")
def apply_headcount_change(mapper, connection, target):
    from app.models.flock import Flock

    flock_table = Flock.__table__
    connection.execute(
        update(flock_table)
        .where(flock_table.c.id == target.flock_id)
        .values(current_headcount=flock_table.c.current_headcount + target.change_amount)
    )
