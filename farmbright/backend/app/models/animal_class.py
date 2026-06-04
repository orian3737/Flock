from app.extensions import db


class AnimalClass(db.Model):
    __tablename__ = "animal_classes"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)

    user = db.relationship("User", back_populates="animal_classes")
    breeds = db.relationship("Breed", back_populates="animal_class", cascade="all, delete-orphan")
