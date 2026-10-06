# Tenancy — the workspace primitive

Status: **landed end to end, 03/09/2026.** The backend primitive shipped 20/08/2026 (`ef6cdd6`), the rule text is in `rules-library/platform/tenancy.md`, and the frontend half — the workspace menu, the chooser, the members surface, the client header and the auth store — shipped in 2026.9.5, driven with two signed-in identities against a stamped app rather than asserted. What remains is not factory work: the apps that predate the slice adopt it on the migration paths below, and §Adopting the surface says what each already-adopted app takes. Two decisions in this document were reversed while landing the frontend and are recorded where they sit: there is no `workspace_label` copier question, and there is no `unscoped()` baseline gate.

**Three decisions were settled by the master session on 20/08/2026, as SME calls rather than operator approval.** The operator's own outstanding decision is the flagship app's cutover window, and nothing below pre-empts it.

1. **The noun is `workspace`, and the flagship app's renter-`tenant` does NOT get renamed to make room for the industry term.** The operator asked whether it should. In Queensland the statutory party to a residential tenancy agreement IS the "tenant" (Residential Tenancies and Rooming Accommodation Act 2008); "renter" is Victorian statutory language, adopted there in 2021. Renaming the flagship app's domain term would import the wrong jurisdiction's word into a Queensland property portfolio in order to free up an infrastructure noun — domain vocabulary wins, and the infrastructure noun is the one free to move. Recognisability is bought back by naming `tenant` in the rule as the industry term for what `workspace` implements, so anyone searching for multi-tenancy finds it.

2. **Entitlement grades are default-deny: bare `<module>` = READ, `<module>:write` = mutation.** This reverses §Left to the operator's recommendation. The deciding fact is measured, not philosophical: `require_module` passes admins unconditionally in the flagship app (`entitlements.py:51`) and the first user is auto-admin, so the operator is unaffected by the default either way. The only accounts a re-provisioning touches are non-admin ones — i.e. the second household member who cannot use the app at all today. The "no existing grant is re-provisioned" convenience is therefore worth close to nothing, while bare=write means a forgotten `:read` silently grants ledger write. The ~16 keys are an authentik-MCP provisioning task, not an operator afternoon.

3. **`is_admin` does not bypass module gates, and there is no first-user-becomes-admin bootstrap.** The flagship app has both. The first is what turns `is_admin` into the super-role every authorisation question ends up asking; the second makes whichever caller reaches a fresh database first an admin, and a machine caller can be first. Both are behaviour changes the flagship app must sequence deliberately rather than discover.

### Three corrections to this document, from building it

- **The table count was wrong, and the wrong way.** "62 of ~70" is measured, at the flagship app `135b1bf9`, as **103 tables, 81 carrying an ownership column, 22 without**. Five of the 81 (`travel_stays`, `travel_transfers`, `travel_activities`, `travel_hires`, `travel_passes`) do not declare `user_id` in their own class body at all — they inherit it from a mixin via `declared_attr` (`api/travel/components/models.py:34-36`). A generator reading source text misses them and they silently keep a user-scoped column after the sweep. The factory's own `_touches_scoped_model` reads SQLAlchemy's mapper metadata (`ORMExecuteState.all_mappers`) for exactly this reason; the flagship app's migration generator must do the same.

- **The registry test needed a third answer, and giving it one was wrong.** Of the 22 tables with no ownership column only ~11 are genuinely global reference data; the rest are CHILD rows reached through a parent FK (`groceries_purchase_lines`, `networth_account_balances`, `pipeline_events`, `superannuation_statement_figures`…). A child row fits neither bucket honestly: `with_loader_criteria` cannot see a model without the mixin, so a bare `select(ChildRow)` returns every workspace's rows, and exempting it with "reached only via a scoped parent" is a discipline claim inside a design whose thesis is that discipline does not work. **Child rows take the mixin**, `workspace_id` denormalised down — one column and one index each, mechanical coverage everywhere, and the RLS ratchet becomes a pure add. `db/registry.py`'s comment says so and the registry test enforces it.

- **`CurrentIdentity` and `CurrentWorkspace` cannot live in `deps.py`.** §What the factory ships puts them there; that is a genuine import cycle (`deps` imports the workspaces slice, the slice imports `deps`) which resolves or fails depending on which module Python reaches first. They are defined in their own slices and `deps.py` imports and re-exports them, so routes keep one import point while the graph flows one way.

