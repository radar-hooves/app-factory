# full-stack-app template

Canonical household full-stack application shape, stamped by `copier` via `/scaffold-project`. This template is the **executable source of truth** for the shape described in `rules-library/platform/canonical-app-shape.md`.

## Shape

```text
<project>/
├── .pre-commit-config.yaml     gitleaks + check-pii + handoff governance + generic hooks + ruff + uv-lock-check + design-craft + design-drift (has_frontend)
├── .gitleaks.toml              allowlist so .env.example placeholders do not block the first commit
├── .envrc                      direnv: source_up + uv sync (backend/)
├── .gitattributes / .gitignore
├── .mcp.json                   empty — enable per project
├── .github/workflows/
│   ├── canonical-shape.yaml    always — structural gate
│   ├── python-ci.yaml          always — thin caller of the python-ci reusable
│   ├── security.yaml           always — thin caller of the security reusable
│   ├── auto-label-issues.yaml  always — thin caller of the issue-labelling reusable
│   ├── cleanup-container-images.yaml  weekly registry-bloat sweep
│   └── frontend-ci.yaml        only when has_frontend
├── DESIGN.md / README.md       skeletons — app-owned after stamping (_skip_if_exists)
├── Dockerfile / compose.yaml / .dockerignore   local build + smoke-test deploy set
├── backend/
│   ├── pyproject.toml          uv + src-layout + runtime deps
│   ├── entrypoint.sh           container start: migrate → stamp environment → exec gunicorn
│   ├── gunicorn.conf.py        production server config (container-aware worker count)
│   ├── .python-version         3.14
│   ├── .envrc                  direnv: uv sync + activate
│   ├── alembic.ini             migration config (DB URL injected at runtime)
│   ├── alembic/
│   │   ├── env.py              sync (create_engine + NullPool)
│   │   └── versions/           migration scripts
│   ├── src/<package>/
│   │   ├── main.py             create_app(): lifespan + /mcp mount + SPA serve
│   │   ├── server.py           uvicorn entrypoint (dev)
│   │   ├── logging.py          configure_logging() with secret redaction + request-id filter
│   │   ├── middleware.py       request id, request logging, security headers
│   │   ├── exceptions.py       BackendBaseException hierarchy + per-type handlers
│   │   ├── deps.py             SessionDep, SettingsDep, CurrentUser (Annotated)
│   │   ├── config/
│   │   │   ├── __init__.py     root Settings + lru_cache get_settings()
│   │   │   ├── paths.py        source-tree-relative .env / repo-root lookup
│   │   │   └── sections/
│   │   │       ├── database.py DatabaseSettings (POSTGRES_* env vars)
│   │   │       ├── mcp.py      MCPSettings (<APP>_OIDC_* inbound-auth vars)
│   │   │       └── example.py  Domain-section template (copy per domain)
│   │   ├── db/
│   │   │   ├── base.py         DeclarativeBase + TimestampMixin
│   │   │   ├── session.py      engine + sessionmaker + get_session (sync, UTC per connection)
│   │   │   ├── environment.py  deployment-environment marker, read fail-closed
│   │   │   ├── stamp.py        CLI that stamps the marker (called by entrypoint.sh)
│   │   │   └── registry.py     imports all models → Alembic target_metadata
│   │   ├── api/
│   │   │   ├── main.py         api_router aggregator + exception handler registration
│   │   │   ├── system/         GET /api/system/health — liveness + DB ping (503 only on DB)
│   │   │   └── example/        vertical domain slice
│   │   │       ├── models.py   SQLAlchemy ORM model
│   │   │       ├── schemas.py  Pydantic request/response models
│   │   │       ├── service.py  business logic (no HTTP concerns)
│   │   │       ├── router.py   FastAPI routes
│   │   │       └── dependencies.py  domain-specific Depends() wrappers
│   │   ├── services/           cross-domain shared services
│   │   │   └── fanout.py       bounded thread-pool helper for I/O fan-out endpoints
│   │   └── mcp/
│   │       ├── server.py       FastMCP server + health_check tool
│   │       ├── http_auth.py    Authentik bearer gate on /mcp (carbon copy)
│   │       ├── actors.py       identity → Actor allow-list loader (carbon copy)
│   │       └── auth.py         resolve_actor() for the tool layer
│   └── tests/
│       ├── conftest.py         ephemeral testcontainer Postgres + txn-rollback session + httpx.AsyncClient
│       ├── support/            explicit_server_guard — refuses to run against a production database
│       ├── test_mcp_auth.py    drives the /mcp gate: refusals, accept, allow-list
│       ├── test_system_health.py  health endpoint: healthy and DB-down
│       └── test_example.py     unit + integration tests for the example slice
├── config/
│   └── actors.yaml             MCP actor allow-list (identity → actor_id/type)
└── frontend/                   (only when has_frontend=true)
    ├── package.json            SvelteKit + shadcn-svelte + Tailwind v4 (+ impeccable for the craft gate)
    ├── components.json         shadcn-svelte config
    ├── svelte.config.js        adapter-static SPA + path aliases
    ├── vite.config.ts          proxy /api → backend, dev auth header injection
    ├── vitest.config.ts        unit tests (jsdom, browser resolve conditions)
    ├── playwright.config.ts    E2E on a dedicated port and identity, never reusing a dev server
    ├── tsconfig.json
    ├── .design-craft-baseline.json  app-owned debt register — stamped empty, grows as findings are banked
    ├── .ui-drift-baseline.json      app-owned debt register — stamped empty, grows as findings are banked
    ├── scripts/
    │   ├── check-design-craft.mjs   craft gate (impeccable); pre-commit static, `pnpm lint:design:live` drives a browser
    │   └── check-ui-drift.mjs       drift gate (@poodle64/ui reuse); pre-commit + `pnpm lint:drift`
    ├── tests/e2e/              example playwright spec
    └── src/
        ├── app.css             design tokens (Eucalyptus palette, OKLCH)
        ├── app.d.ts             SvelteKit ambient types
        ├── test/                vitest setup + $app module stubs
        ├── routes/
        │   ├── +layout.ts      ssr=false, prerender=false
        │   ├── +layout.svelte  ModeWatcher + Sonner + page title, routes wrapped in @poodle64/ui's AppShell
        │   ├── +page.ts        { title: 'Home' }
        │   └── +page.svelte    starter home page (API smoke check)
        └── lib/
            ├── utils.ts        cn() (clsx + tailwind-merge)
            └── api/
                ├── client.ts   openapi-fetch client + timeout, 401 redirect, error normaliser
                ├── error.ts    extractApiError() → ApiErrorInfo { title, description, status }
                └── index.ts    barrel
```

