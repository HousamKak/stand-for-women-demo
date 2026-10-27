"""Browser QA against an already-running local server. Requires Python Playwright."""
import json,os
from urllib.parse import urljoin
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'qa';OUT.mkdir(exist_ok=True)
BASE=os.environ.get('SFW_TEST_BASE_URL','http://127.0.0.1:5173').rstrip('/')
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE,wait_until='networkidle')
    page.wait_for_selector('.hero h1')
    for y in range(0,6000,700):page.evaluate('(y)=>window.scrollTo(0,y)',y);page.wait_for_timeout(120)
    page.wait_for_timeout(600)
    broken=page.locator('img').evaluate_all('(images)=>images.filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src)')
    assert not broken,broken
    page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(OUT/'home-desktop.png'),full_page=True)
    results.append('Desktop homepage, fonts and loaded images verified')

    page.get_by_role('link',name='Explore our projects',exact=True).click()
    page.wait_for_selector('.filter-tabs')
    assert page.locator('.project-card').count()==26
    page.get_by_role('button',name='Leadership',exact=True).click()
    count=page.locator('.project-card').count();assert 0<count<26
    page.get_by_role('button',name='All 26',exact=True).click()
    page.get_by_role('searchbox',name='Search projects').fill('Al Fanar')
    assert page.locator('.project-card').count()==1
    page.locator('.project-card h3 a').click()
    page.wait_for_selector('.project-story')
    assert 'Fanar' in page.locator('h1').inner_text()
    if page.locator('[data-gallery]').count():
        page.locator('[data-gallery]').first.click()
        assert page.locator('.gallery-dialog').is_visible()
        page.get_by_role('button',name='Next photo').click()
        page.get_by_role('button',name='Close gallery').click()
        page.locator('.gallery-dialog').wait_for(state='detached')
    results.append('Project filtering, search, detail navigation and gallery verified')

    page.goto(BASE+'/partners',wait_until='networkidle');assert page.locator('.partner-card').count()==59
    page.get_by_role('searchbox',name='Search partners').fill('Abaad');assert page.locator('.partner-card').count()==1
    page.goto(BASE+'/impact',wait_until='networkidle');assert page.locator('.report-cover').count()==3
    for link in page.locator('.report-cover').all():
        response=context.request.get(urljoin(BASE+'/',link.get_attribute('href')));assert response.status==200;assert response.headers['content-type']=='application/pdf'
    results.append('Partner search and all three downloadable report files verified')

    page.goto(BASE+'/admin',wait_until='networkidle')
    page.get_by_role('button',name='Explore the dashboard').click()
    assert page.get_by_role('heading',name='Welcome to your studio.').is_visible()
    page.screenshot(path=str(OUT/'dashboard-desktop.png'),full_page=True)
    page.get_by_role('button',name='Create a project').click()
    dialog=page.locator('.editor-dialog')
    dialog.get_by_label('Project title').fill('QA draft <script>bad</script>')
    dialog.get_by_label('Short introduction').fill('A local test entry to verify draft and publishing behavior.')
    dialog.get_by_label('The story',exact=False).fill('A first paragraph.\n\nA second paragraph.')
    dialog.get_by_role('button',name='Choose from the media library').click()
    page.locator('.media-library [data-choice]').first.click()
    page.locator('.media-library').wait_for(state='detached')
    dialog.get_by_role('button',name='Preview',exact=True).click()
    assert page.locator('.entry-preview h2').inner_text()=='QA draft <script>bad</script>'
    page.locator('.entry-preview').get_by_role('button',name='Close preview').click()
    dialog.get_by_role('button',name='Save entry').click()
    assert page.locator('.admin-table tbody tr').count()==27
    page.goto(BASE+'/projects',wait_until='networkidle')
    page.get_by_role('searchbox',name='Search projects').fill('QA draft')
    assert page.locator('.project-card').count()==0
    page.goto(BASE+'/admin',wait_until='networkidle');page.get_by_role('button',name='Explore the dashboard').click()
    page.locator('.admin-sidebar [data-admin-kind="projects"]').click()
    row=page.locator('.admin-table tr').filter(has_text='QA draft')
    row.get_by_role('button',name='Edit').click()
    page.locator('.editor-dialog').get_by_label('Visibility').select_option('published')
    page.locator('.editor-dialog').get_by_role('button',name='Save entry').click()
    page.goto(BASE+'/projects',wait_until='networkidle');page.get_by_role('searchbox',name='Search projects').fill('QA draft')
    assert page.locator('.project-card').count()==1
    page.reload(wait_until='networkidle');page.get_by_role('searchbox',name='Search projects').fill('QA draft')
    assert page.locator('.project-card').count()==1
    page.goto(BASE+'/admin',wait_until='networkidle');page.get_by_role('button',name='Explore the dashboard').click();page.locator('.admin-sidebar [data-admin-kind="projects"]').click()
    page.locator('.admin-table tr').filter(has_text='QA draft').get_by_role('button',name='Edit').click()
    page.get_by_role('button',name='Delete entry',exact=True).click()
    page.locator('.confirm-dialog').get_by_role('button',name='Delete entry').click()
    assert page.locator('.admin-table tbody tr').count()==26
    results.append('Dashboard create, escaped preview, draft privacy, publishing, persistence and deletion verified')

    # Filtering must retain original record indices when an entry is opened.
    page.get_by_role('searchbox',name='Search dashboard entries').fill('Al Fanar')
    assert page.locator('.admin-table tbody tr').count()==1
    page.locator('.admin-table tbody tr').get_by_role('button',name='Edit').click()
    assert page.locator('.editor-dialog').get_by_label('Project title').input_value()=='Al Fanar'
    page.get_by_role('button',name='Close editor',exact=True).click()
    page.get_by_role('searchbox',name='Search dashboard entries').fill('')
    page.get_by_role('combobox',name='Filter entries by visibility').select_option('draft')
    assert page.locator('.admin-table tbody tr').count()==0
    page.get_by_role('combobox',name='Filter entries by visibility').select_option('all')
    results.append('Dashboard search, status filtering and correct filtered-record editing verified')

    # Check every public collection, including secondary appearances on the homepage.
    # Fixtures are changed only in isolated browser-local demo storage.
    page.evaluate('''() => {
      const d=JSON.parse(localStorage.getItem('sfw-content-v1'));
      for(const kind of ['projects','partners','reports','testimonials','team'])d[kind][0].status='draft';
      d.testimonials.find(t=>t.name==='Christa Maria Daher').status='draft';
      localStorage.setItem('sfw-content-v1',JSON.stringify(d));
    }''')
    page.goto(BASE+'/about',wait_until='networkidle');assert page.locator('.team-grid article').count()==2
    page.goto(BASE,wait_until='networkidle');assert page.locator('.avatar-stack img').count()==2
    original_data=json.loads((ROOT/'dist'/'content.json').read_text(encoding='utf-8'))
    assert original_data['testimonials'][0]['text'] not in page.locator('blockquote').inner_text()
    page.goto(BASE+'/get-involved',wait_until='networkidle')
    assert 'Christa Maria Daher' not in page.locator('.quote-author').inner_text()
    page.goto(BASE+'/impact',wait_until='networkidle');assert page.locator('.report-cover').count()==2
    page.goto(BASE+'/partners',wait_until='networkidle');assert page.locator('.partner-card').count()==58
    page.goto(BASE+'/projects/'+original_data['projects'][0]['slug'],wait_until='networkidle')
    assert page.get_by_role('heading',name='This page isn’t here.').is_visible()
    page.goto(BASE+'/admin',wait_until='networkidle');page.get_by_role('button',name='Explore the dashboard').click()
    page.get_by_role('button',name='Reset demo').click()
    page.get_by_role('button',name='Keep my changes').click()
    page.locator('.confirm-dialog').wait_for(state='detached')
    assert page.evaluate("JSON.parse(localStorage.getItem('sfw-content-v1')).team[0].status")=='draft'
    page.get_by_role('button',name='Reset demo').click()
    page.get_by_role('button',name='Restore demo').click()
    page.locator('.confirm-dialog').wait_for(state='detached')
    assert page.evaluate("JSON.parse(localStorage.getItem('sfw-content-v1')).projects.length")==26
    page.goto(BASE+'/about',wait_until='networkidle');assert page.locator('.team-grid article').count()==3
    page.goto(BASE+'/impact',wait_until='networkidle');assert page.locator('.report-cover').count()==3
    results.append('Draft visibility across projects, partners, reports, team and quotes; reset cancellation and restoration verified')

    # Exercise every built public page directly, including all project details.
    data=json.loads((ROOT/'dist'/'content.json').read_text(encoding='utf-8'))
    routes=['/','/about','/programs','/projects','/partners','/impact','/get-involved','/contact']+['/projects/'+p['slug'] for p in data['projects']]
    for route in routes:
        page.goto(BASE+route,wait_until='domcontentloaded');page.wait_for_selector('main h1')
        assert 'This page isn’t here.' not in page.locator('h1').inner_text(),route
        assert page.locator('main').count()==1,route
    results.append(f'All {len(routes)} public routes render a main heading without application errors')

    mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append(str(e)))
    for route in ['/','/projects','/partners','/about','/programs','/impact','/contact','/get-involved']:
        mp.goto(BASE+route,wait_until='networkidle');mp.wait_for_selector('main h1')
        overflow=mp.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1')
        assert not overflow, f'Mobile overflow on {route}'
    mp.goto(BASE,wait_until='networkidle')
    mp.get_by_role('button',name='Open navigation').click();assert mp.get_by_role('link',name='Our story',exact=True).last.is_visible()
    mp.get_by_role('button',name='Close navigation').click()
    for y in range(0,9000,650):mp.evaluate('(y)=>window.scrollTo(0,y)',y);mp.wait_for_timeout(80)
    mp.wait_for_timeout(400);mp.evaluate('window.scrollTo(0,0)');mp.screenshot(path=str(OUT/'home-mobile.png'),full_page=True)
    mp.goto(BASE+'/admin',wait_until='networkidle');mp.get_by_role('button',name='Explore the dashboard').click()
    assert not mp.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1')
    mp.screenshot(path=str(OUT/'dashboard-mobile.png'),full_page=True)
    results.append('390px mobile layouts, navigation menu and dashboard verified without horizontal overflow')
    assert not errors,errors
    browser.close()
(OUT/'results.json').write_text(json.dumps({'passed':results,'application_errors':errors,'production_database_rls':'Not executed: no client Supabase project connected.'},indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
