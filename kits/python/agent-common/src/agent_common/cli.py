"""The Claude Code driver: spawn `claude -p` as a persona and yield its events verbatim.

This module does NOT interpret the stream. A translation layer between Claude
Code's events and some house vocabulary rots the moment Claude Code adds an
event type, and it makes a console show something other than what the agent
actually did. So every line the CLI emits on stdout is forwarded unchanged,
and the frontend renders the real thing.

`--output-format stream-json` IS the wire format, which is why this drives the
CLI rather than the Agent SDK: the SDK hands back typed Python objects that
would have to be re-serialised, and re-serialising is translating.

Two kinds of turn share it. A chat turn (`ask`) is one question on the command
line, one process, one stream: CLAUDE.md in the persona's home is its system
prompt and settings.json its model. An app-started job writes every turn to
stdin as a stream-json `user` frame (`user_frame`) and carries its own
system-prompt addendum, JSON schema, model and working directory, so those
stay optional parameters of `argv` rather than a second copy of it. Both
spawn through `spawn`, read through `events` and end through `kill`.

Lifted from the stamped `api/agent/session.py` and the driver inside
`api/agent/jobs.py` (radar-hooves/app-factory), which both began as
the library's `api/agent/session.py`. Need: radar-hooves/cadmus (Nightjar),
30/09/2026.
"""

import asyncio
import contextlib
import json
import os
import re
import signal
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from agent_common.persona import Persona

#: The error frame's `type`. Not this driver's own vocabulary — it is
#: `@poodle64/librarian`'s wire contract: `Transcript.apply()` in the shared
#: frontend package special-cases the literal string `library_error` to set
#: `outcome.isError`, and nothing else recognises a failed turn. Renaming it
#: here would compile, look correct, and render nothing at all.
ERROR_EVENT = "library_error"

#: asyncio's own default (64 KiB) is a StreamReader buffer limit, not a CLI or
#: protocol one: `readline()` raises `ValueError` the moment one stream-json
#: line exceeds it, killing the turn mid-stream. Measured: a
#: `user`/`tool_result` frame carrying 100 rows. 16 MiB because a tool result
#: can carry a whole document.
LINE_LIMIT = 16 * 1024 * 1024

#: How much of the CLI's stderr is kept, for the failure diagnostic only.
STDERR_TAIL_BYTES = 4096

#: Named, not inherited wholesale: the app process's own environment carries
#: that app's own secrets (the database password, the OIDC client secret,
#: broker-vended values), and a persona whose settings.json does not deny a
#: shell or network tool could otherwise read one out of its environment and
#: echo it into the stream. PATH so the CLI (and any shebang line it or a hook
#: execs) resolves an interpreter the ordinary way; LANG/LC_ALL/TERM for
#: encoding and terminal detection; CLAUDE_CODE_OAUTH_TOKEN because it is the
#: credential the CLI authenticates with, vended onto the app process from the
#: broker and never minted here.
_INHERITED_IF_SET = ("PATH", "LANG", "LC_ALL", "TERM", "CLAUDE_CODE_OAUTH_TOKEN")

#: Claude Code's own OpenTelemetry configuration, passed through only when the
#: deployment set it on the app process, so a persona's session reports to the
#: same OTLP collector the app itself does (app-factory#40).
#: `OTEL_SERVICE_NAME` is deliberately not here — the child gets its own,
#: computed in `environment()`, so its telemetry is never folded into the app's.
_TELEMETRY_INHERITED_IF_SET = (
    "CLAUDE_CODE_ENABLE_TELEMETRY",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_HEADERS",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    "OTEL_METRICS_EXPORTER",
    "OTEL_LOGS_EXPORTER",
    "OTEL_RESOURCE_ATTRIBUTES",
)

