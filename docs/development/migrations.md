# Migrations a factory release carries

**A factory migration never names an app's revision.** The app's migrations are one chain; the factory's later migrations are a second branch that hangs off the last factory revision every app already holds. `copier update` then needs no repointing, whatever the app's own migrations are.

```
app:     …  d9e6 ── e1f7 ── 0048_own ── 0049_own      ← app head
                      ╲
factory:               ╲─ depends_on ── f001 ── f002   ← factory head
```

- The first factory migration after `e1f7a3b4c5d6` sets `down_revision = None`, `branch_labels = ("factory",)` and `depends_on = "e1f7a3b4c5d6"`, the last revision that was chained by hand. Each later one sets `down_revision` to its factory predecessor and nothing else. None names a revision an app wrote.
- A factory migration that touches an app table (`users`, `workspaces`) adds that table's factory revision to `depends_on`, never the app's.
- A database holds two rows in `alembic_version`, one per head. Everything that migrates runs `alembic upgrade heads` (entrypoint, `conftest.py`, the rooms e2e server); `upgrade head` refuses two heads.
- An app writes its own migration with `alembic revision --autogenerate --head <its head>`; bare `revision` refuses two heads. It never writes a merge. A rollback names its target (`downgrade -1` and `stamp head` refuse two heads).
- `tests/migrations/test_migration_branch.py` holds the rule: no factory revision after `e1f7a3b4c5d6` chains onto anything but the factory, and an app's own migration on top still upgrades to exactly two heads.

An app with its own code reading `get_current_head()` (a version page, a custom e2e server) reads `get_heads()` the first time a factory branch migration arrives.

The same goes for `MigrationContext.get_current_revision()` (an admin migration status page): it raises once `alembic_version` holds two rows, so read `get_current_heads()`.
