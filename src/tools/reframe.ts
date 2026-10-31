import { S } from '../state'
import { runFF } from '../ff'
import { startJob, showResult } from '../job'
import { baseName, blobOf, even, fmtTime } from '../util'

const AR: Record<string, [number, number]> = { '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5], '16:9': [16, 9] }
function outSize(ar: string, q: string): [number, number] {
  const [a, b] = AR[ar]; const short = q === '720' ? 720 : 1080
  return a <= b ? [short, even(short * b / a)] : [even(short * a / b), short]
}

export function reframeTool(root: HTMLElement, chain: (f: File) => void, video: HTMLVideoElement) {
  root.innerHTML = `
  <p class="hint">YouTube video ko Shorts/Reels (9:16) ya post (1:1, 4:5) me badlo. <b>Crop</b> = subject pe focus (slider se left/right). <b>Blur fill</b> = poora video dikhe, peeche blur background.</p>
  <div class="seg" id="rf-ar">${Object.keys(AR).map((k, i) => `<button type="button" data-v="${k}" class="${i === 0 ? 'on' : ''}">${k}</button>`).join('')}</div>
  <div class="seg" id="rf-mode"><button type="button" data-v="crop" class="on">✂️ Crop</button><button type="button" data-v="blur">🌫️ Blur fill</button></div>
  <label class="slider" id="rf-poswrap">Position <output id="o-pos"></output><input type="range" id="rf-pos" min="0" max="100" step="1" value="50"></label>
  <div class="rf-prev-wrap"><canvas id="rf-prev" class="rf-prev"></canvas></div>
  <p class="tiny">Preview me frame badalne ke liye upar wala video aage-peeche karo.</p>
  <div class="row wrap"><label class="sel">Quality <select id="rf-q"><option value="1080">1080p</option><option value="720" selected>720p (fast, phone ke liye best)</option></select></label>
  <button class="btn gold" id="rf-go" type="button">📐 Export</button></div>
  <div id="rf-job"></div><div id="rf-res"></div>`
  const q = (s: string) => root.querySelector(s) as any
  let ar = '9:16', mode = 'crop'
  const segs = (id: string, cb: (v: string) => void) => q(id).addEventListener('click', (e: Event) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return
    q(id).querySelectorAll('button').forEach((x: Element) => x.classList.toggle('on', x === b)); cb(b.dataset.v!); draw()
  })
  segs('#rf-ar', (v) => ar = v)
  segs('#rf-mode', (v) => { mode = v; q('#rf-poswrap').hidden = v !== 'crop' })

  function cropRect(W: number, H: number) {
    const [a, b] = AR[ar]; const t = a / b; const p = +q('#rf-pos').value / 100
    if (W / H > t) { const cw = even(H * t); return { x: even((W - cw) * p), y: 0, w: Math.min(cw, W - (W % 2)), h: H - (H % 2) } }
    const ch = even(W / t); return { x: 0, y: even((H - ch) * p), w: W - (W % 2), h: Math.min(ch, H - (H % 2)) }
  }
  function draw() {
    q('#o-pos').textContent = q('#rf-pos').value + '%'
    const c = q('#rf-prev') as HTMLCanvasElement; const [a, b] = AR[ar]
    const PH = 260, PW = Math.round(PH * a / b); c.width = PW * 2; c.height = PH * 2; c.style.width = PW + 'px'; c.style.height = PH + 'px'
    const g = c.getContext('2d')!; g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height)
    const W = video.videoWidth, H = video.videoHeight; if (!W) return
    if (mode === 'crop') { const r = cropRect(W, H); g.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height) }
    else {
      const sc = Math.max(c.width / W, c.height / H); g.filter = 'blur(14px) brightness(.7)'
      g.drawImage(video, (c.width - W * sc) / 2, (c.height - H * sc) / 2, W * sc, H * sc); g.filter = 'none'
      const s2 = Math.min(c.width / W, c.height / H); g.drawImage(video, (c.width - W * s2) / 2, (c.height - H * s2) / 2, W * s2, H * s2)
    }
  }
  q('#rf-pos').addEventListener('input', draw)
  video.addEventListener('seeked', draw); video.addEventListener('loadeddata', draw); video.addEventListener('timeupdate', () => { if (!root.hidden) draw() })
  setTimeout(draw, 50)

  q('#rf-go').addEventListener('click', async () => {
    const m = S.meta!; if (!m.hasVideo || !m.w) { alert('Video file chahiye.'); return }
    const res = q('#rf-res'); res.innerHTML = ''
    const job = startJob(q('#rf-job'), 'Reframe ' + ar); if (!job) return
    try {
      const [OW, OH] = outSize(ar, q('#rf-q').value)
      let fc: string
      if (mode === 'crop') { const r = cropRect(m.w, m.h); fc = `[0:v]crop=${r.w}:${r.h}:${r.x}:${r.y},scale=${OW}:${OH},setsar=1,format=yuv420p[v]` }
      else {
        const bw = even(OW / 4), bh = even(OH / 4)
        fc = `[0:v]split[a][b];[a]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=8:2,scale=${OW}:${OH},eq=brightness=-0.08[bg];[b]scale=${OW}:${OH}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]`
      }
      const r = await runFF({ file: S.file!, expectedDuration: m.dur, onProgress: (f, t) => job.set(f, t),
        args: () => ['-filter_complex', fc, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'superfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] })
      job.done()
      showResult(res, blobOf(r.files['out.mp4'], 'video/mp4'), `${baseName(S.file!.name)}-${ar.replace(':', 'x')}.mp4`, { kind: 'video', note: `${OW}×${OH} · ${fmtTime(m.dur)}`, chain: true, onChain: chain })
    } catch (e) { job.fail(e) }
  })
}
