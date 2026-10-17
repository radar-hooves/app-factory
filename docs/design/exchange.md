# The token exchange

Status: **released in factory 2026.10.44.** Need: the operator's ruling of 17/10/2026 on radar-hooves/master-project#380, through master-project's design session: an Authentik token exchange (RFC 8693) is the factory's one way to carry who is asking. Proof of the mechanism: [`docs/research/2026-10-17-token-exchange-proof.md`](../research/2026-10-17-token-exchange-proof.md).

## Decision

**Every stamped app is both sides of the exchange, through one OAuth2 provider of its own (`client_id` the app's name).** As a client, it trades the signed-in person's `X-authentik-jwt` for a ten-minute token for a named service, or for itself. As a service, it verifies a token minted for it from its own JWKS and gets the `Asker`: the person, the app that asked, and their groups and entitlements on its own application. One estate mapping makes those the entitlements the app's pages gate on, so the page and a persona share one vocabulary. One program, run by Authentik's own `ak shell`, provisions the provider, and every estate runs the same program.

**Cost:** 498 net lines of stamped code, carried by every app: `exchange.py` 304, the `/mcp` gate and tool layer 96, settings 55 and wiring 43. Also 806 lines of tests and fakes and the 107-line provisioning program. Per app: one broker credential, one program run, one deployment setting and two nginx lines. Per estate: nothing beyond the program, which creates the mapping on its first run.

```d2
vars: {d2-config: {layout-engine: elk}}
direction: right

page: "Browser\nsigned in to <app>"
nginx: "nginx\nX-authentik-jwt on /api/agent/"
app: "<app> backend" {
  asking: "Asking.token(audience)"
  gate: "/mcp gate\nExchange.verified"
}
persona: "claude -p\nASKER_TOKEN"
ak: "Authentik\n<app>-exchange provider\n<svc>-exchange provider"
svc: "<svc> backend\nCurrentAsker · /mcp"

page -> nginx -> app.asking
app.asking -> ak: "token exchange\nclient secret from the broker"
app.asking -> svc: "Bearer: aud=<svc>"
app.asking -> persona: "aud=<app>, in its env"
persona -> app.gate: 'Bearer ${ASKER_TOKEN}'
svc -> ak: "JWKS" {style.stroke-dash: 3}
app.gate -> ak: "JWKS" {style.stroke-dash: 3}
```

## What a stamped app gets

- **`exchange.py`.** `Asking.token(audience)` (dependency `CurrentAsking`) mints for this request's person, or for the app itself when no audience is given. It mints once per audience per request, and refuses a token whose `sub` is not the request's `X-authentik-uid`. `Exchange.verified` and the `CurrentAsker` dependency verify a bearer minted for this app: RS256 from its own JWKS, its own `iss` and `aud`, unexpired, carrying `sub` and `client_id`. The JWKS is read one request at a time, again for an unknown `kid` at most once a minute, and at least every ten minutes, so a rotated-out key stops verifying. While it is unreachable a held key keeps answering, and a caller with none is told 503 until a retry is due five seconds on. A refused person (`invalid_grant`) is a 401, so the page signs in again. A refused app (its secret, or a service that does not federate it) or an unreachable Authentik is a 503 that names the cause in the log. No token or secret is logged.
- **A library room asks as the person.** `rooms.agent` mints a token with the library as its audience (`<APP>_AGENT_LIBRARY_AUDIENCE`, default `library`) and hands it to `LibraryAgent`, so the app holds no library secret. The caller credential (`<APP>_AGENT_LIBRARY_TOKEN`, `<app>-library`) is gone.
- **A persona's turn carries `ASKER_TOKEN`,** minted for the app, in the run's environment and nowhere else. The persona's `.mcp.json` presents it as `"Authorization": "Bearer ${ASKER_TOKEN}"`.
- **`/mcp` admits the person.** The bearer gate routes a token by its issuer. One from this app's own issuer is verified by the exchange alone, with no userinfo call and no fallback, and the person goes onto the request scope, where no client can write. `mcp.auth.current_asker()` returns them, and `resolve_actor()` answers them as `person <sub>` with no `actors.yaml` row. A person admitted to the app's rooms alone reaches none of its tools, as its HTTP routes refuse them (`entitlements.admitted`). A tool authorises the person as a route does: `entitlements.has_module(current_asker().entitlements, "notes", write=True)`. A machine's bearer goes to userinfo and `actors.yaml` as before.
- **Off until configured.** With no `<APP>_EXCHANGE_ISSUER`, personas run with no token and a library room answers 503. A deployment that sets the issuer requires the forwarded token: a route reached without one answers 503 and names `X-authentik-jwt`.

## Choices

- **One provider per app, client and service at once.** A service that is also an app (the library) would otherwise need two providers that both want its name as their `client_id`. The proxy provider cannot carry the grant: Authentik resets its grant types on every save (the proof).
- **The `asker` mapping reads the sign-in application.** Authentik's stock entitlements mapping reads the issuing provider's own application, which for this provider is a hidden one. Entitlements defined there would be a second vocabulary beside the page's. The estate's one mapping reads the application whose proxy provider the token's provider federates, and adds the asking `client_id` on an exchange. Measured live: the token carried exactly the page's `X-authentik-entitlements`.
- **The hidden application has no policy binding of its own.** The subject token proves the sign-in app's policy admitted the person, and a service makes its own cut from `entitlements` and `client_id`. A service that wants Authentik to refuse earlier binds a policy to its `<svc>-exchange` application.
- **Ten minutes.** Revocation is lifetime alone: a token issued before sign-out verifies until it expires (measured live). Every use but one mints per request. The exception is a persona's turn, whose token must outlive the turn, and the template's idle timeout per line is 600 s. Ten minutes covers that, and more than twice the slowest measured turn (260 s). A turn that runs longer meets 401 at `/mcp` and is asked again. Set by `EXCHANGE_LIFETIME` per provider.
- **An `ak shell` program, not a blueprint or the authentik MCP.** A blueprint cannot build the federation list from two kinds of lookup (the sign-in proxy by slug, each consumer by client id) without nested tags, and it would read the secret from the worker's environment. The MCP's create tools answer with the client secret in the transcript. The program reads its secret from the environment `portcullis exec` fills, and runs wherever Authentik runs.
- **PyJWT, not FastMCP's `JWTVerifier`** (which `mcp-common`'s `AuthentikVerifier` wraps). That seam answers only accept or deny, so an unreachable JWKS would read as a forged token. FastMCP's HTTP stack also moves between majors. PyJWT keeps the 401 and the 503 apart; Authentik itself runs it.