#: Every name `environment()` decides itself. A turn's own variables
#: (`run_env`) may name none of them: a per-turn value never displaces the
#: persona's home, the CLI's credential or the gateway confinement.
_DECIDED = frozenset(
    {
        "HOME",
        "CLAUDE_CONFIG_DIR",
        "OTEL_SERVICE_NAME",
        "MAX_THINKING_TOKENS",
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_CUSTOM_HEADERS",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
        *_INHERITED_IF_SET,
        *_TELEMETRY_INHERITED_IF_SET,
    }
)

_BEARER = re.compile(r"(?i)\bbearer\s+\S+")
_URL_QUERY = re.compile(r"(https?://[^\s?]+)\?\S*")


@dataclass(frozen=True, slots=True)
class Settings:
    """What every session a deployment spawns shares; a persona's own files decide the rest.

    `service` names the deployment's sessions in telemetry: each one reports
    as `<service>-<persona>`. `gateway_url`, set, confines every session to
    that Anthropic-compatible gateway, authenticated by `gateway_key`, and
    names `haiku_model` as the small model Claude Code runs background work
    on, since through a gateway it can only be one the gateway serves; empty,
    the CLI authenticates with the inherited `CLAUDE_CODE_OAUTH_TOKEN`.
    `timeout_seconds` is an IDLE timeout: how long the CLI may go silent while
    it still owes a line. `thinking` off sets `MAX_THINKING_TOKENS=0`, the
    only mechanism that actually disables extended thinking.
    """

    service: str
    executable: str = "claude"
    effort: str = "high"
    thinking: bool = False
    timeout_seconds: float = 600.0
    gateway_url: str = ""
    gateway_key: str = field(default="", repr=False)
    haiku_model: str = ""


class IdleTimeout(TimeoutError):
    """The CLI went silent past `Settings.timeout_seconds` while it still owed a line."""


def scrub_credentials(text: str) -> str:
    """Strip anything shaped like a bearer token or a URL query string.

    Applied to the one text a driver hands back that neither the persona nor
    the app chose: the CLI's stderr tail, where a gateway or MCP error line
    can echo a bearer token or a signed URL.
    """
    return _URL_QUERY.sub(r"\1?[redacted]", _BEARER.sub("Bearer [redacted]", text))


def environment(settings: Settings, persona: Persona, run_env: Mapping[str, str] | None = None) -> dict[str, str]:
    """The subprocess environment, built from scratch rather than inherited.

    `CLAUDE_CONFIG_DIR` and `HOME` are always the persona's own home, never an
    ambient login: a persona's whole point is its own isolated home.
    `run_env` is this one run's own variables, such as the asker's token a
    persona's `.mcp.json` expands into a bearer header: in this process's
    environment only, never a file in the home every asker shares.

    Raises:
        ValueError: `run_env` names a variable this function decides itself.
    """
    clash = sorted(_DECIDED & (run_env or {}).keys())
    if clash:
        raise ValueError(f"a run's own variables may not name {', '.join(clash)}")
    env: dict[str, str] = {
        "HOME": str(persona.home),
        "CLAUDE_CONFIG_DIR": str(persona.home),
        "OTEL_SERVICE_NAME": f"{settings.service}-{persona.name}",
    }
    for name in _INHERITED_IF_SET + _TELEMETRY_INHERITED_IF_SET:
        if name in os.environ:
            env[name] = os.environ[name]

    if not settings.thinking:
        env["MAX_THINKING_TOKENS"] = "0"

    if settings.gateway_url:
        # Keyed on the URL, never on whether a key resolved: a deployment that
        # names a gateway is confined to it, and a missing key must fail the
        # turn at the gateway rather than fall through to the OAuth token and
        # reach Anthropic directly. The token is dropped for the same reason.
        env.pop("CLAUDE_CODE_OAUTH_TOKEN", None)
        env["ANTHROPIC_BASE_URL"] = settings.gateway_url
        env["ANTHROPIC_AUTH_TOKEN"] = settings.gateway_key
        env["ANTHROPIC_DEFAULT_HAIKU_MODEL"] = settings.haiku_model
        # The gateway's end user is the deployment, a bounded name. Left alone,
        # Claude Code sends a per-session `metadata.user_id`, which LiteLLM
        # maps to `end_user`: one unbounded value per session. LiteLLM reads
        # this header before the body's `metadata.user_id`.
        env["ANTHROPIC_CUSTOM_HEADERS"] = f"x-litellm-end-user-id: {settings.service}"
        # No auto-update, telemetry, or availability checks: a container that
        # reaches past its gateway on start is one more thing to diagnose.
        env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1"

    return {**env, **(run_env or {})}


