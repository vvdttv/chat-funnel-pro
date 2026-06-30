import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, ROOT)

from docs.manual.builders.chapters_meta import CHAPTERS

OUT_BASE = r"C:\Users\vinic\Desktop\OmniMob - Padrao Diamond"
INDEX_FOLDER = os.path.join(OUT_BASE, "00-Indice-Mestre")
os.makedirs(INDEX_FOLDER, exist_ok=True)

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
:root { --bg:#0A0A0A; --card:#1C1C1C; --border:#2C2C2C; --green:#2EC76A; --gold:#D4AF37; --text:#FFF; --muted:#A1A1AA; --dim:#71717A; }
html, body { background: var(--bg); color: var(--text); font-family:'Inter','Calibri',sans-serif; line-height:1.6; }
body { max-width:1100px; margin:0 auto; padding:0 24px 80px; }
header { background:linear-gradient(135deg,#0A0A0A 0%,#1C1C1C 100%); border-left:6px solid var(--green); border-top:2px solid var(--gold); padding:48px 40px; margin:32px 0 32px; border-radius:8px; }
header .brand { color:var(--green); font-weight:700; font-size:30px; }
header .brand .tagline { color:var(--gold); font-size:11px; margin-left:16px; letter-spacing:0.5px; font-weight:600; }
header h1 { color:white; font-size:38px; margin:14px 0 8px; line-height:1.15; }
header .sub { color:var(--muted); font-size:16px; }
header .stats { color:var(--gold); font-size:13px; margin-top:18px; font-weight:600; letter-spacing:0.5px; }
.legend { background:var(--card); border-left:4px solid var(--gold); padding:18px 24px; margin:24px 0 36px; border-radius:6px; }
.legend strong { color:var(--gold); }
h2.section { color:var(--green); font-size:22px; margin:48px 0 16px; padding-bottom:8px; border-bottom:2px solid var(--green); }
.modules-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(420px,1fr)); gap:18px; }
.mod-card { background:var(--card); border:1px solid var(--border); border-left:4px solid var(--green); border-radius:8px; padding:22px 24px; }
.mod-card.gold { border-left-color:var(--gold); }
.mod-num { color:var(--green); font-size:12px; font-weight:700; letter-spacing:0.5px; margin-bottom:4px; }
.mod-card.gold .mod-num { color:var(--gold); }
.mod-title { color:white; font-size:18px; font-weight:700; margin-bottom:4px; }
.mod-sub { color:var(--muted); font-size:13px; margin-bottom:14px; }
.mod-cat { display:inline-block; background:#0A0A0A; color:var(--gold); padding:4px 10px; border-radius:4px; font-size:10px; letter-spacing:0.5px; font-weight:700; margin-bottom:12px; }
.links { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
.aud-block { background:#0A0A0A; padding:10px 14px; border-radius:6px; border:1px solid var(--border); }
.aud-block.decisor { border-color:var(--gold); }
.aud-block.operador { border-color:var(--green); }
.aud-label { font-size:10px; font-weight:700; letter-spacing:0.5px; margin-bottom:6px; }
.aud-block.decisor .aud-label { color:var(--gold); }
.aud-block.operador .aud-label { color:var(--green); }
.aud-links a { display:inline-block; padding:3px 8px; margin-right:4px; background:transparent; color:var(--text); border:1px solid var(--border); border-radius:4px; font-size:11px; text-decoration:none; font-weight:600; }
.aud-links a:hover { background:var(--green); color:#0A0A0A; border-color:var(--green); }
footer { color:var(--dim); font-size:11px; text-align:center; margin-top:64px; padding-top:24px; border-top:1px solid var(--border); }
"""


def build_index():
    parts = []
    parts.append('<!DOCTYPE html><html lang="pt-BR"><head>')
    parts.append('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">')
    parts.append('<title>OmniMob - Manual Padrao Diamond - Indice Mestre</title>')
    parts.append('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">')
    parts.append('<style>' + CSS + '</style></head><body>')

    parts.append('<header>')
    parts.append('<div class="brand">OmniMob<span class="tagline">MANUAL OFICIAL - PADRAO DIAMOND</span></div>')
    parts.append('<h1>Indice Mestre</h1>')
    parts.append('<div class="sub">CRM imobiliario com IA que vende, qualifica e fecha.</div>')
    parts.append('<div class="stats">14 modulos x 2 audiencias = 28 apresentacoes + 28 manuais + 28 versoes web</div>')
    parts.append('</header>')

    parts.append('<div class="legend">')
    parts.append('<strong>Como navegar:</strong> cada modulo tem duas versoes - <strong style="color:#D4AF37">Para o Decisor</strong> (foco em ROI, estrategia, decisao) e <strong style="color:#2EC76A">Para o Operador</strong> (foco em uso diario, onde clicar). Em cada versao voce encontra PPTX (apresentacao), DOCX (manual escrito) e HTML (versao web).')
    parts.append('</div>')

    parts.append('<h2 class="section">Modulos</h2>')
    parts.append('<div class="modules-grid">')

    for c in CHAPTERS:
        folder = SLUG_FOLDER[c["slug"]]
        gold_cls = " gold" if c["module_num"] == 0 else ""
        parts.append('<div class="mod-card' + gold_cls + '">')
        parts.append('<div class="mod-num">MODULO ' + ("%02d" % c["module_num"]) + '</div>')
        parts.append('<span class="mod-cat">' + c["category"].upper() + '</span>')
        parts.append('<div class="mod-title">' + c["title"] + '</div>')
        parts.append('<div class="mod-sub">' + c["subtitle"] + '</div>')

        parts.append('<div class="links">')
        # Decisor
        parts.append('<div class="aud-block decisor">')
        parts.append('<div class="aud-label">PARA O DECISOR</div>')
        parts.append('<div class="aud-links">')
        d_base = "../" + folder + "/Para o Decisor/"
        parts.append('<a href="' + d_base + 'Apresentacao - ' + c["slug"] + ' (decisor).pptx">PPTX</a>')
        parts.append('<a href="' + d_base + 'Manual - ' + c["slug"] + ' (decisor).docx">DOCX</a>')
        parts.append('<a href="' + d_base + 'Manual - ' + c["slug"] + ' (decisor).html">HTML</a>')
        parts.append('</div></div>')

        # Operador
        parts.append('<div class="aud-block operador">')
        parts.append('<div class="aud-label">PARA O OPERADOR</div>')
        parts.append('<div class="aud-links">')
        o_base = "../" + folder + "/Para o Operador/"
        parts.append('<a href="' + o_base + 'Apresentacao - ' + c["slug"] + ' (operador).pptx">PPTX</a>')
        parts.append('<a href="' + o_base + 'Manual - ' + c["slug"] + ' (operador).docx">DOCX</a>')
        parts.append('<a href="' + o_base + 'Manual - ' + c["slug"] + ' (operador).html">HTML</a>')
        parts.append('</div></div>')
        parts.append('</div>')
        parts.append('</div>')

    parts.append('</div>')
    parts.append('<footer>OmniMob - Padrao Diamond - Manual oficial. Gerado em ' + os.popen("date /t").read().strip() + '.</footer>')
    parts.append('</body></html>')

    out = os.path.join(INDEX_FOLDER, "INDEX.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    print("Index escrito em: " + out)


if __name__ == "__main__":
    build_index()
