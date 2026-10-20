"""Word and PDF from a persona's document, through the real pandoc and typst the `documents` extra installs."""

import io
import zipfile
from pathlib import Path

import pytest
from agent_common import documents

BRIEF = b"# Leave\n\nTwenty days a year.\n\n| Rank | Days |\n|---|---|\n| LS | 20 |\n"


def _word_text(data: bytes) -> str:
    return zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml").decode()


def test_the_extra_is_what_this_suite_runs_under() -> None:
    assert documents.available()


def test_markdown_becomes_a_word_file_that_reads_back_as_written() -> None:
    word = documents.render(BRIEF, "text/markdown", "docx")

    assert "Twenty days a year." in _word_text(word)
    assert "| Rank | Days |" in documents.text_of_docx(word)


def test_html_becomes_a_word_file() -> None:
    word = documents.render(b"<h1>Leave</h1><p>Twenty days.</p>", "text/html", "docx")
    assert "Twenty days." in _word_text(word)


def test_markdown_becomes_a_pdf() -> None:
    assert documents.render(BRIEF, "text/markdown", "pdf").startswith(b"%PDF-")


def test_a_path_the_document_names_is_never_read_into_it(tmp_path: Path) -> None:
    private = tmp_path / "private.png"
    private.write_bytes(b"\x89PNG not-for-the-reader")

    word = documents.render(f"![x]({private})\n\nText.".encode(), "text/markdown", "docx")

    assert b"not-for-the-reader" not in b"".join(
        zipfile.ZipFile(io.BytesIO(word)).read(name) for name in zipfile.ZipFile(io.BytesIO(word)).namelist()
    )


def test_the_brands_word_template_is_the_one_a_file_takes(tmp_path: Path) -> None:
    reference = documents.render(b"# Brand\n", "text/markdown", "docx")
    styled = zipfile.ZipFile(io.BytesIO(reference))
    with zipfile.ZipFile(tmp_path / "reference.docx", "w") as brand:
        for name in styled.namelist():
            body = styled.read(name)
            if name == "word/styles.xml":
                marker = b'<w:style w:styleId="BrandMarker" w:type="paragraph"><w:name w:val="BrandMarker"/></w:style>'
                body = body.replace(b"</w:styles>", marker + b"</w:styles>")
            brand.writestr(name, body)

    word = documents.render(BRIEF, "text/markdown", "docx", tmp_path)

    assert b"BrandMarker" in zipfile.ZipFile(io.BytesIO(word)).read("word/styles.xml")


def test_the_brands_pdf_template_is_the_one_a_pdf_is_set_in(tmp_path: Path) -> None:
    (tmp_path / "template.typ").write_text('#panic("set in the brand\'s template")\n$body$\n')

    with pytest.raises(documents.Unrenderable, match="typst failed"):
        documents.render(BRIEF, "text/markdown", "pdf", tmp_path)


@pytest.mark.parametrize(("media_type", "fmt"), [("text/plain", "docx"), ("text/markdown", "odt")])
def test_what_it_does_not_render_is_refused(media_type: str, fmt: str) -> None:
    with pytest.raises(documents.Unrenderable):
        documents.render(b"x", media_type, fmt)


def test_front_matter_is_the_documents_title_and_not_its_text() -> None:
    source = b"---\ntitle: Q3 minute\nkind: Minute\n---\n\nTwenty days a year.\n"
    word = documents.render(source, "text/markdown", "docx")

    assert "Q3 minute" in _word_text(word)
    assert "kind: Minute" not in _word_text(word)
    assert "---" not in documents.text_of_docx(word)
    assert documents.render(source, "text/markdown", "pdf").startswith(b"%PDF-")


def test_front_matter_whose_values_carry_colons_still_renders() -> None:
    source = b"---\ntitle: Minute: Q3\nchanges: tightened: the second paragraph\n---\n\nBody.\n"

    word = documents.render(source, "text/markdown", "docx")

    assert "Minute: Q3" in _word_text(word)
    assert "tightened" not in _word_text(word)
