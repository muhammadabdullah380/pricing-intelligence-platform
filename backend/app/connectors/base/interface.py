from abc import ABC, abstractmethod

from app.connectors.base.schemas import ConnectorResult


class SourceConnector(ABC):
    """Every marketplace connector (Amazon, Walmart, Best Buy, ...) must
    implement this exact interface. This is what makes the pipeline
    source-agnostic: swap a mock connector for a real API-backed one
    without touching any other part of the system.
    """

    source_name: str

    @abstractmethod
    def search_by_identifier(self, identifier_type: str, identifier_value: str) -> ConnectorResult | None:
        """Look up a product by an exact identifier (UPC, EAN, GTIN, ASIN)."""
        raise NotImplementedError

    @abstractmethod
    def search_by_title(self, title: str, brand: str | None = None) -> list[ConnectorResult]:
        """Fuzzy search by title, used when no identifier is available."""
        raise NotImplementedError