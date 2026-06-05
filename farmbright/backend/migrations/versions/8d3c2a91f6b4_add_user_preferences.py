"""add user preferences

Revision ID: 8d3c2a91f6b4
Revises: 4c8b2f6d0a91
Create Date: 2026-06-04 23:55:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "8d3c2a91f6b4"
down_revision = "4c8b2f6d0a91"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("display_name", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("preferences", sa.JSON(), nullable=True))

    op.execute("UPDATE users SET preferences = '{}'::json WHERE preferences IS NULL")


def downgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("preferences")
        batch_op.drop_column("display_name")