- **Auto-provisioning does NOT need a machine-caller carve-out** — an earlier reading of the flagship app's #701 said it did. A just-in-time user row is inert: no entitlements (nothing is persisted; they arrive per request), no admin, and only its own empty personal workspace. That matches #701's own measured blast radius — two phantom rows owning zero rows. It is a hygiene problem, not a leak, and caller-classification machinery to prevent it would be an unrequested control. The factory logs the creation at WARNING naming the uid, and drops the first-user-admin rule, which was the part that was genuinely hazardous.

## The missing noun

The factory has no concept between "person" and "everyone", and the fleet answered the gap both wrong ways at once. the flagship app scopes 81 of its 103 tables to the individual who created each row (`user_id` as the access predicate, filtered in every service function — measured from mapper metadata at the flagship app 135b1bf9, 20/08/2026), so the operator's wife signs in through the same SSO and sees an empty app — the app defines "person" as "tenant", and a second person in the same household reads as a second, empty tenant. tapestry scopes nothing — `list_subjects(session)` returns every row to every caller — which is only correct while everyone the proxy admits belongs to one circle, and makes its data model irreconcilable with the flagship app's the day it becomes a module there.

Both are one missing noun: **a set of people who share a body of data**. The primitive is that noun, shipped by the factory so every stamped app inherits it and no app answers the question locally again.

## The noun is `workspace`

One noun in code across the fleet: `workspaces`, `workspace_memberships`, `workspace_id`, `WorkspaceScoped`, `CurrentWorkspace`, `X-Workspace-Id`. What an app CALLS a workspace is its own vocabulary — the flagship app says "household", tapestry says "circle" — passed as the `label` prop where the app mounts the factory's menu and members surface, and used in frontend copy only, never in code, columns, schemas or headers. (The copier question this sentence once named was not added; see §What the factory ships.)

The industry noun `tenant` was the working position and is rejected on measured evidence, not taste: it is live **domain** vocabulary in the flagship consumer. the flagship app's `lease_agreement` and `owner_statement` extraction schemas mean a real person renting a real property, "tenancy" is a statutory term in the same module's documents (residential tenancy agreements are a document type it files), and one service comment already uses "tenant boundary" in the access sense two files away from schemas using "tenant" in the renter sense. A `tenant_id` column on a lease row would read as the renter while meaning the household — a permanent ambiguity in the app where a scoping mistake costs the most. `account` fails the same test harder (a wealth platform is made of accounts), `household` and `circle` are per-app labels and would smuggle one app's flavour into the shared layer, and `workspace` was checked against every backend in the fleet on 20/08/2026: zero collisions, and it is the recognised noun for exactly this boundary (Slack, Notion, Linear).

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

The estate already runs two role sources: tapestry gates its writer on an IdP group (`tapestry-weavers`), the flagship app has only an estate-wide `is_admin`. This design deliberately picks **neither a new in-app role table nor a per-app group check**, because the two role questions are different questions:

- **Per-module read/write** is an entitlement GRADE, provisioned in the IdP on the existing rail: a bare `<module>` key grants READ, and `<module>:write` grants mutation. `require_module("property")` gates read; `require_module("property", write=True)` gates mutation and requires the `:write` grant. (Settled default-deny — decision 2 above; this paragraph originally proposed the inverse.) The pipe-delimited header, the parser and the dependency shape are exactly today's; the grade is vocabulary, not machinery. Tapestry's precedent is preserved as a *provisioning* pattern: the `tapestry-weavers` group becomes the group that grants the bare `tapestry` entitlement in Authentik, readers get `tapestry:read` via the members group, and the in-app group check retires — one authorisation source where there were two.
- **The people list (`require_app_module`) is for accounts holding a non-room entitlement, and an account holding none is refused.** It lists every active user's id and name across all workspaces, plus the ids a member grant needs, so an account the identity provider admitted without a grant (an invited reviewer, a proxy forwarding no entitlements header) must not reach it. An app whose people carry no module grants binds each person who should use the picker one non-room entitlement at the identity provider (a group-bound `<app>` entitlement; earworm's household members are the case). That is provisioning, on the rail entitlements already use, and no factory code changes. The admin area keeps its own gate (`require_module("admin")`).
- **Workspace administration** (invite, remove, rename, delete) is the membership row's `role`: `owner` or `member`. It must be in-app because the workspace is an in-app noun — Authentik does not know what a workspace is, and a global group cannot say "owner of THIS workspace" once a person belongs to two. Creating a workspace makes the creator its owner; that is the whole bootstrap.

