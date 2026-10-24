"""Visual reconnaissance; use with a running dev server. No live accounts."""
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(__file__).resolve().parents[2] / 'docs' / 'screenshots'
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome')
    page = browser.new_page(viewport={'width': 1440, 'height': 1080}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173')
    page.wait_for_load_state('networkidle')
    print('Headings:', page.get_by_role('heading').all_text_contents())
    print('Buttons:', page.get_by_role('button').all_text_contents()[:30])
    print('Errors:', errors)
    page.screenshot(path=str(out / '01-today.png'), full_page=True, animations='disabled', timeout=10000)
    browser.close()
