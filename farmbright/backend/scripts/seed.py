import os
import sys
from datetime import date
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import (  # noqa: E402
    AnimalClass,
    Breed,
    FeedAssignment,
    FeedType,
    Flock,
    InventoryTransaction,
    User,
)


def seed():
    app = create_app(os.getenv("FLASK_ENV", "development"))

    with app.app_context():
        existing_user = User.query.filter_by(supabase_uid="seed-farmbright-user").first()
        if existing_user:
            print("Seed data already exists.")
            return

        user = User(
            supabase_uid="seed-farmbright-user",
            email="farmer@example.com",
            farm_name="Everyday Acres",
        )

        poultry = AnimalClass(name="Poultry", user=user)
        goat = AnimalClass(name="Goat", user=user)

        saxony = Breed(name="Saxony Duck", animal_class=poultry)
        cornish = Breed(name="Cornish Cross", animal_class=poultry)
        nubian = Breed(name="Nubian Goat", animal_class=goat)

        layer_flock = Flock(
            name="Saxony Layers",
            breed=saxony,
            designation="layer",
            pen_name="Duck Yard A",
            current_headcount=12,
        )
        meat_flock = Flock(
            name="Spring Meat Growout",
            breed=cornish,
            designation="meat",
            pen_name="Brooder 1",
            current_headcount=25,
        )
        breeder_flock = Flock(
            name="Nubian Does",
            breed=nubian,
            designation="breeder",
            pen_name="Goat Barn",
            current_headcount=4,
        )

        layer_feed = FeedType(
            user=user,
            name="Layer Ration",
            unit="lbs",
            cost_per_unit=0.62,
            par_level=50.0,
            current_on_hand=150.0,
        )
        grower_feed = FeedType(
            user=user,
            name="Grower Crumble",
            unit="lbs",
            cost_per_unit=0.55,
            par_level=75.0,
            current_on_hand=200.0,
        )
        goat_feed = FeedType(
            user=user,
            name="Goat Pellet",
            unit="lbs",
            cost_per_unit=0.48,
            par_level=40.0,
            current_on_hand=120.0,
        )

        db.session.add_all(
            [
                user,
                poultry,
                goat,
                saxony,
                cornish,
                nubian,
                layer_flock,
                meat_flock,
                breeder_flock,
                layer_feed,
                grower_feed,
                goat_feed,
                FeedAssignment(flock=layer_flock, feed_type=layer_feed),
                FeedAssignment(flock=meat_flock, feed_type=grower_feed),
                FeedAssignment(flock=breeder_flock, feed_type=goat_feed),
                InventoryTransaction(
                    feed_type=layer_feed,
                    date=date.today(),
                    transaction_type="purchase",
                    quantity_change=150.0,
                    unit_cost=0.62,
                    notes="Initial seed stock",
                ),
                InventoryTransaction(
                    feed_type=grower_feed,
                    date=date.today(),
                    transaction_type="purchase",
                    quantity_change=200.0,
                    unit_cost=0.55,
                    notes="Initial seed stock",
                ),
                InventoryTransaction(
                    feed_type=goat_feed,
                    date=date.today(),
                    transaction_type="purchase",
                    quantity_change=120.0,
                    unit_cost=0.48,
                    notes="Initial seed stock",
                ),
            ]
        )

        db.session.commit()
        print("Seeded Everyday Acres with two animal classes and three flocks.")


if __name__ == "__main__":
    seed()
