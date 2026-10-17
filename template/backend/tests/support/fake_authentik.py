#!/usr/bin/env python3
"""Stand-in for Authentik's token exchange and JWKS, over real HTTP.

Mints what the exchange mints (app-factory
`docs/research/2026-10-17-token-exchange-proof.md`): an RS256 token whose
`iss` is the target provider's, `aud` its client id, `sub` the person's uid,
`client_id` the app that asked, `groups`, and the person's entitlements on the
target app. One key signs for every provider and is served at each one's
`jwks/`.

- `POST /application/o/token/`, the token-exchange grant alone. The client's
  secret must match (`invalid_client`). The subject token must be `as:<uid>`
  for a person not signed out (`invalid_grant`), standing for the proxy
  provider's token Authentik would look up. An `audience` must name a
  provider that federates the asking client (`invalid_target`); none mints
  for the client itself.
- `GET /application/o/<slug>/jwks/`, where `<slug>` is a provider's
  application's, which names its issuer.

Run by hand for the E2E: `python fake_authentik.py --port 18767 --client
<app>=<secret> --service library=<app>`.
"""

import argparse
import base64
import json
import threading
import time
import urllib.parse
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

GRANT = "urn:ietf:params:oauth:grant-type:token-exchange"
KID = "fake-authentik"
#: The exchange provider's default lifetime (`authentik/exchange.py`), in seconds.
LIFETIME = 600


@dataclass
class Provider:
    client_id: str
    secret: str = ""
    #: The client ids that may mint tokens for this one.
    federates: set[str] = field(default_factory=set)

    @property
    def slug(self) -> str:
        return f"{self.client_id}-exchange"


class FakeAuthentik:
    def __init__(self) -> None:
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.providers: dict[str, Provider] = {}
        self.signed_out: set[str] = set()
        self.groups: dict[str, list[str]] = {}
        #: (uid, client id) -> the person's entitlements on that app.
        self.entitlements: dict[tuple[str, str], list[str]] = {}
        #: Every exchange asked for: client id and audience, never a secret or a token.
        self.exchanged: list[tuple[str, str | None]] = []
        self.jwks_reads = 0
        self.lock = threading.Lock()
        self.port = 0

    def serve(self, port: int = 0) -> ThreadingHTTPServer:
        fake = self

        class Handler(_Handler):
            authentik = fake

        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        server.daemon_threads = True
        self.port = server.server_port
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server

    def provider(self, client_id: str, *, secret: str = "", federates: tuple[str, ...] = ()) -> Provider:
        made = Provider(client_id, secret, set(federates))
        self.providers[client_id] = made
        return made

    def issuer(self, client_id: str) -> str:
        return f"http://127.0.0.1:{self.port}/application/o/{self.providers[client_id].slug}/"

    def mint(
        self,
        client_id: str,
        uid: str,
        *,
        asked_by: str | None = None,
        lifetime: int = LIFETIME,
        key: rsa.RSAPrivateKey | None = None,
        asker_claim: str | None = "",
        **claims: Any,
    ) -> str:
        """The token an exchange by `asked_by` (default `client_id`) would issue for `client_id`.

        `asker_claim=None` drops the `client_id` claim; the other keywords shape a bad token.
        """
        now = int(time.time())
        body = {
            "iss": self.issuer(client_id),
            "aud": client_id,
            "azp": client_id,
            "sub": uid,
            "iat": now,
            "exp": now + lifetime,
            "preferred_username": uid,
            "groups": self.groups.get(uid, []),
            "entitlements": self.entitlements.get((uid, client_id), []),
            "client_id": None if asker_claim is None else asked_by or client_id,
            **claims,
        }
        payload = {name: value for name, value in body.items() if value is not None}
        return jwt.encode(payload, key or self.key, algorithm="RS256", headers={"kid": KID})

    def jwks(self) -> dict[str, Any]:
        numbers = self.key.public_key().public_numbers()
        return {
            "keys": [
                {
                    "kty": "RSA",
                    "alg": "RS256",
                    "use": "sig",
                    "kid": KID,
                    "n": _b64(numbers.n),
                    "e": _b64(numbers.e),
                }
            ]
        }


def _b64(number: int) -> str:
    return base64.urlsafe_b64encode(number.to_bytes((number.bit_length() + 7) // 8, "big")).rstrip(b"=").decode()


class _Handler(BaseHTTPRequestHandler):
    authentik: FakeAuthentik
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _send(self, status: int, body: object) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        fake = self.authentik
        slugs = {provider.slug for provider in fake.providers.values()}
        parts = self.path.strip("/").split("/")
        if len(parts) == 4 and parts[:2] == ["application", "o"] and parts[2] in slugs and parts[3] == "jwks":
            with fake.lock:
                fake.jwks_reads += 1
            self._send(200, fake.jwks())
            return
        self._send(404, {"detail": "Not found."})

    def do_POST(self) -> None:
        fake = self.authentik
        if self.path != "/application/o/token/":
            self._send(404, {"detail": "Not found."})
            return
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
        form = {name: values[0] for name, values in urllib.parse.parse_qs(raw).items()}
        client = fake.providers.get(form.get("client_id", ""))
        audience = form.get("audience")
        with fake.lock:
            fake.exchanged.append((form.get("client_id", ""), audience))
        if form.get("grant_type") != GRANT:
            self._send(400, {"error": "unsupported_grant_type"})
            return
        if client is None or not client.secret or form.get("client_secret") != client.secret:
            self._send(400, {"error": "invalid_client"})
            return
        subject = form.get("subject_token", "")
        uid = subject.removeprefix("as:")
        if not subject.startswith("as:") or not uid or uid in fake.signed_out:
            self._send(400, {"error": "invalid_grant"})
            return
        target = fake.providers.get(audience) if audience else client
        if target is None or (target is not client and client.client_id not in target.federates):
            self._send(400, {"error": "invalid_target"})
            return
        token = fake.mint(target.client_id, uid, asked_by=client.client_id)
        self._send(200, {"access_token": token, "token_type": "bearer", "expires_in": LIFETIME})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--port", type=int, default=18767)
    parser.add_argument("--client", action="append", default=[], help="<client id>=<secret>")
    parser.add_argument("--service", action="append", default=[], help="<client id>=<client id that may ask>")
    args = parser.parse_args()
    fake = FakeAuthentik()
    for spec in args.client:
        client_id, _, secret = spec.partition("=")
        fake.provider(client_id, secret=secret)
    for spec in args.service:
        client_id, _, asker = spec.partition("=")
        fake.provider(client_id, federates=(asker,))
    server = fake.serve(args.port)
    print(f"fake Authentik on :{fake.port}", flush=True)
    try:
        threading.Event().wait()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
