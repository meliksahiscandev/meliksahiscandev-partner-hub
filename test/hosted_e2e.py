"""End-to-end test of the hosted Partner Hub (Cloudflare Worker + Durable Object) running locally under `wrangler dev`.
Two real accounts in two browser sessions: the agency owner and the Unilever customer. Providers (Claude, Apify,
screenshots, email) run in stub mode. Usage: python3 test/hosted_e2e.py [base_url]"""
import json, os, re, sys, time, pathlib, traceback, hashlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
NM = HERE / 'node_modules'
OUT = HERE / 'out-hosted'; OUT.mkdir(exist_ok=True)
FIX = HERE / 'fixtures'
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8787'
AG = ('owner@test.local', 'owner-pass-123')
CU = ('buyer@unilever.test', 'buyer-pass-123')
LIBMAP = {
    'pdf.js/3.11.174/pdf.min.js': NM / 'pdfjs-dist/build/pdf.min.js',
    'pdf.js/3.11.174/pdf.worker.min.js': NM / 'pdfjs-dist/build/pdf.worker.min.js',
    'jszip/3.10.1/jszip.min.js': NM / 'jszip/dist/jszip.min.js',
    'xlsx/0.18.5/xlsx.full.min.js': NM / 'xlsx/dist/xlsx.full.min.js',
}
results = []
class Fail(Exception):
    pass
def check(cond, label):
    results.append((bool(cond), label))
    print(('  PASS ' if cond else '  FAIL ') + label, flush=True)
    if not cond:
        raise Fail(label)

def make_fixtures():
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (900, 1400), (245, 240, 230)); d = ImageDraw.Draw(im); d.text((40, 40), 'Moodboard: glow, summer, beach', fill=(20, 20, 20)); im.save(FIX / 'moodboard.png')

