from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.store import Store
    from app.models.product_match import ProductMatch


class Product(Base):
    """Customer's own product catalog. Matches the spec's `products` table
    exactly (sku/gtin/ean/upc/brand/manufacturer/title/etc.), plus one
    addition: `list_price`, since the CSV import format includes a Price
    column and we need somewhere to land it until Phase 6 (historical
    pricing in ClickHouse) takes over as the source of truth for prices.
    """

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    external_id: Mapped[str | None] = mapped_column(String(255), index=True)
    sku: Mapped[str | None] = mapped_column(String(255), index=True)
    gtin: Mapped[str | None] = mapped_column(String(64))
    ean: Mapped[str | None] = mapped_column(String(64))
    upc: Mapped[str | None] = mapped_column(String(64))
    brand: Mapped[str | None] = mapped_column(String(255))
    manufacturer: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(255), index=True)
    model_number: Mapped[str | None] = mapped_column(String(255))
    url: Mapped[str | None] = mapped_column(String(2048))
    image_url: Mapped[str | None] = mapped_column(String(2048))
    list_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    store: Mapped["Store"] = relationship(back_populates="products")
    product_matches: Mapped[list["ProductMatch"]] = relationship(back_populates="product", cascade="all, delete-orphan")