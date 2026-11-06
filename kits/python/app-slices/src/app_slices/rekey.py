"""Rekey a Postgres schema's surrogate keys to UUID v7, in the caller's transaction.

`rekey_to_uuid7(connection)` gives every table whose single-column primary key
the database generates (an identity, a serial, a uuid default) a v7 key,
rewrites every foreign key that reaches it, and proves the result before
returning: per table, the row count and a checksum over the columns it did not
convert, the order of the rows by key and the row each reference points at. Any
difference raises `RekeyMismatch` and the caller's transaction rolls back with
nothing changed. A key that is itself a foreign key converts as a reference; a
uuid key whose rows are all v7 already is left as it is.

New keys keep the old order: rows are numbered in their old key order (a v4
table by `created_at`, then key), and each takes a v7 whose time is its own
`created_at` where it has one, held monotonic and never later than now.

What the catalogue cannot know is the caller's to say. An integer or uuid key the
database does not generate is refused until it is named: `keep` one another
system assigns (a MusicBrainz id, another app's document id), `include` one the
app mints in Python. `include` also takes a text key (hex v4). `soft_refs` names
a column holding another table's key with no foreign key; `mapped` a table whose
old ids something outside still holds, whose old-to-new map then stays in schema
`uuid7_rekey`. A view over a converted column and a reference to no row are
refused too, as is a partitioned table holding a converted key, all before
anything changes; a type change Postgres itself refuses (a CHECK or a partial
index comparing a key with an integer) rolls back naming the table.
`docs/development/uuid7-rekey.md` in app-factory is the recipe around it.
"""

import datetime
import logging
import os
import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from sqlalchemy import column, insert, table, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import DBAPIError

logger = logging.getLogger(__name__)

MAP_SCHEMA = "uuid7_rekey"
_INTEGERS = {"smallint", "integer", "bigint"}
_TEXTS = {"text", "character varying", "character"}
_BATCH = 5000
#: Rows per checksum chunk, so the proof of a table of any size stays under Postgres's 1 GB value.
_CHUNK = 100_000


class RekeyError(Exception):
    """A refusal before anything changed: the schema needs the caller's decision."""


class RekeyMismatch(RekeyError):
    """A table's rows, checksum, order or references differ after the rekey."""


@dataclass
class Report:
    """What `rekey_to_uuid7` did: each touched table's proof, held equal before and after."""

    rekeyed: dict[str, int] = field(default_factory=dict)
    converted: list[str] = field(default_factory=list)
    proof: dict[str, tuple[int, str]] = field(default_factory=dict)
    mapped: list[str] = field(default_factory=list)
    dropped_defaults: list[str] = field(default_factory=list)


@dataclass
class _Key:
    table: str
    column: str
    type: str
    #: The old row order: quoted columns, each with its direction.
    order: tuple[str, ...]
    #: Whether `created_at` is a timestamp the new keys take their time from.
    stamped: bool


