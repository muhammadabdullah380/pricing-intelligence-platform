"""Create product_matches table.

Revision ID: 20260926_01
Revises: 20260925_01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260926_01"
down_revision = "20260925_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_matches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column("external_title", sa.String(length=500), nullable=False),
        sa.Column("external_brand", sa.String(length=255), nullable=True),
        sa.Column("external_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("external_url", sa.String(length=2048), nullable=True),
        sa.Column("confidence_score", sa.Numeric(precision=5, scale=3), nullable=False),
        sa.Column("match_level", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="pending_review"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="fk_product_matches_product_id",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_product_matches_product_id", "product_matches", ["product_id"], unique=False)
    op.create_index("ix_product_matches_status", "product_matches", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_product_matches_status", table_name="product_matches")
    op.drop_index("ix_product_matches_product_id", table_name="product_matches")
    op.drop_table("product_matches")