import { S, getPCM } from '../state'
import { runFF } from '../ff'
import { startJob, showResult } from '../job'
import { h, fmtTime, baseName, blobOf, download, even } from '../util'

export function silenceTool(root: HTMLElement, chain: (f: File) => void) {
  root.innerHTML = `
  <p class="hint">Video ke chup wale hisse (dead air, "umm" ke beech ke gap) automatic kaat deta hai — jump-cut style. Pehle <b>Analyze</b>, phir sliders se adjust, phir <b>Export</b>.</p>
  <button class="btn gold" id="sc-an" type="button">🔍 Analyze audio</button>
  <div id="sc-job"></div>
  <div id="sc-ui" hidden>
    <canvas id="sc-wave" class="wave" height="110"></canvas>
    <div class="legend"><span class="lg keep"></span> rakhenge <span class="lg cut"></span> katega</div>
    <label class="slider">Kitna shaant = silence? <output id="o-th"></output><input type="range" id="sc-th" min="-60" max="-15" step="1" value="-38"></label>
    <label class="slider">Kam se kam gap (sec) <output id="o-min"></output><input type="range" id="sc-min" min="0.2" max="2" step="0.05" value="0.6"></label>
    <label class="slider">Padding — cut ke aas paas saans (sec) <output id="o-pad"></output><input type="range" id="sc-pad" min="0" max="0.5" step="0.01" value="0.12"></label>
    <div class="stat" id="sc-stat"></div>
    <details><summary>Cuts ki list</summary><ol id="sc-list" class="cutlist"></ol></details>
    <div class="row wrap">
      <label class="sel">Quality <select id="sc-q"><option value="orig">Original size</option><option value="720">720p (fast)</option></select></label>
      <button class="btn gold" id="sc-go" type="button">✂️ Export video</button>
      <button class="btn ghost" id="sc-txt" type="button">📝 Cut list (.txt)</button>
    </div>
    <div id="sc-job2"></div><div id="sc-res"></div>
  </div>`
  const q = (s: string) => root.querySelector(s) as any
  let rms: Float32Array | null = null
  const WIN = 0.02
  let keep: [number, number][] = []
  let cuts: [number, number][] = []

  function compute() {
    if (!rms) return
    const th = +q('#sc-th').value, min = +q('#sc-min').value, pad = +q('#sc-pad').value
    q('#o-th').textContent = th + ' dB'; q('#o-min').textContent = min.toFixed(2); q('#o-pad').textContent = pad.toFixed(2)
    const dur = rms.length * WIN
    cuts = []
    let st = -1
    for (let i = 0; i <= rms.length; i++) {
      const quiet = i < rms.length && rms[i] < th
      if (quiet && st < 0) st = i
      if (!quiet && st >= 0) {
        const a = st * WIN, b = i * WIN
        if (b - a >= min) {
          const ca = a <= 0.001 ? 0 : a + pad
          const cb = b >= dur - 0.001 ? dur : b - pad
          if (cb - ca > 0.05) cuts.push([ca, cb])
        }
        st = -1
      }
    }
    keep = []
    let t = 0
    for (const [a, b] of cuts) { if (a - t > 0.08) keep.push([t, a]); t = b }
    if (dur - t > 0.08) keep.push([t, dur])
    const removed = cuts.reduce((s, [a, b]) => s + b - a, 0)
    const final = keep.reduce((s, [a, b]) => s + b - a, 0)
    q('#sc-stat').innerHTML = cuts.length ? `<b>${cuts.length}</b> cuts · <b>${removed.toFixed(1)}s</b> hatega · final video <b>${fmtTime(final)}</b> (pehle ${fmtTime(dur)})` : 'Koi silence nahi mila — slider "Kitna shaant" thoda upar (right) karo.'
    q('#sc-list').innerHTML = cuts.slice(0, 200).map(([a, b]) => `<li>${fmtTime(a)} → ${fmtTime(b)} <small>(${(b - a).toFixed(2)}s)</small></li>`).join('') + (cuts.length > 200 ? `<li>…aur ${cuts.length - 200}</li>` : '')
    q('#sc-go').disabled = !cuts.length || !keep.length
    draw()
  }
  function draw() {
    const c = q('#sc-wave') as HTMLCanvasElement
    const W = c.clientWidth * devicePixelRatio || 600, H = c.height = 110 * devicePixelRatio
    c.width = W
    const g = c.getContext('2d')!
    g.fillStyle = '#0d0d12'; g.fillRect(0, 0, W, H)
    if (!rms) return
    const dur = rms.length * WIN
    g.fillStyle = 'rgba(255,70,70,.28)'
    for (const [a, b] of cuts) g.fillRect(a / dur * W, 0, Math.max(1, (b - a) / dur * W), H)
    const th = +q('#sc-th').value
    for (let x = 0; x < W; x++) {
      const i0 = Math.floor(x / W * rms.length), i1 = Math.max(i0 + 1, Math.floor((x + 1) / W * rms.length))
      let m = -100; for (let i = i0; i < i1; i++) if (rms[i] > m) m = rms[i]
      const v = Math.max(0, (m + 70) / 70)
      const t = x / W * dur
      const inCut = cuts.some(([a, b]) => t >= a && t <= b)
      g.fillStyle = inCut ? '#7a3a3a' : '#e3b65a'
      const bh = v * H * 0.9
      g.fillRect(x, (H - bh) / 2, 1, Math.max(1, bh))
    }
    const ty = H / 2 - Math.max(0, (th + 70) / 70) * H * 0.45
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(0, ty); g.lineTo(W, ty); g.moveTo(0, H - ty); g.lineTo(W, H - ty); g.stroke()
  }

  q('#sc-an').addEventListener('click', async () => {
    const job = startJob(q('#sc-job'), 'Audio analyze'); if (!job) return
    try {
      const pcm = await getPCM((f, t) => job.set(f, t))
      const n = Math.floor(WIN * 16000)
      rms = new Float32Array(Math.ceil(pcm.length / n))
      for (let i = 0; i < rms.length; i++) {
        let s = 0; const a = i * n, b = Math.min(pcm.length, a + n)
        for (let j = a; j < b; j++) s += pcm[j] * pcm[j]
        rms[i] = 10 * Math.log10(s / Math.max(1, b - a) + 1e-10)
      }
      job.done('Analyze ho gaya ✅ — ab sliders adjust karo')
      q('#sc-ui').hidden = false
      compute()
    } catch (e) { job.fail(e) }
  })
  for (const id of ['#sc-th', '#sc-min', '#sc-pad']) q(id).addEventListener('input', compute)
  addEventListener('resize', () => rms && draw())

  q('#sc-txt').addEventListener('click', () => {
    const lines = ['ClipKit silence cuts — ' + (S.file?.name || ''), '', 'KEEP segments:', ...keep.map(([a, b], i) => `${i + 1}. ${a.toFixed(2)} → ${b.toFixed(2)}`), '', 'CUT (silence):', ...cuts.map(([a, b], i) => `${i + 1}. ${a.toFixed(2)} → ${b.toFixed(2)} (${(b - a).toFixed(2)}s)`)]
    download(new Blob([lines.join('\n')], { type: 'text/plain' }), baseName(S.file!.name) + '-cuts.txt')
  })

  q('#sc-go').addEventListener('click', async () => {
    const m = S.meta!
    const res = q('#sc-res'); res.innerHTML = ''
    const job = startJob(q('#sc-job2'), 'Silence cut export'); if (!job) return
    try {
      const expr = keep.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+')
      const final = keep.reduce((s, [a, b]) => s + b - a, 0)
      let args: string[], out: string, type: string
      if (m.hasVideo) {
        const fps = m.fps || 30
        let vf = `fps=${fps},select='${expr}',setpts=N/FRAME_RATE/TB`
        if (q('#sc-q').value === '720' && Math.min(m.w, m.h) > 720) vf += m.w >= m.h ? `,scale=-2:720` : `,scale=720:-2`
        vf += ',format=yuv420p'
        out = 'out.mp4'; type = 'video/mp4'
        args = ['-vf', vf, '-af', `aselect='${expr}',asetpts=N/SR/TB`, '-c:v', 'libx264', '-preset', 'superfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]
      } else {
        out = 'out.m4a'; type = 'audio/mp4'
        args = ['-vn', '-af', `aselect='${expr}',asetpts=N/SR/TB`, '-c:a', 'aac', '-b:a', '160k', out]
      }
      const r = await runFF({ file: S.file!, args: () => args, outputs: [out], expectedDuration: final, onProgress: (f, t) => job.set(f, t) })
      job.done()
      const name = baseName(S.file!.name) + '-nosilence.' + (m.hasVideo ? 'mp4' : 'm4a')
      showResult(res, blobOf(r.files[out], type), name, { kind: m.hasVideo ? 'video' : 'audio', note: `${cuts.length} cuts · ${fmtTime(final)} final`, chain: true, onChain: chain })
    } catch (e) { job.fail(e) }
  })
  void even; void h
}
