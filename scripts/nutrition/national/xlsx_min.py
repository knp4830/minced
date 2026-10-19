"""Minimal .xlsx reader (stdlib only): sheet name -> list of rows (list of str|None). No new packages (CLAUDE.md).

    from xlsx_min import read_xlsx
    sheets = read_xlsx(path)        # {"1.3 Proximates": [[...], ...], ...}
"""
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def _col(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_xlsx(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}
    out = {}
    for sh in wb.find("m:sheets", NS):
        name = sh.get("name")
        t = target[sh.get(REL)]
        t = t.lstrip("/")
        member = t if t.startswith("xl/") else "xl/" + t
        root = ET.fromstring(z.read(member))
        rows = []
        for row in root.find("m:sheetData", NS):
            cells = {}
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                typ = c.get("t")
                if typ == "inlineStr":
                    val = "".join(t.text or "" for t in c.iter("{%s}t" % NS["m"]))
                elif v is None or v.text is None:
                    val = None
                elif typ == "s":
                    val = shared[int(v.text)]
                else:
                    val = v.text
                cells[_col(c.get("r"))] = val
            if cells:
                width = max(cells) + 1
                rows.append([cells.get(i) for i in range(width)])
        out[name] = rows
    return out