def rekey_to_uuid7(
    connection: Connection,
    *,
    schema: str = "public",
    keep: Iterable[str] = (),
    include: Iterable[str] = (),
    soft_refs: Mapping[str, str] | None = None,
    mapped: Iterable[str] = (),
) -> Report:
    """Rekey `schema` on `connection`, inside the transaction the caller holds."""
    keep, include, mapped = set(keep), set(include), set(mapped)
    soft = dict(soft_refs or {})
    q = connection.dialect.identifier_preparer.quote
    tables = _tables(connection, schema)
    for name in (keep | include | mapped | set(soft.values())) - set(tables):
        raise RekeyError(f"{schema}.{name} is named but is not a table")
    pairs = _pairs(connection, schema)
    keys = _keys(connection, schema, tables, {(c, cc) for c, cc, _, _ in pairs}, keep, include)
    for name in mapped - set(keys):
        raise RekeyError(f"{name} is mapped but its key is not rekeyed")
    roots = _roots(tables, keys, pairs, soft, schema)
    _refuse_views(connection, schema, roots)
    _refuse_dangling(connection, schema, keys, roots)

    report = Report(converted=sorted(f"{t}.{c}" for t, c in roots))
    touched = sorted({t for t, _ in roots})
    before = {t: _proof(connection, schema, t, tables[t], keys, roots) for t in touched}

    now_ms = _now_ms(connection) - 1
    for i, key in enumerate(keys.values()):
        report.rekeyed[key.table] = _build_map(connection, schema, i, key, now_ms)

    foreign_keys = _foreign_keys(connection, schema, roots)
    for owner, name, _ in foreign_keys:
        connection.execute(text(f"ALTER TABLE {q(schema)}.{q(owner)} DROP CONSTRAINT {q(name)}"))
    sequences = []
    for owner, col in sorted(roots):
        attr = tables[owner][col]
        if attr["identity"]:
            connection.execute(text(f"ALTER TABLE {q(schema)}.{q(owner)} ALTER COLUMN {q(col)} DROP IDENTITY"))
        elif attr["default"] is not None:
            seq = connection.execute(
                text("SELECT pg_get_serial_sequence(:t, :c)"), {"t": f"{q(schema)}.{q(owner)}", "c": col}
            ).scalar()
            if seq:
                sequences.append(seq)
            elif (owner, col) not in {(k.table, k.column) for k in keys.values()}:
                report.dropped_defaults.append(f"{owner}.{col} DEFAULT {attr['default']}")
            connection.execute(text(f"ALTER TABLE {q(schema)}.{q(owner)} ALTER COLUMN {q(col)} DROP DEFAULT"))
    index = {name: i for i, name in enumerate(keys)}
    for owner in touched:
        clauses = [
            f"ALTER COLUMN {q(col)} TYPE uuid USING pg_temp.uuid7_new_{index[root]}({q(col)}::{keys[root].type})"
            for (t, col), root in sorted(roots.items())
            if t == owner
        ]
        try:
            connection.execute(text(f"ALTER TABLE {q(schema)}.{q(owner)} " + ", ".join(clauses)))
        except DBAPIError as exc:
            raise RekeyError(f"Postgres refused converting {schema}.{owner}: {exc.orig}") from exc
    for seq in sequences:
        connection.execute(text(f"DROP SEQUENCE {seq}"))
    for owner, name, definition in foreign_keys:
        connection.execute(text(f"ALTER TABLE {q(schema)}.{q(owner)} ADD CONSTRAINT {q(name)} {definition}"))

    after_keys = {name: _Key(k.table, k.column, "uuid", (q(k.column),), k.stamped) for name, k in keys.items()}
    for t in touched:
        after = _proof(connection, schema, t, tables[t], after_keys, roots)
        if after != before[t]:
            raise RekeyMismatch(f"{schema}.{t}: rows and checksum {before[t]} before, {after} after")
        report.proof[t] = after
        logger.info("Rekeyed to UUID v7", extra={"table": t, "rows": after[0], "checksum": after[1]})

    for name, i in index.items():
        if name in mapped:
            connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {q(MAP_SCHEMA)}"))
            connection.execute(
                text(
                    f"CREATE TABLE {q(MAP_SCHEMA)}.{q(name)} "
                    f"(old_id {keys[name].type} PRIMARY KEY, new_id uuid NOT NULL UNIQUE)"
                )
            )
            connection.execute(text(f"INSERT INTO {q(MAP_SCHEMA)}.{q(name)} SELECT * FROM pg_temp.uuid7_map_{i}"))
            report.mapped.append(name)
        connection.execute(text(f"DROP FUNCTION pg_temp.uuid7_new_{i}"))
        connection.execute(text(f"DROP TABLE pg_temp.uuid7_map_{i}"))
    return report


def uuid7_at(ms: int, counter: int, tail: int) -> uuid.UUID:
    """RFC 9562 v7 in CPython's layout: 48-bit time, a 42-bit counter, 32 random bits."""
    value = (ms & 0xFFFF_FFFF_FFFF) << 80
    value |= ((counter >> 30) & 0xFFF) << 64
    value |= (counter & 0x3FFF_FFFF) << 32
    value |= tail & 0xFFFF_FFFF
    return uuid.UUID(int=value | (7 << 76) | (0x8000 << 48))


def _tables(connection: Connection, schema: str) -> dict[str, dict[str, dict[str, object]]]:
    """Every ordinary table in `schema` but Alembic's, with each column's type, identity and default."""
    rows = connection.execute(
        text(
            """
            SELECT c.relname, a.attname, a.attnum, format_type(a.atttypid, a.atttypmod) AS type,
                   a.attidentity <> '' AS identity, pg_get_expr(d.adbin, d.adrelid) AS dflt
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
            WHERE n.nspname = :schema AND c.relkind = 'r' AND NOT c.relispartition
              AND c.relname <> 'alembic_version'
            ORDER BY c.relname, a.attnum
            """
        ),
        {"schema": schema},
    )
    tables: dict[str, dict[str, dict[str, object]]] = {}
    for row in rows:
        tables.setdefault(row.relname, {})[row.attname] = {
            "num": row.attnum,
            "type": row.type,
            "identity": row.identity,
            "default": row.dflt,
        }
    return tables


