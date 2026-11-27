"""The stamped compose publishes the app port on loopback only, never on every interface."""

from pathlib import Path

from render import render


def test_the_app_port_binds_loopback(tmp_path: Path) -> None:
    text = (render(tmp_path / "app") / "compose.yaml").read_text()
    assert "'127.0.0.1:8398:8398'" in text
