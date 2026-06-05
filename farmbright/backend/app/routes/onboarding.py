from flask import Blueprint, jsonify, request
from flask_cors import CORS
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import AnimalClass, Breed, FeedAssignment, FeedType, Flock
from app.utils.jwt_middleware import require_auth


onboarding_bp = Blueprint("onboarding", __name__, url_prefix="/api/onboarding")
CORS(onboarding_bp, origins=["http://localhost:5173"])


def _payload():
    return request.get_json(silent=True) or {}


def _required(data, fields):
    missing = [field for field in fields if data.get(field) in (None, "")]
    if missing:
        return jsonify({"message": f"Missing required field(s): {', '.join(missing)}"}), 400
    return None


def _commit_or_conflict(message):
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"message": message}), 409
    return None


def _flock_json(flock):
    return {
        "id": flock.id,
        "breed_id": flock.breed_id,
        "name": flock.name,
        "designation": flock.designation,
        "pen_name": flock.pen_name,
        "current_headcount": flock.current_headcount,
        "created_at": flock.created_at.isoformat() if flock.created_at else None,
    }


def _feed_type_json(feed_type):
    return {
        "id": feed_type.id,
        "user_id": feed_type.user_id,
        "name": feed_type.name,
        "unit": feed_type.unit,
        "cost_per_unit": feed_type.cost_per_unit,
        "cost_per_lb": feed_type.cost_per_lb,
        "bag_weight": feed_type.bag_weight,
        "bag_price": feed_type.bag_price,
        "par_level": feed_type.par_level,
        "current_on_hand": feed_type.current_on_hand,
    }


def _assignment_json(assignment):
    return {
        "id": assignment.id,
        "flock_id": assignment.flock_id,
        "feed_type_id": assignment.feed_type_id,
    }


def _not_found(label):
    return jsonify({"message": f"{label} not found."}), 404


@onboarding_bp.post("/animal-class")
@require_auth
def create_animal_class():
    data = _payload()
    error = _required(data, ["user_id", "name"])
    if error:
        return error

    name = data["name"].strip()
    duplicate = AnimalClass.query.filter_by(user_id=data["user_id"], name=name).first()
    if duplicate:
        return jsonify({"message": "Animal class already exists for this user."}), 409

    animal_class = AnimalClass(user_id=data["user_id"], name=name)
    db.session.add(animal_class)
    conflict = _commit_or_conflict("Could not create animal class.")
    if conflict:
        return conflict

    return jsonify({"id": animal_class.id, "name": animal_class.name}), 201


@onboarding_bp.patch("/animal-class/<int:animal_class_id>")
@require_auth
def update_animal_class(animal_class_id):
    animal_class = db.session.get(AnimalClass, animal_class_id)
    if not animal_class:
        return _not_found("Animal class")

    data = _payload()
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"message": "Name is required."}), 400
        animal_class.name = name

    conflict = _commit_or_conflict("Could not update animal class.")
    if conflict:
        return conflict

    return jsonify({"id": animal_class.id, "name": animal_class.name}), 200


@onboarding_bp.delete("/animal-class/<int:animal_class_id>")
@require_auth
def delete_animal_class(animal_class_id):
    animal_class = db.session.get(AnimalClass, animal_class_id)
    if not animal_class:
        return _not_found("Animal class")

    db.session.delete(animal_class)
    conflict = _commit_or_conflict("Could not delete animal class.")
    if conflict:
        return conflict

    return jsonify({"success": True}), 200


@onboarding_bp.post("/breed")
@require_auth
def create_breed():
    data = _payload()
    error = _required(data, ["animal_class_id", "name"])
    if error:
        return error

    name = data["name"].strip()
    duplicate = Breed.query.filter_by(animal_class_id=data["animal_class_id"], name=name).first()
    if duplicate:
        return jsonify({"message": "Breed already exists for this animal class."}), 409

    breed = Breed(animal_class_id=data["animal_class_id"], name=name)
    db.session.add(breed)
    conflict = _commit_or_conflict("Could not create breed.")
    if conflict:
        return conflict

    return jsonify({"id": breed.id, "name": breed.name, "animal_class_id": breed.animal_class_id}), 201


