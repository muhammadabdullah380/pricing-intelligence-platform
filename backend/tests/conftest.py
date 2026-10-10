from collections.abc import Generator
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.deps import get_current_user
from app.main import app
from app.models.organization import Organization
from app.models.product import Product
from app.models.store import Store
from app.models.user import User, UserRole


@pytest.fixture
def session_factory() -> Generator[sessionmaker[Session], None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(connection, _record) -> None:
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    try:
        yield factory
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def tenant(session_factory: sessionmaker[Session]) -> dict[str, object]:
    with session_factory() as db:
        organization = Organization(name="Test Org", slug="test-org")
        other_organization = Organization(name="Other Org", slug="other-org")
        db.add_all([organization, other_organization])
        db.flush()

        user = User(
            name="Test Owner",
            email="owner@example.test",
            password_hash="not-used-in-this-test",
            role=UserRole.OWNER,
            organization_id=organization.id,
        )
        own_store = Store(organization_id=organization.id, name="Own Store", currency="USD")
        other_store = Store(organization_id=other_organization.id, name="Other Store", currency="USD")
        db.add_all([user, own_store, other_store])
        db.flush()

        own_product = Product(store_id=own_store.id, title="Own product", list_price=100)
        other_product = Product(store_id=other_store.id, title="Other tenant product", list_price=80)
        db.add_all([own_product, other_product])
        db.commit()

        return {
            "current_user": SimpleNamespace(id=user.id, organization_id=organization.id),
            "store_id": own_store.id,
            "other_store_id": other_store.id,
            "product_id": own_product.id,
            "other_product_id": other_product.id,
            "owner_email": user.email,
        }


@pytest.fixture
def client(
    session_factory: sessionmaker[Session], tenant: dict[str, object]
) -> Generator[TestClient, None, None]:
    def override_db() -> Generator[Session, None, None]:
        with session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: tenant["current_user"]
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        test_client.close()
        app.dependency_overrides.clear()