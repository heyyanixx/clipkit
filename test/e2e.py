
import sys, json, time, base64, subprocess, os
from playwright.sync_api import sync_playwright
BASE = sys.argv[1]; OUT = sys.argv[2]; VW = int(sys.argv[3]) if len(sys.argv) > 3 else 390; VH = int(sys.argv[4]) if len(sys.argv) > 4 else 844
ONLY = sys.argv[5].split(',') if len(sys.argv) > 5 else None
os.makedirs(OUT, exist_ok=True)
MEDIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'media', 'test-landscape.mp4')
res = {'base': BASE, 'viewport': [VW, VH], 'console_errors': [], 'page_errors': [], 'steps': {}}
def probe(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,width,height', '-of', 'json', p], capture_output=True, text=True)
    return json.loads(r.stdout)
def save(page, sel, name):
    href = page.get_attribute(sel, 'href')
    b64 = page.evaluate("async (u) => { const b = await (await fetch(u)).arrayBuffer(); let s=''; const a=new Uint8Array(b); for (let i=0;i<a.length;i+=32768) s+=String.fromCharCode.apply(null, a.subarray(i,i+32768)); return btoa(s) }", href)
    p = os.path.join(OUT, name); open(p, 'wb').write(base64.b64decode(b64)); return p
def shot(page, name, full=False):
    page.screenshot(path=os.path.join(OUT, name), full_page=full)
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    mobile = VW < 600
    ctx = br.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and res['console_errors'].append(m.text))
    page.on('pageerror', lambda e: res['page_errors'].append(str(e)))
    t0 = time.time(); page.goto(BASE, wait_until='load'); res['load_s'] = round(time.time() - t0, 2)
    res['title'] = page.title()
    shot(page, 'landing.png')
    page.set_input_files('#file', MEDIA)
    page.wait_for_function("document.querySelector('#finfo').textContent.includes('1280')", timeout=20000)
    shot(page, 'loaded.png')
    def step(name, fn):
        if ONLY and name not in ONLY: return
        t = time.time()
        try:
            out = fn(); res['steps'][name] = {'ok': True, 'secs': round(time.time() - t, 1), **(out or {})}
        except Exception as e:
            res['steps'][name] = {'ok': False, 'secs': round(time.time() - t, 1), 'error': str(e)[:600]}
            try: shot(page, f'fail-{name}.png', True)
            except Exception: pass
        print(name, json.dumps(res['steps'][name])[:400], flush=True)
    def open_tool(t):
        page.click(f'.tcard[data-t="{t}"]'); page.wait_for_timeout(300)
    def silence():
        open_tool('silence'); page.click('#sc-an')
        page.wait_for_selector('#sc-ui:not([hidden])', timeout=180000)
        stat = page.inner_text('#sc-stat'); shot(page, 'silence-analyzed.png')
        page.click('#sc-go'); page.wait_for_selector('#sc-res .result', timeout=300000)
        p = save(page, '#sc-res a[download]', 'silence-out.mp4'); pr = probe(p)
        page.locator('#sc-res .result').scroll_into_view_if_needed(); shot(page, 'silence-result.png')
        return {'stat': stat, 'out_duration': float(pr['format']['duration']), 'out_size': int(pr['format']['size'])}
    def captions():
        open_tool('captions'); page.select_option('#cp-lang', 'english')
        page.click('#cp-run'); page.wait_for_selector('#cp-ui:not([hidden])', timeout=600000)
        texts = page.eval_on_selector_all('#cp-list .cap .x', 'els => els.map(e => e.value)')
        shot(page, 'captions-list.png')
        with page.expect_download() as d: page.click('#cp-srt')
        srtp = os.path.join(OUT, 'captions.srt'); d.value.save_as(srtp)
        page.select_option('#cp-q', '720'); page.click('#cp-burn'); page.wait_for_selector('#cp-res .result', timeout=600000)
        p = save(page, '#cp-res a[download]', 'captions-burned.mp4'); pr = probe(p)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '2.2', '-i', p, '-frames:v', '1', os.path.join(OUT, 'captions-frame.png')])
        page.locator('#cp-res .result').scroll_into_view_if_needed(); shot(page, 'captions-result.png')
        return {'n': len(texts), 'transcript': ' | '.join(texts), 'srt_head': open(srtp).read()[:300], 'burn_streams': pr['streams'], 'burn_duration': float(pr['format']['duration'])}
    def reframe():
        open_tool('reframe'); page.wait_for_timeout(500); shot(page, 'reframe-ui.png')
        page.click('#rf-go'); page.wait_for_selector('#rf-res .result', timeout=300000)
        p = save(page, '#rf-res a[download]', 'reframe-916-crop.mp4'); pr1 = probe(p)
        page.click('#rf-ar button[data-v="1:1"]'); page.click('#rf-mode button[data-v="blur"]'); page.click('#rf-go')
        page.wait_for_function("document.querySelectorAll('#rf-res .result').length >= 1 && document.querySelector('#rf-res .result b').textContent.includes('1x1')", timeout=300000)
        p2 = save(page, '#rf-res a[download]', 'reframe-11-blur.mp4'); pr2 = probe(p2)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '3', '-i', p, '-frames:v', '1', os.path.join(OUT, 'reframe-916-frame.png')])
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '3', '-i', p2, '-frames:v', '1', os.path.join(OUT, 'reframe-11-frame.png')])
        return {'crop916': [s for s in pr1['streams'] if s['codec_type'] == 'video'][0], 'blur11': [s for s in pr2['streams'] if s['codec_type'] == 'video'][0]}
    def compress():
        open_tool('compress'); page.click('#cm-t button[data-v="c"]')
        page.fill('#cm-c', '2'); page.dispatch_event('#cm-c', 'input'); est = page.inner_text('#cm-est'); shot(page, 'compress-ui.png')
        page.click('#cm-go'); page.wait_for_selector('#cm-res .result', timeout=300000)
        p = save(page, '#cm-res a[download]', 'compress-2MB.mp4'); pr = probe(p)
        return {'estimate': est, 'job': page.inner_text('#cm-job .job-text'), 'out_size_bytes': int(pr['format']['size']), 'under_2MB': int(pr['format']['size']) <= 2 * 1048576}
    def thumb():
        open_tool('thumb'); page.click('#th-scan'); page.wait_for_selector('#th-ed:not([hidden])', timeout=120000)
        page.fill('#th-t1', 'SILENCE AUTO CUT'); page.fill('#th-t2', '1 TAP ME')
        page.wait_for_timeout(300); page.locator('#th-c').scroll_into_view_if_needed(); shot(page, 'thumb-ui.png')
        with page.expect_download() as d: page.click('#th-dl')
        tp = os.path.join(OUT, 'thumbnail.png'); d.value.save_as(tp)
        from PIL import Image; im = Image.open(tp)
        return {'png_size': im.size}
    def audio():
        open_tool('audio'); page.click('#au-go'); page.wait_for_selector('#au-res .result', timeout=300000)
        p = save(page, '#au-res a[download]', 'audio-normalized.mp3')
        r = subprocess.run(['ffmpeg', '-hide_banner', '-i', p, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], capture_output=True, text=True)
        I = [l for l in r.stderr.splitlines() if l.strip().startswith('I:')]
        pr = probe(p)
        return {'job': page.inner_text('#au-job .job-text'), 'measured_I': I[-1].strip() if I else None, 'codec': [s.get('codec_type') for s in pr['streams']], 'duration': float(pr['format']['duration'])}
    for n, f in [('silence', silence), ('compress', compress), ('reframe', reframe), ('thumb', thumb), ('audio', audio), ('captions', captions)]:
        step(n, f)
    shot(page, 'final-full.png', True)
    br.close()
json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=1)
print('CONSOLE_ERRORS', res['console_errors'], res['page_errors'])
