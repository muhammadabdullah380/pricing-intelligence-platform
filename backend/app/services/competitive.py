import statistics

from app.services.clickhouse_schema import get_clickhouse_client

# How far (as a fraction) our price can be from the market median before
# we call it "above" or "below" market, instead of "at market".
AT_MARKET_TOLERANCE = 0.05


def get_latest_competitor_prices(product_id: int) -> list[dict]:
    """The most recent price observation per source -- 'latest snapshot'
    rather than full history, which is what a competitive comparison
    actually needs.
    """
    client = get_clickhouse_client()
    rows = client.execute(
        "SELECT source, argMax(price, observed_at) as price, "
        "argMax(in_stock, observed_at) as in_stock, max(observed_at) as last_seen "
        "FROM price_observations WHERE product_id = %(pid)s GROUP BY source",
        {"pid": product_id},
    )
    return [
        {"source": source, "price": price, "in_stock": bool(in_stock), "observed_at": str(last_seen)}
        for source, price, in_stock, last_seen in rows
    ]


def get_competitive_position(product_id: int, our_price: float | None) -> dict:
    """Compares our price against the competitive market for one product:
    market median/min/max, and where we sit relative to it.
    """
    competitors = get_latest_competitor_prices(product_id)
    prices = [c["price"] for c in competitors if c["price"] is not None]

    if not prices:
        return {
            "our_price": our_price,
            "competitors": competitors,
            "market_median": None,
            "market_min": None,
            "market_max": None,
            "position": "no_market_data",
        }

    market_median = round(statistics.median(prices), 2)
    market_min = round(min(prices), 2)
    market_max = round(max(prices), 2)

    if our_price is None:
        position = "no_own_price"
    elif our_price < market_min:
        position = "cheapest"
    elif our_price > market_max:
        position = "most_expensive"
    elif our_price < market_median * (1 - AT_MARKET_TOLERANCE):
        position = "below_market"
    elif our_price > market_median * (1 + AT_MARKET_TOLERANCE):
        position = "above_market"
    else:
        position = "at_market"

    return {
        "our_price": our_price,
        "competitors": competitors,
        "market_median": market_median,
        "market_min": market_min,
        "market_max": market_max,
        "position": position,
    }