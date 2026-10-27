"""Check that the deployed GitHub Pages demo serves its routes and core assets."""
import json
import os
import time
import urllib.request
from urllib.parse import urljoin

base = os.environ['PAGE_URL'].rstrip('/') + '/'


def get(path, expected_type):
    url = urljoin(base, path)
    for attempt in range(8):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'SFW-Deployment-Check/1.0'})
            with urllib.request.urlopen(request, timeout=20) as response:
                if response.status != 200:
                    raise RuntimeError(f'Unexpected HTTP status: {response.status}')
                actual_type = response.headers.get_content_type()
                expected_types = (expected_type,) if isinstance(expected_type, str) else expected_type
                if actual_type not in expected_types:
                    raise RuntimeError(f'{url}: expected {expected_type}, got {actual_type}')
                body = response.read()
                if not body:
                    raise RuntimeError(f'{url}: empty response')
                return body
        except Exception:
            if attempt == 7:
                raise
            time.sleep(4)


home = get('', 'text/html').decode('utf-8')
if 'When she rises' not in home:
    raise RuntimeError('The live homepage is not the expected redesign.')

content = json.loads(get('content.json', 'application/json'))
assert len(content['projects']) == 26
assert len(content['partners']) == 59
assert len(content['reports']) == 3

routes = ['about/', 'programs/', 'projects/', 'partners/', 'impact/', 'get-involved/', 'contact/', 'admin/']
routes += ['projects/' + project['slug'] + '/' for project in content['projects']]
for route in routes:
    body = get(route, 'text/html').decode('utf-8')
    if route != 'admin/' and '<main id="main">' not in body:
        raise RuntimeError(f'Missing prerendered content on {route}')

get('style.css', 'text/css')
# GitHub Pages serves .js files with application/javascript.
get('app.js', ('application/javascript', 'text/javascript'))
for font in ('inter.woff2', 'cardo.woff2'):
    raw = get('assets/' + font, ('font/woff2', 'application/font-woff2', 'application/octet-stream'))
    if not raw.startswith(b'wOF2'):
        raise RuntimeError(f'Invalid WOFF2 font: {font}')
image = content['photos']['hero'].split('/assets/', 1)[1]
get('assets/' + image, 'image/webp')

print(f'LIVE DEMO VERIFIED: {base}')
print(f'Checked homepage, {len(routes)} other routes, content, CSS, JavaScript, fonts and hero image.')
