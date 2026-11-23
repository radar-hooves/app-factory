"""The stamped suite binds its Postgres only when a selected test needs a database.

The template's conftest is rendered into a scratch project whose app, sqlalchemy, httpx and
filelock are stubs and whose `_resolve_test_server` records a marker file instead of starting a
container, so what is proved is WHEN the server is resolved, with no Docker and no private index.
"""

import importlib.util
import os
import subprocess
import sys
from pathlib import Path

CONFTEST = Path(__file__).resolve().parents[2] / "template/backend/tests/conftest.py.jinja"

THIRD_PARTY = {"filelock", "httpx", "sqlalchemy"}

STUBS = {
    "filelock.py": "class FileLock:\n    def __init__(self, *_a): ...\n    def __enter__(self): return self\n    def __exit__(self, *_a): return False\n",
    "httpx.py": "class ASGITransport:\n    def __init__(self, **_k): ...\nclass AsyncClient: ...\n",
    "sqlalchemy/__init__.py": "",
    "sqlalchemy/orm.py": "class Session: ...\ndef sessionmaker(**_k):\n    return lambda: type('S', (), {'close': lambda self: None})()\n",
    "pkg/__init__.py": "",
    "pkg/config/__init__.py": "from functools import lru_cache\n@lru_cache\ndef get_settings(): return object()\n",
    "pkg/db/__init__.py": "",
    "pkg/db/session.py": (
        "class _Conn:\n    def begin(self): return self\n    def rollback(self): ...\n    def close(self): ...\n"
        "class _Engine:\n    def connect(self): return _Conn()\n"
        "_engine = None\n"
        "def get_engine(): return _Engine()\n"
        "def get_session(): ...\n"
    ),
    "pkg/main.py": "def create_app(): return object()\n",
    "pkg/api/__init__.py": "",
    "pkg/api/users/__init__.py": "",
    "pkg/api/users/service.py": "def upsert_from_identity(*_a, **_k): ...\n",
    "tests/__init__.py": "",
    "tests/app_fixtures.py": (
        "import pytest\ndef app_session_start(): ...\n"
        "@pytest.fixture\ndef _engine(): return object()\n"
        "@pytest.fixture\ndef db_session(_engine): return _engine\n"
        "@pytest.fixture(autouse=True)\ndef _guard(): ...\n"
    ),
    "tests/app_chain/__init__.py": "",
    "tests/app_chain/conftest.py": "import pytest\n@pytest.fixture\ndef bound(db_session): return db_session\n",
    "tests/app_chain/test_chain.py": (
        "import os\ndef test_chain(bound):\n    assert os.environ['POSTGRES_HOST'] == 'db.test'\n"
    ),
    # What the real `_resolve_test_server` would start, replaced by a marker; the migrations are the app's, not under test.
    "tests/probe.py": (
        "import os, sys\n"
        "import pytest\n@pytest.hookimpl(tryfirst=True)\ndef pytest_collection_finish(session):\n"
        "    conftest = sys.modules['tests.conftest']\n"
        "    def resolve():\n"
        "        with open(os.environ['BIND_MARKER'], 'a') as marker:\n"
        "            marker.write('bound\\n')\n"
        "        return {'host': 'db.test', 'port': '5999', 'user': 'postgres', 'password': 'pw'}\n"
        "    conftest._resolve_test_server = resolve\n"
        "    conftest._ensure_test_database_ready = lambda: None\n"
    ),
    "tests/test_plain.py": (
        "import os\ndef test_plain():\n    assert os.environ['POSTGRES_HOST'] == os.environ['EXPECT_HOST']\n"
    ),
    "tests/test_database.py": (
        "import os\n"
        "def test_database(session):\n"
        "    assert os.environ['POSTGRES_HOST'] == 'db.test' and os.environ['POSTGRES_PORT'] == '5999'\n"
        "    assert os.environ['POSTGRES_PASSWORD'] != os.environ['POSTGRES_RUNTIME_PASSWORD'] != 'test-server-not-bound'\n"
    ),
    "pyproject.toml": "[tool.pytest.ini_options]\ntestpaths = ['tests']\npythonpath = ['.']\naddopts = '-p tests.probe'\n",
}


def _project(tmp_path: Path) -> Path:
    for name, text in STUBS.items():
        if name.split("/")[0].removesuffix(".py") in THIRD_PARTY and importlib.util.find_spec(
            name.split("/")[0].removesuffix(".py")
        ):
            continue  # the real library, where this environment has one
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    source = (
        CONFTEST.read_text()
        .replace("{{ package_name }}", "pkg")
        .replace("{{ project_name | upper | replace('-', '_') }}", "PKG")
        .replace("{% raw %}", "")
        .replace("{% endraw %}", "")
    )
    (tmp_path / "tests/conftest.py").write_text(source)
    return tmp_path


def _run(
    project: Path, *args: str, expect_host: str = "test-server-not-bound.invalid"
) -> tuple[subprocess.CompletedProcess[str], int]:
    marker = project / "bound.log"
    env = {
        **os.environ,
        "DOCKER_HOST": "unix:///nonexistent",
        "BIND_MARKER": str(marker),
        "EXPECT_HOST": expect_host,
        "PYTHONPATH": str(project),
    }
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", *args],
        cwd=project,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    return result, len(marker.read_text().splitlines()) if marker.exists() else 0


def test_a_run_selecting_no_database_test_binds_nothing(tmp_path: Path) -> None:
    result, binds = _run(_project(tmp_path), "tests/test_plain.py")
    assert result.returncode == 0, result.stdout + result.stderr
    assert binds == 0


def test_collect_only_binds_nothing(tmp_path: Path) -> None:
    result, binds = _run(_project(tmp_path), "--collect-only", "tests")
    assert result.returncode == 0, result.stdout + result.stderr
    assert binds == 0


def test_a_run_selecting_a_database_test_binds_once(tmp_path: Path) -> None:
    result, binds = _run(_project(tmp_path), "tests", expect_host="db.test")
    assert result.returncode == 0, result.stdout + result.stderr
    assert binds == 1


def test_a_test_reaching_the_database_through_the_apps_own_fixtures_binds_once(tmp_path: Path) -> None:
    result, binds = _run(_project(tmp_path), "tests/app_chain", expect_host="db.test")
    assert result.returncode == 0, result.stdout + result.stderr
    assert binds == 1