def _keys(
    connection: Connection,
    schema: str,
    tables: dict[str, dict[str, dict[str, object]]],
    references: set[tuple[str, str]],
    keep: set[str],
    include: set[str],
) -> dict[str, _Key]:
    """The tables whose key is rekeyed, each with its column, type and old row order.

    A key that is itself a foreign key holds its parent's values, so it converts as a reference."""
    q = connection.dialect.identifier_preparer.quote
    primaries = connection.execute(
        text(
            """
            SELECT c.relname, array_agg(a.attname) AS columns
            FROM pg_constraint k
            JOIN pg_class c ON c.oid = k.conrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(k.conkey)
            WHERE n.nspname = :schema AND k.contype = 'p'
            GROUP BY c.relname
            """
        ),
        {"schema": schema},
    )
    keys: dict[str, _Key] = {}
    undecided: list[str] = []
    for name, columns in primaries:
        if name not in tables or name in keep:
            continue
        if len(columns) != 1:
            if name in include:
                raise RekeyError(f"{name} is included but its key has {len(columns)} columns")
            continue
        col = columns[0]
        if (name, col) in references:
            continue
        attr = tables[name][col]
        kind = str(attr["type"]).split("(")[0]
        default = str(attr["default"] or "")
        stamped = str(tables[name].get("created_at", {}).get("type", "")).startswith("timestamp")
        by_time = (f"{q('created_at')} NULLS FIRST", q(col)) if stamped else (q(col),)
        if kind in _INTEGERS:
            generated = bool(attr["identity"]) or default.startswith("nextval(")
            order: tuple[str, ...] = (q(col),)
        elif kind == "uuid":
            all_v7 = connection.execute(
                text(f"SELECT bool_and(substr({q(col)}::text, 15, 1) = '7') FROM {q(schema)}.{q(name)}")
            ).scalar()
            if all_v7 or (all_v7 is None and not default):
                continue
            generated, order = bool(default), by_time
        elif kind in _TEXTS and name in include:
            generated, kind, order = True, "text", by_time
        elif name in include:
            raise RekeyError(f"{name}.{col} is included but is {attr['type']}, not an integer, uuid or text")
        else:
            continue
        if not generated and name not in include:
            undecided.append(f"{name}.{col} ({kind})")
            continue
        keys[name] = _Key(name, col, kind, order, stamped)
    if undecided:
        raise RekeyError(
            f"keys the database does not generate: {', '.join(sorted(undecided))}. "
            "Keep each another system assigns; include each this app mints"
        )
    return dict(sorted(keys.items()))


def _pairs(connection: Connection, schema: str) -> list[tuple[str, str, str, str]]:
    """Each foreign key's column pairs: child table and column, parent table and column."""
    rows = connection.execute(
        text(
            """
            SELECT ch.relname AS child, ca.attname AS child_column, pa.relname AS parent, pc.attname AS parent_column
            FROM pg_constraint k
            JOIN pg_namespace n ON n.oid = k.connamespace
            JOIN pg_class ch ON ch.oid = k.conrelid
            JOIN pg_class pa ON pa.oid = k.confrelid
            CROSS JOIN LATERAL unnest(k.conkey, k.confkey) AS u(child_num, parent_num)
            JOIN pg_attribute ca ON ca.attrelid = k.conrelid AND ca.attnum = u.child_num
            JOIN pg_attribute pc ON pc.attrelid = k.confrelid AND pc.attnum = u.parent_num
            WHERE n.nspname = :schema AND k.contype = 'f'
            """
        ),
        {"schema": schema},
    )
    return [(r.child, r.child_column, r.parent, r.parent_column) for r in rows]


