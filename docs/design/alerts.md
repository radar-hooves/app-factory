# Alerts

Status: **design, 29/09/2026.** The operator, the same day: "we should start to think about how the app factory can support alerts like this natively. And I can see alerts on the app rather than ntfy which should be reserved for specific things." First consumer: Nightjar's standing OSINT scan, an n8n workflow whose per-run report belongs in the app, not on his phone.

## Decision

**The factory gains an `alerts` slice: one table, one `/mcp` tool producers write through, and three admin-gated routes. The top-bar bell over them is `@poodle64/ui/alerts` (`AlertBell`, 2026.9.21).** An alert is what a machine told this deployment's operator. Feedback is the same inbox from the other side: people telling the operator. Both are read under the reserved `admin` entitlement. Cost is about 360 lines of product code in the factory (`api/alerts/` 250, `mcp/dispatchers/alerts.py` 65, the migration 50) and 170 for the bell in the package. Tests add about 350.

```text
n8n / estate service ──POST /mcp/ tools/call "alerts"──┐   (Authentik bearer + actors.yaml)
app's own job ──service.raise_alert(session, …)─────────┤
                                                        ▼
                                                  alerts table (one row per key)
                                                        ▲
bell (admin only) ──GET /api/alerts/, POST …/read, DELETE …/{id}
```

## Shape

- **One row per `key`.** The producer names a stable key, such as `osint-scan:report` or `osint-scan:dry:<query>`. Raising a key that already exists updates that row in place and makes it unread again, through one `INSERT … ON CONFLICT`. A recurring condition is therefore one alert that changes, never a stack. The key is required: it is the only way to raise, so there is one code path.
- **Unread, read, gone.** Opening an alert marks it read. Dismissing it deletes the row, and so does a producer's `clear`. A later raise of that key brings it back unread. The factory keeps no dismissed state, history or severity, and it has no per-person read state: a deployment's alerts are one inbox, and whoever reads an alert has read it for everyone.
- **`link`** is an app path (`/documents/42`) or an absolute `http(s)` URL. It is validated at the raise, so no `javascript:` link can reach an `href`.
- **The bell is the UI package's, like `ReportWidget`.** It is app machinery the layout mounts once, reaching the factory's routes through an `endpoint` prop, so a fix to it is one package release rather than a convergence across every app. `AlertRead`/`AlertList` are its contract.
- **Inert until used.** A deployment with no producer has no rows, and the bell renders nothing when nothing is open. The bell appears only for callers holding `admin`. There is no setting.

## Producers

A machine calls the `/mcp` surface, the factory's one machine door. It presents an Authentik bearer (client credentials for n8n), and its identity must be listed in `config/actors.yaml`. The factory adds no new auth scheme. `/mcp` is stateless, so a single `tools/call` needs no `initialize` first:

```http
POST https://<app>/mcp/
Authorization: Bearer <client-credentials token>
Accept: application/json, text/event-stream
Content-Type: application/json

{"jsonrpc": "2.0", "id": 1, "method": "tools/call",
 "params": {"name": "alerts", "arguments": {
   "action": "raise", "key": "osint-scan:report",
   "title": "OSINT scan: 3 filed, 2 waiting for you",
   "body": "…", "link": "/review"}}}
```

The answer arrives as one server-sent event. A refused argument comes back as `result.isError: true` inside an HTTP 200, so a producer checks that flag rather than the status code. `{"action": "clear", "key": …}` withdraws an alert once its condition has passed. The app's own scheduled jobs skip HTTP and call `api.alerts.service.raise_alert(session, AlertRaise(...))` / `clear_alert(session, key)` directly.

## Tenancy

`Alert` is exempt from workspace scoping. It is data with no per-workspace division (`db/registry.py`), in the same bucket as a deployment marker or an app-level settings row. A producer names no workspace, and n8n knows the app, not a membership. The reader is whoever holds the reserved `admin` entitlement, which is how `platform/tenancy.md` gates estate-wide data. As a consequence, an alert's text is visible to every admin whatever workspaces they belong to. A producer must not put a workspace's private rows in one where the admins are not all members of it. No household app has that shape today.

## Rejected

- **An ntfy subscriber.** atlas's ntfy keeps a message about 12 hours and has no read state and no action. It stays the channel for what must interrupt.
- **An `/api` route for machines.** `platform/authentication.md` does admit a service account to the proxy-fronted surface on an app password. But `get_identity` refuses to mint a user row for a machine principal, the factory has no way to link one, and its refusal message sends the machine to `/mcp`.
- **Workspace-scoped alerts.** A producer would have to name a workspace it cannot know, and `/mcp` has no actor-to-membership link to authorise it against. Building that link is a general `/mcp` tenancy change, not an alerts need.
- **Pebblestone's notifications** (`api/notifications/`) are addressed to a person or a role, for a human workflow such as approval outcomes. That is a different thing, and pebblestone keeps it. Its bell is the precedent the factory's bell follows.

## Adoption

An app takes `api/alerts/`, `mcp/dispatchers/alerts.py`, the migration, the layout line and the `@poodle64/ui` 2026.9.21 floor on its next convergence. The migration's `down_revision` is repointed at the app's own head. It then registers each producer's Authentik identity in its `config/actors.yaml`.
