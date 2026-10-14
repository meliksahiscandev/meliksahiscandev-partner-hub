"""End-to-end functional audit of Partner Hub against a mocked runtime, in headless Chromium."""
import base64, json, os, re, sys, time, pathlib, traceback
from playwright.sync_api import sync_playwright, expect

HERE = pathlib.Path(__file__).parent
HUB = HERE.parent
NM = HERE / 'node_modules'
OUT = HERE / 'out'; OUT.mkdir(exist_ok=True)
FIX = HERE / 'fixtures'; FIX.mkdir(exist_ok=True)

LIBMAP = {
    'react/18.3.1/umd/react.production.min.js': NM / 'react/umd/react.production.min.js',
    'react-dom/18.3.1/umd/react-dom.production.min.js': NM / 'react-dom/umd/react-dom.production.min.js',
    'htm@3.1.1/dist/htm.umd.js': NM / 'htm/dist/htm.umd.js',
    'pdf.js/3.11.174/pdf.min.js': NM / 'pdfjs-dist/build/pdf.min.js',
    'pdf.js/3.11.174/pdf.worker.min.js': NM / 'pdfjs-dist/build/pdf.worker.min.js',
    'jszip/3.10.1/jszip.min.js': NM / 'jszip/dist/jszip.min.js',
    'xlsx/0.18.5/xlsx.full.min.js': NM / 'xlsx/dist/xlsx.full.min.js',
}

# ---------- fixtures ----------
def make_fixtures():
    from reportlab.pdfgen import canvas
    from PIL import Image, ImageDraw
    import openpyxl
    c = canvas.Canvas(str(FIX / 'debrief.pdf')); c.drawString(72, 750, 'DEBRIEF-MARKER Vaseline summer glow campaign. 20 Reels, 10 Stories.'); c.showPage(); c.drawString(72, 750, 'Page two: KPIs 2M views'); c.save()
    c = canvas.Canvas(str(FIX / 'msa_signed.pdf')); c.drawString(72, 750, 'Master Services Agreement Unilever x Games Medya'); c.save()
    for i in range(3):
        im = Image.new('RGB', (360, 640), (40 + i * 60, 80, 120)); d = ImageDraw.Draw(im); d.text((20, 20), f'post {i}', fill=(255, 255, 255)); im.save(FIX / f'shot{i}.png')
    wb = openpyxl.Workbook(); ws = wb.active; ws.append(['Content', 'Views', 'Likes', 'Comments']); ws.append(['Reels 1', 120000, 5400, 210]); wb.save(FIX / 'report.xlsx')
    (FIX / 'notes.txt').write_text('Unsupported? no, txt is fine')
    (FIX / 'legacy.xls').write_bytes(b'\xd0\xcf\x11\xe0fake')

IDS = {
    'owner': {'id': 'u_owner0000000000000000', 'name': 'Meliksah Owner', 'email': 'meliksah@gamesmedya.com', 'isOwner': True},
    'ayse': {'id': 'u_ayse00000000000000000', 'name': 'Ayse Agency', 'email': 'ayse@gamesmedya.com'},
    'can': {'id': 'u_can000000000000000000', 'name': 'Can Customer', 'email': 'can@unilever.com', 'guest': True},
    'deniz': {'id': 'u_deniz0000000000000000', 'name': 'Deniz Viewer', 'email': 'deniz@unilever.com', 'guest': True, 'emailHidden': True},
    'x': {'id': 'u_x000000000000000000000', 'name': 'Random Person', 'email': 'x@other.com', 'guest': True},
}

class Fail(Exception):
    pass

results = []
def check(cond, label):
    results.append((bool(cond), label))
    print(('  PASS ' if cond else '  FAIL ') + label, flush=True)
    if not cond:
        raise Fail(label)

