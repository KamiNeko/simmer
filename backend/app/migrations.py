from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Engine

ALEMBIC_DIR = Path(__file__).parent / "alembic"


def alembic_config(engine: Engine | None = None) -> Config:
    config = Config()
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    if engine is not None:
        config.attributes["engine"] = engine
    return config


def upgrade_database(engine: Engine) -> None:
    command.upgrade(alembic_config(engine), "head")
