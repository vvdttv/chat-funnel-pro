"""Pipeline Playwright para capturar prints reais do sistema."""
import sys, os, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, ROOT)

from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = os.path.join(os.path.dirname(HERE), "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

BASE_URL = os.environ.get("OMNIMOB_URL", "http://localhost:8080")

# Credenciais por papel - vem de env vars
CREDS = {
    "admin": (os.environ.get("OMNIMOB_ADMIN_USER", ""), os.environ.get("OMNIMOB_ADMIN_PASS", "")),
    "corretor": (os.environ.get("OMNIMOB_CORRETOR_USER", ""), os.environ.get("OMNIMOB_CORRETOR_PASS", "")),
    "correspondente": (os.environ.get("OMNIMOB_CORRESPONDENTE_USER", ""), os.environ.get("OMNIMOB_CORRESPONDENTE_PASS", "")),
    "atendente_seguradora": (os.environ.get("OMNIMOB_SEGURADORA_USER", ""), os.environ.get("OMNIMOB_SEGURADORA_PASS", "")),
    "administrativo": (os.environ.get("OMNIMOB_ADM_USER", ""), os.environ.get("OMNIMOB_ADM_PASS", "")),
    "vistoriador": (os.environ.get("OMNIMOB_VISTORIADOR_USER", ""), os.environ.get("OMNIMOB_VISTORIADOR_PASS", "")),
}


def login(page, role):
    user, pwd = CREDS.get(role, ("", ""))
    if not user:
        print("  [SKIP] sem credenciais para papel: " + role)
        return False
    page.goto(BASE_URL + "/auth", wait_until="networkidle")
    page.fill('input[autocomplete="username"]', user)
    page.fill('input[autocomplete="current-password"]', pwd)
    page.click('button:has-text("Entrar")')
    try:
        page.wait_for_url("**/", timeout=15000)
        return True
    except Exception as e:
        print("  [ERRO LOGIN] " + role + ": " + str(e))
        return False


def shot(page, path, full_page=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    page.screenshot(path=path, full_page=full_page)
    print("  -> " + os.path.basename(path) + " ok")


def capture_auth_page(page):
    """Captura a /auth - tela publica, sem login."""
    page.goto(BASE_URL + "/auth", wait_until="networkidle")
    time.sleep(1.0)
    folder = os.path.join(SCREENSHOT_DIR, "00-auth")
    os.makedirs(folder, exist_ok=True)
    shot(page, os.path.join(folder, "01-01_tela-auth-completa.png"), full_page=True)

    # foco no card de login
    card = page.locator('form').first
    try:
        card.screenshot(path=os.path.join(folder, "01-01b_card-login-foco.png"))
        print("  -> 01-01b_card-login-foco.png ok")
    except Exception:
        pass


def capture_main_app(page, role):
    """Apos login, navega pelas areas e captura."""
    if not login(page, role):
        return
    role_folder = os.path.join(SCREENSHOT_DIR, "by-role", role)
    os.makedirs(role_folder, exist_ok=True)

    # Home
    time.sleep(2)
    shot(page, os.path.join(role_folder, "home.png"), full_page=True)

    # Navegacao pelas areas (via clique no BottomNav)
    routes = [
        ("funnels", "/"),
        ("atividades", "/?tab=atividades"),
        ("ia", "/?tab=ia"),
        ("indicadores", "/?tab=indicadores"),
        ("configuracao", "/?tab=config"),
    ]
    for name, route in routes:
        try:
            page.goto(BASE_URL + route, wait_until="networkidle", timeout=10000)
            time.sleep(1.5)
            shot(page, os.path.join(role_folder, name + ".png"), full_page=True)
        except Exception as e:
            print("  [ERRO " + role + "/" + name + "] " + str(e))

    # Paineis dedicados
    if role in ("admin", "correspondente"):
        try:
            page.goto(BASE_URL + "/correspondente", wait_until="networkidle", timeout=10000)
            time.sleep(1.5)
            shot(page, os.path.join(role_folder, "correspondente-panel.png"), full_page=True)
        except Exception:
            pass

    if role in ("admin", "atendente_seguradora", "administrativo"):
        try:
            page.goto(BASE_URL + "/garantia", wait_until="networkidle", timeout=10000)
            time.sleep(1.5)
            shot(page, os.path.join(role_folder, "garantia-panel.png"), full_page=True)
        except Exception:
            pass

    if role in ("admin", "corretor"):
        try:
            page.goto(BASE_URL + "/corretor", wait_until="networkidle", timeout=10000)
            time.sleep(1.5)
            shot(page, os.path.join(role_folder, "corretor-panel.png"), full_page=True)
        except Exception:
            pass

    if role in ("admin", "vistoriador"):
        try:
            page.goto(BASE_URL + "/vistorias", wait_until="networkidle", timeout=10000)
            time.sleep(1.5)
            shot(page, os.path.join(role_folder, "vistorias-panel.png"), full_page=True)
        except Exception:
            pass

    if role in ("admin", "administrativo"):
        try:
            page.goto(BASE_URL + "/contratos", wait_until="networkidle", timeout=10000)
            time.sleep(1.5)
            shot(page, os.path.join(role_folder, "contratos-panel.png"), full_page=True)
        except Exception:
            pass


def main():
    print(">>> Iniciando captura Playwright em: " + BASE_URL)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900},
                                  device_scale_factor=2)
        page = ctx.new_page()

        # 1. Tela publica (sempre rola)
        print(">>> Capturando /auth (publico)")
        capture_auth_page(page)

        # 2. Pra cada papel com credencial, captura
        roles_with_creds = [r for r, (u, _) in CREDS.items() if u]
        if not roles_with_creds:
            print("\n[AVISO] Nenhuma credencial nas env vars. Pulando capturas autenticadas.")
            print("Defina: OMNIMOB_ADMIN_USER, OMNIMOB_ADMIN_PASS (e demais por papel)")
        else:
            for role in roles_with_creds:
                print(">>> Capturando como " + role)
                capture_main_app(page, role)

        browser.close()
    print(">>> Captura finalizada. Veja: " + SCREENSHOT_DIR)


if __name__ == "__main__":
    main()
