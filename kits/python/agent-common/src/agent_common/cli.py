"""The Claude Code driver: spawn `claude -p` as a persona and yield its events verbatim.

This module does NOT interpret the stream. A translation layer between Claude
Code's events and some house vocabulary rots the moment Claude Code adds an
event type, and it makes a console show something other than what the agent
actually did. So every line the CLI emits on stdout is forwarded unchanged,
and the frontend renders the real thing.

`--output-format stream-json` IS the wire format, which is why this drives the
CLI rather than the Agent SDK: the SDK hands back typed Python objects that
would have to be re-serialised, and re-serialising is translating.

Two kinds of turn share it. A chat turn (`ask`) is one question, one process,
one stream, run `--restricted`: a person's question is answered by a session
whose file tools reach only its own folder, which has no tool that runs a
command, and which writes no settings, git or MCP file, so it reads no
settings or memory file of its own and is handed CLAUDE.md and settings.json
on its command line instead; it is offered only the tools its settings.json
allows (`--permission-mode dontAsk`), of the built-in ones only `CHAT_TOOLS`.
A question known at once goes on the command line;
one still being put together (passages the app is retrieving) is written to
stdin once it is ready, so the CLI's start-up, a second or two, runs while
the question is assembled. An app-started job writes every turn to
stdin as a stream-json `user` frame (`user_frame`) and carries its own
system-prompt addendum, JSON schema, model and working directory, so those
stay optional parameters of `argv` rather than a second copy of it. Both
spawn through `spawn`, read through `events` and end through `kill`.

Every session runs confined (`sandbox`): it reads and writes only its working
directory, its own scoped home and the system, and connects only to the
ports it needs, whatever its tools are told to do. `spawn` is the one place
that decides it, so no caller can start an unconfined one by accident. The
app's own stdio MCP servers for a session run outside it (`bridge`).

Lifted from the stamped `api/agent/session.py` and the driver inside
`api/agent/jobs.py` (radar-hooves/app-factory), which both began as
the library's `api/agent/session.py`. Need: radar-hooves/cadmus (Nightjar),
30/09/2026.
"""

import asyncio
import contextlib
import dataclasses
import hashlib
import inspect
import json
import os
import re
import shutil
import signal
import tempfile
from collections.abc import AsyncIterator, Awaitable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from agent_common import bridge, sandbox
from agent_common.persona import SOURCE_FILES, Persona

#: The error frame's `type`. Not this driver's own vocabulary — it is
#: `@poodle64/librarian`'s wire contract: `Transcript.apply()` in the shared
#: frontend package special-cases the literal string `agent_error` to set
#: `outcome.isError`, and nothing else recognises a failed turn. Renaming it
#: here would compile, look correct, and render nothing at all.
ERROR_EVENT = "agent_error"

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

#: The built-in tools a chat turn may be offered, and only those its persona's
#: settings.json allows: reading and writing its own folder. Never a tool
#: that runs a command, fetches the web from the session, or starts a
#: sub-agent, whatever a persona allows (agent-console.md §The asker and the writes).
CHAT_TOOLS = ("Read", "Glob", "Grep", "Write", "Edit")

#: A persona's CLAUDE.md and settings.json reach a restricted session on its
#: command line, where one argument may run to 128 KiB (MAX_ARG_STRLEN).
INSTRUCTIONS_LIMIT = 100_000

