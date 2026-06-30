"""Parser do markdown dos capitulos do manual OmniMob."""
import re
from pathlib import Path

# regex de marcador de PRINT: `[PRINT NN-NN: tela | logado: X | anotacoes: a, b]`
PRINT_RE = re.compile(
    r"\`\[(?:.{0,4} )?PRINT\s+([\d\-]+):\s*([^|\`]+?)(?:\s*\|\s*logado:\s*([^|\`]+?))?(?:\s*\|\s*anota[çc][õo]es:\s*([^\`]+?))?\]\`",
    re.IGNORECASE
)


def parse_chapter(md_path):
    md_path = Path(md_path)
    raw = md_path.read_text(encoding="utf-8")
    mm = re.match(r"(\d+)", md_path.stem)
    module_num = int(mm.group(1)) if mm else 0

    lines = raw.split("\n")
    title = ""
    intro_lines = []
    sections = []
    current = None
    all_prints = []
    in_code_block = False
    i = 0

    while i < len(lines):
        line = lines[i]
        if line.strip().startswith("```"):
            in_code_block = not in_code_block

        if not in_code_block:
            if line.startswith("# ") and not title:
                title = line[2:].strip()
                title = re.sub(r"^\d+\s*[—\-]\s*", "", title)
                i += 1
                continue

            if line.startswith("## "):
                if current:
                    sections.append(current)
                current = {
                    "heading": line[3:].strip(),
                    "level": 2,
                    "body_lines": [],
                    "prints": [],
                }
                i += 1
                continue

            if line.startswith("### ") and current:
                current["body_lines"].append(line)
                i += 1
                continue

        if not in_code_block:
            m2 = PRINT_RE.search(line)
            if m2:
                pid, screen, logged_as, notes_raw = m2.groups()
                notes = []
                if notes_raw:
                    for n in re.split(r"[,;] *", notes_raw):
                        nn = n.strip()
                        if nn:
                            notes.append(nn)
                pr = {
                    "id": pid.strip(),
                    "screen": (screen or "").strip(),
                    "logged_as": (logged_as or "").strip(),
                    "notes": notes,
                }
                all_prints.append(pr)
                if current:
                    current["prints"].append(pr)
                    current["body_lines"].append(line)
                else:
                    intro_lines.append(line)
                i += 1
                continue

        if current is None:
            intro_lines.append(line)
        else:
            current["body_lines"].append(line)
        i += 1

    if current:
        sections.append(current)

    for s in sections:
        s["body"] = "\n".join(s["body_lines"]).strip()
        del s["body_lines"]

    return {
        "module_num": module_num,
        "title": title,
        "intro": "\n".join(intro_lines).strip(),
        "sections": sections,
        "all_prints": all_prints,
    }


def _clean(text):
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"\`([^\`]+)\`", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    text = re.sub(r"\[(?:.{0,4} )?PRINT[^\]]+\]", "", text).strip()
    return text


def extract_bullets(body, max_items=6):
    bullets = []
    in_code = False
    for raw in body.split("\n"):
        line = raw.rstrip()
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        m = re.match(r"^\s*[-*]\s+(.+)$", line)
        if m:
            bullets.append(_clean(m.group(1)))
            continue
        m = re.match(r"^\s*\d+\.\s+(.+)$", line)
        if m:
            bullets.append(_clean(m.group(1)))
            continue
    return bullets[:max_items]


def extract_paragraphs(body):
    paras = []
    cur = []
    in_code = False
    for raw in body.split("\n"):
        line = raw.rstrip()
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if not line.strip():
            if cur:
                paras.append(" ".join(cur))
                cur = []
            continue
        if line.startswith("#") or line.startswith("|") or line.startswith(">"):
            if cur:
                paras.append(" ".join(cur))
                cur = []
            continue
        if "[PRINT" in line or PRINT_RE.search(line):
            continue
        if re.match(r"^\s*[-*\d]", line):
            continue
        cur.append(_clean(line))
    if cur:
        paras.append(" ".join(cur))
    paras = [p for p in paras if p and len(p) > 20]
    return paras
