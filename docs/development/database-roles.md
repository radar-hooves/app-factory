# A stamped app's database roles

Decision, with the three roles' table: `docs/product/P09-decisions.md` §Roles. Mechanism: `db/roles.py`, run by `alembic/env.py` at every start. Each app adopts in its own window, portcullis first (portcullis#257), the rest beside their UUID v7 windows; the factory adopts none.

## What every start does

1. **Takes a Postgres advisory lock, held for the adoption and for step 4's role change alone**, so two starts against one server (workers, parallel test databases) go in turn rather than failing with `tuple concurrently updated`. **Tries the bootstrap superuser with the app's password (`<app>-db`), and the owner role.** If the bootstrap answers (the first start, or a dump and restore into a fresh initdb, which hands it the store password back while the owner keeps its old verifier and logs in), it adopts: in one transaction it creates the owner role, moves the database and every schema, table, view, sequence, type, routine, statistics object, collation and text search object the bootstrap owns outside the system schemas and extensions to it, strips a runtime role made before (the 2026.10 opt-in) of every attribute and membership and puts it in the owner's charge, and removes the bootstrap's password. A refused password or a `pg_hba.conf` that rejects the bootstrap reads as closed, and the start goes on if the owner logs in; both refused is no first start and raises. An unreachable server raises as it is, and changes nothing. A first adoption over a `pg_hba.conf` that rejects the bootstrap's TCP login needs its line added for that one start.
2. **Refuses to migrate as a superuser.**
3. **Migrates.**
4. **Creates the runtime role if it is missing and sets its password** from `<app>-db-runtime`, hashed to a SCRAM verifier in the app. Revokes all it holds on the owner's schemas and grants back DML on every table and sequence, default privileges for tables to come and `SELECT` on `alembic_version`, nothing else; revokes `CREATE` on those schemas from `PUBLIC`.
5. **Proves the runtime role:** connects as it and has it try `CREATE TABLE`, `DROP TABLE`, `ALTER ROLE`, `COPY … PROGRAM`, `TRUNCATE` and `CREATE TRIGGER`, each rolled back. One not refused, any role attribute or any membership stops the start.

```
INFO  [alembic.roles] <app>_owner now owns the database and 212 objects; <bootstrap> logs in only through the database's own socket
INFO  [alembic.roles] <app>_runtime created: DML on the app's tables; refused CREATE TABLE, DROP TABLE, ALTER ROLE, COPY ... PROGRAM, TRUNCATE, CREATE TRIGGER
```

The first line prints at the first start, and again after a restore. On every later start the second reads `password set from the broker`.

## In the app's lane

1. **Mint the runtime credential, value-blind.** Through the portcullis MCP, beside `<app>-db`: `item(action="create", create={"name": "<app>-db-runtime", "collection_ids": [<app>-db's], "generate": [{"field": "password", "length": 48, "special": false}]})`, then a catalogue entry `<app>-db-runtime` reading that item's `password` (portcullis `docs/development/guide-consumer.md` §Writing a self-invented secret). Grant it in yggdrasil's `portcullis-identities.nix` to the app's identity and to the developer identity that vends `<app>-db`. Nobody sees the value. Portcullis is the broker and cannot vend from itself: its runtime password is a boot-lane file (`POSTGRES_RUNTIME_PASSWORD_FILE`) minted by the host, as its `POSTGRES_PASSWORD_FILE` is.
2. **Change the stack (yggdrasil), merged with the window.**
   - The app service drops `POSTGRES_USER: <bootstrap>`, since the stamped default names the owner role.
   - Its `portcullis exec` vends both passwords, in the repeatable form: `--vend POSTGRES_PASSWORD=<app>-db.password --vend POSTGRES_RUNTIME_PASSWORD=<app>-db-runtime.password`.
   - A `pg_hba.conf` that names roles admits `<app>_owner` and `<app>_runtime` from the app's address; portcullis's has named `portcullis` alone since yggdrasil d66fc7cb.
   - **`pg_reload_conf()` does not load a `pg_hba.conf` that is bind-mounted and rewritten.** An editor or a deploy that writes a new file replaces the inode, and the container's mount keeps pointing at the old one, so the server reloads the file it already had (portcullis and caspo, 07/11/2026). Write the file in place (`cat new > pg_hba.conf`, never `mv` or an editor's save), or restart the Postgres container; then check with `SELECT * FROM pg_hba_file_rules` that the line is there.
   - The database service stays as it is: its `POSTGRES_USER` is the bootstrap, which db-dumps reads, inside the container over its socket.
