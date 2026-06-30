"""
OmniMob Padrão Diamond — Theme tokens.

Espelha a estrutura do Padrão Gold da Enermac, mas com identidade
visual OmniMob: dark + verde primário + acento dourado.

Cores em RGB (python-pptx usa RGBColor).
Dimensões em EMU (1 cm = 360000, 1 inch = 914400) ou pt (1pt = 12700).
"""
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor

# === PALETA DIAMOND =========================================================
# Fundos
BG_DARK        = RGBColor(0x0A, 0x0A, 0x0A)   # preto OmniMob (#0A0A0A)
BG_CARD        = RGBColor(0x1C, 0x1C, 0x1C)   # card escuro (#1C1C1C)
BG_LIGHT       = RGBColor(0xF2, 0xF5, 0xFB)   # alternativa clara, se necessário

# Marca
BRAND_GREEN    = RGBColor(0x2E, 0xC7, 0x6A)   # verde OmniMob (HSL 145 63% 49%)
BRAND_GREEN_DK = RGBColor(0x1F, 0x8C, 0x4A)   # verde escuro p/ hover/bordas
ACCENT_GOLD    = RGBColor(0xD4, 0xAF, 0x37)   # acento dourado Diamond
ACCENT_GOLD_DK = RGBColor(0xA8, 0x88, 0x29)   # dourado escuro

# Texto
TEXT_WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
TEXT_MUTED     = RGBColor(0xA1, 0xA1, 0xAA)
TEXT_DIM       = RGBColor(0x71, 0x71, 0x7A)
TEXT_DARK      = RGBColor(0x33, 0x33, 0x33)   # p/ contraste em fundos claros

# Semânticas
SUCCESS        = RGBColor(0x2E, 0xC7, 0x6A)   # verde = OK
WARNING        = RGBColor(0xF5, 0x9E, 0x0B)
ERROR          = RGBColor(0xEF, 0x44, 0x44)
INFO           = RGBColor(0x3B, 0x82, 0xF6)

# Borda
BORDER         = RGBColor(0x2C, 0x2C, 0x2C)
BORDER_LIGHT   = RGBColor(0x3F, 0x3F, 0x46)

# === TIPOGRAFIA =============================================================
FONT_FAMILY = "Calibri"           # universal Windows, mesmo padrão Enermac
FONT_FAMILY_MONO = "Consolas"

# Tamanhos (em pt)
SIZE_DISPLAY = Pt(44)   # capa título grande
SIZE_H1      = Pt(32)   # título de slide
SIZE_H2      = Pt(24)   # subtítulo
SIZE_H3      = Pt(20)   # heading section
SIZE_BODY    = Pt(16)   # corpo padrão
SIZE_BODY_SM = Pt(14)   # corpo pequeno (bullets densos)
SIZE_CAPTION = Pt(11)   # legenda, rodapé
SIZE_TINY    = Pt(9)    # micro-info

# === DIMENSÕES DO SLIDE (16:9 widescreen) ===================================
SLIDE_W = Inches(13.333)   # 33,87 cm
SLIDE_H = Inches(7.5)      # 19,05 cm

# Margens
MARGIN_X = Inches(0.55)
MARGIN_Y = Inches(0.45)

# Header banner (slides de conteúdo)
HEADER_H        = Inches(1.10)
HEADER_STRIPE_H = Inches(0.06)   # faixa verde abaixo do header
HEADER_LOGO_W   = Inches(1.40)
HEADER_LOGO_H   = Inches(0.45)

# Capa: faixa vertical lateral
COVER_STRIPE_W = Inches(0.22)

# Conteúdo: área útil
CONTENT_TOP = HEADER_H + HEADER_STRIPE_H + Inches(0.25)
CONTENT_BOT_RESERVE = Inches(0.45)  # rodapé

# === ETIQUETAS DE PÚBLICO ===================================================
AUDIENCE_DECISOR  = ("PARA O DECISOR",  ACCENT_GOLD)
AUDIENCE_OPERADOR = ("PARA O OPERADOR", BRAND_GREEN)

# === IDENTIDADE =============================================================
BRAND_NAME = "OmniMob"
BRAND_TAGLINE = "CRM imobiliário com IA que vende, qualifica e fecha"
FOOTER_TEXT = "OmniMob — Padrão Diamond"

# === ÍCONES (placeholder via glyphs unicode) ================================
ICON_CHECK = "✓"
ICON_ARROW = "→"
ICON_DOT = "●"
ICON_STAR = "★"
ICON_WARN = "⚠"
ICON_INFO = "ⓘ"
