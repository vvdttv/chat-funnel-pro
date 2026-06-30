"""Smoke test for slide_factory."""
import sys
import os
sys.path.insert(0, r"C:\Users\vinic\chat-funnel-pro\docs\manual")

from builders import slide_factory as sf
from builders import theme as t

prs = sf.new_presentation()

# 1. Cover
sf.cover_slide(prs,
    module_num=1,
    category="Fundamentos",
    title="Comecando no OmniMob",
    subtitle="Login, papeis, navegacao e primeiros passos no sistema",
    audience=t.AUDIENCE_OPERADOR,
)

# 2. Hook
sf.hook_slide(prs,
    module_num=1,
    audience=t.AUDIENCE_OPERADOR,
    headline="Antes de operar, entenda o terreno",
    hook_phrase="Quem domina os fundamentos do OmniMob nas primeiras 24 horas, vende mais nas proximas 24.",
    objectives=[
        "Fazer login com seu perfil e identificar seu papel no sistema",
        "Navegar entre Funis, Atividades, Indicadores e Configuracoes com fluencia",
        "Entender como o BottomNav muda conforme seu papel",
        "Saber onde pedir suporte e onde estao os relatorios",
        "Reconhecer os 6 papeis e suas permissoes na pratica",
    ],
)

# 3. Content
sf.content_slide(prs,
    module_num=1,
    audience=t.AUDIENCE_OPERADOR,
    title="Os 6 papeis do OmniMob",
    subtitle="Cada papel ve uma versao do sistema desenhada pra ele",
    body=[
        {"label": "Admin", "desc": "controla tudo, configura funis, IA, papeis"},
        {"label": "Corretor", "desc": "atende leads, opera Kanban, fecha vendas"},
        {"label": "Correspondente", "desc": "gerencia financiamentos, status de aprovacao"},
        {"label": "Atendente seguradora", "desc": "cota garantia locaticia, aplica overrides"},
        {"label": "Administrativo", "desc": "contratos, documentos, lifecycle"},
        {"label": "Vistoriador", "desc": "checklist de imoveis, fotos, aprovacao"},
    ],
    page_num=3,
)

# 4. Screenshot placeholder
sf.screenshot_slide(prs,
    module_num=1,
    audience=t.AUDIENCE_OPERADOR,
    title="Tela de login",
    subtitle="E-mail, senha e selecao de organizacao",
    image_path=None,
    caption="Captura: pagina /auth do OmniMob em modo dark",
    hotspot_notes=[
        "Logo OmniMob no topo",
        "Campo de e-mail (obrigatorio)",
        "Campo de senha (obrigatorio)",
        "Botao Entrar (verde primario)",
        "Link Esqueci minha senha",
    ],
    page_num=4,
)

# 5. Recap
sf.recap_slide(prs,
    module_num=1,
    audience=t.AUDIENCE_OPERADOR,
    title="Modulo 01 finalizado",
    takeaways=[
        "Voce sabe acessar o sistema com seu papel",
        "Reconhece os 6 papeis e suas telas",
        "Navega entre as 4 areas principais",
        "Sabe onde buscar suporte e relatorios",
    ],
    next_module="Modulo 02 - Configuracoes do Admin (as 18 abas)",
    page_num=5,
)

out = r"C:\Users\vinic\chat-funnel-pro\docs\manual\dist\_smoke_test.pptx"
os.makedirs(os.path.dirname(out), exist_ok=True)
prs.save(out)
print("OK -> " + out)
print("Slides:", len(prs.slides.__iter__.__self__._sldIdLst))