## Questions (copier.yml)

| Question       | Default                  | Effect                                                  |
| -------------- | ------------------------ | ------------------------------------------------------- |
| `project_name` | —                        | kebab-case name; used in pyproject.toml, package naming |
| `package_name` | snake_case(project_name) | Python package under `src/`                             |
| `description`  | —                        | one-sentence description in metadata                    |
| `has_frontend` | `true`                   | include the `frontend/` SvelteKit skeleton              |

## Usage

```bash
# Stamp a new project
copier copy docs/master/templates/full-stack-app /path/to/new-project

# Or via the /scaffold-project skill (preferred — sets up symlinks, CLAUDE.md, etc.)
/scaffold-project
```

## Adopting an existing app (the ADOPT path)

Stamping over a repo that already has an app is a different job from scaffolding
a fresh one, and the difference is not the stamp — it is the reconcile after it.
Proved on `fixxxer`, 2026-08-13.

```bash
uvx copier@latest copy --overwrite --defaults --vcs-ref v2026.8.6 \
  --data project_name=<app> --data package_name=<package> \
  --data description="<one sentence>" --data has_frontend=true \
  --data backend_port=<from the port registry> \
  --data frontend_port=<from the port registry> \
  gh:poodle64/full-stack-app-template .
```

Take the ports from the repo's existing config and confirm them against
`operators/<operator>/registries/registry-ports.md`; never invent one. Commit
nothing until the reconcile below is done — `git diff` is the whole worklist,
and a clean tree before the stamp is what makes it readable.

