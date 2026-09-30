"""The driver, through the argv and environment it builds and a real subprocess it reads."""

import json
from pathlib import Path
from typing import Any

import pytest
from agent_common import cli
from agent_common.persona import Persona


async def _ask(settings: cli.Settings, persona: Persona, question: str, **kwargs: Any) -> list[dict[str, Any]]:
    return [event async for event in cli.ask(settings, persona, question, **kwargs)]


def _echo(events: list[dict[str, Any]]) -> dict[str, Any]:
    """What the fake CLI reported of its own argv and environment."""
    assistant = next(event for event in events if event.get("type") == "assistant")
    echoed: dict[str, Any] = json.loads(assistant["message"]["content"][0]["text"])
    return echoed


# ── argv ─────────────────────────────────────────────────────────────────


def test_a_chat_turns_argv(settings: cli.Settings, milton: Persona) -> None:
    assert cli.argv(settings, milton, "what is leave?", resume="abc") == [
        settings.executable,
        "-p",
        "what is leave?",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--allowedTools",
        "Read,Grep",
        "--disallowedTools",
        "Bash",
        "--effort",
        "high",
        "--permission-mode",
        "bypassPermissions",
        "--mcp-config",
        str(milton.home / ".mcp.json"),
        "--strict-mcp-config",
        "--resume",
        "abc",
    ]


def test_a_jobs_argv_takes_its_turns_from_stdin(settings: cli.Settings, milton: Persona, tmp_path: Path) -> None:
    command = cli.argv(
        settings,
        milton,
        None,
        session_id="job-1",
        mcp_config=tmp_path / "job.json",
        append_system_prompt="Also this.",
        json_schema={"type": "object"},
        input_format="stream-json",
        model="opus",
        partial_messages=False,
    )
    assert command[:2] == [settings.executable, "-p"]
    assert command[2] == "--output-format"
    assert "--include-partial-messages" not in command
    assert command[command.index("--mcp-config") + 1] == str(tmp_path / "job.json")
    assert command[command.index("--append-system-prompt") + 1] == "Also this."
    assert json.loads(command[command.index("--json-schema") + 1]) == {"type": "object"}
    assert command[command.index("--model") + 1] == "opus"
    assert command[command.index("--input-format") + 1] == "stream-json"
    assert "--replay-user-messages" in command
    assert command[command.index("--session-id") + 1] == "job-1"
    assert "--resume" not in command


# ── environment ──────────────────────────────────────────────────────────


def test_the_environment_is_built_from_scratch_around_the_personas_home(
    settings: cli.Settings, milton: Persona, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("KIT_TEST_MARKER", "an app secret")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "direct-path-token")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://alloy:4318")
    monkeypatch.setenv("OTEL_SERVICE_NAME", "the-app")

    env = cli.environment(settings, milton)

    assert "KIT_TEST_MARKER" not in env
    assert env["HOME"] == env["CLAUDE_CONFIG_DIR"] == str(milton.home)
    assert env["CLAUDE_CODE_OAUTH_TOKEN"] == "direct-path-token"
    assert env["OTEL_EXPORTER_OTLP_ENDPOINT"] == "http://alloy:4318"
    assert env["OTEL_SERVICE_NAME"] == "kit-test-agent-milton"
    assert env["MAX_THINKING_TOKENS"] == "0"
    assert "ANTHROPIC_BASE_URL" not in env


def test_thinking_on_sets_no_token_cap(settings: cli.Settings, milton: Persona) -> None:
    assert "MAX_THINKING_TOKENS" not in cli.environment(cli.Settings(service="s", thinking=True), milton)


