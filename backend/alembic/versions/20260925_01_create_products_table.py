"""Create products table.

Revision ID: 20260925_01
Revises: 20260924_01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260925_01"
down_revision = "20260924_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("store_id", sa.Integer(), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column("sku", sa.String(length=255), nullable=True),
        sa.Column("gtin", sa.String(length=64), nullable=True),
        sa.Column("ean", sa.String(length=64), nullable=True),
        sa.Column("upc", sa.String(length=64), nullable=True),
        sa.Column("brand", sa.String(length=255), nullable=True),
        sa.Column("manufacturer", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=255), nullable=True),
        sa.Column("model_number", sa.String(length=255), nullable=True),
        sa.Column("url", sa.String(length=2048), nullable=True),
        sa.Column("image_url", sa.String(length=2048), nullable=True),
        sa.Column("list_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="active"),
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
            ["store_id"],
            ["stores.id"],
            name="fk_products_store_id",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_products_store_id", "products", ["store_id"], unique=False)
    op.create_index("ix_products_external_id", "products", ["external_id"], unique=False)
    op.create_index("ix_products_sku", "products", ["sku"], unique=False)
    op.create_index("ix_products_category", "products", ["category"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_products_category", table_name="products")
    op.drop_index("ix_products_sku", table_name="products")
    op.drop_index("ix_products_external_id", table_name="products")
    op.drop_index("ix_products_store_id", table_name="products")
    op.drop_table("products")
