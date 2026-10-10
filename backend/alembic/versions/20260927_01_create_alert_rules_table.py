"""Create alert_rules table.

Revision ID: 20260927_01
Revises: 20260926_01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260927_01"
down_revision = "20260926_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("store_id", sa.Integer(), nullable=False),
        sa.Column("metric", sa.String(length=32), nullable=False),
        sa.Column("threshold_pct", sa.Float(), nullable=False),
        sa.Column("email_enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "metric IN ('price_drop_pct', 'price_increase_pct')",
            name="ck_alert_rules_metric",
        ),
        sa.ForeignKeyConstraint(
            ["store_id"],
            ["stores.id"],
            name="fk_alert_rules_store_id",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_alert_rules_store_id", "alert_rules", ["store_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_alert_rules_store_id", table_name="alert_rules")
    op.drop_table("alert_rules")