def _roots(
    tables: dict[str, dict[str, dict[str, object]]],
    keys: dict[str, _Key],
    pairs: list[tuple[str, str, str, str]],
    soft: dict[str, str],
    schema: str,
) -> dict[tuple[str, str], str]:
    """Every column to convert, mapped to the table whose key its values are."""
    roots = {(k.table, k.column): k.table for k in keys.values()}
    for ref, target in soft.items():
        owner, _, col = ref.partition(".")
        if col not in tables.get(owner, {}):
            raise RekeyError(f"soft ref {ref} is not a column of {schema}")
        if target not in keys:
            raise RekeyError(f"soft ref {ref} names {target}, whose key is not rekeyed")
        roots[(owner, col)] = target
    changed = True
    while changed:
        changed = False
        for child, child_column, parent, parent_column in pairs:
            root = roots.get((parent, parent_column))
            if root is None:
                continue
            seen = roots.get((child, child_column))
            if seen is None:
                roots[(child, child_column)] = root
                changed = True
            elif seen != root:
                raise RekeyError(f"{child}.{child_column} holds keys of both {seen} and {root}")
    others = sorted({t for t, _ in roots} - set(tables))
    if others:
        raise RekeyError(f"partitioned or not ordinary tables hold a converted key; convert them by hand: {others}")
    return roots


def _foreign_keys(connection: Connection, schema: str, roots: dict[tuple[str, str], str]) -> list[tuple[str, str, str]]:
    """Each foreign key with a converted column on either side: its table, name and definition."""
    rows = connection.execute(
        text(
            """
            SELECT k.conname, ch.relname AS child, pg_get_constraintdef(k.oid) AS definition,
                   array(SELECT attname FROM pg_attribute WHERE attrelid = k.conrelid AND attnum = ANY(k.conkey))
                       AS child_columns,
                   pa.relname AS parent,
                   array(SELECT attname FROM pg_attribute WHERE attrelid = k.confrelid AND attnum = ANY(k.confkey))
                       AS parent_columns
            FROM pg_constraint k
            JOIN pg_namespace n ON n.oid = k.connamespace
            JOIN pg_class ch ON ch.oid = k.conrelid
            JOIN pg_class pa ON pa.oid = k.confrelid
            WHERE n.nspname = :schema AND k.contype = 'f'
            ORDER BY ch.relname, k.conname
            """
        ),
        {"schema": schema},
    )
    return [
        (row.child, row.conname, row.definition)
        for row in rows
        if any((row.child, c) in roots for c in row.child_columns)
        or any((row.parent, c) in roots for c in row.parent_columns)
    ]


def _refuse_views(connection: Connection, schema: str, roots: dict[tuple[str, str], str]) -> None:
    views = connection.execute(
        text(
            """
            SELECT DISTINCT v.relname, c.relname AS owner, a.attname
            FROM pg_depend d
            JOIN pg_rewrite r ON r.oid = d.objid
            JOIN pg_class v ON v.oid = r.ev_class
            JOIN pg_class c ON c.oid = d.refobjid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.refobjsubid
            WHERE n.nspname = :schema AND v.oid <> c.oid
            """
        ),
        {"schema": schema},
    ).all()
    found = sorted({v for v, owner, col in views if (owner, col) in roots})
    if found:
        raise RekeyError(f"views read a converted column; drop and recreate them around the rekey: {found}")


def _refuse_dangling(
    connection: Connection, schema: str, keys: dict[str, _Key], roots: dict[tuple[str, str], str]
) -> None:
    quote = connection.dialect.identifier_preparer.quote
    for (owner, col), root in sorted(roots.items()):
        if owner == root and col == keys[root].column:
            continue
        key = keys[root]
        missing = connection.execute(
            text(
                f"SELECT count(*) FROM {quote(schema)}.{quote(owner)} t WHERE t.{quote(col)} IS NOT NULL AND NOT EXISTS "
                f"(SELECT 1 FROM {quote(schema)}.{quote(root)} p "
                f"WHERE p.{quote(key.column)} = t.{quote(col)}::{key.type})"
            )
        ).scalar()
        if missing:
            raise RekeyError(f"{missing} rows of {owner}.{col} name no row of {root}")


