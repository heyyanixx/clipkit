import { S } from '../state'
import { startJob } from '../job'
import { baseName, download, fmtTime } from '../util'

function seek(v: HTMLVideoElement, t: number) {
  return new Promise<void>((res) => {
    const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); res() }
    const to = setTimeout(done, 4000)
    v.addEventListener('seeked', done); v.currentTime = t
  })
}

export function thumbTool(root: HTMLElement) {
  root.innerHTML = `
  <p class="hint">Video se sabse <b>sharp</b> (blur-free) frames dhundh ke deta hai. Ek chuno → bada text lagao → <b>1280×720 PNG</b> (YouTube thumbnail size).</p>
  <div class="row wrap"><label class="sel">Kitne frames scan kare <select id="th-n"><option>16</option><option selected>24</option><option>40</option></select></label>
  <button class="btn gold" id="th-scan" type="button">🔎 Best frames dhundho</button></div>
  <div id="th-job"></div>
  <div id="th-grid" class="thgrid"></div>
  <div id="th-ed" hidden>
    <canvas id="th-c" class="th-canvas" width="1280" height="720"></canvas>
    <label class="txt">Line 1 (white) <input id="th-t1" value="YE TRICK" maxlength="40"></label>
    <label class="txt">Line 2 (gold) <input id="th-t2" value="KOI NAHI BATATA" maxlength="40"></label>
    <div class="row wrap">
      <label class="sel">Text side <select id="th-side"><option value="l">Left</option><option value="c">Center</option><option value="r">Right</option></select></label>
      <label class="sel">Text upar/neeche <select id="th-v"><option value="b">Neeche</option><option value="t">Upar</option><option value="m">Beech</option></select></label>
    </div>
    <label class="slider">Text size <output id="o-ts"></output><input type="range" id="th-ts" min="60" max="160" value="100"></label>
    <label class="slider">Frame position (vertical video ke liye) <output id="o-fp"></output><input type="range" id="th-fp" min="0" max="100" value="50"></label>
    <label class="check"><input type="checkbox" id="th-dark" checked> Dark gradient (text clear dikhe)</label>
    <label class="check"><input type="checkbox" id="th-pop" checked> Saturation/contrast boost</label>
    <button class="btn gold" id="th-dl" type="button">⬇ PNG download (1280×720)</button>
  </div>`
  const q = (s: string) => root.querySelector(s) as any
  let frames: { t: number; score: number; img: HTMLCanvasElement }[] = []
  let sel: HTMLCanvasElement | null = null

  q('#th-scan').addEventListener('click', async () => {
    if (!S.meta?.previewOk) { alert('Ye video format browser me nahi chal raha — pehle Compress tool se MP4 bana lo, phir thumbnail.'); return }
    const job = startJob(q('#th-job'), 'Frames scan'); if (!job) return
    try {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = S.url
      await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('Video load nahi hua')) })
      const N = +q('#th-n').value, dur = v.duration
      frames = []
      const sw = 160, sh = Math.round(160 * v.videoHeight / v.videoWidth)
      const small = document.createElement('canvas'); small.width = sw; small.height = sh
      const sg = small.getContext('2d', { willReadFrequently: true })!
      for (let i = 0; i < N; i++) {
        if (job.cancelled) return
        const t = dur * (0.03 + 0.94 * i / Math.max(1, N - 1))
        await seek(v, t)
        sg.drawImage(v, 0, 0, sw, sh)
        const d = sg.getImageData(0, 0, sw, sh).data
        const g = new Float32Array(sw * sh); let bright = 0
        for (let k = 0; k < sw * sh; k++) { g[k] = d[k * 4] * 0.299 + d[k * 4 + 1] * 0.587 + d[k * 4 + 2] * 0.114; bright += g[k] }
        bright /= sw * sh
        let s = 0, s2 = 0, n = 0
        for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) { const k = y * sw + x; const l = 4 * g[k] - g[k - 1] - g[k + 1] - g[k - sw] - g[k + sw]; s += l; s2 += l * l; n++ }
        const lapVar = s2 / n - (s / n) ** 2
        const penalty = bright < 30 || bright > 235 ? 0.3 : 1
        const full = document.createElement('canvas'); const fw = Math.min(1280, v.videoWidth); full.width = fw; full.height = Math.round(fw * v.videoHeight / v.videoWidth)
        full.getContext('2d')!.drawImage(v, 0, 0, full.width, full.height)
        frames.push({ t, score: lapVar * penalty, img: full })
        job.set((i + 1) / N, `Frame ${i + 1}/${N} check…`)
      }
      frames.sort((a, b) => b.score - a.score)
      const top = frames.slice(0, 8)
      job.done(`Top ${top.length} sharp frames ✅ — ek pe tap karo`)
      q('#th-grid').innerHTML = ''
      top.forEach((f, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'thcell'
        const im = new Image(); im.src = f.img.toDataURL('image/jpeg', 0.7); im.alt = 'frame ' + fmtTime(f.t)
        b.append(im); b.insertAdjacentHTML('beforeend', `<span>${i === 0 ? '⭐ ' : ''}${fmtTime(f.t)}</span>`)
        b.onclick = () => { q('#th-grid').querySelectorAll('.thcell').forEach((x: Element) => x.classList.remove('on')); b.classList.add('on'); sel = f.img; q('#th-ed').hidden = false; draw() }
        q('#th-grid').append(b)
      })
      ;(q('#th-grid').firstElementChild as HTMLButtonElement)?.click()
    } catch (e) { job.fail(e) }
  })

  function draw() {
    if (!sel) return
    const c = q('#th-c') as HTMLCanvasElement; const g = c.getContext('2d')!
    q('#o-ts').textContent = q('#th-ts').value + '%'; q('#o-fp').textContent = q('#th-fp').value + '%'
    const W = 1280, H = 720
    g.fillStyle = '#060608'; g.fillRect(0, 0, W, H)
    const iw = sel.width, ih = sel.height; const sc = Math.max(W / iw, H / ih)
    const p = +q('#th-fp').value / 100
    g.filter = q('#th-pop').checked ? 'saturate(1.25) contrast(1.12)' : 'none'
    g.drawImage(sel, (W - iw * sc) * (iw * sc > W ? p : 0.5), (H - ih * sc) * (ih * sc > H ? p : 0.5), iw * sc, ih * sc)
    g.filter = 'none'
    const side = q('#th-side').value, vpos = q('#th-v').value
    if (q('#th-dark').checked) {
      const gr = vpos === 't' ? g.createLinearGradient(0, 0, 0, H * 0.7) : vpos === 'm' ? null : g.createLinearGradient(0, H, 0, H * 0.3)
      if (gr) { gr.addColorStop(0, 'rgba(6,6,8,.88)'); gr.addColorStop(1, 'rgba(6,6,8,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H) }
      else { g.fillStyle = 'rgba(6,6,8,.45)'; g.fillRect(0, 0, W, H) }
    }
    const k = +q('#th-ts').value / 100
    const t1 = (q('#th-t1').value || '').toUpperCase(), t2 = (q('#th-t2').value || '').toUpperCase()
    const fit = (t: string, size: number) => { let s = size; g.font = `800 ${s}px "Poppins ExtraBold", Poppins, system-ui, sans-serif`; while (s > 30 && g.measureText(t).width > W * 0.88) { s -= 4; g.font = `800 ${s}px "Poppins ExtraBold", Poppins, system-ui, sans-serif` } return s }
    const s1 = fit(t1, 118 * k), s2 = fit(t2, 96 * k)
    const block = (t1 ? s1 : 0) + (t2 ? s2 * 1.15 : 0)
    let y = vpos === 't' ? 50 + s1 : vpos === 'm' ? (H - block) / 2 + s1 : H - 56 - (t2 ? s2 * 1.15 : 0)
    const x = side === 'l' ? 56 : side === 'r' ? W - 56 : W / 2
    g.textAlign = side === 'l' ? 'left' : side === 'r' ? 'right' : 'center'; g.lineJoin = 'round'
    const line = (t: string, s: number, fill: string, yy: number) => {
      if (!t) return
      g.font = `800 ${s}px "Poppins ExtraBold", Poppins, system-ui, sans-serif`
      g.lineWidth = s * 0.16; g.strokeStyle = '#000'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 18; g.strokeText(t, x, yy); g.shadowBlur = 0
      g.fillStyle = fill; g.fillText(t, x, yy)
    }
    line(t1, s1, '#ffffff', y)
    if (t2) { y += s2 * 1.15; line(t2, s2, '#e3b65a', y) }
    g.strokeStyle = '#e3b65a'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8)
  }
  for (const id of ['#th-t1', '#th-t2', '#th-side', '#th-v', '#th-ts', '#th-fp', '#th-dark', '#th-pop']) q(id).addEventListener('input', draw)
  document.fonts?.ready.then(draw)
  q('#th-dl').addEventListener('click', () => (q('#th-c') as HTMLCanvasElement).toBlob((b) => b && download(b, baseName(S.file!.name) + '-thumbnail.png'), 'image/png'))
}