3. **Check what only the bootstrap can do.** An extension a future migration creates that Postgres does not mark trusted (`pgvector`, say; `pg_trgm` and `uuid-ossp` are trusted), or updates when the bootstrap installed it, is created or updated by hand through the socket before that release: the owner is refused it. Then check that nothing else logs in as the bootstrap over TCP. After the first start, and after any restore once the app has started, it has no password. `SELECT usename, application_name, client_addr FROM pg_stat_activity WHERE usename = '<bootstrap>'` names only the app, and a socket session (`client_addr` null) for dumps.
4. **Take the release.** Run `copier update`. In the app's own tests, a table made through the app's session becomes `TEMPORARY`, and a teardown that `TRUNCATE`s uses `DELETE` or the owner's engine: the suite serves as the runtime role, as production now does. Add `-e POSTGRES_RUNTIME_USER=postgres -e POSTGRES_RUNTIME_PASSWORD="$pgpass"` to the app's `.github/image-smoke.sh`. The suite must be green before the window.
5. **Rehearse on a restored copy, on a server of its own.** Roles belong to the whole server, so a rehearsal beside the real database would close the real bootstrap's login. Start a throwaway Postgres of the same major version with the real `POSTGRES_USER` and a scratch password. Restore the latest dump into it. Run the new image's `entrypoint.sh migrate` against it with that password as `POSTGRES_PASSWORD` and a scratch `POSTGRES_RUNTIME_PASSWORD`, read the two lines, then drop the container.

## The window

```sh
docker compose stop <app>                                   # writers off; the database stays up
docker exec <app>-postgres pg_dump -U <bootstrap> -d <db> -Fc -f /tmp/pre-roles.dump
docker exec <app>-postgres pg_restore --list /tmp/pre-roles.dump > /dev/null && \
  docker cp <app>-postgres:/tmp/pre-roles.dump <dump dir>/<app>-pre-roles-$(date +%Y%m%d).dump
# merge and deploy as the stack deploys: the entrypoint adopts, migrates and proves
docker logs <app> 2>&1 | grep -E 'alembic.roles|Running upgrade'
```

## The proof

- **The start's own lines** (above). The runtime role was refused `CREATE TABLE`, `DROP TABLE`, `ALTER ROLE`, `COPY … PROGRAM`, `TRUNCATE` and `CREATE TRIGGER`, or the start would have stopped.
- **The app serves:** `/api/system/health` answers 200 with the new `revision`, and the app's own pages load.
- **Again, by hand, from the running container:**

  ```sh
  docker exec <app> python -c "from <pkg>.config import get_settings; from <pkg>.db.roles import prove_runtime_role; prove_runtime_role(get_settings().database.runtime_database_url)"
  ```

  It is silent and exits 0, or raises naming each statement the runtime role was allowed.
- **The roles, read as the bootstrap through the socket:**

  ```sh
  docker exec <app>-postgres psql -U <bootstrap> -d <db> -c '\du' \
    -c "SELECT rolname, rolpassword IS NULL AS no_password FROM pg_authid WHERE rolname IN ('<bootstrap>', '<app>_owner', '<app>_runtime')" \
    -c "SELECT count(*) AS not_the_owners FROM pg_tables WHERE schemaname = 'public' AND tableowner <> '<app>_owner'"
  ```

  The owner shows `Create role` and nothing else. The runtime role shows no attributes. Only the bootstrap has no password. `not_the_owners` is 0.

## Rotating

- **`<app>-db-runtime`:** regenerate it in the broker and restart the app; the start sets the role's password from it.
- **`<app>-db`**, the owner's: regenerate it, restart `<app>-postgres` so its environment holds the new value, set the owner's password from it through the socket, then restart the app:

  ```sh
  docker exec -i <app>-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v pw="$POSTGRES_PASSWORD"' <<< "ALTER ROLE <app>_owner PASSWORD :'pw';"
  ```

## Rollback

- **The start raised before adoption committed** (a refused vend, a refused address, a superuser `POSTGRES_USER`): nothing changed, and the previous image starts as before.
- **Wrong after adoption:** start the previous image as the owner role (`POSTGRES_USER: <app>_owner` in the stack). It owns everything the previous image touches, and adoption changed no row. A restore puts the owner's ownership back with `docker exec -i <app>-postgres pg_restore --clean --if-exists --no-owner --role=<app>_owner -U <bootstrap> -d <db> < <dump>`.

## Per app

From a read of each stack, 06/11/2026; each lane confirms its own.

| App | What its window adds |
| --- | --- |
| portcullis | First (portcullis#257). Its pg_hba names `portcullis` alone, so it admits the two roles. Its runtime password is a boot-lane file, since it cannot vend from itself |
| godswood | Its bootstrap is `postgres`. It runs `godswood_runtime` from the 2026.10 opt-in (godswood#928), which adoption puts in the owner's charge. Its About page reads `alembic_version`, which the runtime role may |
| every other stamped app | The steps above |
