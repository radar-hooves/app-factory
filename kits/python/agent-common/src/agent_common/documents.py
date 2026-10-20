"""Word and PDF made from a document a persona wrote, and the text of a Word file a person attached.

Pandoc does both directions and typst sets the PDF, each from its own wheel
(the `documents` extra: pandoc 155 MB unpacked, typst 77 MB), so an app that
offers neither carries neither. The app's brand is a folder it names: a
`reference.docx` whose styles a Word file takes, a `template.typ` (a pandoc
template for its typst writer) and the `fonts/` it sets in. Without one,
pandoc's and typst's own defaults.

What reaches pandoc is a persona's writing, which a web page or an attached
file may have steered, so pandoc runs `--sandbox` (it reads nothing but the
files on its command line, so an image path names nothing it can embed) and
typst compiles in an empty root.
"""

import importlib.util
import subprocess
import tempfile
from pathlib import Path

#: A document this module renders, by the media type it was written as.
READS = {"text/markdown": "gfm", "text/html": "html"}
#: What it renders to.
FORMATS = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
}
PANDOC_SECONDS = 30.0


class Unrenderable(ValueError):
    """This document could not be made in that format."""


def available() -> bool:
    """Whether the `documents` extra is installed."""
    return all(importlib.util.find_spec(name) is not None for name in ("pypandoc", "typst"))


def _pandoc(args: list[str], data: bytes) -> bytes:
    import pypandoc  # the optional extra

    try:
        done = subprocess.run(
            [pypandoc.get_pandoc_path(), "--sandbox", *args],
            input=data,
            capture_output=True,
            timeout=PANDOC_SECONDS,
            check=True,
        )
    except (subprocess.SubprocessError, OSError) as exc:
        raise Unrenderable(f"pandoc failed: {type(exc).__name__}") from None
    return done.stdout


def _own(brand: Path | None, name: str) -> Path | None:
    """The brand's own `name`, where it has one."""
    return brand / name if brand is not None and (brand / name).is_file() else None


def text_of_docx(data: bytes) -> str:
    """A Word file's text as Markdown, its headings, lists and tables kept.

    Raises:
        Unrenderable: pandoc could not read it.
    """
    return _pandoc(["--from", "docx", "--to", "gfm"], data).decode(errors="replace")


def render(source: bytes, media_type: str, fmt: str, brand: Path | None = None) -> bytes:
    """`source`, written as `media_type`, in `fmt` (`FORMATS`), in the brand's templates where it has them.

    Raises:
        Unrenderable: pandoc or typst failed, or the type or format is not one this renders.
    """
    reads = READS.get(media_type)
    if reads is None or fmt not in FORMATS:
        raise Unrenderable(f"{media_type} is not rendered as {fmt}")
    if fmt == "docx":
        reference = _own(brand, "reference.docx")
        args = ["--from", reads, "--to", "docx", "--output", "-"]
        return _pandoc([*args, *(["--reference-doc", str(reference)] if reference else [])], source)
    template = _own(brand, "template.typ")
    typeset = _pandoc(
        ["--from", reads, "--to", "typst", "--standalone", *(["--template", str(template)] if template else [])],
        source,
    )
    import typst  # the optional extra

    fonts = [str(brand / "fonts")] if brand is not None and (brand / "fonts").is_dir() else []
    with tempfile.TemporaryDirectory() as root:
        main = Path(root) / "document.typ"
        main.write_bytes(typeset)
        try:
            return bytes(typst.compile(str(main), root=root, font_paths=fonts))
        except Exception as exc:  # typst raises its own TypstError, a RuntimeError, per failure kind
            raise Unrenderable(f"typst failed: {type(exc).__name__}") from None
