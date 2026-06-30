"""
Orquestrador: gera 28 PPTX (14 capitulos x 2 audiencias) no Padrao Diamond.
"""
import sys
import os
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))

from docs.manual.builders import slide_factory as sf
from docs.manual.builders import theme as t
from docs.manual.builders.chapters_meta import CHAPTERS
from docs.manual.builders.markdown_parser import (
    parse_chapter, extract_bullets, extract_paragraphs
)

CONTENT_DIR = HERE.parent / "content"
OUT_BASE = Path(r"C:\Users\vinic\Desktop\OmniMob - Padrao Diamond")
DIST_DIR = HERE.parent / "dist" / "pptx"
DIST_DIR.mkdir(parents=True, exist_ok=True)

# Reorder: pitch e capitulo 0 vai pra subpasta especial
AUDIENCES = [
    ("decisor", "Para o Decisor", t.AUDIENCE_DECISOR),
    ("operador", "Para o Operador", t.AUDIENCE_OPERADOR),
]


def _safe_audience_folder(slug, aud_subfolder):
    """Localiza a pasta no Desktop pro slug + audiencia."""
    # mapeia slug -> nome de pasta no Desktop
    slug_to_folder = {
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
    folder = OUT_BASE / slug_to_folder.get(slug, slug) / aud_subfolder
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def build_pptx_for(chapter_meta, aud_key, aud_subfolder, aud_tuple):
    """Gera 1 pptx para 1 capitulo + 1 audiencia."""
    md_path = CONTENT_DIR / chapter_meta["md_file"]
    if not md_path.exists():
        print(f"  [SKIP] md nao existe: {md_path}")
        return None

    parsed = parse_chapter(md_path)
    aud_data = chapter_meta[aud_key]

    prs = sf.new_presentation()
    page = 1

    # 1. Capa
    sf.cover_slide(prs,
        module_num=chapter_meta["module_num"],
        category=chapter_meta["category"],
        title=chapter_meta["title"],
        subtitle=chapter_meta["subtitle"],
        audience=aud_tuple,
    )
    page += 1

    # 2. Hook
    sf.hook_slide(prs,
        module_num=chapter_meta["module_num"],
        audience=aud_tuple,
        headline=aud_data["headline"],
        hook_phrase=aud_data["hook"],
        objectives=aud_data["objectives"],
    )
    page += 1

    # 3. Conteudo por secao
    for section in parsed["sections"]:
        heading = section["heading"]
        body = section["body"]
        prints_in = section.get("prints", [])

        bullets = extract_bullets(body, max_items=7)
        paragraphs = extract_paragraphs(body)
        subtitle = ""
        if paragraphs:
            subtitle = paragraphs[0][:140]

        # Slide de conteudo (bullets ou paragrafo)
        if bullets:
            sf.content_slide(prs,
                module_num=chapter_meta["module_num"],
                audience=aud_tuple,
                title=heading,
                subtitle=subtitle,
                body=bullets,
                page_num=page,
            )
            page += 1

        # Slides de screenshot (1 por print da secao)
        for pr in prints_in:
            screen = pr["screen"]
            screen_title = heading + " - " + screen[:50]
            sf.screenshot_slide(prs,
                module_num=chapter_meta["module_num"],
                audience=aud_tuple,
                title=heading,
                subtitle="Tela: " + screen[:80],
                image_path=None,  # captura virao depois via Playwright
                caption="Print " + pr["id"] + " - logado como: " + (pr.get("logged_as") or "n/d"),
                hotspot_notes=pr.get("notes", []),
                page_num=page,
            )
            page += 1

        # Se nao tem bullets nem prints, mas tem paragrafos, gera slide de paragrafo
        if not bullets and not prints_in and paragraphs:
            # converter paragrafos em bullets (cada paragraph como uma bullet)
            para_bullets = [p[:200] for p in paragraphs[:6]]
            if para_bullets:
                sf.content_slide(prs,
                    module_num=chapter_meta["module_num"],
                    audience=aud_tuple,
                    title=heading,
                    subtitle="",
                    body=para_bullets,
                    page_num=page,
                )
                page += 1

    # 4. Recap
    sf.recap_slide(prs,
        module_num=chapter_meta["module_num"],
        audience=aud_tuple,
        title=chapter_meta["title"],
        takeaways=aud_data["takeaways"],
        next_module=aud_data.get("next_module"),
        page_num=page,
    )

    # Salvar
    folder = _safe_audience_folder(chapter_meta["slug"], aud_subfolder)
    filename = "Apresentacao - " + chapter_meta["slug"] + " (" + aud_key + ").pptx"
    out_path = folder / filename
    prs.save(str(out_path))

    # Tambem salva no dist local pra build
    dist_path = DIST_DIR / filename
    shutil.copy2(str(out_path), str(dist_path))

    return out_path


def main():
    total = 0
    for chapter in CHAPTERS:
        print(f"\n>>> Modulo {chapter['module_num']:02d} - {chapter['title']}")
        for aud_key, aud_subfolder, aud_tuple in AUDIENCES:
            try:
                out = build_pptx_for(chapter, aud_key, aud_subfolder, aud_tuple)
                if out:
                    print(f"  [OK] {aud_subfolder} -> {out.name}")
                    total += 1
            except Exception as e:
                print(f"  [ERRO] {aud_subfolder}: {e}")
                import traceback
                traceback.print_exc()
    print(f"\nTotal de PPTX gerados: {total}")


if __name__ == "__main__":
    main()