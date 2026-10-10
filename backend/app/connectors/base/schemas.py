from dataclasses import dataclass


@dataclass
class ConnectorResult:
    """Normalized shape every connector must return, regardless of source."""

    source: str
    external_id: str | None
    title: str
    brand: str | None
    price: float | None
    currency: str
    url: str | None
    image_url: str | None
    in_stock: bool | None
    raw: dict