There is no third source. `is_admin` keeps its one legitimate job — estate-wide administration of global reference data (the flagship app's `document_types` precedent) — and stops standing in for roles it was never shaped for.

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
- `RESTRICT` on the domain rows: deleting a workspace must not silently cascade a financial ledger. This also corrects a live hazard — all 80 of the flagship app's existing `users.id` foreign keys are `ondelete="CASCADE"` (measured: the histogram has exactly one entry), so deleting one user row today would destroy the ledger; under the new shape a departed member's rows remain the workspace's and their attribution nulls out.
- Membership is many-to-many: the operator belongs to the household that owns the ledgers and the circle that owns the stories; the cousin belongs only to the circle.
- Membership is an **explicit row, written by an owner** — never derived from an IdP group, an entitlement, or the ability to log in. Two people sharing a proxy is not evidence they share a ledger; sharing is a grant the operator makes, not an inference the app draws (the same posture the flagship app's rule 79 takes about data provenance). This is why the wife correctly sees an empty personal workspace until the operator grants household membership — the fix is that the grant EXISTS, not that the app guesses.

**Personal workspace auto-provisioning:** the user upsert (which already runs on every authenticated request) creates, in the same transaction on first sight of a user, a personal workspace and an owner membership. Every user therefore always holds at least one membership, resolution never has a zero-membership state, and the org-of-one is the default condition rather than an edge case. It carries no machine-caller carve-out, for the reasons in the corrections above; refusing a machine principal is an app's own business where a tracked defect asks for it, and the flagship app does it in `deps.py` under #701 without the factory needing to know.

**Writes always land in the ACTIVE workspace.** The primitive has no per-row privacy grade and no write-to-another-workspace path; data a member wants private belongs in their personal workspace, which they already have.

## What takes the mixin — four categories, not two

The registry test offers two buckets: `WorkspaceScoped`, or exempt with a reason. Measured against the flagship app's 103 tables (mapper metadata, 20/08/2026), a third and a fourth exist, and each breaks a different half of the thesis.

| Category | Count | Treatment |
| --- | --- | --- |
| Already scoped per user | 79 | `WorkspaceScoped`; `user_id` becomes `created_by_id` |
| Child rows, reached only through a parent FK | 10 | `WorkspaceScoped` too — denormalised, see below |
| Shared reference with a per-workspace override | 2 | `SharedReference` — nullable `workspace_id`, OR-criterion |
| Genuinely global reference and identity | 12 | Exempt, with a reason each |

That is 89 tables taking the mixin, 2 taking a second marker, 12 exempt. The 81/22 split in the corrections above resolves as 79 + 2 and 10 + 12.

### Child rows cannot be exempted honestly

Ten tables carry no ownership column and are reached transitively through a parent that does: `groceries_purchase_lines`, `networth_account_balances`, `networth_ownership_allocations`, `pipeline_events`, `property_execution_links`, `property_inspection_action_items`, `property_manager_assignments`, `property_refinance_delivery_documents`, `property_transaction_attachments`, `superannuation_statement_figures`.

Neither bucket fits. `with_loader_criteria` cannot see them — no mixin, so no criterion is injected — and a bare `select(PurchaseLine)` therefore returns every workspace's rows. Exempting them as "reached only via a scoped parent" is a *discipline* claim inside a design whose entire thesis is that discipline does not work; the exemption would be a promise that no query ever starts at the child, which is exactly the promise the fail-closed hooks exist to stop anyone having to make.

So child rows take the mixin too, `workspace_id` denormalised down: one column and one index per child table, mechanical coverage everywhere, and the exempt list shrinks to tables that are actually global. The denormalisation is also what makes the RLS ratchet a pure add rather than a redesign — a policy needs the column on the row it protects. The cost is that a child's `workspace_id` must agree with its parent's; the flush hook already refuses a cross-workspace write, so the disagreement is caught where it is made rather than discovered later.

### Shared reference is the category that fails silently

Two tables use a **nullable** ownership column to mean something the design has no room for: `networth_account_types` (11 rows, all NULL) and `property_categories` (22 rows, all NULL). NULL there does not mean "owner unknown" — it means **global row, visible to everyone**, with a non-NULL row being one user's private addition to the same taxonomy. Both models say so in their own docstrings, and `get_categories` reads `WHERE user_id IS NULL OR user_id = :user`.

Give those tables the plain mixin and the enforcement stack does the wrong thing perfectly quietly. `workspace_id NOT NULL` cannot express the global row at all, and the injected criterion `workspace_id == :ws` matches none of them — so every caller in every workspace loses the entire ATO rental-expense taxonomy the property P&L is built on, and the net-worth account types with it. Nothing raises. The fail-closed hooks protect against a *leak*; this is the opposite failure, over-filtering, and they are blind to it by construction.

They need their own marker — `SharedReference`: `workspace_id` **nullable**, criterion `workspace_id == :ws OR workspace_id IS NULL`, and a flush rule that only an admin may write a NULL (a global row is estate-wide reference data, the one job `is_admin` keeps). It is a small addition and it belongs in the factory rather than in the flagship app, because "seeded taxonomy plus per-tenant additions" is a shape any stamped app grows.

**The alternative — split each table into a global one and a scoped one — was weighed and rejected on measured grounds.** It is the more orthodox answer, and its objection to this one is real: a nullable access predicate is a visibility rule you have to know to read. But that objection lands on making `WorkspaceScoped.workspace_id` nullable, which is not what is proposed; a distinct marker STATES the rule in the model's own declaration and the registry test enforces three stated buckets exactly as mechanically as it enforces two. Against that, both tables are foreign-key targets:

| Referencing column | Nullable | On delete |
| --- | --- | --- |
| `property_transactions.category_id` | yes | `SET NULL` |
| `networth_accounts.account_type_id` | **no** | `RESTRICT` |

A split leaves each referencing row unable to name its parent with one foreign key. The choices are two nullable FK columns plus a CHECK that exactly one is populated — doubling the join on every read of a transaction's category — or dropping the constraint for a bare integer and a discriminator, which removes referential integrity from a financial ledger. `networth_accounts.account_type_id` is NOT NULL today; a split demotes that database-enforced invariant to a check constraint. One nullable column on a reference table is a smaller price than either.

`fc_document_types` is sometimes cited as the precedent for splitting. It is not: it has no ownership column at all and never had a per-user half, so it is a worked example of the *exempt* bucket, not of a mixed table being separated. Nothing in the estate has yet split one.

The general lesson for the registry test: a table's category is not readable from whether it has an ownership column. Two of the flagship app's 81 "scoped" tables are not scoped at all, and no schema fact distinguishes them — only the nullability, and what the app means by it.

### How the generator must enumerate

The sweep generator reads the **SQLAlchemy mapper metadata**, and there are two misses in opposite directions, so neither view alone is sufficient:

- **Source text misses inherited columns** — the five travel tables inheriting `user_id` from a mixin via `declared_attr`, recorded in the corrections above.
- **Foreign keys alone miss unconstrained columns.** `audit_logs.user_id` is a bare `INTEGER` with no foreign key at all, so an FK-driven metadata sweep does not see it — while a source-text sweep does. That single table is the whole difference between 80 and 81: eighty tables carry a `users.id` foreign key, an eighty-first carries the column without one.

Enumerate the column *and* its constraints from the mapper registry, and reconcile the two answers rather than trusting either. A sweep that disagrees with itself by one table will miss the next one silently.

## What the factory ships / what an app fills in

Factory (stamped, byte-identical or shape-gated per the existing parity machinery):

| Artefact | What it is |
| --- | --- |
| `api/workspaces/` slice | `Workspace` + `WorkspaceMembership` models, schemas, service, router (`GET /api/workspaces/me` — the caller's memberships; create workspace; owner-gated membership add/remove and rename), `dependencies.py` (`get_current_workspace`) |
| `db/base.py` | gains the `WorkspaceScoped` mixin |
| `db/scoping.py` | new — session event hooks, `unscoped()` context, the scoping error types |
| `deps.py` | gains the `CurrentWorkspace` alias (this file already invites app aliases; the alias itself is factory prose) |
| `entitlements.py` | new factory file — `require_module(name, *, write=False)`, promoted from the flagship app per the promote-one-version rule, with the grade added at promotion |
| `backend/tests/test_workspace_scoping.py` | the registry coverage test, the fail-closed test, the two isolation tests |
| `api/workspaces/router.py` | also `GET /api/workspaces/{id}/members` — who shares a workspace, readable by any member; `api/users/router.py` gains `GET /api/users/`, the three-field summary of people the app has seen that an owner grants from |
| `frontend/src/lib/workspaces/` | `WorkspaceMenu` (the shell's `context` slot: the active workspace's name; the switch, as a radio group, once there are two; Members; New workspace; Sign out), `WorkspaceChooser` (rendered instead of a page while several are held and none chosen), `WorkspaceMembers` (list with roles; owner-only add from the people picker, remove with confirmation, rename). Factory-owned and parity-gated; the app mounts them in its own layout and `/workspace` route, and passes `label="Household"` there if it calls a workspace something else |
| `frontend/src/lib/api/client.ts` | injects `X-Workspace-Id`; the auth store grows `workspaces` / `activeWorkspace` / `needsWorkspaceChoice` / `activeRole` / `refreshWorkspaces()`. Only an EXPLICIT choice is remembered in localStorage — selecting a sole membership is not a choice, so the day a second arrives the next load asks |
| `frontend/tests/e2e/workspaces.spec.ts` | the factory's own drive: a second identity grants a seat, the chooser is chosen from, the request that follows carries the header, the grant is made and retracted from the screen. The scaffold's `example.spec.ts` carries the data-isolation half on `example_items` |
| No `unscoped()` baseline | DROPPED. `db/scoping.py`'s docstring records it: nothing counts the call sites and review is by eye, which is stated rather than a gate claimed and never built |
| No `workspace_label` question | DROPPED. The label is a prop on the two app-owned mount points, so an app that says "Household" changes a word in its own layout and route; nine apps answering one more prompt, seven of them with the default, was the wrong trade |

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

The header is a disambiguator, not a second path: resolution always runs, sole membership needs no header, and an ambiguous request without one is refused with the list rather than silently defaulted — a silent default is how household data lands in a personal workspace. The frontend sets the header on every call once `auth.init()` has loaded memberships. A machine caller on `/mcp` resolves through its actor's linked user identically; an actor serving one workspace (the flagship app's n8n schedule) pins it in `config/actors.yaml`, which is already the reviewed home for machine-caller identity.

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

The consequence for services is subtraction, not addition. Today's canonical service (the flagship app's fixxxer) threads `user_id` through every function and hand-writes the filter in every query; under this shape the parameter and the filter are both deleted — `select(FixxxerItemModel)` is already household-scoped because the session is, relationship and lazy loads included, and writes are stamped with workspace and creator without the service mentioning either. Ownership-validation helpers (`_validate_item_ownership` and its siblings) become redundant: a foreign row is invisible, so the cross-workspace probe gets the same 404 as a nonexistent id, which is also the better answer (a 403 confirms the id exists).

## Enforcement — how a forgotten filter is caught

"Developers will remember" is not an answer in a financial app, and RLS is deferred (next section). The replacement is a stack in which the leak-shaped mistake fails loudly at the first request:

1. **Fail-closed sessions.** An unbound session (a route that forgot `CurrentWorkspace`, a background job that took a bare session) touching a `WorkspaceScoped` model raises `UnscopedQueryError` — in production too. The failure mode of forgetting is an exception, never all-rows.
2. **Automatic criteria.** Where the session IS bound, the filter is injected by the hook — there is no per-query filter to forget, which is the difference between discipline and mechanism.
3. **The registry test.** Factory-stamped: every mapped model is `WorkspaceScoped` or named in the app's exempt list in `db/registry.py` — the file that already enumerates the app's models and is already shape-gated — with a reason per entry (global reference data like the flagship app's `fc_document_types`; the identity tables themselves). A new model in neither place fails the suite the day it is written.
4. **The baselined escape hatch.** A genuinely cross-workspace operation (a system sweep, an estate-wide admin report) goes through `unscoped()`, greppable and counted against a checked-in baseline exactly like the drift and craft gates — a new unscoped call site is a failing check until it is argued in.
5. **The isolation pair.** Two members of different workspaces see nothing of each other's rows, and two members of the SAME workspace see the same rows. The second test is the one the per-user model could never pass; it is the defect's regression test.

**Residual risk, named:** the hooks see ORM statements. Raw SQL (`text()`) and Core statements carrying no ORM entity bypass them; so does anything reading outside the app (a BI tool on the database). The rule forbids raw SQL against workspace-scoped tables, review enforces it, and the estate's ORM-only convention makes it rare — but it is a known hole, closed mechanically only by RLS, which is exactly what the ratchet below is for.

## Postgres RLS: deferred, with the trigger named

RLS is the textbook layer and the working position defers it; this design agrees, on the estate's own constraint rather than on best practice. With every workspace in practice held by mutually-trusting household members, RLS's entire value — cross-tenant leak prevention below the app — is near zero, while its costs are permanent: transaction-scoped GUC discipline through SQLAlchemy's pool, an alembic-as-owner bypass story, and a test suite connecting as the app role. One maintainer, one server, ~50-user ceiling: that trade is wrong today.

It is recorded as a **ratchet with a named trigger**: adopt RLS the day a workspace admits a member the operator does not household-trust, or the backend becomes reachable by any path other than the proxy. The schema is RLS-ready by construction — one column, one policy per table — and the session hook that already binds the workspace is the single place `SET LOCAL app.workspace_id` lands, so adoption is additive, not a redesign.

## Domain ownership is not tenancy

the flagship app's `networth` ownership allocations record which LEGAL entity — a trust, an individual, an SMSF — owns what percentage of an asset, effective-dated. That is a fact about the world the workspace records. Tenancy is who may read and write the record. A property owned 100% by one spouse's trust is visible to both members of the household workspace; the trust owns the asset, the household sees the row. The two models share no columns and no code path, no access decision ever reads an ownership allocation, and no ownership row ever carries an access grant. Conflating them is the obvious wrong turn because both say "owner" — one means the tax substrate, the other means who holds the keys.

## Migration paths

Three shapes exist in the fleet; the design adds no fourth. Every path is forward-only, and each app cuts over in one deploy: schema, backfill and constraint tightening land in transactional revisions, so the database is never half-migrated. cadmus, the second consumer, is one of these three shapes — inventory it first, then its path is below.

### (a) Brownfield with per-user scoping and live production data — the flagship app

Two revisions, one deploy. the flagship app's database is production with no dev copy, so the revisions are proven against the testcontainer suite (which runs the full chain on every test run) and the nightly backup is verified current before dispatch. Postgres DDL is transactional: each revision lands whole or not at all.

**Take the template catch-up FIRST, as its own deploy.** the flagship app's `.copier-answers.yml` records `_commit: v2026.8.13`; the template is already two releases past that and, at the time of writing, 47 commits past its newest tag. So `copier update` at the cutover is not a tenancy step — it lands two releases of convergence work at the same moment as a migration that rewrites every query in the app, against a production database with no dev copy. Split them: take the `copier update`, get its gates green and deploy it on its own, then run the tenancy migration as the second deploy. Neither change is easier to review inside the other, and a failure in the combined deploy would not say which half caused it.

The tag is a step inside that first deploy rather than a separate decision: the template is deliberately untagged, `copier` resolves by latest tag, and a convergence-copy from an untagged tip would leave `_commit` naming a release that does not contain the code — every later parity run then measures against the wrong baseline and reports drift that is not drift.

**Revision A — the slice.** Create `workspaces` and `workspace_memberships`; then, for every existing `users` row, insert a personal workspace and an owner membership. This is the auto-provision invariant applied retroactively: after A, every user has exactly one membership.

**Revision B — the sweep (script-generated, hand-reviewed).** For each of the 89 tables that take the mixin, in order: add `workspace_id` nullable; backfill it through the membership join (unambiguous, because A guarantees exactly one membership per user at this moment — B must run before any shared membership exists, which sequencing guarantees since no UI to create one has served a request yet); set NOT NULL, add the RESTRICT FK and index; rename `user_id` to `created_by_id`, replace its CASCADE FK with SET NULL and make it nullable; translate any UNIQUE constraint or index containing `user_id` to `workspace_id`, each translation listed in the revision for review. **The generator's one trap, and it is exactly one table wide.** It reads the SQLAlchemy mapper metadata, and it must enumerate on the COLUMN and on its CONSTRAINTS, then reconcile the two answers. In the flagship app the two views disagree by one: 80 tables carry a `users.id` foreign key, and `audit_logs.user_id` carries the column as a bare `INTEGER` with no constraint at all, so an FK-driven sweep sees 80 and a column sweep sees 81. In the other direction, five travel tables declare no `user_id` in their class body — they inherit it from a mixin via `declared_attr` — so a sweep over source text misses all five and they keep a user-scoped column after a run that reports success (§How the generator must enumerate).

A one-table disagreement is the dangerous size: too small to look like a bug, and a sweep that quietly disagrees with itself by one table will miss the next one the same way. The generator should assert the two counts against each other and refuse to emit a revision when they differ without a named reason, rather than report whichever number it happened to compute.

**Pre-flight checkpoint — run 20/08/2026, and it found no question to ask.** The five nullable ownership columns (not two: `loans`, `networth_account_types`, `property_categories`, `property_leases`, `property_valuations`) were counted against production. `loans` (9 rows), `property_valuations` (6) and `audit_logs` (1) hold zero NULLs; `property_leases` is empty; their columns tighten to NOT NULL with no decision to make. `networth_account_types` (11 of 11 NULL) and `property_categories` (22 of 22 NULL) are not orphans at all — every row is NULL, because in those two tables NULL *means* something, which is the fourth category below.

**Lazy seeding must move off the read path.** `CategoryService.get_categories` calls `seed_defaults` on every read and writes the 22 global rows when it finds none — a request-bound session minting global reference data as a side effect of a GET. Under `SharedReference` a bound session cannot mint a global row (a new row is stamped into the caller's workspace instead), so on any empty database the seed would silently produce one workspace's private taxonomy rather than the estate's. Production is unaffected — the rows already exist, so the guard short-circuits — but every fresh testcontainer run starts empty and hits it, which is where it will be found. The seed belongs in a migration or an `unscoped()` admin command, not in a read.

**Code sweep, same change set.** Service functions lose their `user_id` scoping parameters and hand-written filters (the session scopes); ownership-validation helpers are deleted; routers swap to `CurrentWorkspace`; the entitlement gates are untouched; test fixtures gain the workspace binding; the MCP context binds the actor's workspace. Response schemas that expose `user_id` are sequenced per the live-consumer rule: the field is served under both names while the n8n schedule and watchers are moved, then the old name is removed — a cutover sequence, not a kept legacy path.

**After the deploy** the app behaves identically to today — every user sees exactly what they saw, because every user is an org-of-one. The fix is then two operator actions in the UI, which is the point (sharing is a grant): rename his personal workspace to the household label, and add his wife as a member. Her auto-provisioned personal workspace remains hers, empty and harmless.

### (b) Brownfield with no ownership columns — tapestry

Prerequisite: the users slice (#288) — tapestry deliberately persists no users today, so upsert-and-auto-provision lands with the slice. Then one revision: create the circle workspace; add `workspace_id NOT NULL DEFAULT <circle-id>` to every domain table and drop the default (a constant default is metadata-only in Postgres 11+, so this is cheap even if the corpus grows); add `created_by_id` as NULL everywhere — historic attribution is honestly unknown. Ownership bootstrap is one factory-shipped command at cutover, the same class of tool as the flagship app's `db.stamp`: `python -m tapestry.db.grant_membership circle <operator-uid> owner`. The owner adds the rest of the circle in the admin UI. Service signatures do not change at all — they never took identity — and the weaver/reader gate converges onto entitlement grades as described above, additively first.

### (c) Greenfield stamp

Nothing to migrate. The example slice's model ships with the mixin so the first real domain copies the right shape; the first request upserts the user and provisions their workspace; shared workspaces are created in-app, creator as owner.

## Adopting the surface — what a stamped app does

Measured across the nine stamped apps on 03/09/2026, from their code, not their docs.

- **A fresh stamp** does nothing: the menu is in its layout, the members route exists, the E2E drives both.
- **An app already carrying the slice** (four do: eight, casefile, earworm, mission-command) takes the changed factory files in the ordinary convergence sweep — `api/workspaces/{models,service,schemas,router}.py`, `api/users/{service,schemas,router}.py`, `src/lib/auth.svelte.ts` and its test, `src/lib/workspaces/`, `tests/e2e/workspaces.spec.ts`, `playwright.config.ts`, `stylelint.config.js` — regenerates `schema.d.ts`, and then edits the two files it owns: mount `<WorkspaceMenu />` in the shell's `context` snippet of its `+layout.svelte` (gating children on `auth.isLoading`, the chooser, and the `{#key}` remount as the stamped layout does), and add a `routes/workspace/+page.svelte` mounting `<WorkspaceMembers />` under a `PageHeader`. Pass `label` to both if the app's word is not "workspace". Half a session each; the domain models are untouched.
- **An app that hand-rolled tenancy** pays the migration paths above before any of this applies, and the surface is the cheap part:
  - **the flagship app** — `users.id` is still an autoincrement integer, 69 of 79 model files carry `user_id`, and its services filter `WHERE user_id = :user_id` throughout (`api/loans/service.py` is representative). No alembic revision has yet begun the move. This is path (a): the users table re-keyed to UUID, the two-revision sweep over 89 tables, every service losing a parameter, then the surface. Multiple sessions and a deliberate deploy window, exactly as §What it costs has always said; tracked as the flagship app's #715.
  - **cadmus** — hand-rolled a UUID-keyed `users` table on its own base model, no workspaces slice, no scoping hooks; every model is classified in `WORKSPACE_EXEMPT` with a reason, its per-person leave and education surfaces argued personal-subject. Taking the factory's `api/users/` and `api/workspaces/` means reconciling one users table with another of the same key type — a small revision — after which the shared tables it does have take the mixin. One to two sessions.
  - **pebblestone, portcullis, library** carry no `users` table at all; each has recorded, in its own `.canonical-exceptions`, why its process holds one body of data. They are not adopting this surface and the rule's adoption clause covers them.

Nothing here is coordinated: the factory change is inert for an app until that app takes it, so it lands on its own, and each adoption is its own change on its own schedule.

## What it costs

- **The factory:** DONE. The workspaces slice, the scoping module and its hooks, the entitlements promotion with grades, the registry test, the members and people endpoints, the menu, the chooser, the members surface and the client header — the fail-closed behaviour proved by driving a real violation through it, and the grant proved by driving two identities through a stamped app (2026.9.5).
- **the flagship app:** the largest single change since inception, and it touches every query in the app. 80 tables carry a `users.id` FK, one column each; essentially every service function loses a parameter and a filter; the two-revision migration rewrites 89 tables' columns, constraints and indexes in one deploy against production with no dev database (81 that already scope, plus the 10 child tables and minus the 2 that become shared reference); the ownership helpers, the test fixtures, the MCP context and every schema exposing `user_id` are all touched. The sweep is script-generated but the review is not. Plan multiple sessions and a deliberate deploy window with the image-dispatch dance the flagship app's own CLAUDE.md records. The compensation is that the result is smaller than the current code: scoping becomes zero lines per service.
- **tapestry:** small. One slice adoption, one stamp revision, one bootstrap command; no service signature changes.
- **Ongoing:** every new model takes the mixin or argues its exemption into the reviewed list; multi-membership users see a switcher (single-membership users never do); machine actors serving one workspace pin it in `actors.yaml`.

## Left to the operator

1. **Schedule the flagship app's cutover.** The only open decision. The noun, the grade default and the shape are SME calls, recorded above as settled rather than awaiting approval — and the NULL-owner pre-flight this list used to defer to him has been run: it found no question to ask.
2. **Make the two grants that realise the fix, once the flagship app has cut over** — rename his workspace to the household's name, and add the second household member. Both are two clicks on the Members screen the workspace menu opens (Rename; Add member, picking them from the people the app has seen — they must have signed in once). These are the deliberate acts sharing is defined to be, so the timing is his. An agent can make the same two calls, but there is now a screen, and it is the one he will use afterwards.

   The 409 that used to bite here no longer reaches a page: a person holding two workspaces with nothing remembered is shown the chooser instead, and their choice is what every request then carries. In the browser they were already using, the new workspace appears under "Switch workspace" in the menu.
3. ~~Enact the rule~~ — done; `rules-library/platform/tenancy.md` is live and the appendix below is the record of the text as proposed.

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
2026-08-20: the flagship app scopes 81 of its 103 tables to the individual who created each row, so a
second household member signing in through the same SSO sees an empty app; tapestry scopes
nothing, so every caller sees every row. Both are the same missing noun — a set of people
who share a body of data — answered two wrong ways.

## The Noun

- Must call the access boundary a **workspace**, one noun in code across the fleet:
  `workspaces`, `workspace_memberships`, `workspace_id`, `WorkspaceScoped`,
  `CurrentWorkspace`, `X-Workspace-Id`. What a workspace is CALLED in an app's UI is the
  app's own vocabulary (the flagship app "household", tapestry "circle"), supplied as a copier
  answer and used in frontend copy only — never in code, schemas, columns or headers.
- Must NOT use `tenant` as the code noun. It is live domain vocabulary in the flagship
  consumer — the flagship app's `lease_agreement` and `owner_statement` schemas mean a real person
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
  IdP, DEFAULT-DENY: a bare `<module>` key grants READ only; `<module>:write` grants
  mutation and implies read. `require_module(<module>)` gates read;
  `require_module(<module>, write=True)` gates mutation. The inverse (bare = read+write)
  re-provisions nothing on cutover day and was rejected for it: forgetting `:read` would
  silently hand out ledger write, where forgetting `:write` produces a 403 someone reports.
- Must NOT let `is_admin` bypass a module gate, and must NOT grant admin implicitly to the
  first account seen on a fresh database. The first makes `is_admin` the super-role every
  authorisation question ends up asking; the second hands admin to whichever caller arrives
  first, which can be a machine. Admin is granted deliberately or not at all.
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

- Must mark every workspace-scoped model with the factory's `WorkspaceScoped` mixin,
  INCLUDING a child table reached through a scoped parent — its `workspace_id` is
  denormalised down. "Reached only via its parent" is a claim about how callers happen to
  behave; nothing stops a bare `select(ChildRow)`, and the criteria hook cannot see a model
  without the mixin. The exemption list is for tables that genuinely have no workspace.
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

the flagship app's `networth` ownership allocations record which LEGAL entity owns what percentage
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
