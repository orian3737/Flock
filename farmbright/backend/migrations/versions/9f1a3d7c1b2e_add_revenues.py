"""add revenues

Revision ID: 9f1a3d7c1b2e
Revises: d2c72f65c70a
Create Date: 2026-06-04 23:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "9f1a3d7c1b2e"
down_revision = "d2c72f65c70a"
branch_labels = None
depends_on = None


def upgrade():
    revenue_source = postgresql.ENUM(
        "egg_sales",
        "meat_sales",
        "breeding_sales",
        "other",
        name="revenue_entry_source",
        create_type=False,
    )
    revenue_source.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "revenues",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("flock_id", sa.Integer(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("source", revenue_source, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["flock_id"], ["flocks.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("revenues", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_revenues_date"), ["date"], unique=False)
        batch_op.create_index(batch_op.f("ix_revenues_flock_id"), ["flock_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_revenues_user_id"), ["user_id"], unique=False)


def downgrade():
    with op.batch_alter_table("revenues", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_revenues_user_id"))
        batch_op.drop_index(batch_op.f("ix_revenues_flock_id"))
        batch_op.drop_index(batch_op.f("ix_revenues_date"))
    op.drop_table("revenues")
    sa.Enum(name="revenue_entry_source").drop(op.get_bind(), checkfirst=True)
