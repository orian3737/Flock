from app.extensions import db


class Breed(db.Model):
    __tablename__ = "breeds"

    id = db.Column(db.Integer, primary_key=True)
    animal_class_id = db.Column(db.Integer, db.ForeignKey("animal_classes.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)

    animal_class = db.relationship("AnimalClass", back_populates="breeds")
    flocks = db.relationship("Flock", back_populates="breed", cascade="all, delete-orphan")
