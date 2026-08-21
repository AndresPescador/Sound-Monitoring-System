from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

engine = create_async_engine(
    settings.database_url(),
    echo=False,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout_seconds,
    pool_pre_ping=True,
    connect_args={
        "command_timeout": settings.db_statement_timeout_ms / 1000,
        "server_settings": {
            "statement_timeout": str(settings.db_statement_timeout_ms),
            "lock_timeout": "1000",
            "idle_in_transaction_session_timeout": "5000",
        },
    },
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    """Dependencia FastAPI que provee una sesión de base de datos por request."""
    async with AsyncSessionLocal() as session:
        yield session
