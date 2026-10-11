"""Confine an agent session's process to what its persona needs (landlock, no privilege).

A persona's `claude -p` runs with `--permission-mode bypassPermissions`, so
its tool lists decide what it is offered and nothing decides what the disk
lets it reach: an absolute path from `Read` or `Bash` goes anywhere the app
process can, the app's data, other sessions' transcripts, the database on
the network. This module is the boundary. `confine` wraps a command line in
this file run as a launcher, which restricts itself with Landlock and then
execs the command; the command and everything it starts (a shell, a hook, a
stdio MCP server) can read only beneath the paths named, write only beneath
the writable ones, open a TCP connection only to the ports named, and neither
trace nor signal a process outside. Landlock filters TCP by port, not host, and
UDP not at all: the gateway's port is open to any host, which reaches nothing
a session does not already hold.

Landlock needs no privilege and no namespace, so it holds inside a container
under Docker's default seccomp profile, where bubblewrap (Claude Code's own
`sandbox` setting) cannot start, and it covers the built-in file tools and
MCP servers, which that setting does not. The launcher runs by path under
`python -I` and imports only the standard library, so it is single-threaded
when it restricts itself and loads nothing of the app's. When the kernel
cannot honour every restriction it exits 126 rather than exec: a failed turn
is the right outcome, an unconfined one never is.

Lifted from the library's `api/librarian/sandbox.py` (radar-hooves/library),
which confined Milton first. Need: radar-hooves/library, via godswood's
sensitive-documents work, 11/10/2026.
"""

import ctypes
import os
import shutil
import sys
from collections.abc import Iterable, Sequence

_CREATE_RULESET, _ADD_RULE, _RESTRICT_SELF = 444, 445, 446
_ABI_VERSION_FLAG = 1
_PATH_BENEATH, _NET_PORT = 1, 2
_PR_SET_NO_NEW_PRIVS = 38

_EXECUTE, _WRITE_FILE, _READ_FILE, _READ_DIR = 1 << 0, 1 << 1, 1 << 2, 1 << 3
_REFER, _TRUNCATE, _IOCTL_DEV = 1 << 13, 1 << 14, 1 << 15
_READ = _EXECUTE | _READ_FILE | _READ_DIR
#: The rights a rule on a single file (not a directory) may carry.
_FILE_RIGHTS = _EXECUTE | _WRITE_FILE | _READ_FILE | _TRUNCATE | _IOCTL_DEV
_BIND_TCP, _CONNECT_TCP = 1 << 0, 1 << 1
_SCOPE_ABSTRACT_UNIX_SOCKET, _SCOPE_SIGNAL = 1 << 0, 1 << 1
#: ABI 4 brought TCP port rules and ABI 6 the signal and abstract-socket scope.
_MIN_ABI = 6
REFUSED = 126

#: Read beyond the paths an ask is given: the system and the interpreter's own
#: install, for a command that is a script. Never /app, /home, /run or /tmp.
SYSTEM = ("/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc", "/proc", "/sys", "/nix/store")
#: The device nodes a command writes; never /dev itself, whose /dev/shm would
#: carry one ask's reading to the next.
DEVICES = ("/dev/null", "/dev/zero", "/dev/full", "/dev/random", "/dev/urandom", "/dev/tty")


def confine(
    argv: Sequence[str], *, read: Iterable[object], write: Iterable[object], connect: Iterable[int]
) -> list[str]:
    """`argv` run under the launcher, confined to these paths and ports.

    Raises:
        FileNotFoundError: `argv[0]` is no executable, as an unconfined spawn would say.
    """
    executable = shutil.which(argv[0])
    if executable is None:
        raise FileNotFoundError(2, "No such file or directory", argv[0])
    target = os.path.realpath(executable)
    readable = [*SYSTEM, sys.prefix, sys.base_prefix, os.path.dirname(target), *map(str, read)]
    flags = [arg for path in readable for arg in ("--read", path)]
    flags += [arg for path in (*DEVICES, *map(str, write)) for arg in ("--write", path)]
    flags += [arg for port in connect for arg in ("--connect", str(port))]
    # The name it was called by stays argv[0]: a multi-call binary (busybox, coreutils) dispatches on it.
    return [sys.executable, "-I", os.path.abspath(__file__), *flags, "--exec", target, "--", executable, *argv[1:]]


