"""Render public demo routes into initial HTML for a reviewable, indexable static preview.

Run after build with the local server running. Production needs its own authenticated,
publication-aware rendering/rebuild strategy; this exporter intentionally refuses it.
"""
import json,re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
config=(ROOT/'src'/'config.js').read_text(encoding='utf-8')
if re.search(r"mode\s*:\s*['\"]production",config):
    raise SystemExit('Use a publication-aware server rendering strategy for production, not demo snapshots.')
content=json.loads((ROOT/'dist'/'content.json').read_text(encoding='utf-8'))
routes=['/about','/programs','/projects','/partners','/impact','/get-involved','/contact']+['/projects/'+p['slug'] for p in content['projects']]+['/']
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page()
    for route in routes:
        page.goto('http://127.0.0.1:5173'+route,wait_until='domcontentloaded')
        page.wait_for_selector('main h1')
        markup=page.locator('#app').inner_html()
        target=ROOT/'dist'/route.strip('/')/'index.html'
        html=target.read_text(encoding='utf-8')
        start=html.index('  <div id="app">');end=html.index('  <div id="toast"')
        html=html[:start]+'  <div id="app">'+markup+'</div>\n'+html[end:]
        target.write_text(html,encoding='utf-8')
    browser.close()
print(f'Prerendered {len(routes)} public demo routes. Admin remains excluded.')