def argv(
    settings: Settings,
    persona: Persona,
    question: str | None,
    *,
    resume: str | None = None,
    session_id: str | None = None,
    mcp_config: Path | None = None,
    append_system_prompt: str | None = None,
    json_schema: dict[str, object] | None = None,
    input_format: str | None = None,
    model: str | None = None,
    partial_messages: bool = True,
) -> list[str]:
    """The exact command line. Split out so a test can assert it without a subprocess.

    A chat turn passes only `question` and `resume`, and gets the argv it has
    always had. `session_id` and `resume` are mutually exclusive the way the
    CLI's own `--session-id`/`--resume` are: the former MINTS an id before the
    CLI has run at all, the latter continues one already minted.

    `input_format="stream-json"` takes every turn from stdin, so `question`
    is `None` there: the CLI ignores a prompt on the command line in that
    mode (measured, 2.1.283 — it exits having answered nothing). It also adds
    `--replay-user-messages`, which echoes each stdin frame back as the turn
    that consumes it starts: the only record of what the agent was sent.
    """
    command = [settings.executable, "-p"]
    if question is not None:
        command.append(question)
    command += [
        "--output-format",
        "stream-json",
        # --verbose is REQUIRED for stream-json to emit anything but the final
        # result; without it the endpoint streams one frame at the very end and
        # looks like a hang.
        "--verbose",
    ]
    if partial_messages:
        # Token-level deltas. Without this, `assistant` events arrive as whole
        # blocks and a console renders in paragraph-sized jumps rather than
        # streaming the way the editor does.
        command.append("--include-partial-messages")
    command += [
        "--allowedTools",
        persona.allowed_tools,
        "--disallowedTools",
        persona.disallowed_tools,
        "--effort",
        settings.effort,
        "--permission-mode",
        "bypassPermissions",
    ]
    config = mcp_config if mcp_config is not None else persona.mcp_config
    if config is not None:
        # --strict-mcp-config stops the CLI walking cwd's ancestors for a
        # second .mcp.json: without it, a persona's own file merges with
        # whatever the household fleet happens to declare above the persona's
        # home. Measured: a developer's system/init listed ninety fleet
        # servers beside the persona's own two.
        command += ["--mcp-config", str(config), "--strict-mcp-config"]
    if append_system_prompt:
        command += ["--append-system-prompt", append_system_prompt]
    if json_schema is not None:
        command += ["--json-schema", json.dumps(json_schema)]
    if model:
        command += ["--model", model]
    if input_format:
        command += ["--input-format", input_format]
        if input_format == "stream-json":
            command.append("--replay-user-messages")
    if session_id:
        command += ["--session-id", session_id]
    if resume:
        command += ["--resume", resume]
    return command


async def spawn(
    settings: Settings,
    persona: Persona,
    command: list[str],
    *,
    cwd: Path,
    stdin: bool = False,
    run_env: Mapping[str, str] | None = None,
) -> asyncio.subprocess.Process:
    """Start `command` as `persona`, in its own process group, reading its stdout and stderr.

    `stdin=False` gives the child DEVNULL, not an inherited descriptor: `claude
    -p` READS stdin and folds it into the prompt, so an inherited one makes the
    agent answer about whatever the parent had on it rather than the question.
    `stdin=True` is a pipe for stream-json turns (`user_frame`).

    Raises:
        OSError: the executable could not be started.
    """
    return await asyncio.create_subprocess_exec(
        *command,
        cwd=str(cwd),
        env=environment(settings, persona, run_env),
        stdin=asyncio.subprocess.PIPE if stdin else asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        # Its own process group: `kill` ends the whole group, not just the
        # CLI's own pid, so nothing it spawned (an MCP server, a hook)
        # survives it.
        start_new_session=True,
        limit=LINE_LIMIT,
    )