Then, reconciling from that diff, the default is **take the template**. Keep the
app's version only for genuine domain code, and be able to say why in one line.
Six things a greenfield stamp never has to think about:

1. **`.gitignore` and `.gitattributes` are replaced wholesale.** Any app-specific
   asset policy in them is gone, and everything it protected is suddenly
   untracked-and-visible. Re-add it under the template's own `Project-Specific`
   heading before staging anything. On `fixxxer` this was ~4 GB of CAD and
   reference material that a broad `git add` would have swept straight in.
2. **Delete the `example` slice.** `api/example/`, `config/sections/example.py`,
   `tests/test_example.py` and the `example_items` migration are a starting
   point for an app that has no domain yet; in an adopted repo they are dead
   code plus a dead table in a real database.
3. **Re-point the migration chain.** The template's environment-marker migration
   chains off the example one, so deleting that leaves two roots and two alembic
   heads. Set its `down_revision` to the app's existing head and confirm with
   `alembic heads`.
4. **The stamp overwrites the app's version.** `backend/pyproject.toml` and
   `frontend/package.json` carry template defaults; restore the app's own.
   Runtime dependencies the app needs and the scaffold does not (say
   `python-multipart` for uploads) go back the same way.
5. **`_skip_if_exists` covers `README.md`, `DESIGN.md` and the two baselines** —
   but only at the paths the template writes. An app keeping its design North
   Star somewhere else (`frontend/DESIGN.md`) gets a skeleton at the root
   alongside it; move the real one into place.
6. **Hunt prose the stamp cannot reach.** Log and error wording, docstrings,
   config-key descriptions, test names, README headings. Where the app says the
   same thing differently, take the template's words
   (`canonical-app-shape.md` §Sameness Extends to Prose).
7. **Rename a colliding `operation_id`.** `api/system/router.py` claims
   `healthCheck`. An app that already had its own liveness route usually claims
   it too, and FastAPI resolves the collision by dropping one path from the
   schema — a `UserWarning` on stdout, then a generated `schema.d.ts` quietly
   missing an endpoint. Rename the app's.
8. **Resolve a conflict hunk against the comment it sits in.** Taking the app's
   side of one hunk and the template's side of the next can split a `/* ... */`
   block across the boundary. Neither `pnpm check` nor `eslint` sees it; the
   first signal is `pnpm build` failing inside Tailwind with `Unterminated
   string`. Read each resolved file once before running the gates.

Verify by driving, not by building: the backend suite with nothing else running
(it must start its own Postgres), `pnpm check`/`lint`/`build`, both design gates,
`pre-commit run --all-files`, then the app itself — HTTP, a client-side deep
link, and `POST /mcp/` answering its 401 rather than a 404.

## Key Decisions

**Auth: two surfaces, two gates, never interchangeable** A stamped app exposes a human surface and a machine surface, and each is gated on its own terms. Mixing them is a bypass, not a shortcut.

The **human surface** (`/api`, the SPA) is Tier 1a (proxy-delegated, the default for homelab apps). Identity arrives via `x-authentik-uid` / `x-authentik-username` headers injected by Authentik. The app trusts headers; network isolation is the security boundary. No app-level sessions or Redis needed. Change to Tier 1b (BFF) when the app must be reachable without a proxy in front of it.

