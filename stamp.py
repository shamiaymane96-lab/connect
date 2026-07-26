#!/usr/bin/env python3
"""Stamp a build id into index.html. Run before committing a deploy.

The in-app update check compares the id baked into the running page against the id
in the deployed file. That only works if the id actually changes per deploy, so this
derives it from the git commit rather than leaving it to memory.

    python stamp.py            # stamp with the current HEAD
    python stamp.py --reset    # back to "dev", which disables the check locally
"""
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HTML = Path(__file__).with_name("index.html")
PATTERN = re.compile(r'(<meta name="build" content=")([^"]*)(">)')


def build_id() -> str:
    try:
        sha = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=True, cwd=HTML.parent,
        ).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        sha = "nogit"
    return f"{datetime.now(timezone.utc):%Y%m%d-%H%M}-{sha}"


def main() -> int:
    text = HTML.read_text(encoding="utf-8")
    if not PATTERN.search(text):
        print('error: no <meta name="build"> tag in index.html', file=sys.stderr)
        return 1

    new = "dev" if "--reset" in sys.argv else build_id()
    stamped, n = PATTERN.subn(rf"\g<1>{new}\g<3>", text, count=1)
    if n != 1:
        print("error: expected exactly one build tag", file=sys.stderr)
        return 1

    HTML.write_text(stamped, encoding="utf-8", newline="")
    print(f"build = {new}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
