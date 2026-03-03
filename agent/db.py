"""Database connection and query utilities."""
import os
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional

import asyncpg

logger = logging.getLogger(__name__)


class Database:
    """Async database connection pool manager."""
    
    def __init__(self, database_url: Optional[str] = None):
        self.database_url = database_url or os.environ.get("DATABASE_URL", "")
        self._pool: Optional[asyncpg.Pool] = None
    
    async def connect(self) -> None:
        """Create connection pool using PG* env vars or database_url.
        
        Retries up to 3 times with exponential backoff if PG is temporarily unavailable.
        """
        import asyncio
        
        pg_host = os.environ.get("PGHOST", "")
        pg_user = os.environ.get("PGUSER", "")
        pg_password = os.environ.get("PGPASSWORD", "")
        pg_database = os.environ.get("PGDATABASE", "")
        pg_port = int(os.environ.get("PGPORT", "5432"))
        
        if not (pg_host and pg_user and pg_database) and not self.database_url:
            logger.warning("No database configuration found, skipping connection")
            return
        
        for attempt in range(3):
            try:
                if pg_host and pg_user and pg_database:
                    self._pool = await asyncpg.create_pool(
                        host=pg_host, port=pg_port, user=pg_user,
                        password=pg_password, database=pg_database,
                        ssl="require", min_size=1, max_size=5,
                        command_timeout=30, timeout=15,
                    )
                else:
                    self._pool = await asyncpg.create_pool(
                        self.database_url, min_size=1, max_size=10
                    )
                logger.info("Database pool created successfully")
                return
            except Exception as e:
                logger.error(
                    f"DB connect attempt {attempt + 1}/3 failed: "
                    f"{type(e).__name__}: {e}"
                )
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
        logger.error("All DB connection attempts failed; pool is None")
    
    async def disconnect(self) -> None:
        """Close connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None
            logger.info("Database pool closed")
    
    @asynccontextmanager
    async def acquire(self) -> AsyncGenerator[asyncpg.Connection, None]:
        """Acquire a connection from the pool."""
        if not self._pool:
            raise RuntimeError("Database not connected")
        async with self._pool.acquire() as conn:
            yield conn
    
    async def ensure_connected(self) -> bool:
        """Try to connect if not already connected."""
        if self._pool is not None:
            return True
        try:
            await self.connect()
        except Exception:
            pass
        return self._pool is not None

    async def fetch_all(self, query: str, *args: Any) -> list[dict]:
        """Execute query and return all rows as dicts."""
        if not self._pool:
            await self.ensure_connected()
        if not self._pool:
            logger.warning("Database pool not available, returning empty list")
            return []
        try:
            async with self.acquire() as conn:
                rows = await conn.fetch(query, *args)
                logger.debug(f"Query returned {len(rows)} rows")
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Database query failed: {e}")
            return []
    
    async def fetch_one(self, query: str, *args: Any) -> Optional[dict]:
        """Execute query and return one row as dict."""
        if not self._pool:
            await self.ensure_connected()
        if not self._pool:
            logger.warning("Database pool not available, returning None")
            return None
        try:
            async with self.acquire() as conn:
                row = await conn.fetchrow(query, *args)
                return dict(row) if row else None
        except Exception as e:
            logger.error(f"Database query failed: {e}")
            return None
    
    @property
    def is_connected(self) -> bool:
        """Check if database pool is available."""
        return self._pool is not None


# Global database instance
db = Database()
