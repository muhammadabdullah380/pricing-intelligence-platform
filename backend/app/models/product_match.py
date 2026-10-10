from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.product import Product


class ProductMatch(Base):
    """One candidate match between our product and a connector's result.

    Every time the matching engine scores a connector hit against one of
    our products, a row lands here -- high-confidence hits are auto
    accepted, mid-confidence ones sit in a review queue for a human to
    confirm, and low-confidence ones are rejected outright.
    """

    __tablename__ = "product_matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(255))
    external_title: Mapped[str] = mapped_column(String(500), nullable=False)
    external_brand: Mapped[str | None] = mapped_column(String(255))
    external_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    external_url: Mapped[str | None] = mapped_column(String(2048))
    confidence_score: Mapped[float] = mapped_column(Numeric(5, 3), nullable=False)
    match_level: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending_review")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    product: Mapped["Product"] = relationship(back_populates="product_matches")