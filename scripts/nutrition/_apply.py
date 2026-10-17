"""Apply SQL files, in the order given, to a docker postgres container (test databases only).
usage: python _apply.py <container> file1.sql file2.sql ...
Prints the elapsed time per file and stops at the first error.
"""
import subprocess
import sys
import time

ctr = sys.argv[1]
for path in sys.argv[2:]:
    t = time.time()
    with open(path, "rb") as f:
        r = subprocess.run(
            ["docker", "exec", "-i", ctr, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1", "-1"],
            stdin=f, capture_output=True,
        )
    out = (r.stdout + r.stderr).decode("utf-8", "replace").strip()
    print(f"{path.split('/')[-1]}: {'OK' if r.returncode == 0 else 'FAILED'} in {time.time() - t:.1f}s")
    if out:
        print(out[:1500])
    if r.returncode:
        sys.exit(1)
