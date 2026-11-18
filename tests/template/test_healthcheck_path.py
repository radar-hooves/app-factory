"""`healthcheck_path` is the route the container healthcheck polls: liveness by default, the app's own readiness by answer."""

from pathlib import Path

from render import render


def _healthcheck(app: Path) -> str:
    text = (app / "compose.yaml").read_text()
    return text[text.index("healthcheck:") : text.index("interval:")]


def test_the_default_probes_the_schema_and_requires_its_body(tmp_path: Path) -> None:
    probe = _healthcheck(render(tmp_path / "app"))
    assert "localhost:8398/openapi.json" in probe
    assert '"openapi" in json.load(response)' in probe


def test_an_app_that_names_a_route_is_healthy_only_when_it_answers_200(tmp_path: Path) -> None:
    probe = _healthcheck(render(tmp_path / "app", healthcheck_path="/api/system/health"))
    assert "localhost:8398/api/system/health" in probe
    assert "openapi" not in probe
    assert "response.getcode() == 200 else 1" in probe
