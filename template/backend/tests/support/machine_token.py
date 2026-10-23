"""A machine bearer shaped like Authentik's: a JWT naming the audience it was issued for.

The signature segment carries a label instead of a signature. The gate never
verifies one (userinfo vouches for the token); a fake userinfo reads the label
back with :func:`token_label` to decide who the token is.
"""

import base64
import json

#: The audience the gate under test is configured to accept.
AUDIENCE = "this-app-client"


def _segment(value: dict[str, object]) -> str:
    return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()


def machine_token(label: str, *, aud: str | list[str] | None = AUDIENCE) -> str:
    """A bearer whose ``aud`` is ``aud`` (omitted when None) and whose signature segment is ``label``."""
    claims: dict[str, object] = {"iss": "https://auth.example.test/application/o/app/", "sub": label}
    if aud is not None:
        claims["aud"] = aud
    return f"{_segment({'alg': 'RS256', 'typ': 'JWT'})}.{_segment(claims)}.{label}"


def token_label(bearer: str) -> str:
    """The label ``machine_token`` signed with, or the bearer itself when it is not one."""
    return bearer.rsplit(".", 1)[-1]
