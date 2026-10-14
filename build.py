import pathlib
root = pathlib.Path(__file__).parent
src = root / 'src'
css = (src / 'styles.css').read_text()
js = '\n'.join((src / n).read_text() for n in ['core.js', 'ui.js', 'pages-a.js', 'dash.js', 'pages-b.js'])
page = f'''<title>Games Medya Partner Hub</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Geist+Mono:wght@400;500&family=Geist:wght@400;500;600;700&display=swap">
<style>
{css}
</style>
<div id="root"><div class="boot">Loading Partner Hub…</div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js"></script>
<script>
(function(){{
'use strict';
{js}
}})();
</script>
'''
out = root / 'partner-hub.html'
out.write_text(page)

# Hosted build (Cloudflare): a full HTML document with the hosted runtime and self-hosted vendor scripts.
pub = root / 'hosted' / 'public'
pub.mkdir(parents=True, exist_ok=True)
runtime = (root / 'hosted' / 'client' / 'runtime.js').read_text()
import datetime as _dt, os as _os
version = _os.environ.get('APP_VERSION') or _dt.datetime.now(_dt.timezone.utc).strftime('%Y%m%d.%H%M')
hosted = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="app-version" content="{version}">
<title>Games Medya Partner Hub</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%2338D6F0'/%3E%3Cstop offset='.55' stop-color='%237B6CFF'/%3E%3Cstop offset='1' stop-color='%23F0469C'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='8' fill='url(%23g)'/%3E%3Ctext x='16' y='21' font-family='Arial' font-weight='700' font-size='13' text-anchor='middle' fill='white'%3EGM%3C/text%3E%3C/svg%3E">
<meta name="theme-color" content="#090D1A">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Geist+Mono:wght@400;500&family=Geist:wght@400;500;600;700&display=swap">
<style>
:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}
body{{margin:0}} img{{max-width:100%}} [hidden]{{display:none!important}}
{css}
</style>
</head>
<body>
<div id="root"><div class="boot">Loading Partner Hub…</div></div>
<script src="/vendor/react.production.min.js"></script>
<script src="/vendor/react-dom.production.min.js"></script>
<script src="/vendor/htm.umd.js"></script>
<script>
{runtime}
</script>
<script>
(function(){{
'use strict';
{js}
}})();
</script>
</body>
</html>
'''
(pub / 'index.html').write_text(hosted)
(pub / 'login.html').write_text((root / 'hosted' / 'client' / 'login.html').read_text())
(pub / 'robots.txt').write_text('User-agent: *\nAllow: /api/health\nDisallow: /\n')
print(pub / 'index.html', len(hosted), 'version', version)
(root / 'app.check.js').write_text("(function(){'use strict';\n" + js + "\n})();\n")
print(out, len(page))
