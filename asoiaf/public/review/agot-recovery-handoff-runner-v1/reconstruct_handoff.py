#!/usr/bin/env python3
"""Verify and locally extract the admitted AGOT recovery-to-review handoff carrier."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import shutil
import stat
import subprocess
import sys
import zipfile
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any, Sequence

COMPONENT = "asoiaf-agot-recovery-handoff-runner-v1"
EXPECTED = {
    "carrier_schema": "axm-asoiaf-exact-base64-carrier/1",
    "base64_characters": 143420,
    "base64_sha256": "ed5b5c481488c0e68887702bb6c0c36ac775677887638cde51e39b979d2af819",
    "zip_filename": "asoiaf-agot-recovery-to-review-handoff-v1.zip",
    "zip_bytes": 107565,
    "zip_sha256": "dd70c8c9d5de23db7014d8e4d89b73a52d24ecedc8986c4e42812e7820a390d9",
    "expanded_files": 45,
    "root_directory": "asoiaf-agot-recovery-to-review-handoff-v1",
}
EXIT = {
    "PASS_EXACT_HANDOFF_RECONSTRUCTABLE": 0,
    "REFUSE_CARRIER_METADATA": 20,
    "REFUSE_CHUNK_IDENTITY": 21,
    "REFUSE_DECODED_IDENTITY": 22,
    "REFUSE_UNSAFE_ZIP": 23,
    "REFUSE_OUTPUT_BOUNDARY": 24,
    "REFUSE_INNER_LAUNCHER": 25,
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob_sha1(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode("utf-8") + data).hexdigest()


def locate_carrier(repo_root: Path) -> Path:
    return repo_root.resolve() / "asoiaf/public/review/agot-recovery-to-review-handoff-v1"


def refuse(status: str, detail: str) -> tuple[dict[str, Any], int]:
    return ({
        "schema": "axm-asoiaf-agot-recovery-handoff-runner-receipt/1",
        "componentId": COMPONENT,
        "status": status,
        "detail": detail,
        "privateSourceTextPresent": False,
        "privatePayloadPresent": False,
        "reviewTransactionsExecuted": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }, EXIT[status])


def reconstruct(repo_root: Path) -> tuple[dict[str, Any], bytes | None, int]:
    carrier_dir = locate_carrier(repo_root)
    metadata_path = carrier_dir / "CARRIER.json"
    try:
        carrier = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception as exc:
        receipt, code = refuse("REFUSE_CARRIER_METADATA", f"cannot read carrier metadata: {type(exc).__name__}")
        return receipt, None, code
    if (
        carrier.get("schema") != EXPECTED["carrier_schema"]
        or carrier.get("base64Characters") != EXPECTED["base64_characters"]
        or carrier.get("base64Sha256") != EXPECTED["base64_sha256"]
        or carrier.get("decodedObject", {}).get("filename") != EXPECTED["zip_filename"]
        or carrier.get("decodedObject", {}).get("bytes") != EXPECTED["zip_bytes"]
        or carrier.get("decodedObject", {}).get("sha256") != EXPECTED["zip_sha256"]
        or carrier.get("decodedObject", {}).get("expandedFileCount") != EXPECTED["expanded_files"]
    ):
        receipt, code = refuse("REFUSE_CARRIER_METADATA", "carrier metadata differs from the admitted exact object")
        return receipt, None, code
    chunks = carrier.get("chunks")
    order = carrier.get("concatenationOrder")
    if not isinstance(chunks, list) or not chunks or order != [row.get("path") for row in chunks]:
        receipt, code = refuse("REFUSE_CARRIER_METADATA", "chunk order is absent or inconsistent")
        return receipt, None, code
    encoded_parts: list[bytes] = []
    for row in chunks:
        rel = row.get("path")
        if not isinstance(rel, str) or Path(rel).is_absolute() or ".." in Path(rel).parts:
            receipt, code = refuse("REFUSE_CARRIER_METADATA", "unsafe carrier chunk path")
            return receipt, None, code
        path = carrier_dir / rel
        try:
            data = path.read_bytes()
        except OSError as exc:
            receipt, code = refuse("REFUSE_CHUNK_IDENTITY", f"cannot read {rel}: {type(exc).__name__}")
            return receipt, None, code
        if any(byte in b" \t\r\n" for byte in data):
            receipt, code = refuse("REFUSE_CHUNK_IDENTITY", f"whitespace found in {rel}")
            return receipt, None, code
        record = {
            "characters": len(data),
            "sha256": sha256(data),
            "gitBlobSha1": git_blob_sha1(data),
        }
        if (
            record["characters"] != row.get("characters")
            or record["sha256"] != row.get("sha256")
            or record["gitBlobSha1"] != row.get("gitBlobSha1")
        ):
            receipt, code = refuse("REFUSE_CHUNK_IDENTITY", f"chunk identity mismatch: {rel}")
            return receipt, None, code
        encoded_parts.append(data)
    encoded = b"".join(encoded_parts)
    if len(encoded) != EXPECTED["base64_characters"] or sha256(encoded) != EXPECTED["base64_sha256"]:
        receipt, code = refuse("REFUSE_CHUNK_IDENTITY", "concatenated base64 identity mismatch")
        return receipt, None, code
    try:
        archive = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        receipt, code = refuse("REFUSE_DECODED_IDENTITY", f"base64 decode failed: {type(exc).__name__}")
        return receipt, None, code
    if len(archive) != EXPECTED["zip_bytes"] or sha256(archive) != EXPECTED["zip_sha256"]:
        receipt, code = refuse("REFUSE_DECODED_IDENTITY", "decoded ZIP identity mismatch")
        return receipt, None, code
    try:
        with zipfile.ZipFile(BytesIO(archive)) as package:
            infos = package.infolist()
            if len(infos) != EXPECTED["expanded_files"]:
                raise ValueError("expanded file count mismatch")
            for info in infos:
                member = PurePosixPath(info.filename)
                mode = (info.external_attr >> 16) & 0xFFFF
                if member.is_absolute() or ".." in member.parts or "\\" in info.filename or stat.S_ISLNK(mode):
                    raise ValueError(f"unsafe ZIP member {info.filename!r}")
            launcher_member = EXPECTED["root_directory"] + "/Run-Recovery-And-Resolve.cmd"
            if launcher_member not in {info.filename for info in infos}:
                raise ValueError("inner Windows launcher absent")
    except Exception as exc:
        receipt, code = refuse("REFUSE_UNSAFE_ZIP", str(exc))
        return receipt, None, code
    receipt = {
        "schema": "axm-asoiaf-agot-recovery-handoff-runner-receipt/1",
        "componentId": COMPONENT,
        "status": "PASS_EXACT_HANDOFF_RECONSTRUCTABLE",
        "carrierDirectory": "asoiaf/public/review/agot-recovery-to-review-handoff-v1",
        "chunkCount": len(chunks),
        "base64Characters": len(encoded),
        "base64Sha256": sha256(encoded),
        "decodedFilename": EXPECTED["zip_filename"],
        "decodedBytes": len(archive),
        "decodedSha256": sha256(archive),
        "expandedFileCount": EXPECTED["expanded_files"],
        "privateSourceTextPresent": False,
        "privatePayloadPresent": False,
        "reviewTransactionsExecuted": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }
    return receipt, archive, 0


def extract_archive(archive: bytes, output: Path, force: bool) -> tuple[dict[str, Any], int]:
    output = output.resolve()
    if output.exists():
        if any(output.iterdir()):
            if not force:
                return refuse("REFUSE_OUTPUT_BOUNDARY", "output directory exists and is nonempty")
            shutil.rmtree(output)
        elif force:
            output.rmdir()
    output.mkdir(parents=True, exist_ok=False)
    try:
        with zipfile.ZipFile(BytesIO(archive)) as package:
            for info in package.infolist():
                target = (output / PurePosixPath(info.filename)).resolve()
                if output != target and output not in target.parents:
                    raise ValueError("resolved member escapes output directory")
            package.extractall(output)
    except Exception as exc:
        shutil.rmtree(output, ignore_errors=True)
        return refuse("REFUSE_UNSAFE_ZIP", f"safe extraction failed: {exc}")
    receipt = {
        "schema": "axm-asoiaf-agot-recovery-handoff-local-extraction/1",
        "status": "PASS_PUBLIC_SAFE_HANDOFF_EXTRACTED",
        "decodedSha256": EXPECTED["zip_sha256"],
        "expandedFileCount": EXPECTED["expanded_files"],
        "localOutput": str(output),
        "innerLauncher": str(output / EXPECTED["root_directory"] / "Run-Recovery-And-Resolve.cmd"),
        "privateSourceTextPresent": False,
        "privatePayloadPresent": False,
        "reviewTransactionsExecuted": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }
    (output / "LOCAL_EXTRACTION_RECEIPT.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return receipt, 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    sub = root.add_subparsers(dest="command", required=True)
    for name in ("verify", "extract", "run"):
        item = sub.add_parser(name)
        item.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[4]))
        if name != "verify":
            item.add_argument("--out", required=True)
            item.add_argument("--force", action="store_true")
    return root


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    receipt, archive, code = reconstruct(Path(args.repo_root))
    if code:
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return code
    if args.command == "verify":
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 0
    extracted, code = extract_archive(archive or b"", Path(args.out), args.force)
    if code:
        print(json.dumps(extracted, indent=2, sort_keys=True))
        return code
    if args.command == "run":
        launcher = Path(extracted["innerLauncher"])
        if sys.platform != "win32" or not launcher.is_file():
            failed, code = refuse("REFUSE_INNER_LAUNCHER", "inner launcher requires Windows and an exact extracted package")
            print(json.dumps(failed, indent=2, sort_keys=True))
            return code
        completed = subprocess.run(["cmd.exe", "/c", str(launcher)], cwd=launcher.parent, check=False)
        if completed.returncode:
            failed, code = refuse("REFUSE_INNER_LAUNCHER", f"inner launcher exited {completed.returncode}")
            print(json.dumps(failed, indent=2, sort_keys=True))
            return code
    print(json.dumps(extracted, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
