from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "tools" / "asoiaf_private_corpus_sqlite.py"
SPEC = importlib.util.spec_from_file_location("asoiaf_private_corpus_sqlite", MODULE_PATH)
assert SPEC and SPEC.loader
operator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(operator)


def digest(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


class PrivateCorpusSqliteTests(unittest.TestCase):
    def build_fixture(self, root: Path) -> tuple[Path, Path]:
        edition_root = root / "local-editions" / "fixture-edition"
        private_root = edition_root / "private-text"
        private_root.mkdir(parents=True)
        paragraphs = [
            "The old trees stood above Winterfell.",
            "A direwolf waited beside the summer snow.",
            "A red comet burned above the sea.",
        ]
        text = "\n\n".join(paragraphs)
        unit_id = "asoiaf-local-unit:fixture"
        starts = []
        cursor = 0
        for paragraph in paragraphs:
            starts.append(cursor)
            cursor += len(paragraph) + 2
        segments = []
        for index, paragraph in enumerate(paragraphs):
            start = starts[index]
            end = start + len(paragraph)
            segments.append(
                {
                    "format": "axm-asoiaf-local-edition-segment/1",
                    "segmentId": f"asoiaf-local-segment:fixture-{index}",
                    "unitId": unit_id,
                    "order": index,
                    "paragraphIndex": index,
                    "startChar": start,
                    "endChar": end,
                    "charCount": len(paragraph),
                    "wordCount": len(paragraph.split()),
                    "textDigest": digest(paragraph),
                    "locator": {
                        "kind": "record",
                        "unit": f"local-agot/fixture/0/{index}",
                        "start": start,
                        "end": end,
                        "contentDigest": digest(text),
                    },
                    "graphEffect": "none",
                    "canonEffect": "none",
                }
            )
        unit = {
            "format": "axm-asoiaf-local-edition-unit/1",
            "unitId": unit_id,
            "order": 0,
            "label": "PROLOGUE",
            "sourcePart": "fixture.txt",
            "sourcePartDigest": digest(text),
            "textDigest": digest(text),
            "charCount": len(text),
            "wordCount": sum(len(paragraph.split()) for paragraph in paragraphs),
            "paragraphCount": len(paragraphs),
            "segmentIds": [row["segmentId"] for row in segments],
            "locator": {
                "kind": "chapter",
                "unit": "local-agot/fixture/0",
                "start": 0,
                "end": len(text),
                "contentDigest": digest(text),
            },
            "graphEffect": "none",
            "canonEffect": "none",
        }
        manifest = {
            "sourceId": "local-agot",
            "editionId": "fixture",
            "editionKey": "fixture-edition",
            "continuityId": "book-main",
            "sourceDigest": digest(text),
            "sourceBytes": len(text.encode()),
            "manifestFingerprint": digest("manifest"),
            "collectorObservationId": "fixture-observation",
            "privateTextRetained": True,
            "unitCount": 1,
            "segmentCount": len(segments),
            "charCount": len(text),
            "wordCount": unit["wordCount"],
            "metadata": {
                "title": "Synthetic fixture",
                "language": "en",
                "publisher": "Fixture Press",
            },
        }
        (private_root / "0000.txt").write_text(text, encoding="utf-8")
        (edition_root / "private-text-index.json").write_text(
            json.dumps({"entries": [{"unitId": unit_id, "relativeUri": "private-text/0000.txt"}]}),
            encoding="utf-8",
        )
        (edition_root / "edition-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        (edition_root / "units.ndjson").write_text(json.dumps(unit) + "\n", encoding="utf-8")
        (edition_root / "segments.ndjson").write_text(
            "".join(json.dumps(row) + "\n" for row in segments), encoding="utf-8"
        )
        database = root / "private-research" / operator.DEFAULT_DATABASE_NAME
        receipt = operator.build_corpus(
            root,
            database,
            "2026-08-12T00:00:00.000Z",
            force=True,
        )
        return database, database.parent / operator.DEFAULT_RECEIPT_NAME

    def test_build_verify_and_private_query_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            database, receipt_path = self.build_fixture(Path(temporary))
            verification = operator.verify_corpus(database, receipt_path)
            self.assertTrue(verification["passed"], verification["errors"])
            self.assertEqual(verification["counts"]["documents"], 3)
            hidden = operator.query_corpus(database, "Winterfell old", mode="all")
            self.assertEqual(hidden["returnedCount"], 1)
            self.assertIsNone(hidden["matches"][0]["snippet"])
            self.assertNotIn("old trees", json.dumps(hidden))
            visible = operator.query_corpus(
                database,
                "red comet",
                mode="phrase",
                include_snippet=True,
                context_characters=40,
            )
            self.assertEqual(visible["returnedCount"], 1)
            self.assertIn("red comet", visible["matches"][0]["snippet"].casefold())
            self.assertFalse(json.loads(receipt_path.read_text())["repositoryEligible"])

    def test_tampered_private_text_is_refused_on_rebuild(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.build_fixture(root)
            private_text = root / "local-editions" / "fixture-edition" / "private-text" / "0000.txt"
            private_text.write_text(private_text.read_text() + " drift", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "unit digest mismatch"):
                operator.build_corpus(
                    root,
                    root / "private-research" / "tampered.sqlite3",
                    "2026-08-12T00:00:01.000Z",
                    force=True,
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