_BEARER = re.compile(r"(?i)\bbearer\s+\S+")
_REFERENCE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")
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
    `confine` runs every session under `sandbox`.
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
    #: Off only on a host without Landlock (a Mac), where a session then runs
    #: unconfined; every deployment leaves it on.
    confine: bool = True


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
    replay: bool = True,
    restricted: bool = False,
    rewind: str | None = None,
) -> list[str]:
    """The exact command line. Split out so a test can assert it without a subprocess.

    A chat turn passes only `question` and `resume`; every command carries an
    `--append-system-prompt` naming the persona and service, then any the caller adds. `session_id` and `resume`
    are mutually exclusive the way the CLI's own `--session-id`/`--resume`
    are: the former MINTS an id before the CLI has run at all, the latter
    continues one already minted.

    `input_format="stream-json"` takes every turn from stdin, so `question`
    is `None` there: the CLI ignores a prompt on the command line in that
    mode (measured, 2.1.283 — it exits having answered nothing). With
    `replay` it also adds `--replay-user-messages`, which echoes each stdin
    frame back as the turn that consumes it starts: a job's only record of
    what the agent was sent. A chat turn already knows what it sent, and its
    stream goes to a person, so it does not replay.

    `restricted` is a chat turn's: `--restricted` under `dontAsk`, the
    persona's settings.json passed whole as `--settings` and its CLAUDE.md
    appended to the system prompt, and `--tools` naming the `CHAT_TOOLS` its
    allow list names. `rewind`, with `resume`, is the message the
    conversation is taken back to before this question
    (`--resume-session-at`): an edited question replaces what followed it.

    Raises:
        ValueError: a restricted persona's CLAUDE.md is past `INSTRUCTIONS_LIMIT`,
            or `rewind` comes without `resume`.
    """
    if rewind is not None and resume is None:
        raise ValueError("a rewind resumes a session")
    for named, text in (("CLAUDE.md", persona.instructions), ("settings.json", persona.settings)):
        if restricted and len(text) > INSTRUCTIONS_LIMIT:
            raise ValueError(f"{persona.name}'s {named} is past {INSTRUCTIONS_LIMIT} characters")
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
    ]
    if restricted:
        command += [
            "--restricted",
            "--permission-mode",
            "dontAsk",
            "--tools",
            chat_tools(persona),
            "--settings",
            persona.settings,
        ]
    else:
        command += ["--permission-mode", "bypassPermissions"]
    config = mcp_config if mcp_config is not None else persona.mcp_config
    if config is not None:
        # --strict-mcp-config stops the CLI walking cwd's ancestors for a
        # second .mcp.json: without it, a persona's own file merges with
        # whatever the household fleet happens to declare above the persona's
        # home. Measured: a developer's system/init listed ninety fleet
        # servers beside the persona's own two.
        command += ["--mcp-config", str(config), "--strict-mcp-config"]
    # Always present: with it the CLI's system prompt opens "You are Claude Code
    # ...", the identity Anthropic's subscription path (a Max seat behind the
    # gateway) requires to serve Sonnet and Opus 5; without it that path 429s.
    identity = f"You are {persona.name}, the {settings.service} service's agent."
    prompt = [identity, persona.instructions.strip() if restricted else "", append_system_prompt or ""]
    command += ["--append-system-prompt", "\n\n".join(part for part in prompt if part)]
    if json_schema is not None:
        command += ["--json-schema", json.dumps(json_schema)]
    if model:
        command += ["--model", model]
    if input_format:
        command += ["--input-format", input_format]
        if input_format == "stream-json" and replay:
            command.append("--replay-user-messages")
    if session_id:
        command += ["--session-id", session_id]
    if resume:
        command += ["--resume", resume]
    if rewind:
        command += ["--resume-session-at", rewind]
    return command


def chat_tools(persona: Persona) -> str:
    """The `CHAT_TOOLS` the persona's allow list names, a rule's specifier (`Write(./notes/**)`) aside."""
    named = {rule.split("(", 1)[0].strip() for rule in persona.allowed_tools.split(",")}
    return ",".join(tool for tool in CHAT_TOOLS if tool in named)


async def spawn(
    settings: Settings,
    persona: Persona,
    command: list[str],
    *,
    cwd: Path,
    stdin: bool = False,
    run_env: Mapping[str, str] | None = None,
    read: Sequence[Path] = (),
    write: Sequence[Path] = (),
    connect: Sequence[int] = (),
    mcp: Mapping[str, Any] | None = None,
) -> asyncio.subprocess.Process:
    """Start `command` as `persona`, in its own process group, reading its stdout and stderr.

    `stdin=False` gives the child DEVNULL, not an inherited descriptor: `claude
    -p` READS stdin and folds it into the prompt, so an inherited one makes the
    agent answer about whatever the parent had on it rather than the question.
    `stdin=True` is a pipe for stream-json turns (`user_frame`).

    Confined (`sandbox`): `read`, `write` and `connect` add to what a session
    is given, for a caller whose session reads another tree or reaches a
    service on another port.

    `mcp` is the app's own MCP config for this session, written here to the
    file `command`'s `--mcp-config` names, which must sit in `cwd`, and never
    read back: the session writes that folder, so the file is staged and
    renamed, replacing a link left at its name rather than writing through it.
    Confined, each stdio server in it runs as the app, outside the session's
    confinement (`bridge`), so a server that vends its own credentials needs
    nothing of its key or its ports admitted to the session. Without `mcp`,
    the ports are read from the file, which the session must not write.

    Raises:
        OSError: the executable could not be started.
        ValueError: `mcp` is given and `command` names no `--mcp-config` in `cwd`.
    """
    path = _flag_value(command, "--mcp-config")
    if mcp is not None and (path is None or Path(path).parent.resolve() != cwd.resolve()):
        raise ValueError("`mcp` is written to the command's --mcp-config, which must name a file in `cwd`")
    if not settings.confine:
        if mcp is not None and path is not None:
            await asyncio.to_thread(_write_config, Path(path), mcp)
        return await _spawn(command, cwd, environment(settings, persona, run_env), stdin)
    cwd = cwd.resolve()
    home, transcripts = await asyncio.to_thread(scope_home, persona, cwd)
    scratch = home / "tmp"
    scratch.mkdir(exist_ok=True)
    env = environment(settings, dataclasses.replace(persona, home=home), run_env)
    env["TMPDIR"] = env["CLAUDE_CODE_TMPDIR"] = str(scratch)
    relayed = bridge.Bridge(mcp, run_env=run_env or {}, session_dir=cwd) if mcp is not None else None
    try:
        if relayed is not None and path is not None:
            await asyncio.to_thread(_write_config, Path(path), relayed.config)
            # In `cwd`, so read already; never resolved, as a link left there would be.
            servers, config = relayed.config.get("mcpServers"), []
        else:
            path = str(Path(path).resolve()) if path else None
            servers, config = _servers(path), [Path(path)] if path else []
        confined = sandbox.confine(
            command,
            read=[cwd, home, *config, *read],
            write=[cwd, home, transcripts, *write],
            connect=[*_ports(settings, env, servers), *([relayed.port] if relayed and relayed.port else []), *connect],
        )
        process = await _spawn(confined, cwd, env, stdin)
    except BaseException:
        if relayed is not None:
            await relayed.close()
        raise
    if relayed is not None:
        closing = asyncio.create_task(_close_after(process, relayed))
        _closing.add(closing)
        closing.add_done_callback(_closing.discard)
    return process