def _proof(
    connection: Connection,
    schema: str,
    name: str,
    columns: dict[str, dict[str, object]],
    keys: dict[str, _Key],
    roots: dict[tuple[str, str], str],
) -> tuple[int, str]:
    """Rows and one checksum: the unconverted columns, the row's place by key, and where each reference points."""
    quote = connection.dialect.identifier_preparer.quote
    kept = [quote(c) for c in columns if (name, c) not in roots]
    joins, marks = [], []
    for i, ((owner, col), root) in enumerate(sorted(roots.items())):
        if owner != name or (owner == root and col == keys[root].column):
            continue
        key = keys[root]
        joins.append(
            f"LEFT JOIN (SELECT {quote(key.column)} AS k, row_number() OVER (ORDER BY {_order(key)}) AS n "
            f"FROM {quote(schema)}.{quote(root)}) r{i} ON r{i}.k = t.{quote(col)}::{key.type}"
        )
        marks.append(f"CASE WHEN t.{quote(col)} IS NULL THEN 'null' ELSE coalesce(r{i}.n::text, 'dangling') END")
    own = keys.get(name)
    place = f"row_number() OVER (ORDER BY {_order(own, 't')})" if own else "0"
    line = " || '|' || ".join([f"md5(ROW({', '.join(f't.{c}' for c in kept)})::text)", *marks])
    lines = f"SELECT {line} AS line, {place} AS place FROM {quote(schema)}.{quote(name)} t {' '.join(joins)}"
    numbered = f"SELECT line, row_number() OVER (ORDER BY place, line) AS r FROM ({lines}) s"
    chunks = (
        f"SELECT (r - 1) / {_CHUNK} AS g, count(*) AS n, md5(string_agg(line, E'\\n' ORDER BY r)) AS h "
        f"FROM ({numbered}) s GROUP BY 1"
    )
    row = connection.execute(
        text(f"SELECT coalesce(sum(n), 0), md5(coalesce(string_agg(h, '' ORDER BY g), '')) FROM ({chunks}) s")
    ).one()
    return int(row[0]), str(row[1])


def _order(key: _Key, alias: str = "") -> str:
    """`key`'s row order as an ORDER BY list, its columns qualified by `alias`."""
    return ", ".join(f"{alias}.{part}" if alias else part for part in key.order)


def _now_ms(connection: Connection) -> int:
    now: datetime.datetime = connection.execute(text("SELECT clock_timestamp()")).scalar_one()
    return int(now.timestamp() * 1000)


def _build_map(
    connection: Connection,
    schema: str,
    i: int,
    key: _Key,
    now_ms: int,
) -> int:
    """Fill `pg_temp.uuid7_map_<i>` with a v7 per row, in old order, and the lookup function over it."""
    quote = connection.dialect.identifier_preparer.quote
    connection.execute(
        text(f"CREATE TEMP TABLE uuid7_map_{i} (old_id {key.type} PRIMARY KEY, new_id uuid NOT NULL UNIQUE)")
    )
    source = f"{quote(schema)}.{quote(key.table)}"
    earliest = connection.execute(text(f"SELECT min(created_at) FROM {source}")).scalar() if key.stamped else None
    last = min(_ms(earliest), now_ms) if earliest is not None else now_ms
    counter, count = -1, 0
    target = table("uuid7_map_" + str(i), column("old_id"), column("new_id"), schema="pg_temp")
    rows = connection.execute(
        text(
            f"SELECT {quote(key.column)}, {quote('created_at') if key.stamped else 'NULL'} "
            f"FROM {source} ORDER BY {_order(key)}"
        ),
        execution_options={"yield_per": _BATCH},
    )
    for partition in rows.partitions():
        batch: list[dict[str, object]] = []
        for old, created in partition:
            ms = min(max(last, _ms(created)) if created is not None else last, now_ms)
            counter = counter + 1 if ms == last and counter >= 0 else int.from_bytes(os.urandom(6)) >> 7
            last = ms
            batch.append({"old_id": old, "new_id": uuid7_at(ms, counter, int.from_bytes(os.urandom(4)))})
        connection.execute(insert(target), batch)
        count += len(batch)
    connection.execute(text(f"ANALYZE pg_temp.uuid7_map_{i}"))
    connection.execute(
        text(
            f"CREATE FUNCTION pg_temp.uuid7_new_{i}(old {key.type}) RETURNS uuid LANGUAGE sql STABLE STRICT "
            f"AS 'SELECT new_id FROM pg_temp.uuid7_map_{i} WHERE old_id = $1'"
        )
    )
    return count


def _ms(value: datetime.datetime) -> int:
    """Milliseconds since the epoch, none before it; a timestamp without a zone is read as UTC."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.UTC)
    return max(int(value.timestamp() * 1000), 0)