def test_a_named_gateway_confines_the_child_to_it_even_with_no_key(
    milton: Persona, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A missing key fails at the gateway rather than falling through to the OAuth token."""
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "direct-path-token")
    env = cli.environment(cli.Settings(service="s", gateway_url="https://gateway.example", haiku_model="h"), milton)
    assert env["ANTHROPIC_BASE_URL"] == "https://gateway.example"
    assert env["ANTHROPIC_AUTH_TOKEN"] == ""
    assert env["ANTHROPIC_DEFAULT_HAIKU_MODEL"] == "h"
    assert env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] == "1"
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in env


def test_a_runs_own_variables_reach_its_environment_and_nothing_else(
    settings: cli.Settings, milton: Persona, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("KIT_TEST_MARKER", "an app secret")
    env = cli.environment(settings, milton, {"ASKER_TOKEN": "one asker's"})
    assert env["ASKER_TOKEN"] == "one asker's"
    assert "KIT_TEST_MARKER" not in env
    assert "ASKER_TOKEN" not in cli.environment(settings, milton)


@pytest.mark.parametrize("name", ["HOME", "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_BASE_URL", "PATH"])
def test_a_runs_own_variables_may_not_displace_what_the_driver_decides(
    settings: cli.Settings, milton: Persona, name: str
) -> None:
    with pytest.raises(ValueError, match=name):
        cli.environment(settings, milton, {name: "x"})


def test_the_gateway_key_never_appears_in_a_repr() -> None:
    assert "not-a-real-token" not in repr(cli.Settings(service="s", gateway_key="not-a-real-token"))


# ── a turn, through a real subprocess ───────────────────────────────────


async def test_a_turn_yields_the_clis_events_verbatim_and_drops_what_is_not_json(
    settings: cli.Settings, milton: Persona
) -> None:
    events = await _ask(settings, milton, "hello")

    assert [event["type"] for event in events] == ["system", "assistant", "result"]
    echo = _echo(events)
    assert echo["argv"][echo["argv"].index("-p") + 1] == "hello"
    assert echo["cwd"] == str(milton.home)
    assert echo["env"]["CLAUDE_CONFIG_DIR"] == str(milton.home)


async def test_a_turn_runs_where_it_is_told_with_what_it_is_given(
    settings: cli.Settings, milton: Persona, tmp_path: Path
) -> None:
    echo = _echo(await _ask(settings, milton, "hi", cwd=tmp_path, append_system_prompt="Scoped.", model="opus"))
    assert echo["cwd"] == str(tmp_path)
    assert echo["argv"][echo["argv"].index("--append-system-prompt") + 1] == "Scoped."
    assert echo["argv"][echo["argv"].index("--model") + 1] == "opus"


async def test_a_line_past_asyncios_default_limit_arrives_intact(settings: cli.Settings, milton: Persona) -> None:
    events = await _ask(settings, milton, "__giant__")
    assistant = next(event for event in events if event["type"] == "assistant")
    assert len(assistant["message"]["content"][0]["text"]) == 200_000
    assert not any(event["type"] == cli.ERROR_EVENT for event in events)


async def test_stderr_past_the_pipe_buffer_does_not_stall_the_turn(settings: cli.Settings, milton: Persona) -> None:
    events = await _ask(settings, milton, "__chatty__")
    assert events[-1]["type"] == "result"


async def test_a_cli_that_dies_badly_is_one_error_frame_with_its_stderr_scrubbed(
    settings: cli.Settings, milton: Persona
) -> None:
    events = await _ask(settings, milton, "__crash__")

    assert len(events) == 1
    assert events[0]["type"] == cli.ERROR_EVENT
    assert events[0]["error"] == "agent exited 3"
    assert "Bearer [redacted]" in events[0]["detail"]
    assert "https://gw.example/v1?[redacted]" in events[0]["detail"]
    assert "sk-live-123" not in events[0]["detail"]


async def test_a_silent_cli_is_killed_at_the_idle_timeout(settings: cli.Settings, milton: Persona) -> None:
    quick = cli.Settings(service=settings.service, executable=settings.executable, timeout_seconds=0.5)
    assert await _ask(quick, milton, "__hang__") == [
        {"type": cli.ERROR_EVENT, "error": "agent exceeded its wall clock"}
    ]


async def test_a_cli_that_cannot_start_is_one_error_frame(milton: Persona, tmp_path: Path) -> None:
    events = await _ask(cli.Settings(service="s", executable=str(tmp_path / "no-such-cli")), milton, "hi")
    assert len(events) == 1
    assert events[0]["error"].startswith("agent could not start: ")


# ── stdin frames and the scrub ──────────────────────────────────────────


def test_a_user_frame_is_one_stream_json_line() -> None:
    frame = cli.user_frame("next")
    assert frame.endswith(b"\n")
    assert json.loads(frame) == {
        "type": "user",
        "message": {"role": "user", "content": [{"type": "text", "text": "next"}]},
    }


def test_the_scrub_takes_bearer_tokens_and_query_strings() -> None:
    assert cli.scrub_credentials("bearer abc at http://x/y?sig=1 ok") == "Bearer [redacted] at http://x/y?[redacted] ok"