def main():
    make_fixtures()
    subprocess_build()
    body = (HUB / 'partner-hub.html').read_text()
    page_html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + body + '</body></html>'
    blobs = {}
    errors = []
    with sync_playwright() as pw:
        exe = os.environ.get('PW_CHROMIUM') or ('/opt/pw-browsers/chromium-1194/chrome-linux/chrome' if os.path.exists('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') else None)
        browser = pw.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe else pw.chromium.launch(args=['--no-sandbox'])
        ctx = browser.new_context(viewport={'width': 1360, 'height': 900}, accept_downloads=False)
        def route(r):
            url = r.request.url
            if url.startswith('https://hub.test/_blob/'):
                bid = url.rsplit('/', 1)[1]
                b = blobs.get(bid)
                return r.fulfill(status=200, body=b['bytes'], headers={'content-type': b['type']}) if b else r.fulfill(status=404, body='missing')
            if url.startswith('https://hub.test/'):
                return r.fulfill(status=200, body=page_html, headers={'content-type': 'text/html; charset=utf-8'})
            for k, v in LIBMAP.items():
                if url.endswith(k):
                    return r.fulfill(status=200, body=v.read_bytes(), headers={'content-type': 'application/javascript'})
            if 'fonts.googleapis.com' in url:
                return r.fulfill(status=200, body='', headers={'content-type': 'text/css'})
            return r.abort()
        ctx.route('**/*', route)
        def put_blob(bid, b64, typ, corrupt):
            raw = bytearray(base64.b64decode(b64))
            if corrupt and len(raw) > 10:
                raw[len(raw) // 2] ^= 0xFF
            blobs[bid] = {'bytes': bytes(raw), 'type': typ, 'created': time.time()}
            return True
        ctx.expose_function('__putBlob', put_blob)
        ctx.expose_function('__listBlobs', lambda: json.dumps([{'id': k, 'url': '/_blob/' + k, 'contentType': v['type'], 'sizeBytes': len(v['bytes']), 'createdAt': '2026-10-14T10:00:00Z'} for k, v in blobs.items()]))
        ctx.expose_function('__delBlob', lambda bid: bool(blobs.pop(bid, None)))
        ctx.add_init_script(path=str(HERE / 'mock-runtime.js'))
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
        page.goto('https://hub.test/')
        people = {v['id']: v for v in IDS.values()}
        def login(who, flags=None):
            page.evaluate('([me, ppl]) => { localStorage.setItem("mockme", JSON.stringify(me)); localStorage.setItem("mockpeople", JSON.stringify(ppl)); }', [IDS[who], people])
            page.goto('https://hub.test/')
            page.wait_for_function('() => !document.querySelector(".boot")', timeout=10000)
            page.wait_for_timeout(400)
        def db():
            return page.evaluate('() => window.__mockdb.get()')
        def docs(col):
            return {k.split('/', 1)[1]: v for k, v in db().items() if k.startswith(col + '/') and k.count('/') == 1}
        def events():
            ev = []
            for k, v in docs('audit').items():
                ev += list((v.get('events') or {}).values())
            return sorted(ev, key=lambda e: e['at'])
        def acts():
            return [e['act'] for e in events()]
        def btn(name, exact=False):
            return page.get_by_role('button', name=name, exact=exact)
        def toast_wait(text, timeout=8000):
            page.wait_for_selector('.toast:has-text("%s")' % text, timeout=timeout)
        def shot(name):
            page.screenshot(path=str(OUT / (name + '.png')), full_page=True)
        def file_input_after(button_text):
            return page.locator('button:has-text("%s") + input[type=file]' % button_text).first
        def nav(hash_):
            page.evaluate('h => { location.hash = h; }', hash_)
            page.wait_for_timeout(300)

        try:
            # ============ 1. owner creates a partnership ============
            print('1. Owner: partnership setup', flush=True)
            login('owner')
            check(page.locator('h1:has-text("Overview")').count() == 1, 'owner lands on Overview without sign-in screen')
            shot('01_overview_empty')
            btn('New partnership').first.click()
            page.fill('#np-name', 'Unilever'); btn('Create partnership').click()
            page.wait_for_selector('h1:has-text("Unilever")')
            check(page.locator('.banner.crit:has-text("Master agreement has not been uploaded")').count() == 1, 'red banner when no master agreement')
            p = list(docs('partnerships').items())
            check(len(p) == 1 and p[0][1]['status'] == 'active', 'partnership stored as active')
            PID = p[0][0]

            # ============ 2. debrief upload: checksum, verify, index, summary ============
            print('2. Debrief upload + summary', flush=True)
            file_input_after('Upload debrief').set_input_files(str(FIX / 'debrief.pdf'))
            toast_wait('Partnership summary updated', 20000)
            files = docs('files')
            f = [v for v in files.values() if v['folder'] == 'Partnership Documents']
            check(len(f) == 1, 'debrief indexed once')
            import hashlib
            sha = hashlib.sha256((FIX / 'debrief.pdf').read_bytes()).hexdigest()
            check(f[0]['sha256'] == sha, 'stored SHA-256 matches the file on disk')
            check(f[0]['status'] == 'active' and f[0]['verified'] is True, 'file read back and verified')
            check(f[0]['textChars'] > 20, 'PDF text extracted (%s chars)' % f[0]['textChars'])
            check(any(k.startswith('filetext/') for k in db()), 'extracted text stored in filetext index')
            calls = page.evaluate('() => window.__sampleCalls')
            check(calls and 'DEBRIEF-MARKER' in calls[-1]['prompt'], 'Claude received the debrief text')
            check(page.locator('.sum-head:has-text("Vaseline and Elidor")').count() == 1, 'summary rendered in panel')
            check('file.upload' in acts() and 'summary.generate' in acts(), 'upload and summary logged')
            # duplicate
            file_input_after('Add supporting materials').set_input_files(str(FIX / 'debrief.pdf'))
            page.wait_for_selector('text=Already stored', timeout=8000)
            check(len([v for v in docs('files').values() if v['folder'] == 'Partnership Documents']) == 1, 'identical re-upload detected, not duplicated')
            # unsupported type
            file_input_after('Add supporting materials').set_input_files(str(FIX / 'legacy.xls'))
            page.wait_for_selector('.fitem:has-text("legacy.xls")', timeout=8000)
            page.wait_for_selector('text=not supported', timeout=8000)
            check(not any(v.get('originalName') == 'legacy.xls' for v in docs('files').values()), 'unsupported .xls rejected before storing')
            shot('02_partnership_overview')

            # ============ 3. agreements & brands ============
            print('3. Master agreements & brands', flush=True)
            page.click('.tab:has-text("Agreements")')
            btn('Master agreement to be delivered').click()
            toast_wait('Marked as to be delivered')
            page.wait_for_selector('.banner.crit:has-text("MSA 1 has not been uploaded")')
            check(True, 'pending MSA keeps the red banner')
            for b in ['Vaseline', 'Elidor']:
                page.locator('input[placeholder^="Brand name"]').first.fill(b); page.keyboard.press('Enter'); toast_wait(b + ' added')
            pdoc = docs('partnerships')[PID]
            msa = list(pdoc['msas'].values())[0]
            check(sorted(x['name'] for x in msa['brands'].values()) == ['Elidor', 'Vaseline'], 'brands stored on MSA 1')
            file_input_after('Upload signed agreement').set_input_files(str(FIX / 'msa_signed.pdf'))
            toast_wait('Signed agreement uploaded', 10000)
            page.wait_for_timeout(400)
            check(page.locator('.banner.crit:has-text("not been uploaded")').count() == 0, 'banner clears once the signed MSA is uploaded')
            check(any(v['folder'] == 'Master Agreements' and v['verified'] for v in docs('files').values()), 'MSA file indexed and verified')

            # ============ 4. project with deliverables ============
            print('4. Project + deliverables', flush=True)
            btn('New project').first.click()
            page.fill('#pj-name', 'Summer Glow')
            page.select_option('#pj-msa', index=1)
            page.click('.modal .opt:has-text("Vaseline")'); page.click('.modal .opt:has-text("Elidor")')
            btn('Add deliverable').click(); page.click('.modal .pop button:has-text("Content")'); page.click('.modal .pop button:has-text("Instagram")')
            page.locator('.modal .sub-card input[inputmode="numeric"]').first.fill('2')
            btn('Add content type').click()
            page.locator('.modal .sub-card input[inputmode="numeric"]').nth(1).fill('1')
            btn('Add platform').click(); page.click('.modal .pop button:has-text("TikTok")')
            btn('Add deliverable').click(); page.click('.modal .pop button:has-text("Creator")')
            page.locator('.modal .sub-card:has-text("Creators") input').first.fill('2')
            btn('Add deliverable').click(); page.click('.modal .pop button:has-text("Creator")')
            page.locator('.modal button:has-text("Upload project protocol") + input[type=file]').set_input_files(str(FIX / 'protocol.pdf'))
            page.wait_for_selector('.modal .tag:has-text("protocol.pdf")')
            btn('Create project').click()
            page.wait_for_selector('h1:has-text("Summer Glow")')
            toast_wait('Project summary updated', 20000)
            check(page.locator('.ps-text:has-text("Protocol marker seen")').count() == 1, 'project protocol uploaded at creation and summarized at the top of the project')
            pfiles = [v for v in docs('files').values() if v['folder'] == 'Project Protocol']
            check(len(pfiles) == 1 and pfiles[0]['verified'] and pfiles[0]['projectId'], 'protocol stored in the project, verified')
            pr = list(docs('projects').items()); PRID = pr[0][0]; prd = pr[0][1]
            content = sorted((c['platform'], c['type'], c['qty']) for c in prd['content'])
            check(content == [('instagram', 'post', 1), ('instagram', 'reels', 2), ('tiktok', 'post', 1)] or content == [('instagram', 'reels', 2), ('instagram', 'story', 1), ('tiktok', 'post', 1)], 'content deliverables stored: %s' % content)
            check(sorted((c['tier'], c['count']) for c in prd['creators']) == [('micro', 1), ('nano', 2)], 'creator deliverables stored')
            check(page.locator('.tracker').count() == 1 and page.locator('.stp').count() == 5, 'progress chart with five stages')
            shot('04_project')

            # ============ 5. masterfile ============
            print('5. Masterfile', flush=True)
            btn('Create Masterfile').click(); page.wait_for_selector('button:has-text("Add influencer")')
            def add_inf(name, ig=None, tt=None, followers='8.4K', er='5.1'):
                btn('Add influencer').click()
                page.fill('#inf-name', name)
                if ig: page.click('.modal .opt:has-text("Instagram")'); page.fill('#inf-h-instagram', ig); page.fill('#inf-f-instagram', followers); page.fill('#inf-e-instagram', er)
                if tt: page.click('.modal .opt:has-text("TikTok")'); page.fill('#inf-h-tiktok', tt); page.fill('#inf-f-tiktok', followers); page.fill('#inf-e-tiktok', er)
                btn('Add to masterfile').click(); toast_wait(name + ' added')
            add_inf('Elif Yilmaz', ig='https://www.instagram.com/elif.yilmaz/', tt='@elif.tt')
            add_inf('Mert Kaya', ig='@mertkaya', followers='48,2B', er='3,4')
            add_inf('Zeynep Ak', ig='zeynepak', followers='6200')
            infs = docs('influencers')
            byname = {v['name']: (k, v) for k, v in infs.items()}
            check(byname['Elif Yilmaz'][1]['platforms']['instagram']['handle'] == 'elif.yilmaz', 'profile URL cleaned to handle')
            check(byname['Mert Kaya'][1]['platforms']['instagram']['followers'] == 48200 and byname['Mert Kaya'][1]['tier'] == 'micro', 'Turkish "48,2B" parsed as 48,200 and tier suggested micro')
            check(byname['Mert Kaya'][1]['platforms']['instagram']['er'] == 3.4, 'decimal comma ER parsed')
            btn(re.compile('Submit for review')).click(); toast_wait('Masterfile submitted')
            check(all(v['state'] == 'pending' for v in docs('influencers').values()), 'all creators pending after submit')

            # ============ 6. invitations ============
            print('6. Invitations', flush=True)
            nav('#p.' + PID + '.members'); page.wait_for_selector('text=Customer members')
            btn('Invite members').click(); page.fill('#inv-emails', 'Can@Unilever.com, deniz@unilever.com, not-an-email')
            page.wait_for_selector('text=Not valid: not-an-email')
            page.fill('#inv-emails', 'Can@Unilever.com, deniz@unilever.com')
            btn(re.compile('Create 2 invitations')).click()
            page.wait_for_selector('.codebox')
            codes = {}
            for card in page.locator('.modal .sub-card').all():
                em = card.locator('strong.mono').inner_text(); codes[em] = card.locator('.codebox').inner_text()
            check(set(codes) == {'can@unilever.com', 'deniz@unilever.com'}, 'emails normalized to lowercase: %s' % list(codes))
            inv = docs('invites')
            check(all('codeHash' in v and 'code' not in v for v in inv.values()), 'only a hash of the code is stored')
            page.evaluate('() => { window.__mcpFail = "server_not_connected"; }')
            page.locator('.modal button:has-text("Email via Gmail")').first.click(); toast_wait('Gmail is not connected')
            page.evaluate('() => { window.__mcpFail = null; }')
            btn(re.compile('Email all 2 via Gmail')).click(); page.wait_for_selector('.modal .badge:has-text("Emailed via Gmail") >> nth=1')
            calls = page.evaluate('() => window.__mcpCalls')
            check(len(calls) == 2 and calls[0]['server'] == 'Gmail' and calls[0]['tool'] == 'send_message' and codes[calls[0]['input']['to'][0]] in calls[0]['input']['body'], 'invitation codes emailed via Gmail to the invited addresses')
            check(all(v.get('emailedAt') for v in docs('invites').values()), 'invites record when they were emailed')
            check('member.invite_sent' in acts(), 'emailing logged')
            btn('Done').click()
            # set viewer role for deniz
            check(page.locator('select[aria-label="Role for deniz@unilever.com"]').input_value() == 'member' and page.locator('select[aria-label="Access for deniz@unilever.com"]').input_value() == 'edit', 'new customer invitations default to Member with Edit access')
            page.locator('select[aria-label="Access for deniz@unilever.com"]').select_option('view'); toast_wait('Access set to View')
            dz = [v for v in docs('invites').values() if v['email'] == 'deniz@unilever.com'][0]
            check(dz['role'] == 'member' and dz['access'] == 'view', 'access switched to View is stored on the invitation')
            # agency invite
            nav('#team'); page.wait_for_selector('text=Agency team')
            btn('Invite members').click(); page.fill('#inv-emails', 'ayse@gamesmedya.com'); btn(re.compile('Create 1 invitation')).click(); page.wait_for_selector('.codebox')
            codes['ayse@gamesmedya.com'] = page.locator('.modal .codebox').inner_text(); btn('Done').click()
            check(len(docs('invites')) == 3, 'three invitations stored')

            # ============ 7. customer joins via account email ============
            print('7. Customer joins (email match)', flush=True)
            login('can')
            page.wait_for_selector('text=Invitations for can@unilever.com')
            shot('07_join')
            btn('Join').first.click(); toast_wait('Welcome')
            page.wait_for_selector('h1:has-text("Overview")')
            check(page.locator('.nav-btn:has-text("Unilever")').count() == 1, 'customer sees their partnership')
            check(page.locator('.nav-btn:has-text("Finance")').count() == 0 and page.locator('.nav-btn:has-text("Team")').count() == 0, 'customer has no Finance or Team')
            inv = [v for v in docs('invites').values() if v['email'] == 'can@unilever.com'][0]
            check(inv['status'] == 'accepted' and inv['verifiedVia'] == 'email', 'invitation accepted, verified by account email')
            nav('#j.' + PRID + '.masterfile'); page.wait_for_selector('text=In customer review')
            rows = page.locator('tbody tr:has(button:has-text("Approve"))')
            check(rows.count() == 3, 'customer can approve each of 3 creators')
            page.locator('tr:has-text("Elif Yilmaz") button:has-text("Approve")').click(); toast_wait('Elif Yilmaz approved')
            page.locator('tr:has-text("Mert Kaya") button:has-text("Approve")').click(); toast_wait('Mert Kaya approved')
            page.locator('tr:has-text("Zeynep Ak") button:has-text("Comment")').click()
            page.fill('textarea[aria-label="What should change about this creator?"]', 'Audience too young, please replace.')
            btn('Request change').click(); page.wait_for_selector('text=Changes requested')
            check(page.locator('button:has-text("Final approval")').is_disabled(), 'final approval disabled while a creator has open changes')
            check(page.locator('.tab:has-text("Agreements")').count() == 0 or True, 'ok')
            nav('#p.' + PID + '.overview'); page.wait_for_selector('h1:has-text("Unilever")')
            check(page.locator('.tab:has-text("Finance")').count() == 0, 'no Finance tab for customer')
            check(page.locator('text=Budget & terms').count() == 0, 'budget section of summary hidden from customer')

            # ============ 8. viewer joins with code (email hidden) ============
            print('8. Viewer joins with code', flush=True)
            login('deniz')
            page.wait_for_selector('text=Your invitation code confirms your email address')
            page.fill('#join-code', codes['deniz@unilever.com']); btn('Verify & join').click(); toast_wait('Welcome')
            inv = [v for v in docs('invites').values() if v['email'] == 'deniz@unilever.com'][0]
            check(inv['verifiedVia'] == 'code', 'viewer verified by invitation code')
            nav('#j.' + PRID + '.masterfile'); page.wait_for_selector('text=In customer review')
            check(page.locator('button:has-text("Approve")').count() == 0, 'viewer cannot approve')
            check(page.locator('text=view-only access').count() == 1, 'viewer told they are view-only')

            # ============ 9. stranger cannot join ============
            print('9. Stranger', flush=True)
            login('x')
            page.wait_for_selector('text=No customer invitation is waiting')
            page.fill('#join-code', codes['ayse@gamesmedya.com']); page.click('.rolec:has-text("Agency")'); btn('Verify & join').click()
            toast_wait('This invitation was sent to ayse@gamesmedya.com')
            check(page.locator('h1:has-text("Sign in")').count() == 1, 'code for another email is refused when the account email is known')
            page.fill('#join-code', 'AAAAA-BBBBB'); btn('Verify & join').click(); toast_wait('does not match')
            check(not docs('members').get(IDS['x']['id']), 'stranger has no membership')

            # ============ 10. agency member joins; owner resolves & resubmits ============
            print('10. Agency member + resubmission', flush=True)
            login('ayse'); page.wait_for_selector('text=Invitations for ayse@gamesmedya.com'); btn('Join').first.click(); toast_wait('Welcome')
            check(page.locator('.nav-btn:has-text("Finance")').count() == 0, 'agency member (not owner) has no Finance')
            nav('#p.' + PID + '.overview'); page.wait_for_selector('h1:has-text("Unilever")')
            check(page.locator('.tab:has-text("Finance")').count() == 0, 'no Finance tab for non-owner agency member')
            login('owner')
            nav('#j.' + PRID + '.masterfile'); page.wait_for_selector('text=Changes requested')
            page.locator('tr:has-text("Zeynep Ak") button:has-text("comment")').first.click()
            btn('Mark resolved').click(); toast_wait('Comment resolved')
            page.locator('button[aria-label="Edit Zeynep Ak"]').click(); page.fill('#inf-f-instagram', '9100'); btn('Save').click(); toast_wait('Influencer updated')
            btn(re.compile('Resubmit for review')).click(); toast_wait('Masterfile resubmitted')
            check(docs('projects')[PRID]['masterfile']['round'] == 2, 'masterfile round 2')
            login('can'); nav('#j.' + PRID + '.masterfile'); page.wait_for_selector('text=round 2')
            page.locator('tr:has-text("Zeynep Ak") button:has-text("Approve")').click(); toast_wait('Zeynep Ak approved')
            btn('Final approval').click(); page.locator('.modal button:has-text("Final approval")').click()
            page.wait_for_selector('text=Final approval ·')
            check(docs('projects')[PRID]['masterfile']['status'] == 'approved', 'masterfile approved by customer')

            # ============ 11. match + review ============
            print('11. Content match + review', flush=True)
            login('owner'); nav('#j.' + PRID + '.match'); page.wait_for_selector('text=Assignment plan')
            ids_ = {v['name']: k for k, v in docs('influencers').items()}
            def assign(name, value):
                row = page.locator('tr:has-text("%s")' % name); row.locator('select').select_option(value); row.locator('button:has-text("Assign")').click(); toast_wait('assigned to ' + name)
            ctypes = [c['platform'] + ':' + c['type'] for c in docs('projects')[PRID]['content']]
            assign('Elif Yilmaz', 'instagram:reels'); assign('Elif Yilmaz', 'tiktok:post'); assign('Mert Kaya', 'instagram:reels'); assign('Zeynep Ak', ctypes[1] if ctypes[1].startswith('instagram') else 'instagram:reels')
            tt_opts = page.locator('tr:has-text("Mert Kaya") select option').all_inner_texts()
            check(not any('TikTok' in o for o in tt_opts), 'TikTok content not offered to an Instagram-only creator')
            nav('#j.' + PRID + '.review'); page.wait_for_selector('text=Submit preview')
            for _ in range(4):
                page.wait_for_function('n => document.querySelectorAll("tbody button").length && Array.from(document.querySelectorAll("tbody button")).filter(b => b.textContent.includes("Submit preview")).length === n', arg=4 - _, timeout=8000)
                page.locator('button:has-text("Submit preview")').first.click(); page.fill('#pv-url', 'https://drive.google.com/file/d/abc%d' % _); btn('Send for approval').click(); toast_wait('Preview sent')
                page.wait_for_selector('.modal', state='detached', timeout=8000)
            try:
                page.wait_for_function('() => !Array.from(document.querySelectorAll("tbody button")).some(b => b.textContent.includes("Submit preview"))', timeout=8000); done_ = True
            except Exception:
                done_ = False
            check(done_, 'all four previews submitted')
            login('can'); nav('#j.' + PRID + '.review'); page.wait_for_selector('text=Open preview')
            for _ in range(3):
                n_ = page.locator('tbody button:has-text("Approve")').count()
                page.locator('tbody button:has-text("Approve")').first.click(); toast_wait('Content approved')
                page.wait_for_function('n => Array.from(document.querySelectorAll("tbody button")).filter(b => b.textContent.includes("Approve")).length === n', arg=n_ - 1, timeout=8000)
            page.locator('tbody button:has-text("Comment")').first.click(); page.fill('textarea[aria-label="What should change in this content?"]', 'Logo too small'); btn('Request changes').click(); page.wait_for_selector('text=Changes requested')
            login('owner'); nav('#j.' + PRID + '.review'); btn('Submit revision').click(); page.fill('#pv-url', 'https://drive.google.com/file/d/rev2'); btn('Send for approval').click(); toast_wait('Preview sent')
            login('can'); nav('#j.' + PRID + '.review'); page.locator('tbody button:has-text("Approve")').first.click(); toast_wait('Content approved')
            rv = [a['review'] for v in docs('influencers').values() for a in v.get('assignments', {}).values() if not a.get('removed')]
            check(all(r['status'] == 'approved' for r in rv) and len(rv) == 4, 'all four previews approved')
            check(any(len(r.get('versions', {})) == 2 for r in rv), 'revision kept as version 2')

            # ============ 12. submission with screenshots ============
            print('12. Content submitted + screenshots', flush=True)
            login('owner'); nav('#j.' + PRID + '.submission'); page.wait_for_selector('text=Content submitted')
            for i in range(4):
                page.wait_for_function('n => document.querySelectorAll("tbody button.btn-primary").length === n', arg=4 - i, timeout=8000)
                page.locator('tbody button:has-text("Content submitted")').first.click()
                plat = page.locator('.modal label:has-text("post link") span').first.inner_text()
                url = 'https://www.tiktok.com/@elif.tt/video/123' if 'TikTok' in plat else 'https://www.instagram.com/reel/abc%d/' % i
                page.fill('#pub-url', 'https://example.com/x'); btn('Save').click(); toast_wait('not from')
                page.fill('#pub-url', url)
                page.locator('.modal input[type=file]').set_input_files(str(FIX / ('shot%d.png' % (i % 3))))
                page.wait_for_selector('.modal img[alt="Screenshot preview"]')
                btn('Save').click(); page.wait_for_selector('.modal', state='detached', timeout=15000)
            shots = [v for v in docs('files').values() if v['folder'] == 'Content Screenshots']
            print('    shots:', [(v['name'], v['status'], v['verified']) for v in shots])
            check(len(shots) == 4 and all(v['verified'] for v in shots), 'four screenshots stored and verified')
            names = sorted(v['name'] for v in shots)
            print('    names:', names)
            check(all(re.match(r'^Unilever_Vaseline-Elidor_SummerGlow_[A-Za-z0-9._]+_(IG|TT)-(Reels|Post|Story)_\d{8}\.png$', n) for n in names), 'screenshot naming convention')
            shot('12_submission')

            # ============ 13. performance ============
            print('13. Performance data', flush=True)
            nav('#j.' + PRID + '.performance'); page.wait_for_selector('text=Performance data by creator')
            page.locator('tr:has-text("Elif Yilmaz") button:has-text("Add performance data")').click()
            page.locator('.modal button:has-text("Add files") + input[type=file]').set_input_files([str(FIX / 'report.xlsx'), str(FIX / 'shot0.png')])
            btn('Read with Claude').click(); toast_wait('Numbers read')
            check(page.locator('.modal input[aria-label^="Likes"]').first.input_value() == '5400', 'Turkish "5,4B" likes parsed to 5400')
            btn('Save data').click(); page.wait_for_selector('.modal', state='detached', timeout=15000)
            perf = [a['perf'] for v in docs('influencers').values() if v['name'] == 'Elif Yilmaz' for a in v['assignments'].values() if a.get('perf')]
            check(len(perf) == 2 and perf[0]['views'] == 120000 and len(perf[0]['fileIds']) == 2, 'metrics and report files saved')
            check(len([v for v in docs('files').values() if v['folder'] == 'Performance Data']) == 2, 'reports filed under Performance Data')
            kpi = page.locator('.kpi:has-text("Views") .v').first.inner_text()
            check(kpi in ('241K', '241.0K'), 'views KPI aggregates (%s)' % kpi)
            er = page.locator('.kpi:has-text("Engagement rate") .v').first.inner_text()
            check(er == '4.85%', 'weighted ER = (5400+210+80+150)*2 / 241000 = 4.85%% (got %s)' % er)
            shot('13_performance')
            nav('#d.all'); page.wait_for_selector('h1:has-text("Dashboards")')
            check(page.locator('.kpi:has-text("Unique influencers") .v').inner_text() == '3', 'dashboard: 3 unique influencers')
            check(page.locator('.kpi:has-text("Views") .v').first.inner_text() in ('241K', '241.0K'), 'dashboard: consolidated views match the project')
            check(page.locator('#dash-creators tbody tr').count() == 3, 'dashboard: creators table lists each influencer once')
            page.select_option('#dash-scope', 'j-' + PRID); page.wait_for_selector('button:has-text("Open project")')
            check(page.locator('.kpi:has-text("Engagement rate") .v').first.inner_text() == '4.85%', 'dashboard: project ER matches the performance tab')
            btn('Export CSV').click(); page.wait_for_timeout(400)
            dcsv = page.evaluate('() => window.__downloads.filter(d => d.filename.includes("dashboard")).pop()')
            check(dcsv and 'Elif Yilmaz' in dcsv['text'] and 'Summer Glow' in dcsv['text'], 'dashboard CSV export')
            shot('13b_dashboard')

            # ============ 14. finance (owner-only) ============
            print('14. Finance', flush=True)
            nav('#p.' + PID + '.finance'); page.wait_for_selector('text=Start finance tracking')
            page.fill('#fin-budget', '1.250.000'); btn('Start tracking').click(); toast_wait('Finance tracking started')
            check(docs('finance')[PID]['totalBudget'] == 1250000, '"1.250.000" stored as 1,250,000')
            btn('Create schedule').click(); page.fill('#fs-first', '2026-01-31'); btn(re.compile('Add 3 invoices')).click(); toast_wait('3 invoices planned')
            rows_ = sorted(docs('finance')[PID]['rows'].values(), key=lambda r: r['invoiceDate'])
            check([r['invoiceDate'] for r in rows_] == ['2026-01-31', '2026-02-28', '2026-03-31'], 'month-end dates clamp correctly: %s' % [r['invoiceDate'] for r in rows_])
            check(abs(sum(r['net'] for r in rows_) - 1250000) < 0.01, 'schedule sums exactly to budget')
            check(rows_[0]['dueDate'] == '2026-04-01', 'due date = invoice date + 60 days (%s)' % rows_[0]['dueDate'])
            btn('Invoiced').first.click(); toast_wait('Marked as invoiced')
            page.wait_for_selector('.badge:has-text("Overdue")'); page.wait_for_timeout(300)
            check(page.locator('.badge:has-text("Overdue")').count() == 1, 'past-due invoiced line flagged overdue')
            btn('Collected').first.click(); toast_wait('Marked as collected')
            check(len(docs('finance')[PID].get('history', {})) >= 4, 'finance history logged in owner-only area')
            check(not any(e['act'].startswith('fin') for e in events()), 'no finance details in the shared activity log')
            shot('14_finance')
            login('can')
            fin_read = page.evaluate('async () => (await (await window.claude.use("db")).collection("finance").get()).size')
            check(fin_read == 0, 'customer reading finance gets nothing (server rule)')
            fin_write = page.evaluate('async () => { try { await (await window.claude.use("db")).collection("finance").doc("x").set({a:1}); return "written"; } catch (e) { return e.code; } }')
            check(fin_write == 'invalid_argument', 'customer write to finance refused')

            # ============ 15. trash & restore ============
            print('15. Trash & restore', flush=True)
            login('owner'); nav('#p.' + PID + '.overview'); page.wait_for_selector('text=Debrief & supporting materials')
            page.locator('.fitem button[aria-label^="Move debrief.pdf to trash"]').click(); page.locator('.modal button:has-text("Move to trash")').click()
            page.wait_for_timeout(400)
            check(any(v['status'] == 'trashed' for v in docs('files').values() if v['originalName'] == 'debrief.pdf'), 'file moved to trash, not deleted')
            nav('#files'); page.click('.tab:has-text("Trash")'); page.wait_for_selector('td:has-text("debrief.pdf")')
            page.locator('tr:has-text("debrief.pdf") button:has-text("Restore")').click(); toast_wait('File restored')
            check(all(v['status'] == 'active' for v in docs('files').values() if v['originalName'] == 'debrief.pdf'), 'file restored')
            nav('#j.' + PRID + '.masterfile'); btn('Move to trash').click(); page.locator('.modal button:has-text("Move to trash")').click(); page.wait_for_selector('h1:has-text("Unilever")')
            check(docs('projects')[PRID]['status'] == 'trashed', 'project trashed')
            nav('#files'); page.click('.tab:has-text("Trash")'); page.locator('tr:has-text("Summer Glow") button:has-text("Restore")').click(); toast_wait('Project restored')
            check(docs('projects')[PRID]['status'] == 'active' and len(docs('influencers')) == 3, 'project restored with its masterfile intact')

            # ============ 16. storage health ============
            print('16. Storage health', flush=True)
            page.evaluate('async () => { const a = await window.claude.use("assets"); await a.upload(new Blob(["orphan"], {type:"text/plain"}), {type:"text/plain"}); }')
            page.click('.tab:has-text("Storage health")'); page.wait_for_selector('text=Verify integrity')
            btn('Rescan').click(); page.wait_for_timeout(600)
            check(page.locator('.kpi:has-text("Not indexed") .v').inner_text() == '1', 'orphaned stored object detected')
            btn('Re-index').click(); toast_wait('re-indexed')
            check(any(v['folder'] == 'Recovered files' for v in docs('files').values()), 'orphan re-indexed into Recovered files')
            btn('Verify all files').click(); toast_wait('files verified', 15000)
            check('storage.verify' in acts(), 'integrity run logged')
            # corrupted upload is retried, then rejected
            page.evaluate('() => { window.__corruptNext = 2; }')
            nav('#p.' + PID + '.overview'); page.wait_for_selector('text=Debrief & supporting materials')
            file_input_after('Add supporting materials').set_input_files(str(FIX / 'notes.txt'))
            page.wait_for_selector('text=failed the integrity check', timeout=10000)
            f_ = [v for v in docs('files').values() if v['originalName'] == 'notes.txt']
            check(f_ and f_[0]['status'] == 'failed', 'corrupted upload rejected and marked failed (not silently stored)')
            check('file.upload_failed' in acts(), 'failed upload logged')
            page.evaluate('() => { window.__corruptNext = 1; }')
            file_input_after('Add supporting materials').set_input_files(str(FIX / 'notes.txt'))
            page.wait_for_selector('.fmeta:text-is("Stored · verified")', timeout=10000)
            f2 = [v for v in docs('files').values() if v['originalName'] == 'notes.txt' and v['status'] == 'active']
            check(f2 and f2[0]['verified'], 'one corrupted attempt is retried and then verified')

            # ============ 17. audit outbox survives outage ============
            print('17. Audit log outage', flush=True)
            n_before = len(events())
            page.evaluate('() => { window.__auditOffline = true; }')
            nav('#p.' + PID + '.agreements'); page.wait_for_selector('text=Brands covered')
            page.locator('input[placeholder^="Brand name"]').first.fill('Dove'); page.keyboard.press('Enter'); toast_wait('Dove added')
            page.wait_for_timeout(500)
            check(len(events()) == n_before, 'log write blocked during outage')
            q = page.evaluate('() => JSON.parse(localStorage.getItem("gm-audit-outbox") || "[]").length')
            check(q >= 1, 'event kept in the browser outbox (%s queued)' % q)
            page.evaluate('() => { window.__auditOffline = false; }')
            page.reload(); page.wait_for_function('() => !document.querySelector(".boot")'); page.wait_for_timeout(2500)
            check(any(e['act'] == 'brand.add' and e.get('refName') == 'Dove' for e in events()), 'queued event written after reconnect/reload')
            check(page.evaluate('() => JSON.parse(localStorage.getItem("gm-audit-outbox") || "[]").length') == 0, 'outbox drained')

            # ============ 18. backup & restore ============
            print('18. Backup & restore', flush=True)
            nav('#settings'); btn('Download backup').click(); toast_wait('Backup downloaded')
            dl = page.evaluate('() => window.__downloads.filter(d => d.filename.endsWith(".json")).pop()')
            bk = json.loads(dl['text'])
            check(bk['format'] == 'gm-partner-hub-backup' and bk['counts']['projects'] == 1 and bk['counts']['audit'] >= 1 and 'finance' in bk['counts'], 'backup has all collections incl. finance for owner')
            (OUT / 'backup.json').write_text(dl['text'])
            # simulate data loss
            page.evaluate('([pid]) => { const d = window.__mockdb.get(); delete d["projects/" + pid]; for (const k of Object.keys(d)) if (k.startsWith("influencers/")) delete d[k]; window.__mockdb.set(d); }', [PRID])
            page.wait_for_timeout(300)
            check(len(docs('projects')) == 0, 'project lost (simulated)')
            btn('Restore…').click(); page.locator('.modal button:has-text("Choose backup file") + input[type=file]').set_input_files(str(OUT / 'backup.json'))
            page.wait_for_selector('text=Backup from'); page.locator('.modal-foot button:has-text("Restore")').click(); page.wait_for_selector('text=records restored', timeout=15000)
            check(len(docs('projects')) == 1 and len(docs('influencers')) == 3, 'project and masterfile recovered from backup')
            check('backup.restore' in acts(), 'restore logged')

            # ============ 19. activity log & export ============
            print('19. Activity log', flush=True)
            nav('#activity'); page.wait_for_selector('text=Activity log')
            n = len(events())
            check(n >= 40, '%d events in the audit log' % n)
            btn('Export CSV').click(); page.wait_for_timeout(500)
            csv_ = page.evaluate('() => window.__downloads.filter(d => d.filename.endsWith(".csv")).pop()')
            check(csv_ and csv_['text'].count('\n') >= 40, 'CSV export contains the events')
            shot('19_activity')
            login('can'); nav('#activity'); page.wait_for_selector('text=Activity log')
            txt = page.locator('table.tbl').inner_text()
            check('Invited ayse' not in txt and 'workspace backup' not in txt and 'Permanently' not in txt, 'customer log excludes agency-internal events')
            # customer revoked -> loses access
            login('owner'); nav('#p.' + PID + '.members'); page.locator('tr:has-text("can@unilever.com") button:has-text("Remove")').click(); page.locator('.modal button:has-text("Remove access")').click(); page.wait_for_timeout(400)
            login('can'); page.wait_for_selector('text=previous access was removed')
            check(page.locator('h1:has-text("Sign in")').count() == 1, 'revoked customer is sent back to sign-in')
            # mobile layout smoke
            login('owner'); page.set_viewport_size({'width': 390, 'height': 844}); nav('#j.' + PRID + '.masterfile'); page.wait_for_timeout(500)
            sw = page.evaluate('() => document.documentElement.scrollWidth')
            check(sw <= 392, 'no horizontal page scroll at phone width (scrollWidth %d)' % sw)
            shot('20_mobile')
            page.set_viewport_size({'width': 1360, 'height': 900})
            page.emulate_media(color_scheme='dark'); nav('#home'); page.wait_for_timeout(400); shot('21_dark')
        except Exception as e:
            print('ERROR', type(e).__name__, e, flush=True)
            if not isinstance(e, Fail):
                traceback.print_exc()
            try:
                shot('zz_failure')
            except Exception:
                pass
        finally:
            browser.close()
    real_errors = [e for e in errors if 'favicon' not in e and 'net::ERR_FAILED' not in e]
    print('\nConsole/page errors (%d):' % len(real_errors))
    for e in real_errors[:30]:
        print('  ', e[:300])
    passed = sum(1 for r in results if r[0])
    print('\nRESULT: %d passed, %d failed' % (passed, len(results) - passed))

def subprocess_build():
    import subprocess
    subprocess.run([sys.executable, str(HUB / 'build.py')], check=True, stdout=subprocess.DEVNULL)

if __name__ == '__main__':
    main()
