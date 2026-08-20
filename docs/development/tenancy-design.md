# Tenancy — the workspace primitive

Status: **proposed 20/08/2026, awaiting operator approval.** Nothing here is built. Implementation belongs with the shared-domains factory work (`canonical-app-shape.md` §Shared Domains Belong to the Factory, master-project#288): the workspaces slice shares the local user record with `auth`, `users` and `admin`, and the four land as one decision. The binding rule text this design proposes for `rules-library/platform/tenancy.md` is in the appendix — the shared pool is enacted through the sunset review, not mid-task, so it ships here verbatim for that sitting.

## The missing noun

The factory has no concept between "person" and "everyone", and the fleet answered the gap both wrong ways at once. godswood scopes 62 of ~70 tables to the individual who created each row (`user_id` as the access predicate, filtered in every service function), so the operator's wife signs in through the same SSO and sees an empty app — the app defines "person" as "tenant", and a second person in the same household reads as a second, empty tenant. tapestry scopes nothing — `list_subjects(session)` returns every row to every caller — which is only correct while everyone the proxy admits belongs to one circle, and makes its data model irreconcilable with godswood's the day it becomes a module there.

Both are one missing noun: **a set of people who share a body of data**. The primitive is that noun, shipped by the factory so every stamped app inherits it and no app answers the question locally again.

## The noun is `workspace`

One noun in code across the fleet: `workspaces`, `workspace_memberships`, `workspace_id`, `WorkspaceScoped`, `CurrentWorkspace`, `X-Workspace-Id`. What an app CALLS a workspace is its own vocabulary — godswood says "household", tapestry says "circle" — supplied as a copier answer (`workspace_label`) and used in frontend copy only, never in code, columns, schemas or headers.

The industry noun `tenant` was the working position and is rejected on measured evidence, not taste: it is live **domain** vocabulary in the flagship consumer. godswood's `lease_agreement` and `owner_statement` extraction schemas mean a real person renting a real property, "tenancy" is a statutory term in the same module's documents (residential tenancy agreements are a document type it files), and one service comment already uses "tenant boundary" in the access sense two files away from schemas using "tenant" in the renter sense. A `tenant_id` column on a lease row would read as the renter while meaning the household — a permanent ambiguity in the app where a scoping mistake costs the most. `account` fails the same test harder (a wealth platform is made of accounts), `household` and `circle` are per-app labels and would smuggle one app's flavour into the shared layer, and `workspace` was checked against every backend in the fleet on 20/08/2026: zero collisions, and it is the recognised noun for exactly this boundary (Slack, Notion, Linear).

A single-member workspace is an org-of-one — the same code path as a shared one, never a special case, so there is no "personal mode" and no second branch to test.

## Three questions, three layers

Each question has exactly one answering layer. Conflating any two is how the defect happened.

| Question | Layer | Source | Status |
| --- | --- | --- | --- |
| Who is calling? | Authentication | Proxy headers / `/mcp` bearer | Exists, unchanged |
| May this account use module M, at what grade? | Entitlement | Authentik Application Entitlements header | Exists; gains a read grade |
| Whose data is in scope? | Tenancy | Workspace membership (in-app rows) | **This design** |

Module entitlement stays per ACCOUNT — it is licensing, not scoping, and does not vary by workspace. What a member sees is the intersection: a module they hold the entitlement for, showing rows of the workspace they are in. The wife with the `property` entitlement and household membership sees the household's properties; the cousin with the `tapestry` entitlement and circle membership sees the family stories and no ledger, whatever workspace the ledger lives in.

### Where the role comes from

The estate already runs two role sources: tapestry gates its writer on an IdP group (`tapestry-weavers`), godswood has only an estate-wide `is_admin`. This design deliberately picks **neither a new in-app role table nor a per-app group check**, because the two role questions are different questions:

- **Per-module read/write** is an entitlement GRADE, provisioned in the IdP on the existing rail: a bare `<module>` key grants read and write — the unchanged meaning of every grant already issued, so nothing is re-provisioned — and `<module>:read` grants read only. `require_module("property")` gates read (accepts either form); `require_module("property", write=True)` gates mutation (requires the bare grant). The pipe-delimited header, the parser and the dependency shape are exactly today's; the grade is vocabulary, not machinery. Tapestry's precedent is preserved as a *provisioning* pattern: the `tapestry-weavers` group becomes the group that grants the bare `tapestry` entitlement in Authentik, readers get `tapestry:read` via the members group, and the in-app group check retires — one authorisation source where there were two.
- **Workspace administration** (invite, remove, rename, delete) is the membership row's `role`: `owner` or `member`. It must be in-app because the workspace is an in-app noun — Authentik does not know what a workspace is, and a global group cannot say "owner of THIS workspace" once a person belongs to two. Creating a workspace makes the creator its owner; that is the whole bootstrap.

There is no third source. `is_admin` keeps its one legitimate job — estate-wide administration of global reference data (godswood's `document_types` precedent) — and stops standing in for roles it was never shaped for.

## The model

```text
workspaces
  id            int PK
  slug          str UNIQUE          -- machine identifier
  name          str                 -- display, member-editable by owners
  created_at / updated_at           -- TimestampMixin

workspace_memberships
  id            int PK
  workspace_id  int FK workspaces.id  ON DELETE CASCADE
  user_id       int FK users.id       ON DELETE CASCADE
  role          enum('owner','member')
  created_at / updated_at
  UNIQUE (workspace_id, user_id)
```

And on **every workspace-scoped domain table**, via the mixin:

```text
workspace_id    int FK workspaces.id  NOT NULL  ON DELETE RESTRICT  (indexed)
created_by_id   int FK users.id       NULL      ON DELETE SET NULL
```

Four properties are load-bearing:

- `workspace_id` is THE access predicate. A person's id never appears in an access predicate again; `created_by_id` is attribution only, never authorisation.
- `RESTRICT` on the domain rows: deleting a workspace must not silently cascade a financial ledger. This also corrects a live hazard — godswood's 72 existing `users.id` foreign keys are `ondelete="CASCADE"`, so deleting one user row today would destroy the ledger; under the new shape a departed member's rows remain the workspace's and their attribution nulls out.
- Membership is many-to-many: the operator belongs to the household that owns the ledgers and the circle that owns the stories; the cousin belongs only to the circle.
- Membership is an **explicit row, written by an owner** — never derived from an IdP group, an entitlement, or the ability to log in. Two people sharing a proxy is not evidence they share a ledger; sharing is a grant the operator makes, not an inference the app draws (the same posture godswood's rule 79 takes about data provenance). This is why the wife correctly sees an empty personal workspace until the operator grants household membership — the fix is that the grant EXISTS, not that the app guesses.

**Personal workspace auto-provisioning:** the user upsert (which already runs on every authenticated request) creates, in the same transaction on first sight of a user, a personal workspace and an owner membership. Every user therefore always holds at least one membership, resolution never has a zero-membership state, and the org-of-one is the default condition rather than an edge case.

**Writes always land in the ACTIVE workspace.** The primitive has no per-row privacy grade and no write-to-another-workspace path; data a member wants private belongs in their personal workspace, which they already have.

## What the factory ships / what an app fills in

Factory (stamped, byte-identical or shape-gated per the existing parity machinery):

| Artefact | What it is |
| --- | --- |
| `api/workspaces/` slice | `Workspace` + `WorkspaceMembership` models, schemas, service, router (`GET /api/workspaces/me` — the caller's memberships; create workspace; owner-gated membership add/remove and rename), `dependencies.py` (`get_current_workspace`) |
| `db/base.py` | gains the `WorkspaceScoped` mixin |
| `db/scoping.py` | new — session event hooks, `unscoped()` context, the scoping error types |
| `deps.py` | gains the `CurrentWorkspace` alias (this file already invites app aliases; the alias itself is factory prose) |
| `entitlements.py` | new factory file — `require_module(name, *, write=False)`, promoted from godswood per the promote-one-version rule, with the grade added at promotion |
| `backend/tests/test_workspace_scoping.py` | the registry coverage test, the fail-closed test, the two isolation tests |
| `scripts/check-unscoped-baseline.py` + `.unscoped-baseline.json` | baselined count of `unscoped()` call sites, `_skip_if_exists` like the drift/craft baselines |
| `@poodle64/ui` | workspace switcher in the shared shell — renders only when the caller holds more than one membership, labelled by `workspace_label` |
| `frontend/src/lib/api/client.ts` | injects `X-Workspace-Id`; auth store grows `workspaces` / `activeWorkspace` (localStorage-persisted) |
| `copier.yaml` | one new question: `workspace_label` (default `workspace`) |

The app fills in exactly three things: which of ITS models take the mixin (the default answer is all of them), the entries in its exempt list with a reason each, and the label. Nothing else is per-app.

## The dependency and session shape

Resolution is one code path for every surface:

```python
# api/workspaces/dependencies.py (factory)
def get_current_workspace(
    user: CurrentUser,
    session: SessionDep,
    x_workspace_id: Annotated[int | None, Header(alias="x-workspace-id")] = None,
) -> WorkspaceContext:
    memberships = list_memberships(session, user.id)   # always >= 1 (auto-provision)
    if x_workspace_id is not None:
        membership = _match(memberships, x_workspace_id)  # 403 if not a member
    elif len(memberships) == 1:
        membership = memberships[0]
    else:
        raise AmbiguousWorkspaceError(memberships)        # 409 carrying the choices
    session.info["workspace_id"] = membership.workspace_id
    session.info["user_id"] = user.id
    return WorkspaceContext(workspace=membership.workspace, membership=membership)
```

The header is a disambiguator, not a second path: resolution always runs, sole membership needs no header, and an ambiguous request without one is refused with the list rather than silently defaulted — a silent default is how household data lands in a personal workspace. The frontend sets the header on every call once `auth.init()` has loaded memberships. A machine caller on `/mcp` resolves through its actor's linked user identically; an actor serving one workspace (godswood's n8n schedule) pins it in `config/actors.yaml`, which is already the reviewed home for machine-caller identity.

Scoping itself lives in the session, not in service signatures:

```python
# db/base.py (factory)
class WorkspaceScoped:
    """Marks a model as workspace-scoped: workspace_id is THE access predicate."""
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

# db/scoping.py (factory) — the documented SQLAlchemy global-criteria recipe, fail-closed
@event.listens_for(Session, "do_orm_execute")
def _scope_or_refuse(execute_state):
    ws_id = execute_state.session.info.get("workspace_id")
    if ws_id is UNSCOPED:
        return
    if ws_id is None:
        if _statement_touches(execute_state, WorkspaceScoped):
            raise UnscopedQueryError(...)      # every environment, not just tests
        return
    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(
            WorkspaceScoped, lambda cls: cls.workspace_id == ws_id, include_aliases=True
        )
    )

@event.listens_for(Session, "before_flush")
def _stamp_or_refuse(session, flush_context, instances):
    ws_id = session.info.get("workspace_id")
    for obj in session.new:
        if isinstance(obj, WorkspaceScoped):
            if ws_id in (None, UNSCOPED):
                raise UnscopedFlushError(...)
            if obj.workspace_id is None:
                obj.workspace_id = ws_id
                obj.created_by_id = obj.created_by_id or session.info.get("user_id")
            elif obj.workspace_id != ws_id:
                raise CrossWorkspaceWriteError(...)
    # dirty/deleted WorkspaceScoped instances are checked the same way
```

The consequence for services is subtraction, not addition. Today's canonical service (godswood's fixxxer) threads `user_id` through every function and hand-writes the filter in every query; under this shape the parameter and the filter are both deleted — `select(FixxxerItemModel)` is already household-scoped because the session is, relationship and lazy loads included, and writes are stamped with workspace and creator without the service mentioning either. Ownership-validation helpers (`_validate_item_ownership` and its siblings) become redundant: a foreign row is invisible, so the cross-workspace probe gets the same 404 as a nonexistent id, which is also the better answer (a 403 confirms the id exists).

## Enforcement — how a forgotten filter is caught

"Developers will remember" is not an answer in a financial app, and RLS is deferred (next section). The replacement is a stack in which the leak-shaped mistake fails loudly at the first request:

1. **Fail-closed sessions.** An unbound session (a route that forgot `CurrentWorkspace`, a background job that took a bare session) touching a `WorkspaceScoped` model raises `UnscopedQueryError` — in production too. The failure mode of forgetting is an exception, never all-rows.
2. **Automatic criteria.** Where the session IS bound, the filter is injected by the hook — there is no per-query filter to forget, which is the difference between discipline and mechanism.
3. **The registry test.** Factory-stamped: every mapped model is `WorkspaceScoped` or named in the app's exempt list in `db/registry.py` — the file that already enumerates the app's models and is already shape-gated — with a reason per entry (global reference data like godswood's `fc_document_types`; the identity tables themselves). A new model in neither place fails the suite the day it is written.
4. **The baselined escape hatch.** A genuinely cross-workspace operation (a system sweep, an estate-wide admin report) goes through `unscoped()`, greppable and counted against a checked-in baseline exactly like the drift and craft gates — a new unscoped call site is a failing check until it is argued in.
5. **The isolation pair.** Two members of different workspaces see nothing of each other's rows, and two members of the SAME workspace see the same rows. The second test is the one the per-user model could never pass; it is the defect's regression test.

**Residual risk, named:** the hooks see ORM statements. Raw SQL (`text()`) and Core statements carrying no ORM entity bypass them; so does anything reading outside the app (a BI tool on the database). The rule forbids raw SQL against workspace-scoped tables, review enforces it, and the estate's ORM-only convention makes it rare — but it is a known hole, closed mechanically only by RLS, which is exactly what the ratchet below is for.

## Postgres RLS: deferred, with the trigger named

RLS is the textbook layer and the working position defers it; this design agrees, on the estate's own constraint rather than on best practice. With every workspace in practice held by mutually-trusting household members, RLS's entire value — cross-tenant leak prevention below the app — is near zero, while its costs are permanent: transaction-scoped GUC discipline through SQLAlchemy's pool, an alembic-as-owner bypass story, and a test suite connecting as the app role. One maintainer, one server, ~50-user ceiling: that trade is wrong today.

It is recorded as a **ratchet with a named trigger**: adopt RLS the day a workspace admits a member the operator does not household-trust, or the backend becomes reachable by any path other than the proxy. The schema is RLS-ready by construction — one column, one policy per table — and the session hook that already binds the workspace is the single place `SET LOCAL app.workspace_id` lands, so adoption is additive, not a redesign.

## Domain ownership is not tenancy

godswood's `networth` ownership allocations record which LEGAL entity — a trust, an individual, an SMSF — owns what percentage of an asset, effective-dated. That is a fact about the world the workspace records. Tenancy is who may read and write the record. A property owned 100% by one spouse's trust is visible to both members of the household workspace; the trust owns the asset, the household sees the row. The two models share no columns and no code path, no access decision ever reads an ownership allocation, and no ownership row ever carries an access grant. Conflating them is the obvious wrong turn because both say "owner" — one means the tax substrate, the other means who holds the keys.

## Migration paths

Three shapes exist in the fleet; the design adds no fourth. Every path is forward-only, and each app cuts over in one deploy: schema, backfill and constraint tightening land in transactional revisions, so the database is never half-migrated. cadmus, the second consumer, is one of these three shapes — inventory it first, then its path is below.

### (a) Brownfield with per-user scoping and live production data — godswood

Two revisions, one deploy. godswood's database is production with no dev copy, so the revisions are proven against the testcontainer suite (which runs the full chain on every test run) and the nightly backup is verified current before dispatch. Postgres DDL is transactional: each revision lands whole or not at all.

**Revision A — the slice.** Create `workspaces` and `workspace_memberships`; then, for every existing `users` row, insert a personal workspace and an owner membership. This is the auto-provision invariant applied retroactively: after A, every user has exactly one membership.

**Revision B — the sweep (script-generated, hand-reviewed).** For each of the 62 `user_id`-scoped tables, in order: add `workspace_id` nullable; backfill it through the membership join (unambiguous, because A guarantees exactly one membership per user at this moment — B must run before any shared membership exists, which sequencing guarantees since no UI to create one has served a request yet); set NOT NULL, add the RESTRICT FK and index; rename `user_id` to `created_by_id`, replace its CASCADE FK with SET NULL and make it nullable; translate any UNIQUE constraint or index containing `user_id` to `workspace_id`, each translation listed in the revision for review. The generator enumerates the catalogue rather than trusting a hand-written table list. **Pre-flight checkpoint:** enumerate rows with NULL `user_id` in the two nullable-FK tables first — if any exist, whose workspace they belong to is a provenance question the operator settles before the migration, never a default.

**Code sweep, same change set.** Service functions lose their `user_id` scoping parameters and hand-written filters (the session scopes); ownership-validation helpers are deleted; routers swap to `CurrentWorkspace`; the entitlement gates are untouched; test fixtures gain the workspace binding; the MCP context binds the actor's workspace. Response schemas that expose `user_id` are sequenced per the live-consumer rule: the field is served under both names while the n8n schedule and watchers are moved, then the old name is removed — a cutover sequence, not a kept legacy path.

**After the deploy** the app behaves identically to today — every user sees exactly what they saw, because every user is an org-of-one. The fix is then two operator actions in the UI, which is the point (sharing is a grant): rename his personal workspace to the household label, and add his wife as a member. Her auto-provisioned personal workspace remains hers, empty and harmless.

### (b) Brownfield with no ownership columns — tapestry

Prerequisite: the users slice (#288) — tapestry deliberately persists no users today, so upsert-and-auto-provision lands with the slice. Then one revision: create the circle workspace; add `workspace_id NOT NULL DEFAULT <circle-id>` to every domain table and drop the default (a constant default is metadata-only in Postgres 11+, so this is cheap even if the corpus grows); add `created_by_id` as NULL everywhere — historic attribution is honestly unknown. Ownership bootstrap is one factory-shipped command at cutover, the same class of tool as godswood's `db.stamp`: `python -m tapestry.db.grant_membership circle <operator-uid> owner`. The owner adds the rest of the circle in the admin UI. Service signatures do not change at all — they never took identity — and the weaver/reader gate converges onto entitlement grades as described above, additively first.

### (c) Greenfield stamp

Nothing to migrate. The example slice's model ships with the mixin so the first real domain copies the right shape; the first request upserts the user and provisions their workspace; shared workspaces are created in-app, creator as owner.

## What it costs

- **The factory:** the workspaces slice, the scoping module and its hooks, the entitlements promotion with grades, the registry test, the baseline check, the shell switcher and client header, the copier question — and proving the fail-closed behaviour by driving a real violation through it, per the estate's own gate discipline. Three to five focused sessions.
- **godswood:** the largest single change since inception, and it touches every query in the app. 57 model files carry the `users.id` FK (72 columns); essentially every service function in 62 domain slices loses a parameter and a filter; the two-revision migration rewrites 62 tables' columns, constraints and indexes in one deploy against production with no dev database; the ownership helpers, the test fixtures, the MCP context and every schema exposing `user_id` are all touched. The sweep is script-generated but the review is not. Plan multiple sessions and a deliberate deploy window with the image-dispatch dance godswood's own CLAUDE.md records. The compensation is that the result is smaller than the current code: scoping becomes zero lines per service.
- **tapestry:** small. One slice adoption, one stamp revision, one bootstrap command; no service signature changes.
- **Ongoing:** every new model takes the mixin or argues its exemption into the reviewed list; multi-membership users see a switcher (single-membership users never do); machine actors serving one workspace pin it in `actors.yaml`.

## Left to the operator

1. **Approve the noun** (`workspace`, per-app labels) and **the grade vocabulary** — bare `<module>` = read+write was chosen so no existing grant is re-provisioned; the alternative (bare = read, `:write` grants mutation) is safer-by-default but re-provisions every grant in Authentik on cutover day. Either works; the design recommends the first for a household-sized estate.
2. **Schedule godswood's cutover** and settle any NULL-owner rows the pre-flight enumeration finds.
3. **Perform the two grants that realise the fix** after the deploy: rename the household workspace, add the wife's membership.
4. **Enact the rule** (appendix below) through the sunset review — the shared rules pool is deliberately fenced from mid-task writes, so the text ships here ready rather than landed.

---

## Appendix — proposed rule text

### New file: `rules-library/platform/tenancy.md`

```markdown
---
paths:
  - '**/*.{py,ts,svelte,js}'
---

# Tenancy Standard

Design, factory file inventory, migration paths for the three adoption shapes, and cost:
full-stack-app-template `docs/development/tenancy-design.md`. Siblings: `authentication.md`
answers WHO is calling, this rule answers WHOSE DATA is in scope, `proxy-delegated-auth.md`
answers how identity arrives. Factory delivery rides `canonical-app-shape.md` §Shared Domains
Belong to the Factory (tracked with #288).

The defect this closes: the fleet had no noun between "person" and "everyone". Measured
2026-08-20: godswood scopes 62 of ~70 tables to the individual who created each row, so a
second household member signing in through the same SSO sees an empty app; tapestry scopes
nothing, so every caller sees every row. Both are the same missing noun — a set of people
who share a body of data — answered two wrong ways.

## The Noun

- Must call the access boundary a **workspace**, one noun in code across the fleet:
  `workspaces`, `workspace_memberships`, `workspace_id`, `WorkspaceScoped`,
  `CurrentWorkspace`, `X-Workspace-Id`. What a workspace is CALLED in an app's UI is the
  app's own vocabulary (godswood "household", tapestry "circle"), supplied as a copier
  answer and used in frontend copy only — never in code, schemas, columns or headers.
- Must NOT use `tenant` as the code noun. It is live domain vocabulary in the flagship
  consumer — godswood's `lease_agreement` and `owner_statement` schemas mean a real person
  renting a real property — so `tenant_id` on a lease row would read as the renter while
  meaning the household. `account` fails the same test harder in a finance app.
- Must treat a single-member workspace as the same code path as a shared one — an
  org-of-one, never a special case. There is no "personal mode".

## Three Questions, Three Layers

Authentication answers who is calling (proxy headers / `/mcp` bearer). Entitlement answers
whether this ACCOUNT may use module M, and at what grade (Authentik Application
Entitlements). Tenancy answers whose data is in scope (workspace membership, in-app rows).
Each question has exactly one answering layer.

- Must keep module entitlement per ACCOUNT, exactly as it is today — licensing, not
  scoping; it does not vary by workspace. What a member sees is the intersection: a module
  they are entitled to, showing rows of the workspace they are in.
- Must express the per-module read/write split as an entitlement GRADE, provisioned in the
  IdP: a bare `<module>` key grants read and write (the unchanged meaning of every existing
  grant); `<module>:read` grants read only. `require_module(<module>)` gates read;
  `require_module(<module>, write=True)` gates mutation and requires the bare grant.
- Must NOT add a third role source. Workspace administration (invite, remove, rename) is
  the membership row's `role` (`owner`/`member`); module read/write is the entitlement
  grade; there is nothing else. An IdP group survives as what GRANTS an entitlement in
  Authentik (tapestry's `tapestry-weavers` grants the bare `tapestry` key), never as a
  second in-app authorisation check.

## The Model

- Must give every stamped app `workspaces` and `workspace_memberships(workspace_id,
  user_id, role)` from the factory, membership many-to-many, UNIQUE per (workspace, user).
- Must scope every domain row by `workspace_id` — THE access predicate, NOT NULL,
  `ondelete="RESTRICT"`. A person's id never appears in an access predicate again.
- Must keep `created_by_id` (nullable, `ondelete="SET NULL"`) for attribution only, never
  authorisation. A departed member's rows remain the workspace's; a deleted user must not
  cascade a ledger away.
- Must auto-provision a personal workspace (owner membership) in the same transaction as
  the user upsert, so every user always holds at least one membership.
- Must make membership an explicit row, written by an owner — never derived from an IdP
  group, an entitlement, or the ability to log in. Sharing is a grant, not an inference.
- Must write a new row to the ACTIVE workspace, always. The primitive has no per-row
  privacy grade and no write-to-another-workspace path; data a member wants private
  belongs in their personal workspace.

## Enforcement — a forgotten filter must be impossible, not remembered

Postgres RLS is deferred (below); what replaces it is fail-closed scoping in the session
itself, so scoping is not a per-query discipline any developer or agent can forget.

- Must mark every workspace-scoped model with the factory's `WorkspaceScoped` mixin.
- Must bind the session to the resolved workspace (the `CurrentWorkspace` dependency) and
  inject the workspace criterion into every ORM statement against a `WorkspaceScoped`
  model from the factory's session hooks — services never write the filter by hand, and
  never take a caller id parameter for scoping.
- Must FAIL CLOSED: an unbound session executing a statement that touches a
  `WorkspaceScoped` model raises, in every environment — never returns all rows.
- Must guard the flush the same way: new scoped instances are stamped with the session's
  workspace and creator; a mismatched instance, or any scoped flush on an unbound
  session, raises.
- Must prove coverage with the factory's registry test: every mapped model is
  `WorkspaceScoped` or named, with a reason, in the app's exempt list in `db/registry.py`
  (already shape-gated). A model in neither place fails the suite.
- Must route a legitimately cross-workspace operation through the explicit `unscoped()`
  context, each use reasoned and counted against a checked-in baseline — the same
  baselined-debt discipline as the drift and craft gates.
- Must NOT run raw SQL (`text()`, Core statements without ORM entities) against a
  workspace-scoped table — the hooks cannot see it; it is the guard's one named hole,
  closed mechanically only by RLS.
- Must test isolation between two members of DIFFERENT workspaces, and visibility between
  two members of the SAME one — the second test is the defect's regression test.

## Domain Ownership Is Not Tenancy

godswood's `networth` ownership allocations record which LEGAL entity owns what percentage
of an asset. That is a fact about the world the workspace records; tenancy is who may read
and write the record.

- Must NOT derive an access decision from domain ownership rows, and must NOT store access
  grants in them. The two models share no columns and no code path.

## Postgres RLS — deferred, with the trigger named

Deliberately not adopted: with every workspace held by mutually-trusting household members
its value is near zero, while it costs transaction-scoped GUC discipline through
SQLAlchemy's pool, an alembic-as-owner bypass story, and a test suite connecting as the
app role.

- Must adopt RLS as a ratchet the day either trigger fires: a workspace admits a member
  the operator does not household-trust, or the backend becomes reachable by any path
  other than the proxy. The schema is RLS-ready by construction; the session hook that
  binds the workspace is where `SET LOCAL app.workspace_id` lands, so adoption is
  additive, not a redesign.

## Adoption

- Must take the workspaces slice from the factory once it ships; an app that already
  scopes another way is **migrating, not in breach**, and must NOT build a local variant,
  a compatibility shim, or a second scoping mechanism in the meantime.
- Must migrate forward-only and in one deploy per app: schema, backfill and constraint
  tightening in transactional revisions, per the design doc's migration paths.

## Not in scope

Authentication tiers and header mechanics (`authentication.md`,
`proxy-delegated-auth.md`); machine-caller identity (`fleet/identity.md`,
`strategy-api-keys.md`); how legal-entity ownership is modelled (domain code).
```

### Amendment: `rules-library/platform/proxy-delegated-auth.md`

Its §Multi-Tenant Data Isolation currently mandates the defect (`user_id` on every
user-owned table as the access predicate, filtered in every query). Replace the section:

```markdown
## Data Isolation

Data scoping is the tenancy standard's job (`platform/tenancy.md`): the access predicate
on a domain row is `workspace_id`, never a person's id. An app not yet migrated is
governed by that rule's adoption clause. What belongs to THIS rule is how identity feeds
it:

- Must derive the caller's user row from the upsert, never directly from the header value
- Must resolve the workspace from that user's memberships; a person is not a tenant
- Must return the same 404 for a cross-workspace id as for a nonexistent one — a 403
  confirms the id exists
- Must test isolation between members of different workspaces
```

### Amendment: `rules-library/platform/authentication.md`

Extend the line "Authorisation (RBAC, permissions) is a separate concern riding on the
authenticated identity." with: "Data scoping and roles: `platform/tenancy.md`."
