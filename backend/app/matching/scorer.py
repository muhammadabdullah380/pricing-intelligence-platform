import difflib
import re


def normalize_title(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def title_similarity(title_a: str, title_b: str) -> float:
    return difflib.SequenceMatcher(None, normalize_title(title_a), normalize_title(title_b)).ratio()


def score_match(product, external_title: str, external_brand: str | None,
                 external_upc: str | None = None, external_ean: str | None = None,
                 external_gtin: str | None = None) -> tuple[float, str]:
    """Returns (confidence_score 0.0-1.0, match_level).

    Level 1 -- exact identifier: if any identifier matches exactly, this is
    as confident as matching gets, regardless of how different the titles
    read (retailers often rename/reformat the same physical product).
    """
    for our_value, their_value in [
        (product.upc, external_upc),
        (product.ean, external_ean),
        (product.gtin, external_gtin),
    ]:
        if our_value and their_value and our_value.strip() == their_value.strip():
            return 1.0, "exact_identifier"

    # Level 2 -- brand + model number + fuzzy title similarity, weighted.
    brand_score = 1.0 if (
        product.brand and external_brand
        and product.brand.strip().lower() == external_brand.strip().lower()
    ) else 0.0

    model_score = 1.0 if (
        product.model_number and product.model_number.lower() in external_title.lower()
    ) else 0.0

    title_score = title_similarity(product.title, external_title)

    overall = (0.5 * title_score) + (0.3 * brand_score) + (0.2 * model_score)
    return round(overall, 3), "brand_model_title"


def classify_confidence(score: float) -> str:
    """Turns a raw score into an actionable status."""
    if score >= 0.85:
        return "auto_matched"
    if score >= 0.45:
        return "pending_review"
    return "rejected"