The **machine surface** (`/mcp`) validates a live Authentik OIDC bearer token app-side and resolves it against an `actors.yaml` allow-list. It does _not_ trust a forwarded identity header, because a machine caller does not traverse the human proxy and could forge one (`rules-library/platform/proxy-delegated-auth.md` §Scope). `mcp/http_auth.py` and `mcp/actors.py` are byte-identical carbon copies of the household's canonical gate, shared with godswood, seshat, core-memory, tapestry and milton; do not edit them per app. Both halves are load-bearing: Authentik serves one instance-wide userinfo endpoint that accepts any valid token from any application on the instance, so the bearer check proves identity alone and the allow-list is what restores the app boundary. Every tool calls `resolve_actor()` and authorises off `actor.id` / `actor.type`.

**MCP inbound-auth environment variables** All four are read at runtime, so pointing an app at a different identity provider never needs a rebuild. `<APP>` is the project name upper-cased with hyphens as underscores.

| Variable                           | Default              | Meaning                                                                                                                     |
| ---------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `<APP>_OIDC_USERINFO_URL`          | `""`                 | Authentik userinfo endpoint. **Empty fails closed**: every `/mcp` request 401s.                                             |
| `<APP>_OIDC_IDENTITY_CLAIM`        | `preferred_username` | Claim read as the caller identity, falling back to `sub`. Deployments behind the shared mcp-gateway client set `mcp_actor`. |
| `<APP>_OIDC_RESOURCE_METADATA_URL` | `""`                 | Advertised in the 401 `WWW-Authenticate` header (RFC 9728). Empty omits it.                                                 |
| `<APP>_ACTORS_CONFIG_PATH`         | `config/actors.yaml` | The actor allow-list. An identity the gate resolves but that is absent here is refused.                                     |

The fail-closed default is deliberate. A fresh stamp runs locally with no identity provider configured and its `/mcp` is shut rather than open, and `create_app()` logs a warning naming the variable so the closed state is never a mystery.

**Config: composed sections over one shared `.env`** The root `Settings` owns the unprefixed keys; each section owns its own prefix (`POSTGRES_*`, `EXAMPLE_*`, `<APP>_OIDC_*`). All of them read the same `backend/.env`, so every model must set `extra="ignore"`: a key belonging to a sibling section is not an error, and forbidding it makes the app refuse to start on the very file `.env.example` tells you to copy. Paths come from `config/paths.py` rather than the working directory, because `uvicorn` starts in `backend/` in dev and at the repo root in a container. Follow both conventions when you add a section.

**Persistence: PostgreSQL + sync SQLAlchemy 2.0 + Alembic** Sync is the household way; there is no per-app sync/async choice. An endpoint that genuinely fans out I/O uses the bounded thread-pool fan-out helper (`services/fanout.py`) inside the sync world instead of an app-wide async flip. Tests run against the suite's own ephemeral `postgres:17-alpine` testcontainer, schema-built via `alembic upgrade head`; never a long-lived database, never `create_all`.

