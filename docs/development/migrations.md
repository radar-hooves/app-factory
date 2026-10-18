# Migrations a factory release carries

**A factory migration never names an app's revision.** The app's migrations are one chain; the factory's later migrations are a second branch that hangs off the last factory revision every app already holds. `copier update` then needs no repointing, whatever the app's own migrations are.

```
app:     …  d9e6 ── e1f7 ── 0048_own ── 0049_own      ← app head
                      ╲
factory:               ╲─ depends_on ── f001 ── f002   ← factory head
```

- The first factory migration after `e1f7a3b4c5d6` sets `down_revision = None`, `branch_labels = ("factory",)` and `depends_on = "e1f7a3b4c5d6"`, the last revision that was chained by hand. Each later one sets `down_revision` to its factory predecessor and nothing else. None names a revision an app wrote.
- A factory migration that touches an app table (`users`, `workspaces`) adds that table's factory revision to `depends_on`, never the app's.
- A database holds a row per head that no other head depends on: two once the app has a migration of its own after `e1f7a3b4c5d6`, one in a bare stamp, where the factory's first branch revision depends on the app chain's last. Everything that migrates runs `alembic upgrade heads` (entrypoint, `conftest.py`, the chat e2e server); `upgrade head` refuses two heads.
- An app writes its own migration with `alembic revision --autogenerate --head <its head>`; bare `revision` refuses two heads. It never writes a merge. A rollback names its target (`downgrade -1` and `stamp head` refuse two heads).
- `tests/migrations/test_migration_branch.py` holds the rule: no factory revision after `e1f7a3b4c5d6` chains onto anything but the factory, and an app's own migration on top still upgrades to exactly two heads.

An app with its own code reading `ScriptDirectory.get_current_head()` or `MigrationContext.get_current_revision()` (a version page, an admin migration status page, a custom e2e server) reads `get_heads()` and `get_current_heads()` instead: both raise once `alembic_version` holds two rows. The first factory branch migration is `d943d70b8845`.