## Adopting it

**An estate** (atlas, titan, mimir, CASPO's own). Authentik 2026.8 or later, with the default implicit-consent and invalidation flows and a signing key. The first app's run creates the `app-factory: asker` mapping.

**An app.**

1. Broker: mint `<app>-exchange` (field `value`, a random 64 characters) by the credential-lifecycle skill's path B, never typed. Grant it to the app's consumer identity, and to the identity that runs step 2 (yggdrasil `portcullis-identities.nix`).
2. Authentik: run the program, with `EXCHANGE_SIGNIN` the slug of the application people sign in to and `EXCHANGE_CONSUMERS` empty:

   ```bash
   portcullis exec --broker <url> --vend EXCHANGE_CLIENT_SECRET=<app>-exchange.value -- \
     docker exec -i -e EXCHANGE_CLIENT_SECRET -e EXCHANGE_APP=<app> -e EXCHANGE_SIGNIN=<slug> \
       authentik-server <the container's entrypoint, ending in ak> \
       shell -c "import sys; exec(sys.stdin.read())" < authentik/exchange.py
   ```

   On atlas the entrypoint is the compose file's own list (`portcullis exec --identity front-door … -- dumb-init -- ak`), which vends Authentik's own secret key.
3. Deployment: `<APP>_EXCHANGE_ISSUER=https://auth.<estate>/application/o/<app>-exchange/` in the host's `.env`. The app must reach the token endpoint at that origin, because Authentik derives `iss` from the host a request reached it on.
4. nginx, in the app's own vhost, never the shared snippet: a `location /api/agent/` (and any other route that calls a service as the person) carrying both lines.

   ```nginx
   auth_request_set $authentik_jwt $upstream_http_x_authentik_jwt;
   proxy_set_header X-authentik-jwt $authentik_jwt;
   ```

5. Take the release: `copier update --vcs-ref v2026.10.44`, add `"pyjwt>=2.13.0"` to `backend/pyproject.toml`, and regenerate `.template-parity.json`. Drop `<APP>_AGENT_LIBRARY_TOKEN`.
6. A persona that uses the app's tools: `"headers": {"Authorization": "Bearer ${ASKER_TOKEN}"}` on the app's own server in its `.mcp.json`. Each write tool checks `current_asker()`'s entitlements.

An app with a library room takes step 5 only once the library verifies these tokens at `/api/caller`. Until then its rooms would be refused there.

**A service** is an app (steps 1 to 5) that other apps ask for people.

1. Re-run the program for it with `EXCHANGE_CONSUMERS="<app> <app> …"`, every app that may ask, the whole list each time, each provisioned first. Authentik refuses an app that is not listed (`invalid_target`).
2. Its bearer routes take `CurrentAsker` (`deps.py`), and its `/mcp` admits the person with no change. It decides the cut from `asker.app` and `asker.entitlements`, which are the person's entitlements on the service's own application.
3. The library, in its own lane: `/api/caller` takes `CurrentAsker`, keys its caller on `asker.app` and intersects that caller's grant with the person's entitlements. A conversation stays the app's, keyed by `asker.app`, because the app's own rows decide who may read a shared answer, and a colleague reads it with their own token. It may accept the caller credential beside the exchange until every consumer has moved.

## Proven

- **CI**, the factory self-test, against `tests/support/fake_authentik.py` over real HTTP (`test_exchange.py`, `test_mcp_auth.py`, `test_agent_api.py`). An app exchanges and a service verifies. Forged, tampered, expired, wrong-audience, HS256 and no-`client_id` tokens are refused. An ended sign-in is a 401, and an unfederated service, a wrong secret or an unreachable Authentik a 503. No token reaches a log line. The library receives a token for itself naming the person and the app. A persona's turn presents a token that verifies as the person who asked, and `/mcp`'s tool sees them with no `actors.yaml` row.
- **Live on atlas,** 17/10/2026, Authentik 2026.8.3, with `scratch-ex*` objects only, 25 of 25. The program ran twice for an app and a service, and the second run changed nothing. A probe person signed in (password, then TOTP) and walked the outpost's handshake. The template's own `Exchange` minted and verified through `auth.<estate>`: RS256 with a kid, 600 s, `sub` the person's `X-authentik-uid`, and `client_id` the app. The groups and entitlements were exactly the page's `X-authentik-*` headers. The service saw its own entitlements and the asking app. Every refusal above held live, and the stamped `/mcp` gate and tool layer saw the person. After sign-out the exchange refused the person, and a token issued before it still verified until its expiry. Every object was removed, and a separate query counted no providers, applications, entitlements, mappings, groups, users, TOTP devices or tokens matching `scratch-ex`. The embedded outpost was back at its 25 providers.

## Open

- **A call across estates** (an atlas app asking a titan service). Each estate's Authentik is its own issuer; not designed.
- **titan, mimir and CASPO's Authentik.** The program is the same everywhere; none has run it.
