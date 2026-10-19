"""Tiny helper: run SQL (file or -c) against a docker container's postgres and print stdout.
usage: python _dbq.py <container> <sqlfile>   (or '-c' 'sql')
"""
import subprocess
import sys

ctr = sys.argv[1]
if sys.argv[2] == "-c":
    sql = sys.argv[3]
else:
    sql = open(sys.argv[2], encoding="utf-8").read()
r = subprocess.run(
    ["docker", "exec", "-i", ctr, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"],
    input=sql, capture_output=True, text=True, encoding="utf-8",
)
sys.stdout.write(r.stdout)
sys.stderr.write(r.stderr)
sys.exit(r.returncode)
