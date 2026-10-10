from pydantic import BaseModel


class ProductOut(BaseModel):
    id: int
    store_id: int
    external_id: str | None
    sku: str | None
    gtin: str | None
    ean: str | None
    upc: str | None
    brand: str | None
    manufacturer: str | None
    title: str
    description: str | None
    category: str | None
    model_number: str | None
    url: str | None
    image_url: str | None
    list_price: float | None
    currency: str | None
    status: str

    class Config:
        from_attributes = True


class ImportRowResult(BaseModel):
    row_number: int
    data: dict
    status: str
    messages: list[str]
    will_update: bool = False


class ImportSummary(BaseModel):
    import_id: str
    total_rows: int
    valid: int
    warnings: int
    errors: int


class ImportPreviewResponse(BaseModel):
    summary: ImportSummary
    rows: list[ImportRowResult]


class ImportCommitRequest(BaseModel):
    import_id: str