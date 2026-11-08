# Rekeying a stamped app to UUID v7

Decision: `docs/product/P09-decisions.md` §Keys. Mechanism: `app_slices.rekey.rekey_to_uuid7`, called by revision `2bce3d4f6105` (kit `app-slices>=2026.11.20`). Each app converts in its own lane; the factory converts none.

## What the call does

In the migration's own transaction it gives every single-column key the database generates (an identity, a serial, a uuid default) a v7, in the rows' old order, rewrites every foreign key that reaches one (self-references and composite keys included), drops the old generators, and recreates each foreign key, which Postgres validates. Before and after it reads, per touched table, the row count and one checksum over every unconverted column, each row's place by key and the row each reference points at; a difference raises `RekeyMismatch` and the transaction rolls back with nothing changed. The revision logs one line per table:

```
INFO  [alembic.rekey] example_items: 5000 rows, checksum 0f44ef86…, the same before and after
```

Refused before anything changes: a key the database does not generate (all listed at once), a view over a converted column, a partitioned table holding a converted key, a reference that names no row. A type change Postgres itself refuses (a CHECK or a partial index comparing a key with an integer) rolls back naming the table.

| Argument | Names | When |
| --- | --- | --- |
| `keep` | tables whose key is left alone | another system assigns it (a MusicBrainz id, another app's document id) |
| `include` | tables whose key is rekeyed though nothing in the database generates it | the app mints it in Python (`default=uuid.uuid4`), or it is text (hex v4) |
| `soft_refs` | `{"table.column": "target"}` | a column holds a key with no foreign key |
| `mapped` | tables whose old-to-new map stays in `uuid7_rekey.<table>` (`old_id`, `new_id`) | something outside the app holds the old id (below) |

A key inside JSON or text (a list of ids, `personal-<user id>`) is the app's own `UPDATE` in the same revision, from a `mapped` table, which it drops afterwards if nothing else resolves through it.

## In the app's lane

1. `copier update` to the release and raise `app-slices` to it. Point `2bce3d4f6105`'s `down_revision` at the app's own head; an app whose history lacks `e1f7a3b4c5d6` places the file at its head the same way. Name in its call what the catalogue cannot know. Every later revision of the app's own goes on top of it.
2. Retype the app's own keys as the template's are: `id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)`, every foreign key column, Pydantic schemas, path parameters, MCP tool arguments, and the frontend types (regenerate `schema.d.ts`). `ORDER BY id` keeps meaning insertion order.
3. The suite migrates through the revision on every run; it is green before the window.
4. Rehearse on a restored copy of production (`canonical-app-shape.md`): restore the latest dump into a scratch database beside the real one, run the new image against it with `alembic upgrade heads`, read the proof lines and the app's own pages, drop the copy.

## The window

```sh
docker compose stop <app>                                   # writers off; the database stays up
docker exec <app>-postgres pg_dump -U <role> -d <db> -Fc -f /tmp/pre-uuid7.dump
docker exec <app>-postgres pg_restore --list /tmp/pre-uuid7.dump > /dev/null && \
  docker cp <app>-postgres:/tmp/pre-uuid7.dump <dump dir>/<app>-pre-uuid7-$(date +%Y%m%d).dump
# merge and deploy as the stack deploys: the entrypoint runs `alembic upgrade heads`
docker logs <app> 2>&1 | grep -E 'alembic.rekey|Running upgrade'
```

- The upgrade raised: nothing changed. The previous image starts as before.
- Stored agent sessions: an `agent_jobs` row keeps the `mcp_config` it started with, which binds the old user and workspace ids, and a resume replays it, so its server exits finding no such user (godswood, 08/11/2026: every reading waited). Define `app_hooks.agent_job_resumable` before the window, or retire the paused jobs; `send_message()` then raises `StaleSessionError` and the app starts the job again.
- Wrong after it committed: stop the app, `docker exec -i <app>-postgres pg_restore --clean --if-exists -U <role> -d <db> < <dump>`, start the previous image.

## Keys held outside each app

From a survey of each repo, read 06/11/2026; each lane confirms its own before naming them.

| App | Store | Held outside | In its call or its lane |
| --- | --- | --- | --- |
| every stamped app | | `feedback_reports.id` in each filed GitHub issue ("Admin: /api/feedback/<id>"); a browser's remembered workspace id; `personal-<user id>` slugs keep the old user id as text, read by nothing | map `feedback_reports` only to keep those links; the workspace falls back to the sole membership or the chooser |
| casefile | Postgres 18 | `cases.id` (v4) in `/matters/[id]`, in `<casefile-matters>` links on other apps' pages, in MCP results, and in godswood's `casefile_matter_id` | `include` and `mapped` `cases`; godswood rewrites its copies from the map. `references.urn` holds godswood's keys (`godswood:property/<id>`), rewritten from godswood's map |
| library | Postgres 18, own history | `documents.id` (integer) in `/library/[id]` and `/library/books/[id]`, the caller API and MCP, and stored by caspo and godswood; `collections.id` in `/collections/[id]`; intake uuids in `/arrivals/…`, `?item=`, `?show=`; `operations` uuids stored by godswood; `metric_snapshots.project_ids` (JSON) | `mapped` those tables; converts before caspo and godswood rewrite their copies |
| caspo | Postgres 18 | `extraction_reads.library_document_id` is a key holding library's document id | `keep` it until library's map rewrites it; caspo's `Citation` and `DocumentEntityLink` copies the same |
| godswood | Postgres 18 | about 170 integer tables; ids in `/property/…`, `/networth/accounts/…`, `/crypto/ledger/…`, `/essentialism/clearing/…`, `/groceries/products/…`, `/fixxxer/items/…`, `/fat-controller/runs/…`, `/admin/users/…`; casefile URNs for properties, residences and loans; `alerts.link`; JSON id lists (clearing, travel `traveller_ids`, statement checks `tied_rows`); file paths carrying a workspace id | `mapped` the routed and URN tables; rewrite the JSON lists, `alerts.link` and stored paths from the maps |
| eight | Postgres 18 | routes use business keys (`run_id`, labels) | `journal_records.lineage_of` is a `soft_refs` entry if it has no foreign key |
| earworm | Postgres 18 | MusicBrainz ids as uuid keys (`artist_metadata`, `artist_genres`, `recordings`); client-supplied `devices.id` | `keep` the MusicBrainz tables (the refusal names them); `devices` is text and untouched |
| portcullis | Postgres 17 | its text keys are public ids inside issued bearers | nothing named: text keys are untouched; `audit_log` rekeys |
| core-memory | SQLite, no Alembic | belief and lesson ids (hex), held in every app's `agent_job_lesson_reports` JSON and in dispatch records | the call does not apply; its lane converts and keeps old ids resolving |
| darkroom, claudette | no Postgres | | nothing to convert |