def _write_config(path: Path, config: Mapping[str, Any]) -> None:
    """Write `config` to `path` by renaming a staged copy over it: a link at `path` is replaced, never followed."""
    fd, staged = tempfile.mkstemp(prefix=".mcp.", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            json.dump(config, handle)
        os.replace(staged, path)
    except BaseException:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(staged)
        raise


#: Held so a bridge's closing task is never garbage-collected before its session ends.
_closing: set[asyncio.Task[None]] = set()


async def _close_after(process: asyncio.subprocess.Process, relayed: bridge.Bridge) -> None:
    try:
        await process.wait()
    finally:
        await relayed.close()


async def _spawn(command: list[str], cwd: Path, env: dict[str, str], stdin: bool) -> asyncio.subprocess.Process:
    return await asyncio.create_subprocess_exec(
        *command,
        cwd=str(cwd),
        env=env,
        stdin=asyncio.subprocess.PIPE if stdin else asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        # Its own process group: `kill` ends the whole group, not just the
        # CLI's own pid, so nothing it spawned (an MCP server, a hook)
        # survives it.
        start_new_session=True,
        limit=LINE_LIMIT,
    )


def scope_path(persona_home: Path, cwd: Path) -> Path:
    """Where the home of a session in `cwd` lives, whether or not one has run yet."""
    return persona_home / "scopes" / hashlib.blake2s(str(cwd.resolve()).encode(), digest_size=8).hexdigest()


def transcripts_path(persona_home: Path, cwd: Path) -> Path:
    """Where the CLI's transcripts for a session in `cwd` are kept, under the name it derives from `cwd`."""
    return persona_home / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(cwd.resolve()))


def scope_home(persona: Persona, cwd: Path) -> tuple[Path, Path]:
    """The home a session in `cwd` runs as, and its transcript directory.

    The CLI's own state (todos, shell snapshots, history, a settings copy)
    lives in a home of this working directory's own, so a session reaches its
    own state and no other's. The transcript alone lives in the persona's
    home, where `transcript` reads it, linked in under the name the CLI
    derives from its working directory. A job's `cwd` is its own folder, so
    one job never reads another's; a chat's is the persona's home, and its
    sessions share it.
    """
    home = scope_path(persona.home, cwd)
    transcripts = transcripts_path(persona.home, cwd)
    transcripts.mkdir(parents=True, exist_ok=True)
    link = home / "projects" / transcripts.name
    link.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.suppress(FileExistsError):  # another session in this cwd got there first
        link.symlink_to(transcripts)
    for name in SOURCE_FILES:
        if (persona.home / name).is_file():
            # Staged and renamed, as persona.py seeds a home: a CLI already
            # running here never reads a half-copied file.
            fd, staged = tempfile.mkstemp(prefix=f".{name}.", dir=home)
            os.close(fd)
            shutil.copyfile(persona.home / name, staged)
            os.replace(staged, home / name)
    return home, transcripts


def _flag_value(command: Sequence[str], flag: str) -> str | None:
    """The value after the last `flag`: the builder's own comes after a question that might spell it."""
    at = len(command) - 1 - command[::-1].index(flag) if flag in command else None
    return command[at + 1] if at is not None and at + 1 < len(command) else None


def _servers(mcp_config: str | None) -> object:
    """The `mcpServers` of the config file the CLI is told to read; nothing, if it cannot be read."""
    if not mcp_config:
        return None
    try:
        return json.loads(Path(mcp_config).read_text()).get("mcpServers")
    except OSError, ValueError, AttributeError:
        return None


