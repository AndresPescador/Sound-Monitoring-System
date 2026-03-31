from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

engine = create_async_engine(settings.db_url, echo=False)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    """Dependencia FastAPI que provee una sesión de base de datos por request."""
    async with AsyncSessionLocal() as session:
        yield session
