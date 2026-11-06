# Migrations a factory release carries

**A factory migration never names an app's revision.** The app's migrations are one chain; the factory's later migrations are a second branch that hangs off the last factory revision every app already holds. `copier update` then needs no repointing, whatever the app's own migrations are.

```
app:     …  d9e6 ── e1f7 ── 0048_own ── 0049_own ── 2bce ── 0050_own   ← app head
                      ╲                            (barrier,
                       ╲                            repointed)
factory:                ╲─ depends_on ── d943 ── f002                  ← factory head
```

**A barrier is the one exception.** A revision that changes what the app's own revisions reference (a key's type) must sit after every revision written before it and before every one written after, so it goes on the app's own chain and each app points its `down_revision` at its own head when it takes it. `2bce3d4f6105` (every key a UUID v7, `uuid7-rekey.md`) is the one barrier; in a fresh stamp it follows `e1f7a3b4c5d6`. A factory revision that touches a table a barrier changed names the barrier in `depends_on`.

- The first factory migration after `e1f7a3b4c5d6` sets `down_revision = None`, `branch_labels = ("factory",)` and `depends_on = "e1f7a3b4c5d6"`, the last revision that was chained by hand. Each later one sets `down_revision` to its factory predecessor and nothing else. None names a revision an app wrote.
- A factory migration that touches an app table (`users`, `workspaces`) adds that table's factory revision to `depends_on`, never the app's.
- A database holds a row per head that no other head depends on: two, the app chain's and the factory branch's, in a bare stamp as in an app with migrations of its own. Everything that migrates runs `alembic upgrade heads` (entrypoint, `conftest.py`, the chat e2e server); `upgrade head` refuses two heads.
- An app writes its own migration with `alembic revision --autogenerate --head <its head>`; bare `revision` refuses two heads. It never writes a merge. A rollback names its target (`downgrade -1` and `stamp head` refuse two heads).
- `tests/migrations/test_migration_branch.py` holds the rule: no factory revision after `e1f7a3b4c5d6` chains onto anything but the factory or a barrier, and each barrier chains onto the app chain's last hand-chained revision or barrier.

An app with its own code reading `ScriptDirectory.get_current_head()` or `MigrationContext.get_current_revision()` (a version page, an admin migration status page, a custom e2e server) reads `get_heads()` and `get_current_heads()` instead: both raise once `alembic_version` holds two rows. The first factory branch migration is `d943d70b8845`.