def _ports(settings: Settings, env: Mapping[str, str], servers: object) -> list[int]:
    """The TCP ports a session needs: its model endpoint, telemetry, and each HTTP MCP server's.

    A server's URL is read as the CLI reads it, its `${VAR}` and
    `${VAR:-default}` expanded from the session's own environment.
    """
    urls = [settings.gateway_url or "https://api.anthropic.com", env.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")]
    if isinstance(servers, dict):
        urls += [
            _REFERENCE.sub(lambda match: env.get(match[1]) or match[2] or "", server["url"])
            for server in servers.values()
            if isinstance(server, dict) and isinstance(server.get("url"), str)
        ]
    ports = {_port(url) for url in urls if url}
    return sorted(port for port in ports if port)


def _port(url: str) -> int | None:
    try:
        parts = urlsplit(url)
        return parts.port or (80 if parts.scheme == "http" else 443 if parts.scheme == "https" else None)
    except ValueError:
        return None


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


async def _write_turn(process: asyncio.subprocess.Process, text: str) -> None:
    """Write the one turn and close stdin, so the CLI answers it and exits; a CLI already gone is left to say why."""
    assert process.stdin is not None
    with contextlib.suppress(BrokenPipeError, ConnectionResetError):
        process.stdin.write(user_frame(text))
        await process.stdin.drain()
        process.stdin.close()
        await process.stdin.wait_closed()


def user_frame(text: str) -> bytes:
    """One user turn, as `--input-format stream-json` reads it off stdin."""
    message = {"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": text}]}}
    return json.dumps(message).encode() + b"\n"


async def ask(
    settings: Settings,
    persona: Persona,
    question: str | Awaitable[str],
    *,
    resume: str | None = None,
    session_id: str | None = None,
    cwd: Path | None = None,
    append_system_prompt: str | None = None,
    model: str | None = None,
    run_env: Mapping[str, str] | None = None,
    read: Sequence[Path] = (),
    write: Sequence[Path] = (),
    connect: Sequence[int] = (),
    rewind: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Ask `persona` one question and yield each event the session emits, in order, unaltered.

    `question` is the question, or an awaitable of it: the CLI then starts at
    once, taking its turn from stdin, and the question is written there when
    it resolves, so the CLI's start-up runs while the caller puts it together.
    An awaitable that raises ends the turn before the CLI is asked anything,
    and the error propagates. `cwd` defaults to the persona's home, which a
    confined session then reads whole: pass a folder of its own wherever the
    persona serves more than one person; `append_system_prompt` and `model`
    are for a caller whose question needs more than the persona's own files
    say; `run_env` is this run's own variables (`environment`); `read`,
    `write` and `connect` are `spawn`'s; `rewind` is `argv`'s. One synthetic
    event is added, and it is clearly the transport's own: an `ERROR_EVENT`
    frame if the process cannot start, goes silent past the idle timeout, or
    dies badly. Claude Code's own `result` event terminates a healthy stream.

    The turn is `restricted` (`argv`). Given a `cwd` of its own, the persona's
    `.mcp.json` reaches the session through `spawn`'s `mcp`, written into that
    folder, so its stdio servers, and an HTTP server whose header a
    `headersHelper` mints, run as the app and never in the session
    (`bridge`).

    Raises:
        ValueError: as `argv`, or the persona's `.mcp.json` is not JSON.
    """
    later = None if isinstance(question, str) else question
    folder = cwd or persona.home
    servers = persona.mcp_config if cwd is not None else None
    try:
        mcp = json.loads(servers.read_text()) if servers is not None else None
        command = argv(
            settings,
            persona,
            question if isinstance(question, str) else None,
            resume=resume,
            session_id=session_id,
            append_system_prompt=append_system_prompt,
            model=model,
            input_format="stream-json" if later is not None else None,
            replay=False,
            restricted=True,
            rewind=rewind,
            mcp_config=folder / ".mcp.json" if mcp is not None else None,
        )
    except BaseException:
        if inspect.iscoroutine(later):
            later.close()
        raise
    try:
        process = await spawn(
            settings,
            persona,
            command,
            cwd=folder,
            stdin=later is not None,
            run_env=run_env,
            read=read,
            write=write,
            connect=connect,
            mcp=mcp,
        )
    except BaseException as exc:
        # Never awaited now: closed, so it is not reported as a coroutine left unawaited.
        if inspect.iscoroutine(later):
            later.close()
        if not isinstance(exc, OSError):
            raise
        yield {"type": ERROR_EVENT, "error": f"agent could not start: {exc}"}
        return
    assert process.stderr is not None
    stderr = asyncio.create_task(drain(process.stderr))
    try:
        if later is not None:
            await _write_turn(process, await later)
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
