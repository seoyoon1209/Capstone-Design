import asyncpg
from settings.Settings import get_settings
from fastapi import Depends
from typing import Annotated, AsyncGenerator

#  전역 변수 초기화
dbpool = None

async def init():
    global dbpool
    if dbpool is not None:
        return

    settings = get_settings()

    dsn = f"postgresql://{settings.db_user}:{settings.db_password}@{settings.db_host}:{settings.db_port}/{settings.db_service_name}"

    dbpool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=1,
        max_size=10,
        ssl="require",
        max_inactive_connection_lifetime=30.0  # 30초 이상 비활성화된 연결은 자동 교체
    )

async def dispose():
    global dbpool
    if dbpool:
        await dbpool.close()
        dbpool = None

async def get_db_connection() -> AsyncGenerator:
    global dbpool
    if dbpool is None:
        raise Exception("Database pool is not initialized. Call init() first.")

    async with dbpool.acquire() as conn:
        yield conn

DbConnectionDep = Annotated[asyncpg.Connection, Depends(get_db_connection)]
DbPoolDep = DbConnectionDep