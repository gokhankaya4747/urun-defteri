"""index.html üretir: python3 build.py"""
import re
src=lambda f: open('src/'+f,encoding='utf-8').read()
old=src('header_source.html')
hs=old.index('<header class="top">'); he=old.index('<script>')
header=old[hs:he].replace('<b>Parti Defteri</b>','<b>Ürün Defteri</b>').replace('<div id="sheetroot"></div>','<button class="fab" id="fab" type="button" aria-label="Yeni kayıt ekle"><svg width="26" height="26" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>\n<div id="sheetroot"></div>')
css=src('style_v2.css').replace('<style>','').replace('</style>','')+src('extra_v2.css')+src('auth.css')
logo='<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect x="2" y="8" width="30" height="18" rx="2" fill="none" stroke="var(--accent)" stroke-width="2.2"/><path d="M8 11v12M13 11v12M18 11v12M23 11v12M28 11v12" stroke="var(--accent)" stroke-width="1.6"/></svg>'
html=f'''<!doctype html>
<html lang="tr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Ürün Defteri</title>
<meta name="theme-color" content="#18201B">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Ürün Defteri">
<meta name="robots" content="noindex,nofollow">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap">
<style>
:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}
html,body{{margin:0}} img{{max-width:100%}} [hidden]{{display:none!important}}
{css}
</style>
</head><body>
<div class="authwrap" id="auth"><div class="authcard"><div class="mark">{logo}<b>Ürün Defteri</b></div><div id="authbox"><p class="muted">Yükleniyor…</p></div></div></div>
{header}<script src="supabase.js"></script>
<script src="config.js"></script>
<script src="runtime.js"></script>
<script src="app.js"></script>
</body></html>
'''
open('index.html','w',encoding='utf-8').write(html)
open('runtime.js','w',encoding='utf-8').write(src('runtime.js'))
open('app.js','w',encoding='utf-8').write(src('app.js'))
print('index.html', len(html))
