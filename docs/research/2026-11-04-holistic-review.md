# app-factory: holistic review, 04/11/2026

Checked by master's checker lane against commit `8bdd53bf` (v2026.11.15), the governance it implements (`rules-library/platform/canonical-app-shape.md`, `docs/master/governance/dev-platform/`), the issue threads, and each stamped app's default branch fetched live on 04/11/2026. Host: atlas, 20 cores, 1-minute load 33.85 at 14:01 and 19 to 25 during the gate runs, so no timing figure here is a speed claim. Every usage figure covers 05/10/2026 to 04/11/2026 unless it says otherwise.

**Verdict: refactor, narrowly.** The factory keeps its promise:

- 0 owed files are edited in any of the 8 live apps;
- 1,931 of 2,085 owed files and floors are carbon copies (92.6%), and the shortfall is lag;
- the apps sit 0 to 34 tags behind, median 3;
- the parity gate made 6 of the month's 44 issues, all closed, and none since 27/10.

The faults cluster in two places where the structure fights the rule's own end state (`canonical-app-shape.md:38`, "an update being a version bump plus a render"):

1. **Every app receives every slice.** So an app that does not take one records it as per-file debt:
   - portcullis carries 88 exception lines, all lapsing 03/12;
   - the library carries 29 ratified variants, with 8 more waiting on you (#80);
   - casefile carries a chat slice it never uses;
   - #73 and #75 (the Claude CLI in every image, and no report button without the feedback slice).
2. **The update path.** The household's own converge leaves a stamped app failing its own gate on two counts (reproduced below). The self-test does not run what an app runs, and three documents give three different update routes.

Everything else is a fault in one module and becomes a package. Retiring would cost more than keeping, in every unit measured (acceptance 4).

## Your decisions

**1. The verdict: refactor the two places above, carry on with the rest. Do not migrate the slices into a kit now.**

- **Recommendation:** two restructures, each behind the self-test, one release at a time:
  - slice membership (decision 2);
  - one update move that writes the files, the floors and the manifest together, with the self-test running the stamped pre-commit (faults 1 to 3).
- **Cost:**
  - about two factory releases;
  - one converge per app;
  - one change in master's converge script and gate.
- **Against (the strongest case: both Gemini lenses).** `canonical-app-shape.md:38` says shared app code is "a versioned kit the app mounts". On that reading the end state is the ~18,000 stamped slice lines moving into `kits/python/app-slices`, which already holds settings.
  - **Why not now:** the Gemini case rests on parity friction of 29 to 32% of the issues, growing. Measured, it is 6 of 44 and falling.
  - The stamp is not failing: 0 edits across 8 apps.
  - A kit migration is a rebuild-sized move with no fault that needs it today. It stays the rule's direction, to take one slice at a time when a slice's churn earns it.

**2. Let each app declare once which slices it takes.**

- **Today:** the factory hands every app all eight slices. An app that does not take one argues it file by file:
  - portcullis: 88 `parity:` lines, all dated 03/11, all `until:2026-12-03`, for "users, workspaces, agent, alerts, feedback, settings". They cite master-project#420, which is the pre-commit config package, not this.
  - the library: 29 variants (`variants.yaml:32-61`, your ruling of 31/10), plus 8 more you are asked to ratify (#80).
  - casefile: carries the unused chat slice (its review's decision 4).
  - #73: the Claude CLI is in every image.
  - #75: there is no report button without the feedback slice.
- **Recommendation:**
  - one copier answer listing the slices taken, with `_exclude` conditions in the shape `copier.yaml:94` already uses for the self-test;
  - the lifespan in `main.py.jinja` starting only the taken slices' supervisors;
  - the Dockerfile's CLI install (`Dockerfile.jinja:151-168`) under the same answer.
  - Portcullis's 88 lines, the library's 29 variants and #80's slice entries become one answer each.
- **Cost:**
  - one factory release;
  - each app answers once and re-converges;
  - the self-test stamps one more combination (it already stamps one without the agent slice, `factory-selftest.yaml` "the shell test without the agent slice");
  - `canonical-app-shape.md:38` and §Exceptions ("two homes ... nothing between") need a line at a sitting saying a declared slice set is the render, not an exception.
- **Against:** every optional slice multiplies the combinations the factory must prove. "One pattern" weakens when apps pick slices à la carte.

**3. Two ratifications wait on you meanwhile.**

- **#80:** the library's eight agent-slice and gate-model variants (opened 04/11). These follow your 31/10 ruling. Recommendation: ratify.
- **portcullis's 88 lines:** they lapse together on 03/12, so its gate fails that day.
  - If you take decision 2, they become one answer before then.
  - If not, ratify them as variants. Either way, re-point them off #420 to a tracker about the broker's slices.

**4. #42, "a CI browser job for stamped apps" (eight, 16/10), argues with `fleet/ci.md`.**

- **The conflict:** the rule says "no end-to-end suite ... runs per change". So the three e2e specs the stamp carries (`example`, `shell`, `workspaces`) run in no CI by design, not by oversight.
- **Recommendation:** close #42 against the rule. Keep the specs as the local `playwright test --grep @smoke` set.
- **Against:** specs nothing runs go stale. `shell.spec.ts` already asserts a placeholder an app may change (#68).

## What follows without a decision (packages)

Each is code contradicting its own rule, or a plainly broken path. Most harmful first.

1. **The update path fails its own gate.**
   - **The run:** casefile's default-branch tree (v2026.11.12), converged with `converge-to-template.py --ref v2026.11.15 --apply`, exits 3. The gate then exits 1:
     - `@poodle64/ui declares ^2026.11.5, factory says ^2026.11.6`;
     - `TEMPLATE PARITY FAILED ... frontend/src/lib/shell.ts`.
   - **Floor cause:**
     - converge writes the manifest's floors from the render (`converge-to-template.py:324-359`) but never `frontend/package.json` (sanctioned per-app);
     - the gate grades a floor below the stamp as drift (`template-parity.py:744-758`).
     - `canonical-app-shape.md` §Enforcement says lag is "never failed in the app".
   - **Who meets it:** casefile, caspo, earworm, eight and the library all declare `^2026.11.5`, and meet it on their next take.
   - **Fix:** converge writes the shared floor rows, or the gate reads them as lag. Both files are master's (`skills-library/canonical-app-migration/`, `.claude/hooks/master/precommit/`).
2. **The sanctioned list breaks its own superset rule.**
   - **The gap:** `canonical-app-shape.md` says the list stays "a superset of the template's `_skip_if_exists`". Two copier-skipped files are missing: `frontend/src/lib/shell.ts` and `.github/renovate-app.json`.
   - **Who carries it:**
     - caspo, earworm, eight, the library and portcullis each carry a `shell.ts` exception line;
     - earworm carries one for `renovate-app.json`, lapsing 16/11;
     - casefile meets it on its next take (the run above).
   - **No check holds the invariant:** `git grep _skip_if_exists -- tests .github` is empty.
   - **Fix:** add the two entries by `rules-approach.md`'s process, and a factory test that fails when the superset breaks.
3. **The self-test does not run what an app runs.**
   - On its scratch stamp, `factory-selftest.yaml` runs `ruff format --check`, `prettier --check`, the tests and `pnpm check`. It runs no stylelint, eslint or stamped pre-commit, which is how #63 and #76 shipped.
   - **Fix:** run the stamp's own `.pre-commit-config.yaml` over the scratch app.
4. **The fastmcp floor does not force the fix for `/mcp`.**
   - Two advisories, GHSA-7xgj-8392-5q4r and GHSA-vqqp-x5qm-5qp4, both fixed in 4.1.2.
   - portcullis and eight lock 4.0.1; godswood locks 3.4.2.
   - **Fix:** raise `pyproject.toml.jinja:11` to `fastmcp>=4.1.2`. godswood's `mcp 1.29.0` and eight's and godswood's `authlib 1.7.2` are each app's own lock refresh.
5. **The route walk is weaker than its docstring** (`test_route_walk.py.jinja:67-75`). Fix: match whole path segments, require the declared module, and walk every mounted route.
   - `path.startswith(person_facing)` exempts `/api/feedbackexport` and everything under `/api/feedback`;
   - `any(_gates(...))` accepts any gate;
   - only `/api` is walked.
   - It did not cause this week's open console routes (see the route-gating section below).
6. **The local compose publishes the header-trusting backend on every interface, against the real database** (`compose.yaml.jinja:42-43`).
   - `proxy-delegated-auth.md` says "never bound to the host".
   - **Fix:** `127.0.0.1:{{ backend_port }}:{{ backend_port }}`.
7. **The rate limit puts every caller behind nginx in one bucket.**
   - `trusted_proxy_networks` defaults to `""` (`security.py.jinja:42`), and only compound sets one (yggdrasil `compound/compose.yaml:126`).
   - `security-standards.md` says to identify clients by trusted-proxy `X-Forwarded-For`.
   - **Fix:** key on the forward-auth uid by default in `rate_limit.py.jinja:59-73` (the headers are already trusted by topology), so no stack needs a setting.
8. **#77, the MCP 500s and 503s.**
   - The 503 is the 5 s userinfo timeout (`http_auth.py:58,283`).
   - Nothing in `template/` handles `ClientDisconnect` or `ClosedResourceError` (`git grep` empty).
   - casefile's 164 and the library's 206 were confirmed by their own checkers; godswood's 131 is unchecked.
9. **#78.**
   - **Item 1 is real:** the last-owner check takes no lock (`api/workspaces/service.py.jinja:241-249`).
   - **Item 2's premise is wrong:**
     - the default claim is `preferred_username` (`config/sections/mcp.py.jinja:57`);
     - casefile sets `mcp_actor` (yggdrasil `stacks/casefile/compose.yaml:104`);
     - the real fault is the silent fallback to `sub` when the claim is absent (`http_auth.py:294`).
   - **Fix:** correct the issue.
10. **The gate reads exact pins as floors.**
    - `dependency_floor_met('^4', '3.5.0')` is True, so casefile's `impeccable ^4` passes against the factory's `3.5.0`.
    - The same goes for `@playwright/test 1.58.2`, whose exactness has a recorded reason (`CHANGELOG.md:1251`).
    - **Fix:** the gate holds a template pin with no range operator as exact.
11. **#70:** `sveltekit-api-client.md` says "CI fails on a stale file". Nothing checks `schema.d.ts` currency.
12. **A stamped app with no manifest passes.**
    - `template-parity.py:812-840` returns 0 with a warning, so a bare `copier copy` (README's direct path) is never measured.
    - **Fix:** fail when `.copier-answers.yml` names the factory and `backend/` exists.
13. **One update route in the documents.**
    - `/master:update-app-template` §3 says "Run `copier update`".
    - `canonical-app-migration/SKILL.md:27` says "`copier update` is not the mechanism".
    - The stamped pre-commit comment (`.pre-commit-config.yaml.jinja:329-335`) gives both.
    - The same file's `:146-148` describes "the parity normaliser", which the gate disclaims (`template-parity.py:15`, since 4bb8a043, 07/09).
14. **No security profile.** The template declares none, nor do core-memory or casefile (`security-standards.md`: at inception).
    - The template is where every stamped app's inception happens.
    - **Fix:** write the profile its code implements (default-deny CSP, `frame-ancestors 'none'`, rate limits).
15. **The factory's own screen faults** (see the shell section below).
    - The Ask page's empty state has no action and does not say who grants access (`routes/(protected)/chat/+page.svelte:39-42`).
    - The members list shows the raw lowercase role, with the owner in the brand variant (`lib/workspaces/workspace-members.svelte:227`).
16. **Leftovers, low.**
    - The desktop skeleton carries 879 lines of gate script byte-identical to the template's (`check-ui-drift.mjs`, `check-design-craft.mjs.jinja`).
    - `copier.yaml`'s 55-path `_migrations` list restates the 45-entry `_exclude`, held equal by `tests/migrations/test_retired_files.py`.
    - The gate renders the whole template on every commit with no cache (`template-parity.py:452-472` via `:857`).
    - Twelve hand-registered exception handlers (`exceptions.py:256-358`).
    - The ui `scorecard` component's asker, mission-command, is archived (`ui/CHANGELOG.md:1867`); no app imports it. `about` has no importer either, but its asker is unread, so it stays.
17. **Seen in the apps, theirs.**
    - portcullis's manifest records v2026.11.14 under `_commit: v2026.11.15` (`.template-parity.json` `template.commit` 0f328e73). This is the stale-manifest pitfall, owed by v2026.11.15's "Consumer must change".
    - pebblestone's `parity:Dockerfile` line expires today (`until:2026-11-04`). Its gate fails from tomorrow.

## Acceptance (#57's four questions)

**1. Tag distance, live.**

- **Method:** each app's default branch read through `gh api repos/<owner>/<app>/contents/.copier-answers.yml`, against `git ls-remote --tags origin 'v*' | sort -V` (209 tags, latest v2026.11.15).
- **Results:**

| App | Pinned | Tags behind |
| --- | --- | --- |
| portcullis | v2026.11.15 | 0 |
| library | v2026.11.13 | 2 |
| casefile, caspo, earworm, eight | v2026.11.12 | 3 |
| godswood | v2026.11.3 | 12 |
| pebblestone | v2026.10.76 | 34 |
| mission-command (archived on GitHub) | v2026.10.25 | 85 |

- **Summary:** 8 live apps, 0 to 34 tags behind, median 3, mean 7.5. The 28/10 figure was 5 to 80. The "9" was these 8 plus the archived one. No other repo in the organisation, or in the collaborator's account, carries the factory's answers.
- **The lenses:** Fable purpose, Gemini purpose and the fleet lens hold exactly. Gemini elegance does not (see Disagreements).

**2. The parity gate's share of the factory's issues.**

- **Query:** `gh issue list --repo radar-hooves/app-factory --state all --search "created:>=2026-10-05" --limit 500`. It returns 44 at 14:05. The lenses read 41; #79 to #81 opened since.
- **My rule:** an issue is the gate's when its body says the gate refused a commit because another stamped tool rewrote an owed file, or because it owed a file copier calls app-owned.
- **Count:** 6 of 44, 13.6% (#28, #34, #44, #46, #48, #56); 14.6% of the lenses' 41. All are closed, and the last was opened 27/10.
- **Broader count:** adding issues where a factory file failed an app's own lint, test or hook, and the parity rule left the app only an exception (#30, #47, #63, #68, #76), gives 11 of 44, 25.0%.
- **Author tells nothing:** 43 of 44 are filed under the operator's login.
- **App trackers** (same window, `parity in:title,body`): caspo#196, godswood#858 and godswood#928. Only godswood#858 is about the gate.
- **Which lens holds:** Fable purpose's 6 holds. The others count a wider class (see Disagreements).

**3. What a stamped app costs to keep current.**

- **Adoption commits** (commits that moved `_commit` on each default branch in 30 days):
  - casefile 17, caspo 41, earworm 11, eight 17, godswood 21, library 20, pebblestone 2 and portcullis 2;
  - 131 in all, for 109 tags, so 1.2 adoption commits per release across the fleet;
  - 0 merge commits: every take lands directly;
  - an active app takes a release about every 1.8 days.
- **Lane time** (foreman's dispatch records, which begin 21/10):
  - 77 adoption lanes in the eight apps took 22.3 lane-hours over 21/10 to 04/11, against 50 tags and 71 adoptions;
  - that is 19 minutes of lane time per adoption, 0.45 lane-hours per release, and about 10 lane-hours a week.
  - It is a floor: a take done outside foreman is not counted, and your own hours are recorded nowhere I could read.
- **Hand fixes:** today each take from v2026.11.12 or .13 also needs two by hand (fault 1).
- **The factory's own side, same window:** 61 lanes, 17.1 lane-hours, 158 commits.

**4. Retiring against keeping, in the same units.**

- **Keep:**
  - about 39 lane-hours a fortnight (22.3 in the apps, 17.1 in the factory);
  - 131 adoption commits and 404 factory commits a month.
- **Retire:** adoptions and factory lanes go to 0, and each app owns its factory files alone.
  - casefile, measured: 209 files, 25,174 lines and 73 floors, every manifest path resolved.
  - The factory landed 108 `fix` commits touching `template/` in 30 days. Retired, each becomes a hand port in up to 8 apps: up to 864 a month if every fix applied everywhere, an upper bound.
  - No gate would see drift. That is the 14/08 state `README.md:7` measured: 125 files that should have been 13 copies were 62 versions.
- **Removing the parity gate alone** (Gemini elegance's "under 2 hours") is not retiring the factory: it prices nothing the apps then own.

## Cut list (refactor)

Nothing is retired. What the refactor removes or restructures:

- the library's 29 variants, #80's slice entries and portcullis's 88 lines, which become one slice answer per app (decision 2);
- the floor and `shell.ts` hand fixes per take (faults 1 and 2);
- the two contradicting update documents and the stale normaliser comment (fault 13);
- the per-commit full render, which renders only when an owed file is staged;
- the restated `_migrations` list, derived from `_exclude` (fault 16).

## This week's console routes: not the template's default

Security M-2 said, "I think this is the cause of this week's reviews finding open console routes." That is refuted:

- **core-memory:** not stamped. Its routes are its own `console/app.py`.
- **casefile:**
  - The walk did its job. casefile held the four console routers open on purpose in `app_hooks.OPEN_ROUTES` (`app_hooks.py:80-96`), from 20ef850 on 17/10.
  - Its stated reason claims `require_app_module`, which the routers lacked. They gained it at 12:21 today (3b62ed6, "gate console matter routes on the app entitlement").
- **library:** it excepts the factory's walk itself: `parity:backend/tests/test_route_walk.py 2026-10-31 until:2026-11-30 radar-hooves/library#162 # library's routes gate by Registry grant scope`.

The template's part is that the default gate is a test an app can declare its way past, not a property of the router, plus the prefix weakness (fault 5).

## Shell: which screen faults are the factory's

Read from the two blind second reads of the three apps' captures (Fable `20261104T033604Z-b3fb39e3`, Gemini `20261104T033605Z-889d2a66`) and traced to the file that renders each.

| Fault | Whose | Evidence |
| --- | --- | --- |
| casefile's Ask page, "Nobody to ask yet", no action and no rail entry | **Factory** (and decision 2: casefile has no persona) | `template/.../routes/(protected)/chat/+page.svelte:39-42` |
| casefile settings: lowercase role labels, owner in the brand colour | **Factory** | `lib/workspaces/workspace-members.svelte:227`, `{member.role}` on `Badge variant='default'` |
| The not-found page, "fine" in both reads | **Factory**, praised | `routes/(protected)/+error.svelte` |
| Context column gone on scroll, right third empty (core-memory, casefile) | Each app | Both elements hand-roll `<aside>` (`casefile-matters.svelte:265`, `core-memory-domains.svelte:554`) instead of the kit's `ContextColumn` |
| core-memory's rail colour, `mm/dd/yyyy`, clipped tables, filter chips | core-memory | Not stamped. Rail colour is its own `sidebar-*` tokens; column hiding is the page's (`sveltekit-ui-patterns.md`) |
| "Could not load this matter — Not Found" | casefile | Its `matters/[id]/+page.svelte:190` splices `extractApiError`'s title into a sentence |
| Raw validator and Python text; 422 for a malformed id | library | Its routes. The factory's formatter passes pydantic's message through by design (`lib/api/error.ts:74-90`) |
| The household titled by its id | library's data | `workspace-members.svelte:175` shows `workspace.name`; the factory names a personal workspace `user.username` (`service.py.jinja:119`) |
| "D39" in user copy | library | Its own setting text |

## Where this bears on the other three reviews

- **core-memory:**
  - **Decision 4:** the open read routes are its own code, nothing of the factory's.
  - **F2:** the same header-trust shape as security H-1 here, casefile M3 and the library's fault 12. That is one yggdrasil topology pass; the factory stamps no stack.
  - **Decision 5:** its recommendation (record a library with a console, plus a variant) stands. Decision 2 here does not change it.
- **casefile:**
  - **Decision 4** (the unused chat slice) is decision 2 here in its general form.
  - **Console routes:** gated since 3b62ed6 this morning, so that package is landed.
  - **#77:** confirmed in the factory's code.
  - **#78:** item 2's premise needs correcting (fault 9).
  - **impeccable:** its finding is a gate fault, exact pins read as floors (fault 10).
  - **`shell.ts`:** its rule-fault row now fails casefile's next take (fault 2, reproduced).
- **The library and master-project#431:**
  - The library's verdict holds from this side: a915222f is the 31/10 ratification (28 lines; 08800ead adds two), `road.md:34` says it, and the 29 keys sit at `variants.yaml:32-61`. app-factory#72 is open and is the right tracker: item 1 for the router lines, item 3 for `client.ts`'s `SLOW_PATHS`.
  - Three additions for #431's lane:
    - Taking v2026.11.14 or later, it must raise the `@poodle64/ui` floor to `^2026.11.6` by hand and keep its `shell.ts` line until fault 2 lands.
    - library#162's route-walk exception retires cleanly only if you rule the library's decision 2 (the admin gate on the registry): the library can then take the factory's walk back.
    - #80 is your act, not the lane's.

## Checked findings by lens

Status: **C** confirmed (a corrected detail noted), **R** refuted, **U** unchecked.

**Tally:** 115 findings across the seven lenses: 74 confirmed, 28 refuted, 13 unchecked.

| Lens | C | R | U |
| --- | --- | --- | --- |
| Security | 13 | 2 | 2 |
| Dependencies | 10 | 1 | 2 |
| Fleet | 12 | 1 | 2 |
| Elegance, Gemini | 3 | 10 | 2 |
| Elegance, Fable | 16 | 2 | 2 |
| Purpose, Gemini | 7 | 9 | 0 |
| Purpose, Fable | 13 | 3 | 3 |

### Security, Sonnet ([comment](https://github.com/radar-hooves/app-factory/issues/57#issuecomment-6621869437))

| # | Claim | St | Evidence |
| --- | --- | --- | --- |
| 1 | Strengths: `/mcp` fails closed and checks `aud`, strips `x-client-id`, RS256 only, `local-console` refused over HTTP, undeclared tools refused, default-deny CSP | C | `mcp/http_auth.py:144-150,231-236`; `exchange.py.jinja` `algorithms=["RS256"]`, issuer, audience, `require`; `mcp/auth.py.jinja:117-119,199-200`; `middleware.py.jinja:127-129` |
| 2 | `debug=False` hardcoded | C | `main.py.jinja:354`; `settings.debug` (`config/__init__.py.jinja:69`) drives logging only |
| 3 | H-1: identity headers trusted from any container on a shared network; gunicorn on `0.0.0.0`; casefile on `telemetry` | C | `users/dependencies.py.jinja:143`; `gunicorn.conf.py.jinja:11`; yggdrasil `stacks/casefile/compose.yaml:63-64` (`172.26.254.22`). Forged-header input not run. The owner is yggdrasil, not the factory |
| 4 | M-1: local compose publishes on all interfaces against the real Postgres | C | `compose.yaml.jinja:42-43` and its comment. LAN reach not probed |
| 5 | M-2: prefix exemption, any gate counts, `/api` only, `OPEN_ROUTES` app-owned | C | `test_route_walk.py.jinja:42,67-75`; `entitlements.py.jinja:158` marks `require_app_module` as a gate |
| 6 | M-2: "the cause of this week's reviews finding open console routes" | R | core-memory not stamped; casefile `OPEN_ROUTES` (`app_hooks.py:80-96`, 20ef850); library excepts the walk (`.canonical-exceptions`, library#162) |
| 7 | M-3: one rate-limit bucket behind nginx | C | `security.py.jinja:42` `""`; `rate_limit.py.jinja:59-73`; `:53` `100/minute`; only `PORTCULLIS_TRUSTED_PROXY_NETWORKS` set (yggdrasil `compound/compose.yaml:126`) |
| 8 | L-1: no security profile | C | `git ls-files` has no `docs/security` |
| 9 | L-2: `mcp-service` is `claude-code`/agent | C | `config/actors.yaml.jinja:32-35` |
| 10 | L-2: "#78 (actors keyed on `sub` instead of a username claim)" | R | Default `preferred_username` (`config/sections/mcp.py.jinja:57`); casefile `mcp_actor`; `sub` only as fallback (`http_auth.py:294`) |
| 11 | L-3: 60 s userinfo cache | C | `http_auth.py:56` |
| 12 | L-4: client `x-request-id` accepted | C | `middleware.py.jinja:48` |
| 13 | L-5: `style-src 'unsafe-inline'` | C | `middleware.py.jinja:129` |
| 14 | L-6: unlimited workspace creation | C | `api/workspaces/router.py.jinja:40-44` |
| 15 | L-7: `/openapi.json` on by default | C | `config/__init__.py.jinja:88` `openapi_enabled: bool = True` |
| 16 | L-8: `/mcp`, elements and SPA outside the default limit | U | Not reopened |
| 17 | nginx locations do not clear client `X-authentik-*` | U | yggdrasil's, not read |

### Dependencies, Sonnet ([comment](https://github.com/radar-hooves/app-factory/issues/57#issuecomment-6621877554))

| # | Claim | St | Evidence |
| --- | --- | --- | --- |
| 1 | The template ships no lockfile | C | `git ls-files template \| grep -ic lock` → 0 |
| 2 | fastmcp 4.0.1 carries GHSA-7xgj-8392-5q4r and GHSA-vqqp-x5qm-5qp4; floor `>=4.0.1` does not force 4.1.2 | C | `uvx pip-audit -r` (fastmcp==4.0.1) reproduces both; portcullis and eight lock 4.0.1; `pyproject.toml.jinja:11` |
| 3 | godswood: fastmcp 3.4.2, mcp 1.29.0 with four CVEs | C | godswood `backend/uv.lock`; pip-audit: CVE-2026-59951, -116684, -116685, -116686, fixed 1.30.0/2.2.0 |
| 4 | mcp "is not in the portcullis or eight locks" | R | Both lock `mcp 2.3.0`, a fixed version. Only godswood is exposed, as the lens concluded |
| 5 | authlib 1.7.2 in eight and godswood, nine IDs | C | pip-audit: 9 IDs (PYSEC-2026-4354 to -4360, CVE-2026-96760, -116672). Correction: portcullis does carry authlib (1.9.3) and joserfc (1.8.0), both clean |
| 6 | godswood dompurify, SvelteKit and fast-uri advisories | U | Not re-run |
| 7 | `@playwright/test` exact `1.58.2` (`:40`), reason at `CHANGELOG.md:1251`, harness on v1.62.0 | C | `package.json.jinja:40`; `CHANGELOG.md:1251`; `drive.mjs:33` |
| 8 | `@poodle64/librarian` exact `2026.11.1`, no Renovate rule | C | `package.json.jinja:73`; `grep librarian renovate.json template/renovate.json.jinja` empty |
| 9 | design-tokens `^2026.10.1` below librarian's peer `^2026.10.2` | C | `package.json.jinja:72`; librarian `package.json` peers |
| 10 | Desktop skeleton lags: `pnpm@10.28.0`, ui `^2026.9.23`, tokens `^2026.9.2`, exact kit/vite/svelte-check | C | `skeletons/desktop/package.json.jinja:7,22,23,33,46,49` |
| 11 | No Renovate Dependency Dashboard | C | Search returns #57 and #31 only |
| 12 | `library` and `redactyl-core` declared with a recorded reason | C | `pyproject.toml.jinja:36-54` |
| 13 | Kit and Cargo advisories (qs, minimatch, rustls-webpki ...) | U | Not re-run |

### Fleet alignment, Sonnet ([comment](https://github.com/radar-hooves/app-factory/issues/57#issuecomment-6621888736))

| # | Claim | St | Evidence |
| --- | --- | --- | --- |
| 1 | 8 stamped apps, not 9 | C | Organisation-wide `gh api` read: 8 live, plus mission-command archived |
| 2 | Tag table 0, 2, 3, 3, 3, 3, 12, 34 | C | Acceptance 1 |
| 3 | portcullis manifest at v2026.11.14 under `_commit` v2026.11.15 | C | `template.commit` 0f328e73 = v2026.11.14 |
| 4 | Gate share 8 of 41 (19.5%); 13 with workarounds | C | Reproduces as the lens's own rule. Its 8 include #47 (an eslint failure) and #76 (a coverage hook), which I count in the broader class |
| 5 | App trackers: caspo 1, godswood 2, godswood#858 | C | Same search, re-run |
| 6 | 109 tags, 405 commits in the window | C | 109 tags; 404 commits on `origin/main` since 05/10 |
| 7 | Commits touching `.copier-answers.yml`: 17, 43, 12, 17, 21, 21, 2, 3 | C | Exact. Adoptions (`_commit` moved): 17, 41, 11, 17, 21, 20, 2, 2 |
| 8 | About 206,000 diff lines | U | Not re-run |
| 9 | No conflict or `.rej` in any subject | U | Not re-run |
| 10 | Retire: 201 to 210 owed files, 73 floors | C | Manifest file counts 209, 210, 210, 210, 206, 210, 201, 210; casefile 73 floors |
| 11 | "13,000 to 13,600 lines of source per app" | R | casefile's 209 owed files are 25,174 lines, every path resolved (`{package}` substituted). The lens disclosed an undercount |
| 12 | Exception counts 0, 2, 3, 7, 7, 14, 19, 95; none lapsed | C | Re-counted. Correction: pebblestone's `parity:Dockerfile` expires 04/11 |
| 13 | Variants: portcullis 13, library 29, eight 3, pebblestone 2, earworm 1, caspo 1 | C | `variants.yaml` parsed |
| 14 | portcullis's 95 all cite master-project#420 | C | And #420 is "one pre-commit config for the fleet", not the broker's slices |
| 15 | Only the library's P09 names the factory | C | Correction: eight's P09 names `copier` once |

### Elegance, Gemini ([comment](https://github.com/radar-hooves/app-factory/issues/57#issuecomment-6621904968))

| # | Claim | St | Evidence |
| --- | --- | --- | --- |
| 1 | The factory stamps "306 files (41,297 lines)" | R | `template/` is 331 files, 42,309 lines; a fresh web stamp is 270 files (Fable) |
| 2 | Only 9 `.jinja` files use `{%` | C | 9. Correction: there are 163 `.jinja` files, not 155 |
| 3 | 146 files "solely" substitute scalars; shorter as static files plus hydration | R | The substitutions are the Python package path (`package_name`, 439 sites) and 89 file paths carrying `{{`. Hydration is the same templating in another tool |
| 4 | Backend 162 files, 25,781 lines | U | Not re-counted |
| 5 | Every slice fix needs a release and an update in every app | C | Correction: 8 apps, carried by converge lanes (77 lanes, 22.3 h in 15 days) |
| 6 | Churn: `app-shell.svelte` 52, `shell.ts.jinja` 66 | R | `git log --follow`: 24 and 3 |
| 7 | "copier templates files with local line endings" | U | Unsupported. The formatter half is C (#28, #34, #44, #56) |
| 8 | Proposal 1's need: "open issue #43" | R | #43 is closed and asks for elements as one factory capability |
| 9 | Proposal 2's need: #70 | C | Open: no contract-currency gate |
| 10 | Proposal 2's need: #72 | R | #72 is the route class, a `client_id` log line and `SLOW_PATHS` |
| 11 | Tags: portcullis 11.14, earworm 11.9, casefile 11.8, caspo 10.93 | R | Read from the local checkouts' `HEAD` (`git -C repos/casefile show HEAD:.copier-answers.yml` → v2026.11.8), not each app's default branch (v2026.11.12) |
| 12 | Gate share 12 of 41 | R | Includes #53 (layout-gate hang) and #70 (OpenAPI gate), neither the parity gate |
| 13 | "15 factory releases every 7–10 days" | R | 109 in 30 days; 24 in the last 7 |
| 14 | "4 to 8 operator/agent hours per week" | R | No measurement given. Measured: about 10 lane-hours a week in app adoption lanes, plus 8 a week of factory lanes |
| 15 | Retire: "1 sitting (under 2 hours)" | R | That removes the gate, not the factory (acceptance 4) |

### Elegance, Fable ([comment](https://github.com/radar-hooves/app-factory/issues/57#issuecomment-6622003675))

| # | Claim | St | Evidence |
| --- | --- | --- | --- |
| 1 | Sizes: template 331 / 42,309 (schema 2,994); skeleton 45 / 2,866; 166 PNGs; 140 librarian screenshots 11 MB | C | Re-counted. Correction: the screenshots are 10.2 MB |
| 2 | The stamped pre-commit comment's "normaliser" contradicts `NOTHING IS NORMALISED` | C | `.pre-commit-config.yaml.jinja:146-148`; `template-parity.py:15`; 4bb8a043, 07/09 |
| 3 | Gate scripts duplicated in the skeleton, 879 lines | C | `check-ui-drift.mjs` (492) and `check-design-craft.mjs.jinja` (387) byte-identical (`cmp`). Correction: `check-layout-ownership.mjs` is not in the skeleton, so "both files" is wrong |
| 4 | Dockerfile installs Claude Code unconditionally; #73 open | C | `Dockerfile.jinja:151-168`; 0 `{%` in the file; #73 OPEN |
| 5 | `exceptions.py` 361 lines, twelve one-by-one registrations | C | `wc`; 12 `_register(app` |
| 6 | `main.py.jinja` 429 lines, 114 comment lines | C | `wc`; `grep -cE '^\s*#'` → 114 |
| 7 | `_migrations` 55 paths restate 45 `_exclude`, held by `test_retired_files.py` | C | `copier.yaml` parsed; `tests/migrations/test_retired_files.py:12-18` |
| 8 | The gate renders the whole template every commit, no cache | C | `template-parity.py:452-472`, via `live_render` `:543`, from `check` `:857`; no `cache`. The 4.55 s figure is unchecked |
| 9 | Three update routes | C | `update-app-template.md` §3; `SKILL.md:27`; `.pre-commit-config.yaml.jinja:329-335`; `converge-fleet.md:109` |
| 10 | ui README 1,743 lines, `drive.md` 1,343, `drive.mjs` 5,439 | C | `wc` |
| 11 | Librarian screenshots written by `screenshots.mjs:25`, read only by `README.md:548` | C | Both lines |
| 12 | `UpstreamServiceError` is dead: "no raise site" | R | Searched only `template/` and `kits/`. Raised in caspo, eight, godswood, the library and pebblestone (e.g. godswood `api/essentialism/pocketsmith/client.py`, eight `api/library/client.py`) |
| 13 | `broker_serves` and `BrokerUnavailableError` have no caller | R | godswood `api/fat_controller/pipeline/job.py:1373` calls `broker_serves` |
| 14 | ui `about` and `scorecard` have no importer | C | No app imports either; harness only |
| 15 | Churn: 1,238 commits since 28/06, 439 fix, 350 feat, 211 tags on 62 days, old manifest 165 commits | C | `git log` and `for-each-ref`, re-counted |
| 16 | 37 fix commits of the "stamp fails the app's gate" class, 10 after 53ad5054 | U | 53ad5054 (09/10) confirmed; the 37 not re-classified |
| 17 | The self-test runs neither stylelint nor the stamped hooks | C | `factory-selftest.yaml`: `ruff format --check`, `prettier --check`, tests, `pnpm check` only |
| 18 | Eight issues of that class | C | As the lens's own, broader class (#63 and #76 are not the parity gate's) |
| 19 | 12 of the last 60 tags fixed the previous one | U | Not re-classified |
| 20 | `working-on-the-template.md:16`, "stamp the tag in CI" | C | Line holds |

### Purpose, Gemini ([comment](https://github.com/radar-hooves/app-factory/issues/57#issuecomment-6621909376))

| # | Claim | St | Evidence |
| --- | --- | --- | --- |
| 1 | Load "below half the host's 32-core capacity" | R | `nproc` → 20 |
| 2 | Tag table | C | Acceptance 1 |
| 3 | "15 factory releases in 7 days (v2026.10.94 to v2026.11.15)" | R | 17 tags in that range (31/10 to 04/11); 24 in 7 days |
| 4 | Gate share 13 of 41 (31.7%), or 18 (43.9%) | R | Counts #51 (ui page types), #53 (a layout-gate hang) and #37, #38, #45 (shell kit features) |
| 5 | "1.5–2.5 engineering hours per app per week" | R | No measurement. Measured about 1.3 lane-hours per app per week, a floor |
| 6 | `README.md:7`: 62 versions of 13 files on 14/08 | C | Paraphrase holds |
| 7 | Library 29 variants at `variants.yaml:33-61`, portcullis 13 at `:7-20` | C | Lines hold |
| 8 | Both "because stamping unneeded slices into their trees broke them" | C | Correction: true of the library (ruling 31/10); portcullis's 13 variants are its own bearer auth and workspace UI |
| 9 | "A fix lands once here and reaches every app": FAILS | R | 0 edited owed files across 8 apps; 92.6% carbon copies; the shortfall is lag |
| 10 | `CHANGELOG.md:9-14`: v2026.11.15 "broke backend commits in portcullis" | R | v2026.11.15 is the fix for #76 |
| 11 | Formatter conflicts #28, #34, #44, #56 | C | All closed; the last opened 27/10 |
| 12 | `app-frame.svelte` hard-imports `#lib/agent/chat.js` (#47, #51, #55) | R | `app-frame.svelte:49-60` uses an optional `import.meta.glob` "(the library has none)"; #55 is a Renovate PR |
| 13 | Seams trail needs: #74, #68, #41 | C | All three open |
| 14 | The hierarchy of controls is in `rules-approach.md` | R | It is `core.md:37` |
| 15 | Proposal 3 rests on `vision-dev-platform.md:13`, "Propagation is instant, not pinned" | R | That line governs rules, skills, hooks, commands and agents. The factory pins by tag on purpose (its CLAUDE.md), and `/master:converge-fleet` already does the job |
| 16 | `vision-dev-platform.md:38` quote | C | Line holds |

### Purpose, Fable ([comment](https://github.com/radar-hooves/app-factory/issues/57#issuecomment-6622134566))

| # | Claim | St | Evidence |
| --- | --- | --- | --- |
| 1 | No `docs/product/`; the carve-out applies, so it is not the first finding | C | `umbrella.md:40` names "the copier skeleton" among its three carve-outs; CLAUDE.md:3 states the purpose |
| 2 | 0 owed files edited; 1,931 of 2,085 carbon copies (92.6%) | C | The gate re-run on every app's default-branch tree: 279/283, 275/278, 278/281, 278/281, 223/278, 235/237, 186/270, 177/177, all "0 edited here" |
| 3 | Agent slice 4,666 lines in 14 files; Python kits 6,691 | C | 14 files, 4,666 lines. Correction: kits are 6,574 `.py` lines |
| 4 | mission-command in the graveyard at v2026.10.25 | C | Archived on GitHub |
| 5 | Tag table | C | Acceptance 1 |
| 6 | Self-test run 41701376183 succeeded on bea47b8c | C | `gh run view`: success, bea47b8c, 03/11 |
| 7 | A bare `copier copy` has no manifest and the gate passes | C | `template-parity.py:812-840` returns 0 |
| 8 | "No gate in the pipeline ever runs `alembic upgrade heads`" | R | The stamped `conftest.py.jinja:347-375` runs it on the test database. What no gate boots is the image's entrypoint (`image-smoke.sh.jinja:4-5`) |
| 9 | `copier update` exits 1 on a tempdir `OSError` | U | Not re-run |
| 10 | After converge the gate fails on the ui floor | C | Reproduced on casefile's tree: gate exit 1. The same run also fails on `shell.ts`, which the lens did not raise |
| 11 | The gate fails an edit and passes a dated, tracked line | U | Not re-driven |
| 12 | 147 exception lines, 12 lapsing within 14 days; portcullis 95, 88 `parity:`, 03/11 to 03/12 | C | Re-counted. Correction: portcullis's reason names users, workspaces, agent, alerts, feedback and settings, not "agent, files and exchange" |
| 13 | The library's variants at `variants.yaml:476-504` (and `:475`, `:503`) | R | `variants.yaml` is 61 lines; the block is `:32-61`. The claim itself (29 variants citing 31/10) holds |
| 14 | #77: 164, 131 and 206 failed calls; `http_auth.py:58,283` | C | Code lines hold; casefile's and the library's counts confirmed by their checkers; godswood's is unchecked |
| 15 | The e2e specs run in no CI, as a fault (#42) | R | True, but `fleet/ci.md` forbids a per-change end-to-end suite. That is a decision (decision 4), not a fault |
| 16 | Gate share 6 of 41, all closed, last 27/10, none of 15 since 01/11 | C | Acceptance 2 |
| 17 | 109 tags; v2026.11.12 to v2026.11.15 is 11 commits, 3 template files, 13 lines | C | `rev-list --count` → 11; `diff --stat` → 3 files, 9+4 |
| 18 | 398 factory-related commits by subject; distinct versions per app | U | The subject rule was not given. casefile 17 and caspo 41 match the adoption count; the others differ |
| 19 | Proposals cite `copier.yaml:94-141` (`_exclude` conditions), `canonical-app-shape.md:94-95,167` | C | Lines hold |

## Disagreements, and who was right

| Question | Readings | Right, and why |
| --- | --- | --- |
| How far behind are the apps? | Gemini elegance: portcullis 1, earworm 6, casefile 7, caspo 17. The other three lenses: 0, 3, 3, 3 | **The three.** Gemini read the shared checkouts' `HEAD`, which lag; each app's default branch, read live, agrees with them |
| The gate's issue share | Fable purpose 6 (14.6%). Fable elegance 8 and Sonnet 8 (19.5%). Gemini elegance 12 (29.3%). Gemini purpose 13 to 18 (31.7 to 43.9%) | **Fable purpose**, on #57's question. Fable elegance labelled its 8 honestly as a wider class. Both Gemini counts include issues that never touch the gate (#51, #53, #70, #37, #38, #45) |
| Does "a fix lands once and reaches every app" hold? | Gemini purpose: fails. Fable purpose: holds, the shortfall is lag | **Fable**, from the gate re-run: 0 edited, 92.6% copies |
| Refactor toward what? | Both Gemini: move the slices into kits, shrink the stamp to 15 to 30 files. Fable purpose: slice membership. Fable elegance: the release and update machinery | **Both Fables.** Their scopes are where the measured faults are (decisions 1 and 2, faults 1 to 3). Gemini's premise, that parity friction is a third of the work and growing, measures as 6 of 44 and none since 27/10 |
| Is the missing P01 the first finding? | Fable purpose: no, the carve-out applies. Gemini: silent | **Fable**: `umbrella.md:40` |
| Cost to keep current | Gemini: 4 to 8 h a week, or 1.5 to 2.5 h per app per week, both unmeasured. Sonnet: commits and diff lines, no hours. Fable: commits per release | **Sonnet and Fable** in kind. Lane-hours, now measured from foreman's records: about 10 a week in the apps |
| Retire cost | Gemini elegance: under 2 hours. Sonnet: what each app then owns. Fable: each month's fixes land eight times | **Sonnet and Fable.** Removing the gate is not retiring the factory |
| What caused the open console routes? | Security: "I think" the template's walk | **Neither lens checked.** The apps chose them (route-gating section above) |

## Lessons filed

Reported under `skill:work-package` on core-memory's `estate/lessons`, each with its false claim quoted:

- Gemini elegance: tags read from stale checkouts, and an issue cited unopened;
- Gemini purpose: a claimed hard import, a release read backwards, a misplaced citation;
- Fable elegance: dead code judged without searching the consumers;
- Fable purpose: unresolved line citations, and a rule-mandated absence reported as a fault;
- the security lens and its brief: a presumed cause, unchecked;
- the dependencies lens: "not in the lock" for a fixed version;
- the Fable elegance brief: it carried the stale "nine".
