"""An app has one `cn()`, the kit's: the stamped utils file re-exports it and nothing re-implements it."""

from pathlib import Path

from render import render


def test_the_stamped_cn_is_the_kits(tmp_path: Path) -> None:
    app = render(tmp_path / "app") / "frontend/src/lib"
    assert "export { cn } from '@poodle64/ui/utils';" in (app / "utils.ts").read_text()
    assert "twMerge" not in (app / "utils.ts").read_text()
    assert "from '@poodle64/ui/utils'" in (app / "workspaces/workspace-menu.svelte").read_text()
