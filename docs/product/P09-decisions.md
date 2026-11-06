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

## Shapes and slices

The operator, 06/11/2026: no template variants, so apps are consistent unless master brings him a specific case; some services need no front end (app-factory#101). Every difference below is a copier answer the factory renders, never a per-app file.

| Decision | Choice | Rationale | Trade-off |
| --- | --- | --- | --- |
| An app with no front end | `headless: true` (default false): no `frontend/`, no SPA mount or elements in `main.py`, no frontend build stage, no frontend hooks or launch entries. The change pipeline finds no frontend member, so it runs no frontend CI | One answer and one render: every headless app owes the same files, measured by the same parity manifest, where a removed frontend was a deviation per app. `has_frontend` was retired on 19/08/2026 because all nine apps answered true; the answer returns because an app now answers false | The shape rule (`canonical-app-shape.md` §Applicability) and master's `frontend-dir` shape check still assume a `frontend/` |
| How an app names its slices | The one answer stays `omitted_slices`, what the app does not take, default none | A list of what an app takes, recorded in its answers, would withhold every slice the factory adds later from every app already stamped; the exception list keeps the whole factory the default. Master's gates already read it | An app reads its slices as the factory's less its list |
| What omitting a slice does | `agent`, `feedback`, `alerts` and `files` leave the render: copier excludes their files, `main.py`, `api/main.py`, config, the model registry, the MCP server, the dependencies, the image and the frontend shell render without them, and the parity manifest is that render. `alerts` and `files` go only with `agent`, which uses both (the answer's validator refuses otherwise) | Nothing kept composes on these four, so removing them is a clean cut every app with the same answer renders identically. Casefile's agent slice with no persona, and the library's agent-driven `main.py` and `shell.spec.ts` variants, become an answer. Without `agent` the image carries no Claude Code | Copier never deletes a file `_exclude` newly hides: an app that gives a slice up deletes its files in the same commit. Its seeded migrations stay in the app's chain, so its tables stay |
| The foundations | `users`, `workspaces`, `admin`, `settings` and `system` stay in the render when declared; the gates count the files `slices.yaml` maps to them conforming, absent or differing | Identity, tenancy, the admin gate, runtime settings and health are what every other factory file composes on. An app without them has its own identity model, and that model is a specific case master brings to the operator, not a render | Portcullis, the one app omitting a foundation, keeps the variants its own identity model needs |
| Chat | Part of the `agent` slice, not a slice of its own | Chat, app-started jobs and lessons share the agent kit, its tables and its lifespan; read 06/11/2026, godswood is the one app whose own code starts jobs, and it has personas too; caspo and pebblestone have personas; casefile, earworm and eight use neither | An app that wants jobs without chat takes the whole slice |
