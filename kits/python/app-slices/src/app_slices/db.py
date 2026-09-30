"""The one MetaData a kit's tables and the app's own tables share.

A foreign key resolves only within one MetaData, and Alembic's autogenerate
compares one, so the kit owns it and the app's declarative `Base` adopts it
(`db/base.py`). Kit models map through `KitBase`, a second registry over the
same MetaData, so an app's `Base.registry` still lists only the app's own.
"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

metadata = MetaData()


class KitBase(DeclarativeBase):
    """The declarative base every kit model maps through."""

    metadata = metadata