def kill(process: asyncio.subprocess.Process) -> None:
    """Kill the CLI's whole process group, so nothing it spawned outlives it.

    A CLI that has already exited keeps its exit status: SIGKILL to a
    process that is only waiting to be reaped changes nothing.
    """
    if process.returncode is None:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGKILL)


async def drain(stream: asyncio.StreamReader) -> bytes:
    """Read stderr to EOF beside the stdout loop, and keep only its tail.

    A child that writes enough to its stderr pipe to fill the OS buffer
    (64 KiB on Linux) blocks on that write until something drains it;
    without this running alongside `events`, that block is a deadlock — the
    child never reaches its next stdout line either, and the idle timeout
    eventually kills a process that was never actually stuck.
    """
    tail = b""
    while True:
        chunk = await stream.read(65536)
        if not chunk:
            return tail
        tail = (tail + chunk)[-STDERR_TAIL_BYTES:]


async def events(process: asyncio.subprocess.Process, timeout: float) -> AsyncIterator[dict[str, Any]]:
    """Yield each JSON object the CLI prints on stdout, in order, until it closes stdout.

    The CLI writes non-JSON diagnostics to stdout on some paths; they are
    dropped, which keeps the contract "every frame is an event".

    Raises:
        IdleTimeout: no line arrived for `timeout` seconds.
    """
    assert process.stdout is not None
    while True:
        try:
            line = await asyncio.wait_for(process.stdout.readline(), timeout=timeout)
        except TimeoutError as exc:
            raise IdleTimeout(f"no line from the agent in {timeout:.0f}s") from exc
        if not line:
            return
        text = line.decode(errors="replace").strip()
        if not text.startswith("{"):
            continue
        try:
            event = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            yield event


def user_frame(text: str) -> bytes:
    """One user turn, as `--input-format stream-json` reads it off stdin."""
    message = {"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": text}]}}
    return json.dumps(message).encode() + b"\n"


async def ask(
    settings: Settings,
    persona: Persona,
    question: str,
    *,
    resume: str | None = None,
    session_id: str | None = None,
    cwd: Path | None = None,
    append_system_prompt: str | None = None,
    model: str | None = None,
    run_env: Mapping[str, str] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Ask `persona` one question and yield each event the session emits, in order, unaltered.

    `cwd` defaults to the persona's home; `append_system_prompt` and `model`
    are for a caller whose question needs more than the persona's own files
    say (a scoped reading room); `run_env` is this run's own variables
    (`environment`). One synthetic event is added, and it is
    clearly the transport's own: an `ERROR_EVENT` frame if the process cannot
    start, goes silent past the idle timeout, or dies badly. Claude Code's own
    `result` event terminates a healthy stream.
    """
    command = argv(
        settings,
        persona,
        question,
        resume=resume,
        session_id=session_id,
        append_system_prompt=append_system_prompt,
        model=model,
    )
    try:
        process = await spawn(settings, persona, command, cwd=cwd or persona.home, run_env=run_env)
    except OSError as exc:
        yield {"type": ERROR_EVENT, "error": f"agent could not start: {exc}"}
        return
    assert process.stderr is not None
    stderr = asyncio.create_task(drain(process.stderr))
    try:
        async for event in events(process, settings.timeout_seconds):
            yield event
    except IdleTimeout:
        kill(process)
        yield {"type": ERROR_EVENT, "error": "agent exceeded its wall clock"}
        return
    finally:
        kill(process)
        await process.wait()
        try:
            tail = await asyncio.wait_for(stderr, timeout=5)
        except Exception:
            stderr.cancel()
            tail = b""

    if process.returncode not in (0, None):
        yield {
            "type": ERROR_EVENT,
            "error": f"agent exited {process.returncode}",
            "detail": scrub_credentials(tail.decode(errors="replace")[-2000:]),
        }
