"""Database connection and query utilities with resilient reconnection."""
import asyncio
import os
import logging
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional

import asyncpg

logger = logging.getLogger(__name__)

# asyncpg exceptions that indicate a transient connection problem
_TRANSIENT_EXCEPTIONS = (
    asyncpg.ConnectionDoesNotExistError,
    asyncpg.InterfaceError,
    ConnectionRefusedError,
    ConnectionResetError,
    OSError,
    TimeoutError,
)

_MAX_CONNECT_RETRIES = 10
_MAX_BACKOFF_SECONDS = 30


class Database:
    """Async database connection pool manager with automatic reconnection."""

    def __init__(self, database_url: Optional[str] = None):
        self.database_url = database_url or os.environ.get("DATABASE_URL", "")
        self._pool: Optional[asyncpg.Pool] = None

    async def connect(self, max_retries: int = _MAX_CONNECT_RETRIES) -> None:
        """Create connection pool with persistent retry and exponential backoff.

        Retries up to *max_retries* times (default 10, ~5 min total with
        exponential backoff capped at 30 s). This covers Azure PostgreSQL
        Flex cold-start / auto-pause wake-up time.
        """
        pg_host = os.environ.get("PGHOST", "")
        pg_user = os.environ.get("PGUSER", "")
        pg_password = os.environ.get("PGPASSWORD", "")
        pg_database = os.environ.get("PGDATABASE", "")
        pg_port = int(os.environ.get("PGPORT", "5432"))

        if not (pg_host and pg_user and pg_database) and not self.database_url:
            logger.warning("No database configuration found, skipping connection")
            return

        for attempt in range(max_retries):
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
                        self.database_url, min_size=1, max_size=10,
                    )
                logger.info("Database pool created successfully")
                return
            except _TRANSIENT_EXCEPTIONS as e:
                delay = min(2 ** attempt, _MAX_BACKOFF_SECONDS)
                logger.error(
                    "DB connect attempt %d/%d failed (%s: %s), "
                    "retrying in %ds",
                    attempt + 1, max_retries,
                    type(e).__name__, e, delay,
                )
                if attempt < max_retries - 1:
                    await asyncio.sleep(delay)
            except Exception as e:
                logger.error(
                    "DB connect failed with non-transient error (%s: %s), "
                    "not retrying",
                    type(e).__name__, e,
                )
                raise
        logger.error(
            "All %d DB connection attempts failed; pool is None", max_retries
        )

    async def reconnect(self) -> None:
        """Tear down stale pool and create a fresh one."""
        logger.info("Attempting database reconnection...")
        if self._pool:
            try:
                await self._pool.close()
            except Exception:
                pass
            self._pool = None
        await self.connect()

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

    async def health_check(self) -> dict:
        """Run a real DB round-trip and return status + latency."""
        if not self._pool:
            return {"connected": False, "latency_ms": None}
        start = time.monotonic()
        try:
            async with self.acquire() as conn:
                await conn.fetchval("SELECT 1")
            latency = round((time.monotonic() - start) * 1000, 1)
            return {"connected": True, "latency_ms": latency}
        except Exception as e:
            latency = round((time.monotonic() - start) * 1000, 1)
            logger.warning("Health check query failed: %s", e)
            return {"connected": False, "latency_ms": latency}

    async def _query_with_reconnect(
        self, method: str, query: str, *args: Any
    ) -> Any:
        """Execute a query, retrying once after reconnection on transient errors."""
        # Ensure we have a pool
        if not self._pool:
            await self.ensure_connected()
        if not self._pool:
            logger.warning("Database pool not available")
            return None

        for attempt in range(2):  # original + 1 retry after reconnect
            try:
                async with self.acquire() as conn:
                    if method == "fetch":
                        return await conn.fetch(query, *args)
                    elif method == "fetchrow":
                        return await conn.fetchrow(query, *args)
                    else:
                        return await conn.execute(query, *args)
            except _TRANSIENT_EXCEPTIONS as e:
                if attempt == 0:
                    logger.warning(
                        "Transient DB error (%s), reconnecting and retrying: %s",
                        type(e).__name__, e,
                    )
                    await self.reconnect()
                    continue
                logger.error("Query failed after reconnection: %s", e)
                return None
            except Exception as e:
                logger.error("Database query failed: %s", e)
                return None
        return None

    async def fetch_all(self, query: str, *args: Any) -> list[dict]:
        """Execute query and return all rows as dicts."""
        rows = await self._query_with_reconnect("fetch", query, *args)
        if rows is None:
            return []
        logger.debug("Query returned %d rows", len(rows))
        return [dict(row) for row in rows]

    async def fetch_one(self, query: str, *args: Any) -> Optional[dict]:
        """Execute query and return one row as dict."""
        row = await self._query_with_reconnect("fetchrow", query, *args)
        return dict(row) if row else None

    @property
    def is_connected(self) -> bool:
        """Check if database pool is available."""
        return self._pool is not None


# Global database instance
db = Database()
