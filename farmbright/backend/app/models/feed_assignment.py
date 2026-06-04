from app.extensions import db


class FeedAssignment(db.Model):
    __tablename__ = "feed_assignments"
    __table_args__ = (
        db.UniqueConstraint("flock_id", "feed_type_id", name="uq_feed_assignment_flock_feed_type"),
    )

    id = db.Column(db.Integer, primary_key=True)
    flock_id = db.Column(db.Integer, db.ForeignKey("flocks.id"), nullable=False, index=True)
    feed_type_id = db.Column(db.Integer, db.ForeignKey("feed_types.id"), nullable=False, index=True)

    flock = db.relationship("Flock", back_populates="feed_assignments")
    feed_type = db.relationship("FeedType", back_populates="feed_assignments")
