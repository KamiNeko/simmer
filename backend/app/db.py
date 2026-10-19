from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    """An SQLite engine with foreign keys and WAL mode turned on."""
    engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    return engine


_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def init_engine(url: str | None = None) -> Engine:
    """Create the shared engine and session factory, by default for the data directory."""
    global _engine, _session_factory
    settings = get_settings()
    if url is None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        url = settings.database_url
    _engine = make_engine(url)
    _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_engine() -> Engine:
    """The shared engine, created on first use."""
    if _engine is None:
        init_engine()
    assert _engine is not None
    return _engine


def get_db() -> Iterator[Session]:
    """A database session for one request, closed afterwards."""
    if _session_factory is None:
        init_engine()
    assert _session_factory is not None
    db = _session_factory()
    try:
        yield db
    finally:
        db.close()