@onboarding_bp.patch("/breed/<int:breed_id>")
@require_auth
def update_breed(breed_id):
    breed = db.session.get(Breed, breed_id)
    if not breed:
        return _not_found("Breed")

    data = _payload()
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"message": "Name is required."}), 400
        breed.name = name

    conflict = _commit_or_conflict("Could not update breed.")
    if conflict:
        return conflict

    return jsonify({"id": breed.id, "name": breed.name, "animal_class_id": breed.animal_class_id}), 200


@onboarding_bp.delete("/breed/<int:breed_id>")
@require_auth
def delete_breed(breed_id):
    breed = db.session.get(Breed, breed_id)
    if not breed:
        return _not_found("Breed")

    db.session.delete(breed)
    conflict = _commit_or_conflict("Could not delete breed.")
    if conflict:
        return conflict

    return jsonify({"success": True}), 200


@onboarding_bp.post("/flock")
@require_auth
def create_flock():
    data = _payload()
    error = _required(data, ["breed_id", "name", "designation", "current_headcount"])
    if error:
        return error

    designation = data["designation"]
    if designation not in {"layer", "breeder", "meat", "mixed"}:
        return jsonify({"message": "Designation must be layer, breeder, meat, or mixed."}), 400

    name = data["name"].strip()
    duplicate = Flock.query.filter_by(breed_id=data["breed_id"], name=name).first()
    if duplicate:
        return jsonify({"message": "Flock already exists for this breed."}), 409

    flock = Flock(
        breed_id=data["breed_id"],
        name=name,
        designation=designation,
        pen_name=(data.get("pen_name") or "").strip() or None,
        current_headcount=int(data["current_headcount"]),
    )
    db.session.add(flock)
    conflict = _commit_or_conflict("Could not create flock.")
    if conflict:
        return conflict

    return jsonify(_flock_json(flock)), 201


@onboarding_bp.patch("/flock/<int:flock_id>")
@require_auth
def update_flock(flock_id):
    flock = db.session.get(Flock, flock_id)
    if not flock:
        return _not_found("Flock")

    data = _payload()
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"message": "Name is required."}), 400
        flock.name = name
    if "designation" in data:
        if data["designation"] not in {"layer", "breeder", "meat", "mixed"}:
            return jsonify({"message": "Designation must be layer, breeder, meat, or mixed."}), 400
        flock.designation = data["designation"]
    if "pen_name" in data:
        flock.pen_name = (data.get("pen_name") or "").strip() or None
    if "current_headcount" in data:
        flock.current_headcount = int(data["current_headcount"])

    conflict = _commit_or_conflict("Could not update flock.")
    if conflict:
        return conflict

    return jsonify(_flock_json(flock)), 200


@onboarding_bp.delete("/flock/<int:flock_id>")
@require_auth
def delete_flock(flock_id):
    flock = db.session.get(Flock, flock_id)
    if not flock:
        return _not_found("Flock")

    db.session.delete(flock)
    conflict = _commit_or_conflict("Could not delete flock.")
    if conflict:
        return conflict

    return jsonify({"success": True}), 200


@onboarding_bp.post("/feed-type")
@require_auth
def create_feed_type():
    data = _payload()
    error = _required(data, ["user_id", "name", "unit", "bag_weight", "bag_price", "par_level", "current_on_hand"])
    if error:
        return error

    unit = data["unit"]
    if unit not in {"lbs", "kg"}:
        return jsonify({"message": "Unit must be lbs or kg."}), 400

    name = data["name"].strip()
    duplicate = FeedType.query.filter_by(user_id=data["user_id"], name=name).first()
    if duplicate:
        return jsonify({"message": "Feed type already exists for this user."}), 409

    bag_weight = float(data["bag_weight"])
    bag_price = float(data["bag_price"])
    if bag_weight <= 0:
        return jsonify({"message": "Bag weight must be greater than zero."}), 400

    feed_type = FeedType(
        user_id=data["user_id"],
        name=name,
        unit=unit,
        bag_weight=bag_weight,
        bag_price=bag_price,
        cost_per_unit=bag_price / bag_weight,
        par_level=float(data["par_level"]),
        current_on_hand=float(data["current_on_hand"]),
    )
    db.session.add(feed_type)
    conflict = _commit_or_conflict("Could not create feed type.")
    if conflict:
        return conflict

    return jsonify(_feed_type_json(feed_type)), 201


