import sys, os, shutil, html
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, ROOT)

from docs.manual.builders.chapters_meta import CHAPTERS
from docs.manual.builders.markdown_parser import parse_chapter, PRINT_RE
from docs.manual.builders.markdown_parser import _clean as md_clean

CONTENT_DIR = os.path.join(os.path.dirname(HERE), "content")
OUT_BASE = r"C:\Users\vinic\Desktop\OmniMob - Padrao Diamond"
DIST_DIR = os.path.join(os.path.dirname(HERE), "dist", "html")
os.makedirs(DIST_DIR, exist_ok=True)

SLUG_FOLDER = {
    "00-Pitch-Executivo": "00-Indice-Mestre",
    "01-Comecando": "01-Comecando",
    "02-Admin-Config": "02-Admin-Config",
    "03-Admin-Kanban": "03-Admin-Kanban",
    "04-Admin-IA": "04-Admin-IA",
    "05-Admin-Indicadores": "05-Admin-Indicadores",
    "06-Admin-Atividades": "06-Admin-Atividades",
    "07-Correspondente": "07-Correspondente",
    "08-Corretor": "08-Corretor",
    "09-Garantia": "09-Garantia",
    "10-Vistoria": "10-Vistoria",
    "11-Contrato": "11-Contrato",
    "12-Fluxos-Fim-a-Fim": "12-Fluxos-Fim-a-Fim",
    "13-Glossario-FAQ": "13-Glossario-FAQ",
}


CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0A0A0A;
  --card: #1C1C1C;
  --border: #2C2C2C;
  --green: #2EC76A;
  --green-dk: #1F8C4A;
  --gold: #D4AF37;
  --text: #FFFFFF;
  --muted: #A1A1AA;
  --dim: #71717A;
}
html, body { background: var(--bg); color: var(--text); font-family: 'Inter', 'Calibri', sans-serif; line-height: 1.6; }
body { max-width: 980px; margin: 0 auto; padding: 0 24px 80px; }
header.cover {
  background: linear-gradient(135deg, #0A0A0A 0%, #1C1C1C 100%);
  border-left: 6px solid var(--green);
  border-top: 2px solid var(--gold);
  padding: 48px 40px;
  margin: 32px 0 48px;
  border-radius: 8px;
}
header.cover .brand { color: var(--green); font-weight: 700; font-size: 28px; }
header.cover .brand .tagline { color: var(--gold); font-size: 11px; margin-left: 16px; font-weight: 600; letter-spacing: 0.5px; }
header.cover .modulo { color: var(--green); font-size: 14px; margin-top: 18px; font-weight: 600; }
header.cover h1 { color: white; font-size: 42px; margin: 8px 0 12px; line-height: 1.15; }
header.cover .subtitle { color: var(--muted); font-size: 16px; }
header.cover .audience { color: var(--gold); font-size: 13px; font-weight: 700; letter-spacing: 1px; margin-top: 24px; }
.hook-box {
  background: var(--card);
  border: 2px solid var(--gold);
  padding: 28px 32px;
  border-radius: 8px;
  margin: 24px 0;
  text-align: center;
}
.hook-box .headline { color: var(--green); font-weight: 700; font-size: 18px; margin-bottom: 12px; }
.hook-box .hook { color: white; font-size: 16px; font-style: italic; }
h2 { color: var(--green); font-size: 24px; margin: 36px 0 8px; padding-bottom: 8px; border-bottom: 2px solid var(--green); }
h3 { color: var(--gold); font-size: 18px; margin: 24px 0 8px; }
p { color: var(--text); margin: 8px 0; font-size: 15px; }
blockquote { color: var(--muted); border-left: 3px solid var(--gold); padding-left: 16px; font-style: italic; margin: 12px 0; }
ul, ol { padding-left: 24px; margin: 8px 0; }
li { color: var(--text); margin: 4px 0; font-size: 15px; }
li::marker { color: var(--green); }
table { border-collapse: collapse; width: 100%; margin: 16px 0; }
th { background: var(--bg); color: var(--green); padding: 10px 12px; text-align: left; border: 1px solid var(--border); font-size: 13px; }
td { background: var(--card); color: var(--text); padding: 10px 12px; border: 1px solid var(--border); font-size: 14px; }
.print-callout {
  background: var(--card);
  border-left: 4px solid var(--gold);
  padding: 16px 20px;
  margin: 16px 0;
  border-radius: 6px;
}
.print-callout .pid { color: var(--gold); font-weight: 700; font-size: 12px; letter-spacing: 0.5px; margin-bottom: 8px; }
.print-callout .row { margin: 4px 0; font-size: 13px; }
.print-callout .label { color: var(--green); font-weight: 600; }
.print-callout .value { color: var(--text); }
.print-callout .note { color: var(--muted); margin-left: 16px; font-size: 12px; }
.takeaway-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 20px 0; }
.takeaway {
  background: var(--card);
  border-radius: 8px;
  padding: 20px;
  border: 1px solid var(--border);
}
.takeaway.odd { border-left: 4px solid var(--green); }
.takeaway.even { border-left: 4px solid var(--gold); }
.takeaway .num { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
.takeaway.odd .num { color: var(--green); }
.takeaway.even .num { color: var(--gold); }
.takeaway .text { color: var(--text); font-size: 14px; }
.next-step {
  background: var(--card);
  border: 2px solid var(--gold);
  padding: 20px 24px;
  border-radius: 8px;
  margin: 32px 0;
}
.next-step .label { color: var(--gold); font-size: 12px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 6px; }
.next-step .text { color: white; font-size: 16px; font-weight: 600; }
footer { color: var(--dim); font-size: 11px; text-align: center; margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--border); }
.objectives { background: var(--card); padding: 20px 28px; border-radius: 8px; border-left: 4px solid var(--green); margin: 16px 0; }
.objectives .label { color: white; font-weight: 700; font-size: 16px; margin-bottom: 12px; }
.objectives ul { padding-left: 0; list-style: none; }
.objectives li { padding-left: 28px; position: relative; }
.objectives li::before { content: "✓"; color: var(--green); font-weight: 700; position: absolute; left: 0; }
"""


def esc(s):
    return html.escape(s or "", quote=True)


def is_sep(s):
    if not s:
        return False
    for ch in s:
        if not (ch == "-" or ch == ":" or ch.isspace()):
            return False
    return True


def is_bul(s):
    if len(s) < 2:
        return False
    if s[0] in ("-", "*") and s[1] == " ":
        return True
    j = 0
    while j < len(s) and s[j].isdigit():
        j += 1
    if j > 0 and j + 1 < len(s) and s[j] == "." and s[j + 1] == " ":
        return True
    return False


def strip_bul(s):
    if s[0] in ("-", "*"):
        return s[2:].strip()
    j = 0
    while j < len(s) and s[j].isdigit():
        j += 1
    return s[j + 2:].strip()


def render_md(body):
    out = []
    in_code = False
    rows = []
    in_t = False
    in_list = False
    in_quote = False

    def close_list():
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    def flush_table():
        nonlocal in_t, rows
        if not rows:
            return
        out.append('<table>')
        for ri, row in enumerate(rows):
            tag = "th" if ri == 0 else "td"
            out.append("<tr>")
            for cell in row:
                out.append("<" + tag + ">" + esc(cell.strip()) + "</" + tag + ">")
            out.append("</tr>")
        out.append("</table>")
        in_t = False
        rows.clear()

    for raw in body.split("\n"):
        ln = raw.rstrip()
        st = ln.strip()
        if st.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if st.startswith("|") and st.endswith("|"):
            close_list()
            cs = [c.strip() for c in st.split("|")[1:-1]]
            if cs and all(is_sep(c) for c in cs):
                continue
            rows.append(cs)
            in_t = True
            continue
        elif in_t:
            flush_table()
        if not st:
            close_list()
            continue
        m = PRINT_RE.search(ln)
        if m:
            close_list()
            pid, sc, lg, nr = m.groups()
            out.append('<div class="print-callout">')
            out.append('<div class="pid">[ PRINT ' + esc(pid.strip() if pid else "") + ' ]</div>')
            out.append('<div class="row"><span class="label">Tela:</span> <span class="value">' + esc((sc or "").strip()) + '</span></div>')
            if lg:
                out.append('<div class="row"><span class="label">Logado como:</span> <span class="value">' + esc(lg.strip()) + '</span></div>')
            if nr:
                out.append('<div class="row"><span class="label">Anotacoes:</span></div>')
                for i, n in enumerate(nr.split(","), 1):
                    nn = n.strip()
                    if nn:
                        out.append('<div class="note">' + str(i) + ". " + esc(nn) + '</div>')
            out.append('</div>')
            continue
        if st.startswith("### "):
            close_list()
            out.append("<h3>" + esc(md_clean(st[4:])) + "</h3>")
            continue
        if st.startswith("## "):
            close_list()
            out.append("<h2>" + esc(md_clean(st[3:])) + "</h2>")
            continue
        if st.startswith("> "):
            close_list()
            out.append("<blockquote>" + esc(md_clean(st[2:])) + "</blockquote>")
            continue
        if is_bul(st):
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append("<li>" + esc(md_clean(strip_bul(st))) + "</li>")
            continue
        close_list()
        out.append("<p>" + esc(md_clean(st)) + "</p>")
    close_list()
    if in_t:
        flush_table()
    return "\n".join(out)


def build(ch, ak, asub, alabel, acolor_hex):
    mp = os.path.join(CONTENT_DIR, ch["md_file"])
    if not os.path.exists(mp):
        return None
    parsed = parse_chapter(mp)
    aud = ch[ak]

    head = []
    head.append('<!DOCTYPE html>')
    head.append('<html lang="pt-BR">')
    head.append('<head>')
    head.append('<meta charset="utf-8">')
    head.append('<meta name="viewport" content="width=device-width, initial-scale=1">')
    head.append('<title>OmniMob - ' + esc(ch["title"]) + ' - ' + esc(alabel) + '</title>')
    head.append('<link rel="preconnect" href="https://fonts.googleapis.com">')
    head.append('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">')
    head.append('<style>' + CSS + '</style>')
    head.append('</head>')
    head.append('<body>')

    cover_html = []
    cover_html.append('<header class="cover">')
    cover_html.append('<div class="brand">OmniMob<span class="tagline">MANUAL OFICIAL - PADRAO DIAMOND</span></div>')
    cover_html.append('<div class="modulo">Modulo ' + ("%02d" % ch["module_num"]) + ' - ' + esc(ch["category"]) + '</div>')
    cover_html.append('<h1>' + esc(ch["title"]) + '</h1>')
    cover_html.append('<div class="subtitle">' + esc(ch["subtitle"]) + '</div>')
    cover_html.append('<div class="audience" style="color: ' + acolor_hex + '">' + esc(alabel.upper()) + '</div>')
    cover_html.append('</header>')

    hook_html = []
    hook_html.append('<section>')
    hook_html.append('<h2>Por que este modulo importa</h2>')
    hook_html.append('<div class="hook-box">')
    hook_html.append('<div class="headline">' + esc(aud["headline"]) + '</div>')
    hook_html.append('<div class="hook">' + esc(aud["hook"]) + '</div>')
    hook_html.append('</div>')
    hook_html.append('<div class="objectives">')
    hook_html.append('<div class="label">Ao final deste modulo, voce sera capaz de:</div>')
    hook_html.append('<ul>')
    for o in aud["objectives"]:
        hook_html.append('<li>' + esc(o) + '</li>')
    hook_html.append('</ul>')
    hook_html.append('</div>')
    hook_html.append('</section>')

    body_html = ['<section>']
    body_html.append('<h2>' + esc(ch["title"]) + '</h2>')
    if parsed.get("intro"):
        body_html.append(render_md(parsed["intro"]))
    for sec in parsed["sections"]:
        body_html.append('<h2>' + esc(sec["heading"]) + '</h2>')
        body_html.append(render_md(sec["body"]))
    body_html.append('</section>')

    recap_html = ['<section>']
    recap_html.append('<h2>Recap - o que voce leva deste modulo</h2>')
    recap_html.append('<div class="takeaway-grid">')
    for i, ti in enumerate(aud["takeaways"], 1):
        cls = "odd" if i % 2 else "even"
        recap_html.append('<div class="takeaway ' + cls + '">')
        recap_html.append('<div class="num">#' + ("%02d" % i) + '</div>')
        recap_html.append('<div class="text">' + esc(ti) + '</div>')
        recap_html.append('</div>')
    recap_html.append('</div>')
    if aud.get("next_module"):
        recap_html.append('<div class="next-step">')
        recap_html.append('<div class="label">PROXIMO PASSO</div>')
        recap_html.append('<div class="text">' + esc(aud["next_module"]) + '</div>')
        recap_html.append('</div>')
    recap_html.append('</section>')

    foot = ['<footer>OmniMob - Padrao Diamond - Manual oficial</footer>', '</body></html>']

    full = "\n".join(head) + "\n" + "\n".join(cover_html) + "\n" + "\n".join(hook_html) + "\n" + "\n".join(body_html) + "\n" + "\n".join(recap_html) + "\n" + "\n".join(foot)

    folder = os.path.join(OUT_BASE, SLUG_FOLDER[ch["slug"]], asub)
    os.makedirs(folder, exist_ok=True)
    fn = "Manual - " + ch["slug"] + " (" + ak + ").html"
    op = os.path.join(folder, fn)
    with open(op, "w", encoding="utf-8") as f:
        f.write(full)

    dp = os.path.join(DIST_DIR, fn)
    shutil.copy2(op, dp)
    return op


AUD = [("decisor", "Para o Decisor", "Para o Decisor", "#D4AF37"),
       ("operador", "Para o Operador", "Para o Operador", "#2EC76A")]


def main():
    tot = 0
    for ch in CHAPTERS:
        print(">>> Modulo " + ("%02d" % ch["module_num"]) + " - " + ch["title"])
        for ak, asub, alabel, acolor in AUD:
            try:
                out = build(ch, ak, asub, alabel, acolor)
                if out:
                    print("  [OK] " + alabel + " -> " + os.path.basename(out))
                    tot += 1
            except Exception as e:
                print("  [ERRO] " + alabel + ": " + str(e))
                import traceback
                traceback.print_exc()
    print("Total HTML: " + str(tot))


if __name__ == "__main__":
    main()
