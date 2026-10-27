import pytest
from app.database.session import init_db


@pytest.fixture(autouse=True)
async def setup_test_database():
    await init_db()
