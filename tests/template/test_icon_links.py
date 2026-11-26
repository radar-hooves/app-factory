"""The stamped shell links each icon size an app may draw separately, and keeps the SVG path."""

from pathlib import Path

from render import render


def test_app_html_links_each_icon_size(tmp_path: Path) -> None:
    html = (render(tmp_path / "app") / "frontend/src/app.html").read_text()
    assert 'favicon.svg" type="image/svg+xml"' in html
    assert 'favicon-16.png" sizes="16x16"' in html
    assert 'favicon.png" sizes="32x32"' in html
    assert 'apple-touch-icon.png"' in html
