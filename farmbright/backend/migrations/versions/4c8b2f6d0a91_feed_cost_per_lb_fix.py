"""feed cost per lb fix

Revision ID: 4c8b2f6d0a91
Revises: 9f1a3d7c1b2e
Create Date: 2026-06-04 23:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "4c8b2f6d0a91"
down_revision = "9f1a3d7c1b2e"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("feed_types", schema=None) as batch_op:
        batch_op.add_column(sa.Column("bag_weight", sa.Float(), nullable=False, server_default="50.0"))
        batch_op.add_column(sa.Column("bag_price", sa.Float(), nullable=False, server_default="0.0"))

    op.execute("UPDATE feed_types SET bag_price = cost_per_unit, bag_weight = 50.0 WHERE cost_per_unit > 0")
    op.execute("UPDATE feed_types SET cost_per_unit = CASE WHEN bag_weight > 0 THEN bag_price / bag_weight ELSE 0 END")

    with op.batch_alter_table("inventory_transactions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("bag_weight", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("bag_price", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("cost_per_lb", sa.Float(), nullable=True))

    op.execute(
        """
        UPDATE inventory_transactions
        SET cost_per_lb = unit_cost
        WHERE unit_cost IS NOT NULL
        """
    )

    with op.batch_alter_table("feeding_events", schema=None) as batch_op:
        batch_op.add_column(sa.Column("cost_per_lb_at_time", sa.Float(), nullable=True))

    op.execute(
        """
        UPDATE feeding_events
        SET cost_per_lb_at_time = feed_types.cost_per_unit
        FROM feed_types
        WHERE feeding_events.feed_type_id = feed_types.id
        """
    )

    with op.batch_alter_table("feed_types", schema=None) as batch_op:
        batch_op.alter_column("bag_weight", server_default=None)
        batch_op.alter_column("bag_price", server_default=None)


def downgrade():
    with op.batch_alter_table("feeding_events", schema=None) as batch_op:
        batch_op.drop_column("cost_per_lb_at_time")

    with op.batch_alter_table("inventory_transactions", schema=None) as batch_op:
        batch_op.drop_column("cost_per_lb")
        batch_op.drop_column("bag_price")
        batch_op.drop_column("bag_weight")

    with op.batch_alter_table("feed_types", schema=None) as batch_op:
        batch_op.drop_column("bag_price")
        batch_op.drop_column("bag_weight")
