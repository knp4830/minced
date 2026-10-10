#!/usr/bin/env python3
"""Exercise upload_photos.py against a local mock of the Supabase Storage API.

    python scripts/photos/test_upload.py

Proves, without touching live: the bucket is created public with a mime/size
limit; every object is POSTed with the secret key, image/webp, an immutable
cache header and x-upsert=false; a second run uploads nothing (idempotent); a
wrong key uploads nothing. The mock only implements the three calls the script
makes, so a real-API difference can still exist -- the first live run should be
watched, which is why post_merge_live_steps starts with a dry run.
"""

from __future__ import annotations

import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEY = "test-secret-key"
store: dict[str, bytes] = {}
log: list[dict] = []
bucket: dict = {}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def _send(self, code, body=b"{}"):
        self.send_response(code)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _auth(self) -> bool:
        return self.headers.get("Authorization") == f"Bearer {KEY}" and self.headers.get("apikey") == KEY

    def do_HEAD(self):
        path = self.path.split("/object/public/recipe-photos/", 1)[-1]
        self._send(200 if path in store else 404, b"")

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n)
        if not self._auth():
            return self._send(401, b'{"message":"bad key"}')
        if self.path == "/storage/v1/bucket":
            if bucket:
                return self._send(409, b'{"message":"The resource already exists"}')
            bucket.update(json.loads(body))
            return self._send(200)
        prefix = "/storage/v1/object/recipe-photos/"
        if self.path.startswith(prefix):
            p = self.path[len(prefix):]
            if p in store:
                return self._send(409, b'{"message":"The resource already exists"}')
            store[p] = body
            log.append({"path": p, "ct": self.headers.get("Content-Type"), "cc": self.headers.get("Cache-Control"),
                        "upsert": self.headers.get("x-upsert"), "bytes": len(body)})
            return self._send(200)
        self._send(404)


def run(extra_env: dict) -> subprocess.CompletedProcess:
    import os
    env = {**os.environ, **extra_env}
    return subprocess.run([sys.executable, "-I", str(HERE / "upload_photos.py"), "--apply", "--base-url", f"http://127.0.0.1:{PORT}"],
                          capture_output=True, text=True, env=env)


srv = HTTPServer(("127.0.0.1", 0), H)
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

bad = run({"SUPABASE_SECRET_KEY": "wrong"})
assert bad.returncode != 0 and not store, ("wrong key must upload nothing", bad.stdout, bad.stderr)

first = run({"SUPABASE_SECRET_KEY": KEY})
assert first.returncode == 0, first.stderr + first.stdout
assert bucket["public"] is True and bucket["allowed_mime_types"] == ["image/webp"], bucket
n = len(store)
assert n > 0
assert all(e["ct"] == "image/webp" and "immutable" in e["cc"] and e["upsert"] == "false" for e in log), log
assert all(e["bytes"] < 1_048_576 for e in log)

second = run({"SUPABASE_SECRET_KEY": KEY})
assert second.returncode == 0, second.stderr
assert len(store) == n and len(log) == n, "second run must upload nothing"
print(f"ok: {n} objects uploaded once, re-run uploaded 0, wrong key rejected")
print(first.stdout.strip().splitlines()[-1], "|", second.stdout.strip().splitlines()[-1])
