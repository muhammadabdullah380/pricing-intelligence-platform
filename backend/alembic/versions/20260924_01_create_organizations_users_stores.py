"""Create organizations, users, and stores tables.

Revision ID: 20260924_01
Revises:
"""

from alembic import op
import sqlalchemy as sa


revision = "20260924_01"
down_revision = None
branch_labels = None
depends_on = None


user_role = sa.Enum(
    "OWNER",
    "ADMIN",
    "ANALYST",
    "VIEWER",
    name="user_role",
    native_enum=False,
    create_constraint=True,
)


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("industry", sa.String(length=100), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=True),
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
        sa.UniqueConstraint("slug", name="uq_organizations_slug"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
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
            ["organization_id"],
            ["organizations.id"],
            name="fk_users_organization_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_organization_id", "users", ["organization_id"], unique=False)

    op.create_table(
        "stores",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=True),
        sa.Column("platform", sa.String(length=100), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=True),
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
            ["organization_id"],
            ["organizations.id"],
            name="fk_stores_organization_id",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_stores_organization_id", "stores", ["organization_id"], unique=False)
    op.create_index("ix_stores_domain", "stores", ["domain"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_stores_domain", table_name="stores")
    op.drop_index("ix_stores_organization_id", table_name="stores")
    op.drop_table("stores")

    op.drop_index("ix_users_organization_id", table_name="users")
    op.drop_table("users")

    op.drop_table("organizations")