**MCP surface: FastMCP mounted at /mcp, behind the bearer gate** The embedded MCP server shares the FastAPI process and lifespan. Tools are registered in `mcp/server.py`. Target ≤20 tools; use the action-dispatcher pattern (one tool per noun, `action=` parameter). The mount has a subtlety worth knowing before you touch `main.py`: `raw_mcp_app` carries the FastMCP lifespan (the streamable-HTTP session manager's task group lives there) while the gated wrapper is what mounts at `/mcp`. Chain the lifespan from the raw app and mount the gated one. Getting that backwards either leaves the session manager unstarted or leaves the surface open. The agent endpoint is `POST /mcp/`, trailing slash required.

**Frontend: SvelteKit SPA served by the backend** `adapter-static` builds to `frontend/build/`; FastAPI serves it via `StaticFiles(..., html=True)`. The Vite dev server proxies `/api` and `/mcp` to the backend and injects the dev Authentik headers so the same code path runs in both environments. Those injected headers authenticate the human surface only. They carry no weight on `/mcp`, which stays shut until `<APP>_OIDC_USERINFO_URL` is set.

**Design tokens: Eucalyptus palette (OKLCH)** The shared household design language (`docs/master/reference/guide-shared-design-language.md`). Update master tokens first, then adopt per project. No raw `oklch()` values in component files — all via CSS custom properties defined in `app.css`.

**Component system: `@poodle64/ui` (shared shadcn-svelte primitives)** The shadcn-svelte primitives (bits-ui) are consumed as a published package, not vendored per app: `import { Button } from '@poodle64/ui/button'`. A fix lands once and reaches every app. Two `app.css` lines make that work, and both are load-bearing: `@import '@poodle64/ui/styles.css'` (after the token imports) brings in the shadcn semantic surface _and_ its Tailwind registration, and `@source '../node_modules/@poodle64/ui/dist'` puts the package inside Tailwind's scan. The package's peers that the scaffold actually uses (`bits-ui`, `mode-watcher`, `svelte-sonner`) stay declared in the app's own `package.json`: pnpm resolves an undeclared optional peer into the package's private tree, where app code cannot import it and a second copy would be a `Toaster` that never sees the app's own `toast()` calls. WP-51 Lane WP (`master-project#174`); superseded the earlier vendor-per-app pattern.

**Palette differentiation: `--ds-color-*`, never a hand-written alias layer** An app picks its palette by overriding `--ds-color-primary` (and its pair) in `app.css`; the whole shadcn surface follows, because `@poodle64/ui/styles.css` maps every shadcn name onto a `--ds-*` token. A stamped app must **not** re-declare `--card` / `--popover` / `--muted` / `--accent` / `--input` / `--radius` and friends itself. Doing so was the norm before `@poodle64/ui@2026.7.2` and it silently half-worked: declaring those names as plain custom properties makes the variable exist but never tells Tailwind v4 they are theme colours, so `bg-card`, `bg-muted`, `bg-accent` and `border-input` compile to no rule at all: no build error, no lint hit, no failing test, just classes in the DOM with nothing behind them (`poodle64/design-system#3`). The one part of the surface still owned per app is sidebar and chart colours: the package ships no sidebar or chart component and chrome hue is genuinely an app's own decision, so the scaffold declares and registers those itself.

## Verified Greenfield

Seshat (WP-12) was the first project stamped greenfield from this template, 2026-07-05. That run surfaced seven template bugs — missing answers file, an unrendered `.env.example`, a wrong async Alembic URL, an unwired exception handler, a pytest loop-scope mismatch, several stamped-file formatting failures, and an over-strict conftest guard — all fixed in this template as a direct result.

## Releasing a template change (read this before editing)

This repo is a **copier source**, and `copier update` checks out the **latest git tag** — not the tip of `main`. A change pushed without a tag is therefore invisible to every app: they keep stamping and updating against the previous tag, with no error and no signal that anything was missed.

So a template change is not shipped until it is tagged:

```bash
git tag -a v2026.7.1 -m "Release 2026.7.1"   # CalVer: YYYY.M.x, per rules-library/core/git-workflow.md
git push origin main v2026.7.1
```

Tag once per logical change set, not per commit (`git-workflow.md` §Release Cadence). Apps then pull the change forward with `copier update`; their `.copier-answers.yml` records which tag they last took.

Tagging by hand is discipline, not a ratchet — the same failure mode `rules-library/platform/common-libraries.md` documents for published wheels, where an unbumped version silently served stale code. If template changes ever start missing their tags, the fix is to stamp the tag in CI, not to try harder.

## Where this lives

Authored here; consumed as `gh:poodle64/full-stack-app-template`. The shape it stamps is law in the household's `rules-library/platform/canonical-app-shape.md`; this template is that rule's executable form, and the two move together. Extracted from `poodle64/master-project` (history preserved) so that copier has a tagged VCS source — see master-project#161.
