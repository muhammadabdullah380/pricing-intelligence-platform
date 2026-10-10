from pydantic import BaseModel


class StoreCreate(BaseModel):
    name: str
    domain: str | None = None
    platform: str | None = None
    currency: str | None = None
    country: str | None = None


class StoreOut(BaseModel):
    id: int
    organization_id: int
    name: str
    domain: str | None
    platform: str | None
    currency: str | None
    country: str | None
    status: str | None

    class Config:
        from_attributes = True