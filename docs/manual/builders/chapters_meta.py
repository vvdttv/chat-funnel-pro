"""Loader dos metadados dos capitulos."""
import json
from pathlib import Path

_HERE = Path(__file__).parent
with open(_HERE / "chapters_data.json", encoding="utf-8") as f:
    _DATA = json.load(f)

CHAPTERS = _DATA["CHAPTERS"]


def by_slug(slug):
    for c in CHAPTERS:
        if c["slug"] == slug:
            return c
    return None


def by_num(n):
    for c in CHAPTERS:
        if c["module_num"] == n:
            return c
    return None