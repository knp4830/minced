"""Tiny helper: run SQL in the scratch `fdc` database inside the throwaway container.

The container name comes from env W10_CONTAINER (default w10-world-db). Results are
returned as parsed JSON via json_agg so quoting never breaks. Run scripts with `python -I`.
"""
import json
import os
import subprocess

CONTAINER = os.environ.get("W10_CONTAINER", "w10-world-db")


REF_CONTAINER = os.environ.get("W10_REF_CONTAINER", "w10-world-ref")


def psql(sql, db="fdc"):
    # db="postgres" = the PRISTINE snapshot (wave 9 migrations applied, no seeds from this lane): the dedupe
    # reference. The scratch FDC tables live in CONTAINER; seed tests run in a third database.
    out = subprocess.run(
        ["docker", "exec", "-i", REF_CONTAINER if db == "postgres" else CONTAINER, "psql", "-U", "postgres", "-d", db, "-At", "-q", "-v", "ON_ERROR_STOP=1"],
        input=sql, capture_output=True, text=True, encoding="utf-8",
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:2000])
    return out.stdout


def rows(sql, db="fdc"):
    """Run a SELECT and return a list of dicts."""
    txt = psql("select coalesce(json_agg(t), '[]'::json) from (" + sql.rstrip().rstrip(";") + ") t;", db)
    return json.loads(txt)


def lit(s):
    """SQL string literal."""
    return "'" + str(s).replace("'", "''") + "'"


# FDC nutrient_id -> our key (mirrors compact_fdc.WANT). Energy falls back to Atwater when 1008 is absent.
KEYS = {
    1008: "kcal", 2047: "kcal2", 2048: "kcal3",
    1003: "protein", 1004: "fat", 1005: "carbs", 1079: "fiber", 2000: "sugars",
    1093: "sodium", 1253: "cholesterol", 1258: "sat_fat", 1087: "calcium",
    1089: "iron", 1090: "magnesium", 1092: "potassium", 1095: "zinc",
    1106: "vit_a_rae", 1114: "vit_d_mcg", 1109: "vit_e", 1185: "vit_k",
    1175: "vit_b6", 1178: "vit_b12", 1162: "vit_c", 1190: "folate_dfe",
    1235: "added_sugars",
}


def nutrients_for(ids):
    """{fdc_id: {nutrient_id: amount}} for a list of fdc ids."""
    if not ids:
        return {}
    got = rows("select fdc_id, nutrient_id, amount from nut where fdc_id in (%s)" % ",".join(str(int(i)) for i in ids))
    res = {}
    for g in got:
        res.setdefault(g["fdc_id"], {})[g["nutrient_id"]] = float(g["amount"]) if g["amount"] is not None else None
    for fid, m in res.items():
        if 1008 not in m:
            for alt in (2047, 2048):
                if alt in m:
                    m[1008] = m[alt]
                    break
        for alt in (2047, 2048):
            m.pop(alt, None)
    return res
