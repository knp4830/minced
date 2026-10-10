"""Shared helpers for the photo pipeline (stdlib only).

Everything here is deliberately boring: one polite HTTP getter, one JSON
writer, one place that knows where the cache lives.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
OUT = ROOT / "out"
MANIFEST_DIR = ROOT / "manifest"

# Wikimedia and the Internet Archive both ask API clients to identify themselves.
# https://meta.wikimedia.org/wiki/User-Agent_policy
USER_AGENT = "MincedPhotoBot/1.0 (open-source recipe app image sourcing; https://github.com/knp4830/minced)"


def http_get(url: str, *, retries: int = 6, pause: float = 4.0, timeout: int = 40) -> tuple[int, bytes, dict]:
    """GET with retry/backoff. Returns (status, body, headers); status 0 = gave up.

    archive.org refuses aggressive clients by dropping connections rather than
    sending a 429 (see docs/TERMINAL-LOG.md), so connection errors are retried
    with a growing pause instead of treated as fatal.
    """
    last = 0
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read(), dict(r.headers)
        except urllib.error.HTTPError as e:
            last = e.code
            if e.code == 429:
                # Rate limited. Hammering on makes the block longer (measured: archive.org
                # kept answering 429 for 20+ minutes to a client that retried every few
                # seconds), so wait it out: 30 s, 60 s, 120 s ... capped at 5 min.
                time.sleep(min(300, 30 * 2 ** attempt))
                continue
            if e.code in (404, 403, 410) or attempt >= 2:
                return e.code, b"", {}   # a persistent 5xx is a bad capture, not worth minutes
            time.sleep(pause)
        except Exception:
            # Measured: ~1 in 4 connections to web.archive.org is refused outright
            # even at one request per 4 s, and an immediate retry usually works.
            # (Long back-offs made a 900-page run take hours; see the report.)
            last = 0
            time.sleep(pause * (attempt + 1) / 2)
    return last, b"", {}


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
