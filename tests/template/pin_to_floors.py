"""Prepare a rendered backend to install its household packages at their declared floors.

`uv sync --resolution lowest-direct` alone lowers every direct dependency, and a floor
written for the language's own ecosystem predates the interpreter (an old pydantic-core
has no wheel for it). Pinning everything but the household's own packages to the locked
version leaves `lowest-direct` to lower exactly those: the packages whose floor is a release
of our own code, where a floor below what the template calls is a fault no PyPI wheel hides.

Usage: pin_to_floors.py <backend dir>, after `uv sync` has written the highest-resolution lock.
"""

import sys
import tomllib
from pathlib import Path

backend = Path(sys.argv[1])
pyproject = backend / "pyproject.toml"
text = pyproject.read_text()
household = {name for name, source in tomllib.loads(text)["tool"]["uv"]["sources"].items() if "index" in source}
locked = tomllib.loads((backend / "uv.lock").read_text())["package"]
pins = [f'"{p["name"]}=={p["version"]}"' for p in locked if "registry" in p["source"] and p["name"] not in household]
pyproject.write_text(text.replace("[tool.uv]\n", f"[tool.uv]\nconstraint-dependencies = [{', '.join(pins)}]\n", 1))
print(f"pinned {len(pins)} packages; lowering {sorted(household)}")
