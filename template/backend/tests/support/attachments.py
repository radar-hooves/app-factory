"""Genuine minimal bytes for each type a chat attachment may be, as `api/agent/content.py` reads them."""

import io
import zipfile

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
WEBP = b"RIFF\x1a\x00\x00\x00WEBPVP8 " + b"\x00" * 16
PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"
TEXT = b"hello"


def docx(extra: dict[str, bytes] | None = None, *, without: str = "") -> bytes:
    """A minimal docx zip, with `extra` members added and the member `without` left out."""
    members = {"[Content_Types].xml": b"<Types/>", "word/document.xml": b"<w:document/>", **(extra or {})}
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in members.items():
            if name != without:
                z.writestr(name, data)
    return out.getvalue()


#: The genuine bytes for each suffix an attachment may carry.
GENUINE = {
    ".png": PNG,
    ".jpg": JPEG,
    ".jpeg": JPEG,
    ".webp": WEBP,
    ".pdf": PDF,
    ".docx": docx(),
    ".txt": TEXT,
    ".md": TEXT,
}


def genuine(name: str) -> bytes:
    """Genuine bytes for `name`'s suffix, whatever its case."""
    return GENUINE[name[name.rfind(".") :].lower()]
