# Token exchange on atlas: the proof

Driven on atlas 17/10/2026 against Authentik 2026.8.3, for radar-hooves/master-project#380 (the operator's ruling of 17/10/2026: an RFC 8693 token exchange is the factory's one way to carry who is asking from an app to a household service and to the app's own tools). Nothing in the template changed.

## Answer

**It works.** The app's backend takes the person's forward-auth token, which the embedded outpost already sends as `X-authentik-jwt`, and exchanges it in one back-channel POST for a token whose `aud` is the downstream service. The issued token carries the person: `sub` equal to `X-authentik-uid`, `groups`, and the person's `entitlements` on the service's own application. It also carries the requesting app as `client_id` (RFC 8693 §4.3), added by one scope mapping for the whole estate. The service verifies it alone from its provider's JWKS (RS256, `iss`, `aud`, `exp`). No shared secret is involved.

**Cost.**
- Per app: one OAuth2 provider and a hidden application (the persona provider that `docs/design/agent-console.md` §1 already plans, given the token-exchange grant), one broker-vended client secret, and two nginx lines on the routes that exchange.
- Per service: one OAuth2 provider with a signing key, which federates each consuming app's provider.
- Per estate: one five-line scope mapping.

```d2
vars: {d2-config: {layout-engine: elk}}
direction: right

browser: "Browser\nsigned in"
nginx: "nginx\nforward-auth"
outpost: "Embedded outpost\nX-authentik-jwt: the proxy\nprovider's access token"
app: "App backend\n<app>-persona client"
ak: "Authentik\n/application/o/token/"
svc: "Service\nverifies from JWKS"

browser -> nginx
nginx -> outpost: "auth_request"
outpost -> nginx: "X-authentik-*"
nginx -> app: "X-authentik-jwt\n(exchanging routes only)"
app -> ak: "token exchange\nclient secret + subject_token\naudience=<svc>"
ak -> app: "aud=<svc>: sub, groups,\nentitlements, client_id"
app -> svc: "Authorization: Bearer"
svc -> ak: "public JWKS" {style.stroke-dash: 3}
```

## How it was driven

Only scratch objects were used, every one named `scratch-tx-*`:

- the app's proxy provider (`forward_single`) and its application;
- the app's exchange client (OAuth2, confidential, the token-exchange grant, federating the proxy provider) and its application;
- the service's OAuth2 provider (signed with the existing "authentik Self-signed Certificate", federating the client) and its application, bound to a scratch group;
- a scratch entitlement on that application, bound to the probe user;
- the `client_id` scope mapping;
- an ownerless Actor;
- a probe user whose password and TOTP device were generated in-process.

The scratch proxy provider joined the embedded outpost for the run. Every object was made and removed through `ak shell` in `authentik-server`, using the service's own portcullis entrypoint with the code passed on stdin.

The probe user signed in through `default-authentication-flow` (password, then TOTP), then walked the outpost's own handshake (`/outpost.goauthentik.io/start`, `/application/o/authorize/`, `/outpost.goauthentik.io/callback`). Requests went straight to `authentik-server:9000` carrying the `Host` and `X-Original-URL` that nginx's `auth_request` sends, so no vhost was touched and nginx itself was not driven.

Every run ended with a residue check. Providers, applications, entitlements, scope mappings, groups, users, actors and access tokens matching `scratch-tx*` all counted 0, and the embedded outpost's provider set matched the set from before the run (25 providers). There were eight complete runs, and seven passed every check. The other reported a single failure whose line the filtered output dropped, and it did not recur in the five runs after it. Authentik's event log keeps the runs' sign-in and exchange events, which hold decoded claims, never raw tokens.

## What the outpost sends

On a signed-in forward-auth answer the outpost sends 14 headers: `X-authentik-email`, `-entitlements`, `-groups`, `-jwt`, `-locale`, `-meta-app`, `-meta-jwks`, `-meta-outpost`, `-meta-provider`, `-meta-version`, `-name`, `-timezone`, `-uid` and `-username`. `X-authentik-jwt` is always among them, so nothing needs enabling in Authentik.

That token is the access token from the outpost's own code exchange (`internal/outpost/proxyv2/application/oauth_callback.go:56-73` and `mode_common.go:43` at `version/2026.8.3`). It lives for the proxy provider's `access_token_validity`: one hour here. nginx drops it today, because the shared `authentik-location.conf` forwards eight identity headers and not this one.

## What the tokens carry

