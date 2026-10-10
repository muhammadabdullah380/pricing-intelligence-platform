from app.connectors.amazon.connector import AmazonConnector
from app.connectors.base.interface import SourceConnector
from app.connectors.bestbuy.connector import BestBuyConnector
from app.connectors.walmart.connector import WalmartConnector

CONNECTORS: dict[str, SourceConnector] = {
    "amazon": AmazonConnector(),
    "walmart": WalmartConnector(),
    "bestbuy": BestBuyConnector(),
}


def get_connector(source: str) -> SourceConnector | None:
    return CONNECTORS.get(source.lower())