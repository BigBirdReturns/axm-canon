#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Mapping, Sequence


@dataclass(frozen=True)
class InputSpec:
    role: str
    filename: str
    bytes: int
    sha256: str


PRIVATE_ESTATE = InputSpec(
    role="private-estate-root",
    filename="asoiaf-private-world-estate-v4.1.tar.zst",
    bytes=244_436_743,
    sha256="48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7",
)
FOURTH_GENERATION = InputSpec(
    role="fourth-generation-campaign",
    filename="asoiaf-fourth-generation-dragon-frontier-renewal-v1.tar.zst",
    bytes=249_906,
    sha256="a3df744e910e8d1e20606e773024911182378b3e91e5eab9fca04f991f5a3b02",
)
REQUIRED_INPUTS: tuple[InputSpec, ...] = (PRIVATE_ESTATE, FOURTH_GENERATION)

EXIT_READY = 0
EXIT_UNAVAILABLE = 10
EXIT_SIZE_MISMATCH = 20
EXIT_DIGEST_MISMATCH = 21
EXIT_IO_ERROR = 30


def stream_sha256(path: Path, chunk_bytes: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_bytes)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def verify_one(spec: InputSpec, path: Path) -> dict[str, object]:
    result: dict[str, object] = {
        "role": spec.role,
        "requiredFilename": spec.filename,
        "candidatePath": str(path),
        "requiredBytes": spec.bytes,
        "requiredSha256": spec.sha256,
        "exists": False,
        "regularFile": False,
        "observedBytes": None,
        "observedSha256": None,
        "status": "missing",
    }
    try:
        if not path.exists():
            return result
        result["exists"] = True
        if not path.is_file():
            result["status"] = "io-error"
            result["error"] = "candidate path is not a regular file"
            return result
        result["regularFile"] = True
        observed_bytes = path.stat().st_size
        result["observedBytes"] = observed_bytes
        if observed_bytes != spec.bytes:
            result["status"] = "size-mismatch"
            return result
        observed_sha256 = stream_sha256(path)
        result["observedSha256"] = observed_sha256
        if observed_sha256 != spec.sha256:
            result["status"] = "digest-mismatch"
            return result
        result["status"] = "verified"
        return result
    except OSError as exc:
        result["status"] = "io-error"
        result["error"] = f"{type(exc).__name__}: {exc}"
        return result


def evaluate(
    specs: Iterable[InputSpec],
    candidate_paths: Mapping[str, Path],
) -> tuple[int, dict[str, object]]:
    ordered_specs = tuple(specs)
    results = [
        verify_one(spec, candidate_paths.get(spec.role, Path(spec.filename)))
        for spec in ordered_specs
    ]
    statuses = {str(result["status"]) for result in results}

    if "io-error" in statuses:
        exit_code = EXIT_IO_ERROR
        status = "REFUSE_IO_ERROR"
    elif "missing" in statuses:
        exit_code = EXIT_UNAVAILABLE
        status = "HOLD_EXACT_ARCHIVES_UNAVAILABLE"
    elif "size-mismatch" in statuses:
        exit_code = EXIT_SIZE_MISMATCH
        status = "REFUSE_SIZE_MISMATCH"
    elif "digest-mismatch" in statuses:
        exit_code = EXIT_DIGEST_MISMATCH
        status = "REFUSE_DIGEST_MISMATCH"
    elif statuses == {"verified"} and len(results) == len(ordered_specs):
        exit_code = EXIT_READY
        status = "READY_EXACT_ARCHIVES_VERIFIED"
    else:
        exit_code = EXIT_IO_ERROR
        status = "REFUSE_IO_ERROR"

    receipt: dict[str, object] = {
        "schema": "axm-asoiaf-v4-2-recovery-verification-receipt/1",
        "componentId": "asoiaf-v4-2-recovery-source-v1",
        "status": status,
        "exitCode": exit_code,
        "requiredInputCount": len(ordered_specs),
        "verifiedInputCount": sum(result["status"] == "verified" for result in results),
        "allExactInputsVerified": status == "READY_EXACT_ARCHIVES_VERIFIED",
        "inputs": results,
        "authorityBoundary": {
            "candidateInputCopied": False,
            "candidateInputExtracted": False,
            "candidateInputReconstructed": False,
            "candidateInputSubstituted": False,
            "integrationAuthorized": False,
            "privateEstateMutated": False,
            "v4_2Built": False,
            "v4_2Claimed": False,
            "automaticCanonEffect": "none",
            "automaticGraphEffect": "none",
        },
    }
    return exit_code, receipt


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Verify the exact inherited ASOIAF v4.1 and fourth-generation archives "
            "without copying, extracting, reconstructing, substituting, or integrating them."
        )
    )
    parser.add_argument("--private", type=Path, default=Path(PRIVATE_ESTATE.filename))
    parser.add_argument("--campaign", type=Path, default=Path(FOURTH_GENERATION.filename))
    parser.add_argument("--receipt", type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    exit_code, receipt = evaluate(
        REQUIRED_INPUTS,
        {
            PRIVATE_ESTATE.role: args.private,
            FOURTH_GENERATION.role: args.campaign,
        },
    )
    rendered = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    if args.receipt is not None:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
