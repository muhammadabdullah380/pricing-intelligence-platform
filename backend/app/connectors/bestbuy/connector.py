import random

from app.connectors.base.interface import SourceConnector
from app.connectors.base.schemas import ConnectorResult


class BestBuyConnector(SourceConnector):
    """MOCK connector. Best Buy's real Developer API requires a business
    (non-free-email) domain to sign up, which isn't available yet. This
    returns realistic sample data with the exact same shape the real API
    would produce. Once a business email is available, swap this class
    for a real implementation -- nothing else in the pipeline needs to
    change.
    """

    source_name = "bestbuy"

    def search_by_identifier(self, identifier_type: str, identifier_value: str) -> ConnectorResult | None:
        return ConnectorResult(
            source=self.source_name,
            external_id=f"MOCK-BBY-{identifier_value[-6:]}",
            title=f"[MOCK] Product matching {identifier_type.upper()} {identifier_value}",
            brand="Unknown",
            price=round(random.uniform(15, 200), 2),
            currency="USD",
            url="https://www.bestbuy.com/site/MOCKSKU.p",
            image_url=None,
            in_stock=True,
            raw={"mock": True, "identifier_type": identifier_type, "identifier_value": identifier_value},
        )

    def search_by_title(self, title: str, brand: str | None = None) -> list[ConnectorResult]:
        return [
            ConnectorResult(
                source=self.source_name,
                external_id="MOCK-BBY-0001",
                title=f"[MOCK] {title}",
                brand=brand or "Unknown",
                price=round(random.uniform(15, 200), 2),
                currency="USD",
                url="https://www.bestbuy.com/site/MOCKSKU.p",
                image_url=None,
                in_stock=True,
                raw={"mock": True, "query": title},
            )
        ]