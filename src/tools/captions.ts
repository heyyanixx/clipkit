import { S, getPCM } from '../state'
import { runFF } from '../ff'
import { startJob, showResult } from '../job'
import { esc, srtTime, assTime, baseName, blobOf, download, fmtTime } from '../util'

interface Cap { start: number; end: number; text: string }
let asrWorker: Worker | null = null
let reqId = 0
const STYLES: Record<string, { name: string; primary: string; outline: string; back: string; border: number; outlineW: number; shadow: number }> = {
  yellow: { name: 'Shorts Yellow', primary: '&H0000E6FF', outline: '&H00000000', back: '&H80000000', border: 1, outlineW: 5, shadow: 2 },
  white: { name: 'White + outline', primary: '&H00FFFFFF', outline: '&H00000000', back: '&H80000000', border: 1, outlineW: 5, shadow: 2 },
  box: { name: 'White on black box', primary: '&H00FFFFFF', outline: '&H59000000', back: '&H59000000', border: 3, outlineW: 14, shadow: 0 },
  gold: { name: 'HEYYANIXX Gold', primary: '&H005AB6E3', outline: '&H00080606', back: '&H80000000', border: 1, outlineW: 6, shadow: 3 },
}
let fontCache: Record<string, Uint8Array> = {}
async function font(name: string) {
  if (!fontCache[name]) fontCache[name] = new Uint8Array(await (await fetch(new URL(`fonts/${name}`, document.baseURI))).arrayBuffer())
  return fontCache[name]
}

