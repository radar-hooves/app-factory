---
template-version: "2026-07-17"
---

# App Factory: Decisions

Each decision binds every app the factory stamps. Recorded as it stands; git holds how it got here.

## Keys

The operator, 06/11/2026: primary keys are consistent across the fleet, as UUIDs (app-factory#100).

| Decision | Choice | Rationale | Trade-off |
| --- | --- | --- | --- |
| How a key is made | A UUID v7 (RFC 9562) minted in Python: `mapped_column(primary_key=True, default=uuid.uuid7)`, no server default | Python 3.14 is every app's floor, so the generator costs nothing. Postgres 18's `uuidv7()` needs 18 wherever a stamped database runs, and portcullis's store on atlas, titan and mimir, the factory's test container and its image smoke run 17 (read 06/11/2026). The ORM holds the key before the flush, so rows reference one another and an id is logged or returned with no `RETURNING` round trip. The rekey mints its keys in the same layout | An `INSERT` outside the ORM (psql, a raw data migration) supplies its own key; the tenancy rule already confines writes to ORM statements. Keys from one process are strictly ordered; two processes in one millisecond are not, as with `uuidv7()` across connections |
| Which keys | Every surrogate key: a single-column key the app generates. A natural key stays as it is: a setting's name (`setting_overrides`), the deployment marker's singleton boolean, a person's day count `(user_id, day)`, a job's report `(job_id, revision)` | A natural key is the row's identity; a surrogate beside it needs a unique constraint to hold the same invariant, one more index for nothing | Not every key column is a uuid |
| A key held outside the app | Keeps its value. Claude Code's session id (`agent_jobs.job_id`, its transcript's name on disk) is never rekeyed and is minted v7 from now on. A conversation's id, in its address and a shared answer's link, keeps its v4 value, typed uuid; new ones are v7 | Rekeying a held id breaks a bookmark or a resume and gains nothing. Where a held id cannot keep its value (an integer in a URL, an id another app stores), `rekey_to_uuid7(mapped=…)` keeps its old-to-new map for the app to resolve | v4 and v7 values share a column |
| How a database gets there | `app_slices.rekey.rekey_to_uuid7`, called by revision `2bce3d4f6105` on the app's own chain, run by the image's entrypoint in an offline window after a dump (`docs/development/uuid7-rekey.md`) | Every app already takes the kit, and the entrypoint is the one path a live database moves by (`canonical-app-shape.md`). Every test database runs the same revision, so the conversion is exercised on each app's every suite run | The one factory revision an app repoints at its own head |
