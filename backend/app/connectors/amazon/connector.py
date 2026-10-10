import random

from app.connectors.base.interface import SourceConnector
from app.connectors.base.schemas import ConnectorResult


class AmazonConnector(SourceConnector):
    """MOCK connector. Amazon's Product Advertising API requires an active
    Associates account with qualifying sales history, and scraping Amazon
    directly violates their Terms of Service, so this returns realistic
    sample data with the exact same shape a real integration would produce.
    Swap this class for a real implementation (or a licensed data provider
    like Rainforest API / Keepa) once API access is available -- nothing
    else in the pipeline needs to change.
    """

    source_name = "amazon"

    def search_by_identifier(self, identifier_type: str, identifier_value: str) -> ConnectorResult | None:
        return ConnectorResult(
            source=self.source_name,
            external_id=f"MOCK-ASIN-{identifier_value[-6:]}",
            title=f"[MOCK] Product matching {identifier_type.upper()} {identifier_value}",
            brand="Unknown",
            price=round(random.uniform(15, 200), 2),
            currency="USD",
            url="https://www.amazon.com/dp/MOCKASIN",
            image_url=None,
            in_stock=True,
            raw={"mock": True, "identifier_type": identifier_type, "identifier_value": identifier_value},
        )

    def search_by_title(self, title: str, brand: str | None = None) -> list[ConnectorResult]:
        return [
            ConnectorResult(
                source=self.source_name,
                external_id="MOCK-ASIN-0001",
                title=f"[MOCK] {title}",
                brand=brand or "Unknown",
                price=round(random.uniform(15, 200), 2),
                currency="USD",
                url="https://www.amazon.com/dp/MOCKASIN",
                image_url=None,
                in_stock=True,
                raw={"mock": True, "query": title},
            )
        ]