export function captionsTool(root: HTMLElement, chain: (f: File) => void) {
  root.innerHTML = `
  <p class="hint">Whisper AI tumhare phone/PC pe hi sunke captions banata hai (upload nahi). Phir edit karo → <b>.SRT</b> download ya video pe <b>burn-in</b>. <br><span class="warn-inline">Hindi/Hinglish accuracy rough hai — export se pehle text check kar lena. Pehli baar AI model download hota hai (Tiny ~45 MB, Base ~95 MB). Best on PC/Chrome.</span></p>
  <div class="row wrap">
    <label class="sel">Language <select id="cp-lang"><option value="">Auto detect</option><option value="english">English</option><option value="hindi">Hindi (Devanagari)</option></select></label>
    <label class="sel">AI model <select id="cp-model"><option value="onnx-community/whisper-tiny">Tiny — fast</option><option value="onnx-community/whisper-base">Base — better</option></select></label>
    <label class="sel">Words / caption <select id="cp-words"><option value="3">3 (Shorts style)</option><option value="5">5</option><option value="0">Poori line</option></select></label>
  </div>
  <p class="tiny">Hinglish tip: Roman script (jaise "kya haal hai") chahiye to Language = English try karo.</p>
  <button class="btn gold" id="cp-run" type="button">💬 Captions banao</button>
  <div id="cp-job"></div>
  <div id="cp-ui" hidden>
    <div class="row wrap between"><b id="cp-count"></b><span><button class="btn ghost sm" id="cp-add" type="button">+ Line</button></span></div>
    <div id="cp-list" class="caplist"></div>
    <div class="row wrap"><button class="btn ghost" id="cp-srt" type="button">⬇ .SRT</button><button class="btn ghost" id="cp-txtdl" type="button">⬇ Transcript .TXT</button></div>
    <h4>Burn-in (video pe text chipkao)</h4>
    <div class="row wrap">
      <label class="sel">Style <select id="cp-style">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></label>
      <label class="sel">Position <select id="cp-pos"><option value="safe">Neeche (Shorts safe zone)</option><option value="mid">Beech me</option><option value="top">Upar</option></select></label>
      <label class="sel">Quality <select id="cp-q"><option value="orig">Original</option><option value="720">720p (fast)</option></select></label>
    </div>
    <label class="slider">Text size <output id="o-fs"></output><input type="range" id="cp-fs" min="60" max="160" step="5" value="100"></label>
    <label class="check"><input type="checkbox" id="cp-up" checked> CAPITAL letters (English)</label>
    <div class="cap-preview" id="cp-prev"><span>Ye caption aisa dikhega</span></div>
    <button class="btn gold" id="cp-burn" type="button">🔥 Burn captions into video</button>
    <div id="cp-job2"></div><div id="cp-res"></div>
  </div>`
  const q = (s: string) => root.querySelector(s) as any
  let caps: Cap[] = []

  function render() {
    q('#cp-count').textContent = `${caps.length} captions`
    q('#cp-list').innerHTML = caps.map((c, i) => `<div class="cap" data-i="${i}">
      <input class="t" inputmode="decimal" value="${c.start.toFixed(2)}" aria-label="start"><input class="t" inputmode="decimal" value="${c.end.toFixed(2)}" aria-label="end">
      <input class="x" value="${esc(c.text)}" aria-label="text"><button class="del" type="button" aria-label="delete">✕</button></div>`).join('')
  }
  q('#cp-list').addEventListener('input', (e: Event) => {
    const t = e.target as HTMLInputElement; const row = t.closest('.cap') as HTMLElement; if (!row) return
    const c = caps[+row.dataset.i!]; const ins = row.querySelectorAll('input')
    c.start = parseFloat(ins[0].value) || 0; c.end = parseFloat(ins[1].value) || c.start + 1; c.text = ins[2].value
  })
  q('#cp-list').addEventListener('click', (e: Event) => {
    const b = (e.target as HTMLElement).closest('.del'); if (!b) return
    caps.splice(+(b.closest('.cap') as HTMLElement).dataset.i!, 1); render()
  })
  q('#cp-add').addEventListener('click', () => { const last = caps[caps.length - 1]; const s = last ? last.end : 0; caps.push({ start: s, end: s + 2, text: 'Naya caption' }); render() })

  function split(chunks: { text: string; timestamp: [number, number] }[], n: number): Cap[] {
    const out: Cap[] = []
    for (const c of chunks) {
      const [a, b] = c.timestamp
      const words = c.text.split(/\s+/).filter(Boolean)
      if (!n || words.length <= n) { out.push({ start: a, end: b, text: words.join(' ') }); continue }
      const groups: string[] = []
      for (let i = 0; i < words.length; i += n) groups.push(words.slice(i, i + n).join(' '))
      const total = groups.reduce((s, g) => s + g.length + 1, 0)
      let t = a
      for (const g of groups) { const d = (b - a) * (g.length + 1) / total; out.push({ start: t, end: t + d, text: g }); t += d }
    }
    return out.filter((c) => c.text && !/^\[.*\]$|^\(.*\)$/.test(c.text))
  }

  // Whisper's segment times are loose (often start at 0 during silence) — tighten each segment to where speech actually is.
  function snap(chunks: { text: string; timestamp: [number, number] }[], pcm: Float32Array) {
    const n = 320, nw = Math.floor(pcm.length / n)
    const db = new Float32Array(nw)
    for (let i = 0; i < nw; i++) { let s = 0; for (let j = i * n; j < (i + 1) * n; j++) s += pcm[j] * pcm[j]; db[i] = 10 * Math.log10(s / n + 1e-10) }
    const sorted = Array.from(db).sort((a, b) => a - b)
    const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -60
    const th = Math.max(-50, Math.min(-30, floor + 12))
    return chunks.map((c) => {
      let [a, b] = c.timestamp
      const i0 = Math.max(0, Math.floor(a / 0.02)), i1 = Math.min(nw - 1, Math.ceil(b / 0.02))
      let f = -1, l = -1
      for (let i = i0; i <= i1; i++) if (db[i] > th) { if (f < 0) f = i; l = i }
      if (f >= 0 && (l - f) * 0.02 > 0.2) { a = Math.max(a, f * 0.02 - 0.05); b = Math.min(b, l * 0.02 + 0.2) }
      return { text: c.text, timestamp: [a, b] as [number, number] }
    })
  }

  q('#cp-run').addEventListener('click', async () => {
    const job = startJob(q('#cp-job'), 'Auto captions', () => { asrWorker?.terminate(); asrWorker = null }); if (!job) return
    try {
      const pcm = await getPCM((f) => job.set(f * 0.1, 'Audio nikaal raha hoon…'))
      if (job.cancelled) return
      if (!asrWorker) asrWorker = new Worker(new URL('../asr.worker.ts', import.meta.url), { type: 'module' })
      const id = ++reqId
      const audio = pcm.slice()
      const chunks: any[] = await new Promise((resolve, reject) => {
        asrWorker!.onmessage = (e) => {
          const m = e.data; if (m.id !== id) return
          if (m.type === 'download') job.set(0.1 + (m.total ? m.loaded / m.total : 0) * 0.3, `AI model download… ${(m.loaded / 1048576).toFixed(0)} / ${(m.total / 1048576).toFixed(0)} MB (sirf pehli baar)`)
          else if (m.type === 'status') job.set(0.4, m.text)
          else if (m.type === 'progress') job.set(0.4 + m.frac * 0.6)
          else if (m.type === 'done') resolve(m.chunks)
          else if (m.type === 'error') reject(new Error('AI model: ' + m.error))
        }
        asrWorker!.onerror = (e) => reject(new Error('AI worker error: ' + (e.message || 'unknown')))
        asrWorker!.postMessage({ id, model: q('#cp-model').value, audio, language: q('#cp-lang').value || null }, [audio.buffer])
      })
      caps = split(snap(chunks, pcm), +q('#cp-words').value)
      job.done(caps.length ? `${caps.length} captions ready ✅ — neeche check/edit karo` : 'Koi bolne ki awaaz nahi mili 🤔')
      q('#cp-ui').hidden = false
      render(); preview()
    } catch (e) { job.fail(e) }
  })

  const srt = () => caps.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n')
  q('#cp-srt').addEventListener('click', () => download(new Blob([srt()], { type: 'application/x-subrip' }), baseName(S.file!.name) + '.srt'))
  q('#cp-txtdl').addEventListener('click', () => download(new Blob([caps.map((c) => c.text).join(' ')], { type: 'text/plain' }), baseName(S.file!.name) + '-transcript.txt'))

  function preview() {
    const st = STYLES[q('#cp-style').value]; const p = q('#cp-prev') as HTMLElement; const sp = p.querySelector('span') as HTMLElement
    const col = (a: string) => { const x = a.slice(4); return `#${x.slice(4, 6)}${x.slice(2, 4)}${x.slice(0, 2)}` }
    sp.textContent = caps[0]?.text || 'Ye caption aisa dikhega'
    if (q('#cp-up').checked && !/[\u0900-\u097F]/.test(sp.textContent!)) sp.textContent = sp.textContent!.toUpperCase()
    sp.style.color = col(st.primary)
    sp.style.background = st.border === 3 ? 'rgba(0,0,0,.65)' : 'transparent'
    sp.style.webkitTextStroke = st.border === 3 ? '0' : '1.5px #000'
    sp.style.fontSize = (20 * +q('#cp-fs').value / 100) + 'px'
    p.style.alignItems = { safe: 'flex-end', mid: 'center', top: 'flex-start' }[q('#cp-pos').value as string] as string
    q('#o-fs').textContent = q('#cp-fs').value + '%'
  }
  for (const id of ['#cp-style', '#cp-pos', '#cp-fs', '#cp-up']) q(id).addEventListener('input', preview)

  q('#cp-burn').addEventListener('click', async () => {
    const m = S.meta!
    if (!m.hasVideo || !m.w) { alert('Burn-in ke liye video file chahiye.'); return }
    const res = q('#cp-res'); res.innerHTML = ''
    const job = startJob(q('#cp-job2'), 'Captions burn-in'); if (!job) return
    try {
      let W = m.w, H = m.h, scale = ''
      if (q('#cp-q').value === '720' && Math.min(W, H) > 720) {
        if (W >= H) { W = Math.round(W * 720 / H / 2) * 2; H = 720 } else { H = Math.round(H * 720 / W / 2) * 2; W = 720 }
        scale = `scale=${W}:${H},`
      }
      const st = STYLES[q('#cp-style').value]
      const vertical = H > W
      const base = Math.min(W, H)
      const fs = Math.round(base * (vertical ? 0.08 : 0.09) * +q('#cp-fs').value / 100)
      const pos = q('#cp-pos').value
      const align = pos === 'top' ? 8 : pos === 'mid' ? 5 : 2
      const mv = pos === 'safe' ? Math.round(H * (vertical ? 0.26 : 0.08)) : pos === 'top' ? Math.round(H * (vertical ? 0.14 : 0.06)) : 0
      const ml = Math.round(W * 0.07), mr = Math.round(W * (vertical ? 0.15 : 0.07))
      const up = q('#cp-up').checked
      const lines = caps.filter((c) => c.text.trim() && c.end > c.start).map((c) => {
        let t = c.text.replace(/[{}]/g, '').replace(/\n/g, '\\N')
        const dev = /[\u0900-\u097F]/.test(t)
        if (up && !dev) t = t.toUpperCase()
        return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${dev ? '{\\fnNoto Sans Devanagari}' : ''}${t}`
      })
      const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Poppins ExtraBold,${fs},${st.primary},&H000000FF,${st.outline},${st.back},0,0,0,0,100,100,0,0,${st.border},${Math.max(2, Math.round(st.outlineW * fs / 80))},${st.shadow},${align},${ml},${mr},${mv},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${lines.join('\n')}\n`
      job.set(0.01, 'Fonts load ho rahe…')
      const extra = [{ name: '/fonts/Poppins-ExtraBold.ttf', data: await font('Poppins-ExtraBold.ttf') }, { name: '/subs.ass', data: ass }]
      if (lines.some((l) => l.includes('Devanagari'))) extra.push({ name: '/fonts/NotoSansDevanagari.ttf', data: await font('NotoSansDevanagari.ttf') })
      const r = await runFF({ file: S.file!, extraFiles: extra, expectedDuration: m.dur, onProgress: (f, t) => job.set(f, t),
        args: () => ['-vf', `${scale}ass=/subs.ass:fontsdir=/fonts,format=yuv420p`, '-c:v', 'libx264', '-preset', 'superfast', '-crf', '22', '-c:a', 'copy', '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] })
      job.done()
      showResult(res, blobOf(r.files['out.mp4'], 'video/mp4'), baseName(S.file!.name) + '-captions.mp4', { kind: 'video', note: `${lines.length} captions · ${fmtTime(m.dur)}`, chain: true, onChain: chain })
    } catch (e) { job.fail(e) }
  })
}
