"""Conditional GET: `If-None-Match` compared as RFC 9110 §13.1.2 requires."""


def etag_matches(if_none_match: str | None, etag: str) -> bool:
    """Whether `If-None-Match` names `etag`, weakly: `W/"x"` matches `"x"`, a comma list is searched, `*` matches.

    A hop in front of the app (the CDN edge) may weaken a strong tag it forwards, so an exact string compare never answers 304.
    """
    if not if_none_match:
        return False
    opaque = etag.removeprefix("W/")
    return any(tag == "*" or tag.removeprefix("W/") == opaque for tag in (t.strip() for t in if_none_match.split(",")))