| | Subject (`X-authentik-jwt`) | Issued (exchange, `audience` = service) | Delegated (plus `actor_token`) |
|---|---|---|---|
| alg, kid | HS256, none: signed with the proxy provider's client secret | RS256, kid | RS256, kid |
| `iss` | `…/application/o/scratch-tx-app/` | `…/application/o/scratch-tx-svc/` | same as issued |
| `aud` | the proxy provider's generated client_id | `scratch-tx-svc` | same |
| `azp` | same as `aud` | `scratch-tx-svc`: the target's own, never the requester | same |
| `sub` | 64-char hashed user id | the same value, checked equal to `X-authentik-uid` | unchanged |
| `groups` | `[scratch-tx-readers]` | the same: every group the person holds | same |
| `entitlements`, `roles` | `[]` (the app's own application) | `[scratch-tx-collection-a]` (the service's application) | same |
| `client_id` | absent | `scratch-tx-client`, from the mapping | same |
| `act` | absent | absent | `{sub: <64-char id of the Actor>}` |
| `scope` | `ak_proxy openid profile entitlements email` | what was asked for, cut to the service provider's mappings | same |
| `exp` | now + 3600 s | now + 3600 s (the service provider's `access_token_validity`, default `hours=1`) | same |

Both tokens also carry `acr`, `auth_time`, `iat`, `jti`, `uid`, `name`, `preferred_username`, `nickname`, `given_name`, `email` and `email_verified`. The subject alone carries `amr` (`pwd`, `mfa`), `sid` and `ak_proxy`.

## What gates it

| Attempt | Result |
|---|---|
| Forward-auth with no session | 401 |
| `audience` naming a provider that does not federate the client | 400 `invalid_target` |
| Wrong client secret, or none | 400 `invalid_client` |
| Tampered subject token | 400 `invalid_grant` |
| Person removed from the service application's bound group | 400 `invalid_grant`; restored, 200 |
| Person's session ended, same subject token | 400 `invalid_grant` (`AccessToken.session` cascades, so the proxy token goes with the session); the outpost then answers 401 |
| The raw subject token presented to the service | not verifiable: HS256, no kid, not in the JWKS |
| The issued token at a service with another audience | `InvalidAudienceError` |
| A token issued before sign-out | **still verifies offline until `exp`**: the exchanged token has no session, so its lifetime is the only revocation |

## The requesting app

- **Not in the token by default.** `to_access_token` sets `azp` to the issuing (target) provider's client_id (`authentik/providers/oauth2/id_token.py`), so an exchange names the service and never the app that asked.
- **`act` works, but nothing supported can create the actor.** The delegated exchange carried `act.sub`. For an Actor to act for any person it must have no parent, and only the ORM creates one. The API's Agents are Enterprise (atlas is unlicensed) and always have a parent, and an Actor with a parent may act only for that parent (`token/token_exchange.py`, `post_init_token_exchange_actor`). The proof created its Actor in the ORM and got the Actor's token through the client's own `client_credentials` grant, by giving the Actor the username Authentik derives for that client. That drove the code path; it is not a shape to adopt.
- **A scope mapping on the service provider stamps it (proven).** The mapping reads the token request it is evaluated in. Client authentication is checked before claims are built (`token/base.py`, `TokenRequest.parse`), so it cannot name a client that did not authenticate. The claim appears in the JWT but not in the service's userinfo answer, which has no exchange request to read. Measured: userinfo returned 200 for the issued token, with no `client_id` among its claims.

```python
from authentik.providers.oauth2.utils import extract_client_auth
if http_request is None or http_request.POST.get("grant_type") != "urn:ietf:params:oauth:grant-type:token-exchange":
    return {}
client_id, _ = extract_client_auth(http_request)
return {"client_id": client_id}
```

Recommended: the mapping, with each app's exchange client given `client_id: <app>` so that the claim reads as the app. It is proven, needs no licence, and is one object per estate. `act` is worth revisiting if Authentik ships an API for ownerless Actors.

## What the factory would stamp

The proxy provider cannot be the exchange client. `set_oauth_defaults` resets its grant types to `authorization_code`, `client_credentials` and `password` on every API save and every server start (`providers/proxy/api.py:72,78`, `providers/proxy/apps.py:20`). So the exchange client is a separate OAuth2 provider, and agent-console's persona provider is that provider.

| Where | Object | Settings |
|---|---|---|
| Per app | OAuth2 provider `<app>-persona` | `client_id: <app>`, confidential, grant types `[token-exchange]`, federation providers `[<app>'s proxy provider]`, `sub_mode: hashed_user_id` (equal to `X-authentik-uid`), short `access_token_validity` |
| Per app | Application `<app>-persona` | bound to it, hidden (`meta_launch_url: blank://blank`), bound to the app's own groups |
| Per app | Broker | its client secret, vended to the app's backend |
| Per service | OAuth2 provider `<svc>` | `client_id: <svc>`, a signing key (RS256, so it publishes a JWKS), scope mappings `openid`, `profile`, `entitlements` and `client_id`, federation providers: each consuming `<app>-persona` (Authentik's record of which apps may mint for it), short `access_token_validity` |
| Per service | Application `<svc>` | policy bindings for who may use it; entitlements for what each person may reach |
| Per estate | Scope mapping `client_id` | the five lines above |

The proof's client and service were given explicit client_ids (`scratch-tx-client`, `scratch-tx-svc`), as this table asks. Its scope was named `scratch_tx_client`; the name is free.

nginx, in each exchanging route's own location and never in the shared snippet. The outpost also accepts this token as `Authorization: Bearer` on any route of the app (`intercept_header_auth`, agent-console §1 step 3). `proxy_set_header` replaces any copy of the header sent by the client:

```nginx
auth_request_set $authentik_jwt $upstream_http_x_authentik_jwt;
proxy_set_header X-authentik-jwt $authentik_jwt;
```

The app's backend sends one form POST to `/application/o/token/`. It omits `audience` to mint for its own tools. The proof drove that too: the token is the client's own (HS256 without a signing key, `aud` the client, `sub` equal to `X-authentik-uid`), and userinfo returned 200 for it once the client carried the `openid` mapping.

```text
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
client_id=<app>  client_secret=<from the broker>
subject_token=<X-authentik-jwt>  subject_token_type=urn:ietf:params:oauth:token-type:access_token
audience=<svc>  scope=openid profile entitlements client_id
```

The service verifies the token with any JOSE library; PyJWT shown:

```python
ISSUER = "https://auth.<estate>/application/o/<svc>/"
jwks = jwt.PyJWKClient(ISSUER + "jwks/")
claims = jwt.decode(token, jwks.get_signing_key_from_jwt(token).key, algorithms=["RS256"],
                    audience="<svc>", issuer=ISSUER,
                    options={"require": ["exp", "iat", "iss", "aud", "sub", "client_id"]})
# claims["sub"]: the person; claims["client_id"]: the app; claims["entitlements"]: the person's grants here
```

## What constrains it

| Constraint | Kind | Answer |
|---|---|---|
| The proxy provider cannot carry the token-exchange grant | Hard: the code resets it, and only an upstream change would move it | A separate OAuth2 provider per app |
| The requesting app is not in the token by default | Soft | The `client_id` mapping |
| `act` cannot be used through any supported surface | Soft, two parts: a licence (Agents), and a missing API (ownerless Actors are ORM-only) | A feature request to Authentik, if `act` is wanted |
| An issued token outlives sign-out until `exp` | By construction | A short lifetime on the service provider (a setting) |
| `groups` carries every group the person holds | Soft | A service-specific mapping can filter it |
| `X-authentik-jwt` is a bearer for the whole app | Soft | Forward it only on the routes that exchange |
| agent-console §1.3's `client_credentials` + `client_assertion` route needs no client secret | Measured | With the person's proxy token as `client_assertion` and no secret, it returned 200 and a token for the person; `TokenRequest.parse` checks the secret only for the code, refresh, device and token-exchange grants. Token exchange refused the same request (`invalid_client`). §1.3 now names the exchange. |

## The authentication rule

`platform/authentication.md`, which is lodged for the sitting of 17/10/2026, forbids an app-side OIDC client.

The exchange needs **one back-channel POST** to the token endpoint, made with the app's own confidential client credentials. It needs no redirect, no session, no id_token, no refresh token and no discovery. The app does hold one broker-vended client secret, and it is registered in Authentik as an OAuth2 client (its persona provider). Whether that registration counts as the client the rule forbids is for the sitting. The service is a resource server that checks a JWKS signature, not a client.

## Open

- **Where the app's grant lives**, which the service intersects with the person's entitlements. Candidates: the service's own config keyed on `client_id`, or the mapping also emitting the service-application entitlements of an identity that stands for the app. Neither was driven.
- **The service provider's token lifetime.** The default `hours=1` was measured; the right value is not settled.
- **A call across estates**, such as an atlas app calling a titan service. Not tested; each estate's provider is its own issuer.
- **titan, mimir and CASPO's Authentik.** They run the same version and were not driven.
