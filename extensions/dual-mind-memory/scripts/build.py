from __future__ import annotations

import json
import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.1.0"
OUTPUT = ROOT / "release" / f"DualMindMemory_v{VERSION}.toolpkg"


def main() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("toolpkg_id") != "com.community.dual_mind_memory":
        raise SystemExit("Unexpected toolpkg_id")
    if manifest.get("version") != VERSION:
        raise SystemExit("VERSION does not match manifest.json")

    shutil.copyfile(ROOT / "src" / "main.js", ROOT / "main.js")
    shutil.copyfile(
        ROOT / "src" / "dual_mind_memory.js",
        ROOT / "packages" / "dual_mind_memory.js",
    )

    subprocess.run(["node", "--check", str(ROOT / "main.js")], check=True)
    subprocess.run(
        ["node", "--check", str(ROOT / "packages" / "dual_mind_memory.js")],
        check=True,
    )
    subprocess.run(["node", str(ROOT / "tests" / "mock_runtime_test.js")], check=True)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    files = [
        ROOT / "manifest.json",
        ROOT / "main.js",
        ROOT / "README.md",
        ROOT / "packages" / "dual_mind_memory.js",
    ]
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, path.relative_to(ROOT).as_posix())

    with zipfile.ZipFile(OUTPUT) as archive:
        bad = archive.testzip()
        if bad:
            raise SystemExit(f"Corrupted package member: {bad}")

    print(f"Built {OUTPUT}")


if __name__ == "__main__":
    main()
