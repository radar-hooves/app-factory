# Adopting an existing app

Stamping over a repo that already has an app is a different job from scaffolding a fresh one, and the difference is not the stamp — it is the reconcile after it.

Stamp with `--overwrite` onto a **clean tree**, pinned to a tag, taking ports from the repo's existing config and confirming them against the operator's port registry; never invent one. Commit nothing until the reconcile is done: `git diff` is the whole worklist, and a clean tree beforehand is what makes it readable.

Reconciling from that diff, the default is **take the template**. Keep the app's version only for genuine domain code, and be able to say why in one line.

## Eight things a greenfield stamp never has to think about

Proved on `fixxxer`, 2026-08-13.

1. **`.gitignore` and `.gitattributes` are replaced wholesale.** Any app-specific asset policy in them is gone, and everything it protected is suddenly untracked-and-visible. Re-add it under the template's own `Project-Specific` heading before staging anything. On `fixxxer` that was ~4 GB of CAD and reference material a broad `git add` would have swept straight in.
2. **Delete the `example` slice** — `api/example/`, `config/sections/example.py`, `tests/test_example.py`, and the `example_items` migration. They are a starting point for an app with no domain yet; in an adopted repo they are dead code plus a dead table in a real database.
3. **Re-point the migration chain.** The environment-marker migration chains off the example one, so deleting that leaves two roots and two alembic heads. Set its `down_revision` to the app's existing head and confirm with `alembic heads`.
4. **The stamp overwrites the app's version.** `backend/pyproject.toml` and `frontend/package.json` carry template defaults; restore the app's own. Runtime dependencies the app needs and the scaffold does not go back the same way.
5. **`_skip_if_exists` protects only the paths the template writes.** An app keeping its design North Star at `frontend/DESIGN.md` gets a skeleton at the root alongside it; move the real one into place.
6. **Hunt prose the stamp cannot reach** — log and error wording, docstrings, config-key descriptions, test names, headings. Where the app says the same thing differently, take the template's words (`canonical-app-shape.md` §Sameness Extends to Prose).
7. **Rename a colliding `operation_id`.** `api/system/router.py` claims `healthCheck`, and an app that already had its own liveness route usually claims it too. FastAPI resolves the collision by dropping one path from the schema — a `UserWarning` on stdout, then a generated `schema.d.ts` quietly missing an endpoint.
8. **Resolve a conflict hunk against the comment it sits in.** Taking the app's side of one hunk and the template's side of the next can split a `/* … */` block across the boundary. Neither `pnpm check` nor eslint sees it; the first signal is `pnpm build` failing inside Tailwind with `Unterminated string`. Read each resolved file once before running the gates.

## Verify by driving, not by building

The backend suite with nothing else running (it must start its own Postgres), `pnpm check` / `lint` / `build`, both design gates, `pre-commit run --all-files` — then the app itself: HTTP, a client-side deep link, and `POST /mcp/` answering its 401 rather than a 404.