def main():
    make_fixtures()
    errors = []
    with sync_playwright() as pw:
        exe = os.environ.get('PW_CHROMIUM') or ('/opt/pw-browsers/chromium-1194/chrome-linux/chrome' if os.path.exists('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') else None)
        browser = pw.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe else pw.chromium.launch(args=['--no-sandbox'])
        def new_ctx(tag):
            ctx = browser.new_context(viewport={'width': 1360, 'height': 900}, accept_downloads=True)
            def route(r):
                url = r.request.url
                for k, v in LIBMAP.items():
                    if url.endswith(k):
                        return r.fulfill(status=200, body=v.read_bytes(), headers={'content-type': 'application/javascript', 'access-control-allow-origin': '*'})
                if 'fonts.googleapis.com' in url or 'fonts.gstatic.com' in url:
                    return r.fulfill(status=200, body='', headers={'content-type': 'text/css'})
                if url.startswith(BASE):
                    return r.continue_()
                return r.abort()
            ctx.route('**/*', route)
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(tag + ' pageerror: ' + str(e)))
            page.on('console', lambda m: errors.append(tag + ' console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
            return ctx, page
        A_ctx, A = new_ctx('agency')
        B_ctx, B = new_ctx('customer')

        def btn(page, name, exact=False):
            return page.get_by_role('button', name=name, exact=exact)
        def toast(page, text, timeout=10000):
            page.wait_for_selector('.toast:has-text("%s")' % text, timeout=timeout)
        def shot(page, name):
            page.screenshot(path=str(OUT / (name + '.png')), full_page=True)
        def fin(page, label):
            return page.locator('button:has-text("%s") + input[type=file]' % label).first
        def nav(page, h):
            page.evaluate('h => { location.hash = h; }', h); page.wait_for_timeout(350)
        def api(page, path, body=None):
            return page.evaluate('async ([p, b]) => { const r = await fetch(p, b ? { method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(b) } : {}); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; }', [path, body])
        def state(page):
            r = api(page, '/api/db/sync?since=0')['body']
            out = {}
            for d in r['docs']:
                col, _, did = d['path'].partition('/')
                out.setdefault(col, {})[did] = d['data']
            return out
        def login(page, who):
            page.goto(BASE + '/')
            page.wait_for_url(re.compile(r'/login'), timeout=10000)
            page.fill('#in-email', who[0]); page.fill('#in-pw', who[1])
            page.click('#in button[type=submit]')
            page.wait_for_function('() => location.pathname === "/" && !document.querySelector(".boot")', timeout=15000)
            page.wait_for_timeout(700)

        try:
            print('1. Sign-in page and accounts', flush=True)
            A.goto(BASE + '/')
            A.wait_for_url(re.compile(r'/login'), timeout=10000)
            check(A.locator('h2:has-text("Sign in")').count() == 1, 'signed-out visitor is sent to the sign-in page')
            A.fill('#in-email', AG[0]); A.fill('#in-pw', 'wrong-password'); A.click('#in button[type=submit]')
            A.wait_for_selector('#m:has-text("not correct")')
            check(True, 'wrong password refused with a clear message')
            hdr = A.evaluate('async () => (await fetch("/")).headers.get("content-security-policy")')
            check(hdr and "frame-ancestors 'none'" in hdr, 'HTML served with a content security policy')
            login(A, AG)
            check(A.locator('h1:has-text("Overview")').count() == 1, 'agency owner lands on Overview')
            check(A.locator('.nav-btn:has-text("Unilever")').count() == 1, 'seeded Unilever partnership is listed')
            check(A.locator('.nav-btn:has-text("Finance")').count() == 1, 'owner sees Finance')
            st = state(A)
            PID = [k for k, v in st['partnerships'].items() if v['name'] == 'Unilever'][0]
            shot(A, 'h01_overview')

            print('2. Uploads: checksum, verify, text + image reading', flush=True)
            nav(A, '#p.' + PID + '.overview'); A.wait_for_selector('h1:has-text("Unilever")')
            fin(A, 'Upload debrief').set_input_files(str(FIX / 'debrief.pdf'))
            toast(A, 'Partnership summary updated', 30000)
            st = state(A)
            f = [v for v in st['files'].values() if v['folder'] == 'Partnership Documents']
            sha = hashlib.sha256((FIX / 'debrief.pdf').read_bytes()).hexdigest()
            check(len(f) == 1 and f[0]['sha256'] == sha and f[0]['verified'] is True and f[0]['status'] == 'active', 'debrief stored on the server, SHA-256 matches, read back and verified')
            blob = A.evaluate('async id => { const r = await fetch("/_blob/" + id); const b = new Uint8Array(await r.arrayBuffer()); const h = await crypto.subtle.digest("SHA-256", b); return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, "0")).join(""); }', f[0]['assetId'])
            check(blob == sha, 'stored bytes on the server hash to the same SHA-256')
            ft = api(A, '/api/db/doc?path=filetext/' + [k for k, v in st['files'].items() if v['folder'] == 'Partnership Documents'][0])['body']
            check(ft['exists'] and 'DEBRIEF-MARKER' in ft['data']['text'], 'PDF text extracted and indexed on the server')
            fin(A, 'Add supporting materials').set_input_files(str(FIX / 'moodboard.png'))
            A.wait_for_selector('.fitem:has-text("moodboard.png") .fmeta:has-text("verified")', timeout=15000)
            A.locator('button:has-text("Regenerate"), button:has-text("Update summary"), button:has-text("Summarize")').first.click()
            A.wait_for_function('() => document.body.innerText.includes("Images read: 1")', timeout=30000)
            check(True, 'image document sent to Claude for reading (vision) together with the PDF text')
            check(A.locator('text=Text marker: seen').count() >= 1, 'Claude received the extracted debrief text')
            shot(A, 'h02_partnership')

            print('3. Agreements, brands, project', flush=True)
            A.click('.tab:has-text("Agreements")')
            btn(A, 'Master agreement to be delivered').click(); toast(A, 'Marked as to be delivered')
            for b in ['Vaseline', 'Elidor']:
                A.locator('input[placeholder^="Brand name"]').first.fill(b); A.keyboard.press('Enter'); toast(A, b + ' added')
            fin(A, 'Upload signed agreement').set_input_files(str(FIX / 'msa_signed.pdf')); toast(A, 'Signed agreement uploaded', 15000)
            A.wait_for_timeout(500)
            check(A.locator('.banner.crit:has-text("not been uploaded")').count() == 0, 'red banner gone after the signed MSA upload')
            btn(A, 'New project').first.click()
            A.fill('#pj-name', 'Summer Glow'); A.select_option('#pj-msa', index=1)
            A.click('.modal .opt:has-text("Vaseline")'); A.click('.modal .opt:has-text("Elidor")')
            btn(A, 'Add deliverable').click(); A.click('.modal .pop button:has-text("Content")'); A.click('.modal .pop button:has-text("Instagram")')
            A.locator('.modal .sub-card input[inputmode="numeric"]').first.fill('3')
            btn(A, 'Add platform').click(); A.click('.modal .pop button:has-text("TikTok")')
            btn(A, 'Add deliverable').click(); A.click('.modal .pop button:has-text("Creator")')
            A.locator('.modal .sub-card:has-text("Creators") input').first.fill('2')
            A.locator('.modal button:has-text("Upload project protocol") + input[type=file]').set_input_files(str(FIX / 'protocol.pdf'))
            btn(A, 'Create project').click(); A.wait_for_selector('h1:has-text("Summer Glow")')
            toast(A, 'Project summary updated', 30000)
            check(A.locator('.ps-text:has-text("Protocol marker: seen")').count() == 1, 'project protocol uploaded at creation, read and summarized at the top of the project')
            st = state(A); PRID = [k for k, v in st['projects'].items() if v['name'] == 'Summer Glow'][0]

            print('4. Masterfile with Apify lookup and manual ER override', flush=True)
            btn(A, 'Create Masterfile').click(); A.wait_for_selector('button:has-text("Add influencer")')
            btn(A, 'Add influencer').click()
            A.fill('#inf-name', 'Elif Yilmaz'); A.click('.modal .opt:has-text("Instagram")'); A.fill('#inf-h-instagram', 'https://www.instagram.com/elif.yilmaz/')
            A.click('#inf-fetch-instagram'); toast(A, 'Instagram: 48.2K followers')
            check(A.input_value('#inf-f-instagram') == '48200' and A.input_value('#inf-e-instagram') == '4.37', 'Fetch fills followers 48200 and ER 4.37 from Apify')
            check(A.locator('.modal .mini-tag:has-text("auto")').count() == 2, 'both values marked as fetched automatically')
            A.fill('#inf-e-instagram', '5.1')
            check(A.locator('.modal .mini-tag:has-text("manual")').count() == 1, 'ER typed by hand is marked manual')
            check(A.locator('.modal button:has-text("Use fetched values")').count() == 1, 'fetched value still offered next to the manual one')
            btn(A, 'Add to masterfile').click(); toast(A, 'Elif Yilmaz added')
            btn(A, 'Add influencer').click()
            A.fill('#inf-name', 'Mert Kaya'); A.click('.modal .opt:has-text("Instagram")'); A.fill('#inf-h-instagram', '@mertkaya'); A.click('.modal .opt:has-text("TikTok")'); A.fill('#inf-h-tiktok', 'mert.tt')
            A.click('#inf-fetch-instagram'); toast(A, 'Instagram: 48.2K'); A.click('#inf-fetch-tiktok'); toast(A, 'TikTok: 23.4K')
            btn(A, 'Add to masterfile').click(); toast(A, 'Mert Kaya added')
            st = state(A)
            elif_ = [v for v in st['influencers'].values() if v['name'] == 'Elif Yilmaz'][0]['platforms']['instagram']
            check(elif_['er'] == 5.1 and elif_['erSource'] == 'manual' and elif_['fetched']['er'] == 4.37 and elif_['followers'] == 48200 and elif_['fSource'] == 'apify', 'stored: manual ER 5.1, fetched ER 4.37 kept for reference, followers from Apify')
            A.wait_for_selector('tr:has-text("Elif Yilmaz") .mini-tag:has-text("manual")')
            check(True, 'masterfile shows the manual ER marker to the agency')
            A.click('#mf-refresh'); toast(A, 'Stats updated for 3 profiles')
            st = state(A)
            elif_ = [v for v in st['influencers'].values() if v['name'] == 'Elif Yilmaz'][0]['platforms']['instagram']
            check(elif_['er'] == 5.1, 'refreshing stats keeps the manual ER')
            btn(A, re.compile('Submit for review')).click(); toast(A, 'Masterfile submitted')
            shot(A, 'h04_masterfile')

            print('5. Unilever in a second session', flush=True)
            login(B, CU)
            check(B.locator('.nav-btn:has-text("Unilever")').count() == 1 and B.locator('.nav-btn:has-text("Finance")').count() == 0 and B.locator('.nav-btn:has-text("Team")').count() == 0, 'customer sees Unilever, no Finance or Team')
            bst = state(B)
            check(set(bst.keys()) <= {'settings', 'partnerships', 'projects', 'influencers', 'files', 'invites', 'members', 'audit'}, 'customer receives only their collections: %s' % sorted(bst.keys()))
            binf = [v for v in bst['influencers'].values() if v['name'] == 'Elif Yilmaz'][0]['platforms']['instagram']
            check(binf['er'] == 5.1 and 'fetched' not in binf and 'erSource' not in binf, 'customer sees ER 5.1 without the agency-internal source or fetched value')
            check(all(not (v.get('summary') or {}).get('data', {}).get('budget') for v in bst['partnerships'].values()), 'budget line of the summary is hidden from the customer')
            r = api(B, '/api/db/op', {'op': 'set', 'path': 'finance/' + PID, 'data': {'totalBudget': 1}})
            check(r['status'] == 403, 'customer write to finance refused by the server (%s)' % r['status'])
            r = api(B, '/api/db/op', {'op': 'update', 'path': 'projects/' + PRID, 'data': {'name': 'Hacked'}})
            check(r['status'] == 403, 'customer cannot rename a project')
            iid = [k for k, v in bst['influencers'].items() if v['name'] == 'Mert Kaya'][0]
            r = api(B, '/api/db/op', {'op': 'update', 'path': 'influencers/' + iid, 'data': {'platforms': {'instagram': {'followers': 1}}}})
            check(r['status'] == 403, 'customer cannot change creator numbers')
            r = api(B, '/api/assets', None)
            check(r['status'] == 403, 'customer cannot list storage')
            nav(B, '#j.' + PRID + '.masterfile'); B.wait_for_selector('text=In customer review')
            check(B.locator('.ps-text').count() == 1 and B.locator('button:has-text("Upload project protocol"), button:has-text("Add protocol files")').count() == 0, 'customer reads the project summary but cannot change the protocol')
            check(B.locator('.mini-tag').count() == 0, 'no source markers in the customer view')
            B.locator('tr:has-text("Elif Yilmaz") button:has-text("Approve")').click(); toast(B, 'Elif Yilmaz approved')
            B.locator('tr:has-text("Mert Kaya") button:has-text("Comment")').click()
            B.fill('textarea[aria-label="What should change about this creator?"]', 'Please add a second TikTok creator instead.')
            btn(B, 'Request change').click(); B.wait_for_selector('text=Changes requested')
            shot(B, 'h05_customer_masterfile')
            nav(A, '#j.' + PRID + '.masterfile')
            A.wait_for_selector('tr:has-text("Mert Kaya") .badge:has-text("Changes requested")', timeout=10000)
            check(True, 'agency sees the customer decision live, without reloading')

            print('6. Resolve, resubmit, final approval', flush=True)
            A.locator('tr:has-text("Mert Kaya") button:has-text("comment")').first.click()
            btn(A, 'Mark resolved').click(); toast(A, 'Comment resolved')
            btn(A, re.compile('Resubmit for review')).click(); toast(A, 'Masterfile resubmitted')
            B.wait_for_selector('text=round 2', timeout=10000)
            B.locator('tr:has-text("Mert Kaya") button:has-text("Approve")').click(); toast(B, 'Mert Kaya approved')
            btn(B, 'Final approval').click(); B.locator('.modal button:has-text("Final approval")').click()
            B.wait_for_selector('text=Final approval ·', timeout=10000)
            check(state(A)['projects'][PRID]['masterfile']['status'] == 'approved', 'final approval stored on the server')

            print('7. Assignment with quantities, visible to the customer', flush=True)
            nav(A, '#j.' + PRID + '.match'); A.wait_for_selector('text=Assignment plan')
            row = A.locator('tr:has-text("Elif Yilmaz")'); row.locator('select').select_option('instagram:reels'); row.locator('input[type=number]').fill('2'); row.locator('button:has-text("Assign")').click(); toast(A, '2× Instagram Reels assigned to Elif Yilmaz')
            row = A.locator('tr:has-text("Mert Kaya")'); row.locator('select').select_option('tiktok:post'); row.locator('button:has-text("Assign")').click(); toast(A, '1× TikTok Post assigned to Mert Kaya')
            nav(B, '#j.' + PRID + '.match'); B.wait_for_selector('text=Assignment plan')
            txt = B.locator('.card:has-text("Assignment plan")').inner_text()
            check('Elif Yilmaz' in txt and 'Mert Kaya' in txt and 'Assigned / target' in txt, 'customer sees who got how many of which content')
            check(B.locator('button:has-text("Assign")').count() == 0, 'customer cannot assign')
            shot(B, 'h07_customer_plan')

            print('8. Preview review, submission with automatic screenshot', flush=True)
            nav(A, '#j.' + PRID + '.review'); A.wait_for_selector('text=Submit preview')
            for i in range(3):
                A.wait_for_function('n => Array.from(document.querySelectorAll("tbody button")).filter(b => b.textContent.includes("Submit preview")).length === n', arg=3 - i, timeout=10000)
                A.locator('button:has-text("Submit preview")').first.click(); A.fill('#pv-url', 'https://drive.google.com/file/d/x%d' % i); btn(A, 'Send for approval').click(); toast(A, 'Preview sent')
                A.wait_for_selector('.modal', state='detached', timeout=10000)
            nav(B, '#j.' + PRID + '.review'); B.wait_for_selector('text=Open preview')
            B.wait_for_function('() => Array.from(document.querySelectorAll("tbody button")).filter(b => b.textContent.includes("Approve")).length === 3', timeout=10000)
            for k in range(3):
                B.locator('tbody button:has-text("Approve")').first.click(); toast(B, 'Content approved')
                B.wait_for_function('n => Array.from(document.querySelectorAll("tbody button")).filter(b => b.textContent.includes("Approve")).length === n', arg=2 - k, timeout=10000)
            nav(A, '#j.' + PRID + '.submission'); A.wait_for_selector('button:has-text("Content submitted")')
            A.locator('tr:has-text("Elif Yilmaz") button:has-text("Content submitted")').first.click()
            A.fill('#pub-url', 'https://www.instagram.com/reel/abc1/')
            A.click('#pub-capture'); toast(A, 'Screenshot captured', 20000)
            A.wait_for_selector('.modal img[alt="Screenshot preview"]')
            btn(A, 'Save').click(); A.wait_for_selector('.modal', state='detached', timeout=20000)
            st = state(A)
            shots = [v for v in st['files'].values() if v['folder'] == 'Content Screenshots']
            check(len(shots) == 1 and shots[0]['verified'] and re.match(r'^Unilever_Vaseline-Elidor_SummerGlow_elif\.yilmaz_IG-Reels_\d{8}\.png$', shots[0]['name']), 'captured screenshot stored, verified and named %s' % (shots[0]['name'] if shots else None))
            A.locator('tr:has-text("Mert Kaya") button:has-text("Content submitted")').first.click()
            A.fill('#pub-url', 'https://www.tiktok.com/@mert.tt/video/123')
            A.locator('.modal input[type=file]').set_input_files(str(FIX / 'shot1.png')); A.wait_for_selector('.modal img[alt="Screenshot preview"]')
            btn(A, 'Save').click(); A.wait_for_selector('.modal', state='detached', timeout=20000)
            B.wait_for_timeout(800); nav(B, '#j.' + PRID + '.submission'); B.wait_for_selector('img.thumb')
            ok = B.evaluate('async () => { const i = document.querySelector("img.thumb"); const r = await fetch(i.src); return r.status; }')
            check(ok == 200, 'customer can open the screenshot of their own content')

            print('9. Performance: public metrics and report reading', flush=True)
            nav(A, '#j.' + PRID + '.performance'); A.wait_for_selector('text=Performance data by creator')
            btn(A, 'Refresh public metrics').click(); toast(A, 'Public metrics updated for 2 pieces')
            st = state(A)
            perf = [a.get('perf') for v in st['influencers'].values() for a in (v.get('assignments') or {}).values() if a.get('perf')]
            check(len(perf) == 2 and all(p['views'] == 88000 for p in perf) and all('public' in p['source'] for p in perf), 'views/likes read from the live posts and saved')
            A.locator('tr:has-text("Elif Yilmaz") button:has-text("Update data")').click()
            A.locator('.modal button:has-text("Add files") + input[type=file]').set_input_files([str(FIX / 'report.xlsx'), str(FIX / 'shot0.png')])
            btn(A, 'Read with Claude').click(); toast(A, 'Numbers read', 20000)
            btn(A, 'Save data').click(); A.wait_for_selector('.modal', state='detached', timeout=20000)
            st = state(A)
            check(len([v for v in st['files'].values() if v['folder'] == 'Performance Data']) == 2, 'report files filed under Performance Data')
            nav(B, '#j.' + PRID + '.performance'); B.wait_for_selector('.kpi:has-text("Views")')
            check(B.locator('button:has-text("Refresh public metrics")').count() == 0, 'customer sees results but cannot refresh')
            shot(B, 'h09_customer_performance')
            nav(A, '#d.all'); A.wait_for_selector('h1:has-text("Dashboards")')
            check(A.locator('.kpi:has-text("Unique influencers") .v').inner_text() == '2', 'dashboard: 2 unique influencers')
            check(A.locator('.kpi:has-text("Views") .v').first.inner_text() not in ('—', '0'), 'dashboard: views consolidated (%s)' % A.locator('.kpi:has-text("Views") .v').first.inner_text())
            nav(B, '#dashboards'); B.wait_for_selector('h1:has-text("Dashboards")')
            check(B.locator('.kpi:has-text("Unique influencers") .v').inner_text() == '2', 'customer sees the same dashboard for their projects')
            check(B.locator('.mini-tag').count() == 0, 'no agency-internal markers on the customer dashboard')
            shot(A, 'h09b_dashboard')

            print('10. Finance is owner-only on the server', flush=True)
            nav(A, '#p.' + PID + '.finance'); A.wait_for_selector('text=Start finance tracking')
            A.fill('#fin-budget', '1.250.000'); btn(A, 'Start tracking').click(); toast(A, 'Finance tracking started')
            check(state(A)['finance'][PID]['totalBudget'] == 1250000, 'finance saved for the owner')
            check('finance' not in state(B), 'customer sync contains no finance')
            r = api(B, '/api/db/doc?path=finance/' + PID)['body']
            check(r['exists'] is False, 'direct read of finance by the customer returns nothing')

            print('11. Invitation by email, account creation with the code', flush=True)
            nav(A, '#p.' + PID + '.members'); A.wait_for_selector('text=Customer members')
            btn(A, 'Invite members').click(); A.fill('#inv-emails', 'Ayse@Unilever.test'); btn(A, re.compile('Create 1 invitation')).click()
            A.wait_for_selector('.codebox'); code = A.locator('.modal .codebox').inner_text()
            inv_text = A.locator('.modal pre.inv').inner_text()
            check('/login?code=' in inv_text and code in inv_text, 'invitation text carries the sign-up link with the code')
            A.locator('.modal button:has-text("Send email")').click(); A.wait_for_selector('.modal .badge:has-text("Emailed")')
            check(any(v.get('emailedAt') for v in state(A)['invites'].values() if v['email'] == 'ayse@unilever.test'), 'invitation emailed and recorded')
            btn(A, 'Done').click()
            C_ctx, C = new_ctx('invitee')
            C.goto(BASE + '/login?code=' + code + '&email=ayse%40unilever.test')
            check(C.input_value('#up-code') == code and C.input_value('#up-email') == 'ayse@unilever.test', 'sign-up form pre-filled from the invitation link')
            C.fill('#up-name', 'Ayse Unilever'); C.fill('#up-pw', 'short'); C.click('#up button[type=submit]'); C.wait_for_selector('#m:has-text("at least 10")')
            C.fill('#up-pw', 'ayse-pass-12345'); C.fill('#up-code', 'AAAAA-BBBBB'); C.click('#up button[type=submit]'); C.wait_for_selector('#m:has-text("does not match")')
            C.fill('#up-code', code); C.click('#up button[type=submit]')
            C.wait_for_function('() => location.pathname === "/" && !document.querySelector(".boot")', timeout=15000); C.wait_for_timeout(800)
            check(C.locator('.nav-btn:has-text("Unilever")').count() == 1, 'invitee created an account with the code and landed in Unilever')
            inv = [v for v in state(A)['invites'].values() if v['email'] == 'ayse@unilever.test'][0]
            check(inv['status'] == 'accepted' and inv['verifiedVia'] == 'code', 'invitation accepted, verified by code')
            C.goto(BASE + '/login?code=' + code + '&email=ayse%40unilever.test')
            C.fill('#up-name', 'X'); C.fill('#up-pw', 'another-pass-123'); C.click('#up button[type=submit]'); C.wait_for_selector('#m:has-text("already exists")')
            check(True, 'the same code cannot create a second account')

            print('12. Removing access takes effect immediately', flush=True)
            A.locator('tr:has-text("ayse@unilever.test") button:has-text("Remove")').click(); A.locator('.modal button:has-text("Remove access")').click(); A.wait_for_timeout(800)
            C.goto(BASE + '/'); C.wait_for_function('() => !document.querySelector(".boot")'); C.wait_for_timeout(800)
            check(C.locator('text=previous access was removed').count() == 1 or C.locator('h1:has-text("Join a workspace")').count() == 1, 'removed member lands on the join screen')
            check('projects' not in state(C), 'removed member receives no project data')

            print('13. Password change, sign out, activity', flush=True)
            B.click('button[aria-label="Change password"]'); B.fill('#pw-cur', CU[1]); B.fill('#pw-next', 'buyer-pass-456'); B.fill('#pw-again', 'buyer-pass-456'); btn(B, 'Change password', exact=True).last.click(); toast(B, 'Password changed')
            B.click('button[aria-label="Sign out"]'); B.wait_for_url(re.compile(r'/login'))
            B.fill('#in-email', CU[0]); B.fill('#in-pw', CU[1]); B.click('#in button[type=submit]'); B.wait_for_selector('#m:has-text("not correct")')
            login(B, (CU[0], 'buyer-pass-456'))
            check(B.locator('.nav-btn:has-text("Unilever")').count() == 1, 'customer signs in with the new password')
            nav(A, '#activity'); A.wait_for_selector('text=Activity log')
            ev = []
            for d in state(A)['audit'].values():
                ev += list((d.get('events') or {}).values())
            acts = [e['act'] for e in ev]
            for a in ['auth.login', 'file.upload', 'summary.generate', 'masterfile.submit', 'influencer.approve', 'masterfile.final_approve', 'assignment.add', 'preview.approve', 'content.submitted', 'perf.public_refresh', 'member.invite_sent', 'member.join', 'auth.password']:
                check(a in acts, 'activity log has ' + a)
            cust_ev = [e for e in ev if e['act'] == 'influencer.approve']
            check(all(e['by'] != '' and e.get('role') == 'customer' for e in cust_ev), 'customer approvals are attributed to the customer by the server')
            nav(B, '#activity'); B.wait_for_selector('text=Activity log')
            t = B.locator('table.tbl').inner_text()
            check('Signed in' not in t and 'Refreshed followers' not in t, 'customer log excludes agency-internal events')
            print('14. Delete partnership', flush=True)
            nav(A, '#partnerships'); btn(A, 'New partnership').first.click(); A.fill('#np-name', 'Temp Brand'); btn(A, 'Create partnership').click(); A.wait_for_selector('h1:has-text("Temp Brand")')
            A.click('#p-delete'); A.wait_for_selector('.modal:has-text("Delete Temp Brand")')
            A.click('.del-opt:has-text("Delete permanently")')
            check(A.locator('#del-confirm').is_disabled(), 'permanent delete stays disabled until the name is typed')
            A.fill('#del-type', 'Temp Brand'); A.click('#del-confirm'); toast(A, 'Temp Brand deleted permanently')
            st = state(A)
            check(any(v['name'] == 'Temp Brand' and v['status'] == 'purged' for v in st['partnerships'].values()), 'partnership deleted permanently (tombstone kept)')
            check(A.locator('.nav-btn:has-text("Temp Brand")').count() == 0, 'deleted partnership gone from the navigation')
            nav(A, '#partnerships'); A.locator('button[aria-label="Delete Unilever"]').click(); A.wait_for_selector('.modal:has-text("Delete Unilever")')
            A.click('#del-confirm'); toast(A, 'Unilever moved to trash')
            B.wait_for_timeout(1500); B.reload(); B.wait_for_function('() => !document.querySelector(".boot")'); B.wait_for_timeout(800)
            check(B.locator('.nav-btn:has-text("Unilever")').count() == 0, 'customer loses access while the partnership is in the trash')
            nav(A, '#files'); A.click('.tab:has-text("Trash")'); A.locator('tr:has-text("Unilever") button:has-text("Restore")').click(); toast(A, 'Partnership restored')
            B.wait_for_timeout(1500); B.reload(); B.wait_for_function('() => !document.querySelector(".boot")'); B.wait_for_timeout(800)
            check(B.locator('.nav-btn:has-text("Unilever")').count() == 1, 'customer access returns after restore')
            print('15. Masterfile import and Fetch all', flush=True)
            nav(A, '#p.' + PID + '.projects'); A.wait_for_selector('h1:has-text("Unilever")')
            btn(A, 'New project').first.click(); A.fill('#pj-name', 'Import Test'); A.select_option('#pj-msa', index=1); A.click('.modal .opt:has-text("Vaseline")')
            btn(A, 'Add deliverable').click(); A.click('.modal .pop button:has-text("Creator")')
            btn(A, 'Create project').click(); A.wait_for_selector('h1:has-text("Import Test")')
            btn(A, 'Create Masterfile').click(); A.wait_for_selector('#mf-import')
            A.click('#mf-import'); A.wait_for_selector('.modal:has-text("Import influencers")')
            A.locator('.modal button:has-text("Choose Excel or CSV") + input[type=file]').set_input_files(str(FIX / 'creators.xlsx'))
            A.wait_for_selector('#imp-table')
            check(A.locator('#imp-table .badge:has-text("Ready")').count() == 3, 'import preview: 3 rows ready')
            check(A.locator('#imp-table .badge:has-text("Listed twice")').count() == 1 and A.locator('#imp-table .badge:has-text("No Instagram or TikTok")').count() == 1, 'import preview flags the duplicate and the row without a platform')
            A.click('#imp-run'); toast(A, '3 creators added to the masterfile', 20000)
            toast(A, 'Stats updated for 4 profiles', 30000)
            st = state(A)
            imp = {v['name']: v for v in st['influencers'].values() if v.get('importedFrom') == 'creators.xlsx' and not v.get('removed')}
            check(sorted(imp) == ['Ada Kaya', 'Bora Tan', 'cem.tt'], 'imported creators: %s' % sorted(imp))
            ada = imp['Ada Kaya']['platforms']['instagram']
            check(ada['followers'] == 12500 and ada['er'] == 4.2 and ada['fetched']['followers'] == 48200, 'numbers from the file (Turkish 12,5B) kept; fetched values stored next to them')
            check(imp['Bora Tan']['tier'] == 'nano' and imp['Bora Tan']['platforms']['tiktok']['followers'] == 23400, 'type from the file kept; missing numbers fetched')
            check(imp['cem.tt']['tier'] == 'micro' and imp['cem.tt']['platforms']['tiktok']['handle'] == 'cem.tt', 'name from handle; type set from fetched followers')
            check(any(v['folder'] == 'Masterfile Imports' and v['verified'] for v in st['files'].values()), 'imported file stored and verified in Masterfile Imports')
            A.click('#mf-refresh'); toast(A, 'Stats updated for 4 profiles', 30000)
            check(True, 'Fetch all runs through every creator in the masterfile')
            shot(A, 'h15_import')
            h = api(A, '/api/health')['body']
            check(h['ok'] and h['errors24h'] == 0 and h['storage']['files'] >= 6, 'health endpoint: no server errors, %s files stored' % h['storage']['files'])
            A.set_viewport_size({'width': 390, 'height': 844})
            wide = []
            for h in ['#j.' + PRID + '.masterfile', '#j.' + PRID + '.match', '#j.' + PRID + '.performance', '#p.' + PID + '.overview', '#partnerships', '#dashboards', '#home', '#activity', '#files', '#team', '#finance', '#settings']:
                nav(A, h); A.wait_for_timeout(400); w_ = A.evaluate('() => document.documentElement.scrollWidth')
                if w_ > 392: wide.append((h, w_))
            check(not wide, 'no horizontal scroll at phone width on any page %s' % wide)
            shot(A, 'h13_mobile')
        except Exception as e:
            print('ERROR', type(e).__name__, e, flush=True)
            if not isinstance(e, Fail):
                traceback.print_exc()
            for nm, pg in (('A', A), ('B', B)):
                try: shot(pg, 'zz_failure_' + nm)
                except Exception: pass
        finally:
            browser.close()
    real = [e for e in errors if 'favicon' not in e and 'net::ERR_FAILED' not in e and 'status of 401' not in e and 'status of 403' not in e and 'status of 400' not in e and 'status of 409' not in e]
    print('\nConsole/page errors (%d):' % len(real))
    for e in real[:30]:
        print('  ', e[:300])
    passed = sum(1 for r in results if r[0])
    print('\nRESULT: %d passed, %d failed' % (passed, len(results) - passed))
    sys.exit(0 if passed == len(results) and not real else 1)

if __name__ == '__main__':
    main()