class _RulesetAttr(ctypes.Structure):
    _fields_ = [("fs", ctypes.c_uint64), ("net", ctypes.c_uint64), ("scoped", ctypes.c_uint64)]


class _PathBeneath(ctypes.Structure):
    _layout_ = "ms"  # with _pack_ = 1: the kernel's packed 12 bytes, on every ABI
    _pack_ = 1
    _fields_ = [("allowed", ctypes.c_uint64), ("parent_fd", ctypes.c_int32)]


class _NetPort(ctypes.Structure):
    _fields_ = [("allowed", ctypes.c_uint64), ("port", ctypes.c_uint64)]


def supported() -> bool:
    """Whether this kernel's Landlock honours every restriction `restrict` asks for."""
    try:
        return _abi() >= _MIN_ABI
    except OSError:
        return False


def _abi() -> int:
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    result = int(libc.syscall(_CREATE_RULESET, None, ctypes.c_size_t(0), ctypes.c_uint32(_ABI_VERSION_FLAG)))
    if result < 0:
        error = ctypes.get_errno()
        raise OSError(error, f"Landlock: {os.strerror(error)}")
    return result


def restrict(read: Sequence[str], write: Sequence[str], connect: Sequence[int]) -> None:
    """Restrict this process, and all it execs, to these paths and ports.

    A path that does not exist is skipped, which only narrows what is allowed.

    Raises:
        OSError: the kernel refused a step, or offers no TCP restriction.
    """
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long

    def call(*args: object) -> int:
        result = int(libc.syscall(*args))
        if result < 0:
            error = ctypes.get_errno()
            raise OSError(error, f"Landlock: {os.strerror(error)}")
        return result

    abi = call(_CREATE_RULESET, None, ctypes.c_size_t(0), ctypes.c_uint32(_ABI_VERSION_FLAG))
    if abi < _MIN_ABI:
        raise OSError(f"Landlock ABI {abi} cannot confine TCP and signals; {_MIN_ABI} is the floor")
    fs = (1 << 13) - 1 | _REFER | _TRUNCATE | _IOCTL_DEV
    attr = _RulesetAttr(fs, _BIND_TCP | _CONNECT_TCP, _SCOPE_ABSTRACT_UNIX_SOCKET | _SCOPE_SIGNAL)
    ruleset = call(_CREATE_RULESET, ctypes.byref(attr), ctypes.c_size_t(ctypes.sizeof(attr)), ctypes.c_uint32(0))
    for paths, rights in ((read, _READ), (write, fs)):
        for path in paths:
            try:
                fd = os.open(path, os.O_PATH | os.O_CLOEXEC)
            except FileNotFoundError:
                continue
            try:
                allowed = rights if os.path.isdir(path) else rights & _FILE_RIGHTS
                call(_ADD_RULE, ruleset, _PATH_BENEATH, ctypes.byref(_PathBeneath(allowed & fs, fd)), 0)
            finally:
                os.close(fd)
    for port in connect:
        call(_ADD_RULE, ruleset, _NET_PORT, ctypes.byref(_NetPort(_CONNECT_TCP, port)), 0)
    if libc.prctl(_PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "no_new_privs refused")
    call(_RESTRICT_SELF, ruleset, 0)


def _main(args: list[str]) -> None:
    read: list[str] = []
    write: list[str] = []
    connect: list[int] = []
    target = ""
    while args and args[0] != "--":
        flag, value, *args = args
        if flag == "--read":
            read.append(value)
        elif flag == "--write":
            write.append(value)
        elif flag == "--exec":
            target = value
        else:
            connect.append(int(value))
    command = args[1:]
    try:
        restrict(read, write, connect)
    except OSError as error:
        sys.stderr.write(f"agent sandbox: {error}; refusing to run unconfined\n")
        sys.exit(REFUSED)
    os.execv(target or command[0], command)


if __name__ == "__main__":
    _main(sys.argv[1:])