@onboarding_bp.patch("/feed-type/<int:feed_type_id>")
@require_auth
def update_feed_type(feed_type_id):
    feed_type = db.session.get(FeedType, feed_type_id)
    if not feed_type:
        return _not_found("Feed type")

    data = _payload()
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"message": "Name is required."}), 400
        feed_type.name = name
    if "unit" in data:
        if data["unit"] not in {"lbs", "kg"}:
            return jsonify({"message": "Unit must be lbs or kg."}), 400
        feed_type.unit = data["unit"]
    if "bag_weight" in data:
        bag_weight = float(data["bag_weight"])
        if bag_weight <= 0:
            return jsonify({"message": "Bag weight must be greater than zero."}), 400
        feed_type.bag_weight = bag_weight
    if "bag_price" in data:
        feed_type.bag_price = float(data["bag_price"])
    if "par_level" in data:
        feed_type.par_level = float(data["par_level"])
    if "current_on_hand" in data:
        feed_type.current_on_hand = float(data["current_on_hand"])

    conflict = _commit_or_conflict("Could not update feed type.")
    if conflict:
        return conflict

    return jsonify(_feed_type_json(feed_type)), 200


@onboarding_bp.delete("/feed-type/<int:feed_type_id>")
@require_auth
def delete_feed_type(feed_type_id):
    feed_type = db.session.get(FeedType, feed_type_id)
    if not feed_type:
        return _not_found("Feed type")

    db.session.delete(feed_type)
    conflict = _commit_or_conflict("Could not delete feed type.")
    if conflict:
        return conflict

    return jsonify({"success": True}), 200


@onboarding_bp.post("/feed-assignment")
@require_auth
def create_feed_assignment():
    data = _payload()
    error = _required(data, ["flock_id", "feed_type_id"])
    if error:
        return error

    duplicate = FeedAssignment.query.filter_by(
        flock_id=data["flock_id"],
        feed_type_id=data["feed_type_id"],
    ).first()
    if duplicate:
        return jsonify({"message": "Feed assignment already exists."}), 409

    assignment = FeedAssignment(flock_id=data["flock_id"], feed_type_id=data["feed_type_id"])
    db.session.add(assignment)
    conflict = _commit_or_conflict("Could not create feed assignment.")
    if conflict:
        return conflict

    return jsonify(_assignment_json(assignment)), 201


@onboarding_bp.delete("/feed-assignment/<int:assignment_id>")
@require_auth
def delete_feed_assignment(assignment_id):
    assignment = db.session.get(FeedAssignment, assignment_id)
    if not assignment:
        return _not_found("Feed assignment")

    db.session.delete(assignment)
    conflict = _commit_or_conflict("Could not delete feed assignment.")
    if conflict:
        return conflict

    return jsonify({"success": True}), 200


@onboarding_bp.get("/summary/<int:user_id>")
def onboarding_summary(user_id):
    animal_classes = AnimalClass.query.filter_by(user_id=user_id).order_by(AnimalClass.name).all()
    feed_types = FeedType.query.filter_by(user_id=user_id).order_by(FeedType.name).all()

    class_tree = []
    for animal_class in animal_classes:
        breeds = []
        for breed in sorted(animal_class.breeds, key=lambda item: item.name):
            flocks = []
            for flock in sorted(breed.flocks, key=lambda item: item.name):
                flock_data = _flock_json(flock)
                flock_data["feed_assignments"] = [_assignment_json(assignment) for assignment in flock.feed_assignments]
                flocks.append(flock_data)
            breeds.append(
                {
                    "id": breed.id,
                    "animal_class_id": breed.animal_class_id,
                    "name": breed.name,
                    "flocks": flocks,
                }
            )
        class_tree.append(
            {
                "id": animal_class.id,
                "user_id": animal_class.user_id,
                "name": animal_class.name,
                "breeds": breeds,
            }
        )

    return jsonify(
        {
            "animal_classes": class_tree,
            "feed_types": [_feed_type_json(feed_type) for feed_type in feed_types],
        }
    )
