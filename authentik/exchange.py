"""Provision one app's party to the token exchange (template `exchange.py`), and the estate's one mapping.

Run by Authentik itself, inside the server container's own `ak shell`, the
code on stdin and every input in the environment, so no value reaches a
command line or a file:

    portcullis exec --broker <url> --vend EXCHANGE_CLIENT_SECRET=<app>-exchange.value -- \\
      docker exec -i -e EXCHANGE_CLIENT_SECRET -e EXCHANGE_APP=<app> -e EXCHANGE_SIGNIN=<slug> \\
        -e EXCHANGE_CONSUMERS="<app> ..." authentik-server <the container's entrypoint> \\
        shell -c "import sys; exec(sys.stdin.read())" < authentik/exchange.py

- `EXCHANGE_APP`: the app's name, its client id.
- `EXCHANGE_SIGNIN`: the slug of the application its people sign in to, whose
  proxy provider's tokens (`X-authentik-jwt`) it trades. Empty for a service
  nobody signs in to.
- `EXCHANGE_CONSUMERS`: the client ids of the apps that may ask this one for a
  person, each provisioned first. The whole list, every run.
- `EXCHANGE_CLIENT_SECRET`: from the broker, never typed.
- `EXCHANGE_LIFETIME` (`minutes=10`), `EXCHANGE_MAPPING` (`app-factory: asker`)
  and `EXCHANGE_SIGNING_KEY` (`authentik Self-signed Certificate`) rarely change.

Every run sets each object to what this file says, so a second run changes
nothing and a changed input converges. Design: `docs/design/exchange.md`.
"""

import os

from authentik.common.oauth.constants import GRANT_TYPE_TOKEN_EXCHANGE, SubModes
from authentik.core.models import Application
from authentik.crypto.models import CertificateKeyPair
from authentik.flows.models import Flow
from authentik.providers.oauth2.models import ClientType, OAuth2Provider, ScopeMapping
from authentik.providers.proxy.models import ProxyProvider

#: The estate's one scope mapping, on every exchange provider and nothing else.
ASKER = """\
# The person's entitlements on the app a token is for, read from the application
# its people sign in to (the proxy provider it federates), so a page and a persona
# share one vocabulary; and, on a token exchange, the client that asked, which
# authenticated before claims are built. radar-hooves/app-factory authentik/exchange.py.
from authentik.core.models import Application
from authentik.providers.oauth2.utils import extract_client_auth
from authentik.providers.proxy.models import ProxyProvider

signin = ProxyProvider.objects.filter(pk__in=provider.jwt_federation_providers.values("pk"))
application = Application.objects.filter(provider__in=signin).first()
application = application or Application.objects.filter(provider=provider).first()
names = [entitlement.name for entitlement in request.user.app_entitlements(application)] if application else []
claims = {"entitlements": names, "roles": names}
exchange = "urn:ietf:params:oauth:grant-type:token-exchange"
if http_request is not None and http_request.POST.get("grant_type") == exchange:
    claims["client_id"] = extract_client_auth(http_request)[0]
return claims
"""


def provision() -> str:
    app = os.environ["EXCHANGE_APP"].strip()
    secret = os.environ.get("EXCHANGE_CLIENT_SECRET", "")
    if not app or not secret:
        raise SystemExit("EXCHANGE_APP and EXCHANGE_CLIENT_SECRET (vended, never typed) are both required")
    lifetime = os.environ.get("EXCHANGE_LIFETIME", "minutes=10")
    name = f"{app.replace('-', ' ').title()} Exchange"
    mapping, _ = ScopeMapping.objects.update_or_create(
        name=os.environ.get("EXCHANGE_MAPPING", "app-factory: asker"),
        defaults={"scope_name": "asker", "description": "Who is asking", "expression": ASKER},
    )
    signin = os.environ.get("EXCHANGE_SIGNIN", "").strip()
    federated: list[OAuth2Provider] = [ProxyProvider.objects.get(application__slug=signin)] if signin else []
    federated += [
        OAuth2Provider.objects.get(client_id=consumer) for consumer in os.environ.get("EXCHANGE_CONSUMERS", "").split()
    ]
    provider, _ = OAuth2Provider.objects.update_or_create(
        client_id=app,
        defaults={
            "name": name,
            "client_type": ClientType.CONFIDENTIAL,
            "client_secret": secret,
            "grant_types": [GRANT_TYPE_TOKEN_EXCHANGE],
            "authorization_flow": Flow.objects.get(slug="default-provider-authorization-implicit-consent"),
            "invalidation_flow": Flow.objects.get(slug="default-provider-invalidation-flow"),
            "signing_key": CertificateKeyPair.objects.get(
                name=os.environ.get("EXCHANGE_SIGNING_KEY", "authentik Self-signed Certificate")
            ),
            "sub_mode": SubModes.HASHED_USER_ID,
            "access_token_validity": lifetime,
            "include_claims_in_id_token": True,
        },
    )
    standard = ScopeMapping.objects.filter(
        managed__in=["goauthentik.io/providers/oauth2/scope-openid", "goauthentik.io/providers/oauth2/scope-profile"]
    )
    provider.property_mappings.set([*standard, mapping])
    provider.jwt_federation_providers.set(federated)
    # Hidden: it launches nothing. No policy binding of its own: the subject token
    # proves the sign-in app admitted the person, and a service cuts by entitlement.
    Application.objects.update_or_create(
        slug=f"{app}-exchange",
        defaults={"name": name, "provider": provider, "meta_launch_url": "blank://blank"},
    )
    return (
        f"{app}: issuer /application/o/{app}-exchange/, lifetime {lifetime}, "
        f"federates {', '.join(party.name for party in federated) or 'nothing'}"
    )


print(provision())
