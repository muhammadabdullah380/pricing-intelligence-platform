import random

from app.connectors.base.interface import SourceConnector
from app.connectors.base.schemas import ConnectorResult


class WalmartConnector(SourceConnector):
    """MOCK connector. Walmart's Affiliate/Marketplace API requires partner
    approval that takes time to obtain, so this returns realistic sample
    data with the exact same shape a real integration would produce. Swap
    this class for a real implementation once API access is granted --
    nothing else in the pipeline needs to change.
    """

    source_name = "walmart"

    def search_by_identifier(self, identifier_type: str, identifier_value: str) -> ConnectorResult | None:
        return ConnectorResult(
            source=self.source_name,
            external_id=f"MOCK-WMT-{identifier_value[-6:]}",
            title=f"[MOCK] Product matching {identifier_type.upper()} {identifier_value}",
            brand="Unknown",
            price=round(random.uniform(15, 200), 2),
            currency="USD",
            url="https://www.walmart.com/ip/MOCKITEM",
            image_url=None,
            in_stock=True,
            raw={"mock": True, "identifier_type": identifier_type, "identifier_value": identifier_value},
        )

    def search_by_title(self, title: str, brand: str | None = None) -> list[ConnectorResult]:
        return [
            ConnectorResult(
                source=self.source_name,
                external_id="MOCK-WMT-0001",
                title=f"[MOCK] {title}",
                brand=brand or "Unknown",
                price=round(random.uniform(15, 200), 2),
                currency="USD",
                url="https://www.walmart.com/ip/MOCKITEM",
                image_url=None,
                in_stock=True,
                raw={"mock": True, "query": title},
            )
        ]