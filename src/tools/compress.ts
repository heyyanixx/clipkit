import { S } from '../state'
import { runFF } from '../ff'
import { startJob, showResult } from '../job'
import { baseName, blobOf, even, fmtBytes } from '../util'

export function compressTool(root: HTMLElement, chain: (f: File) => void) {
  root.innerHTML = `
  <p class="hint">Target size chuno — ClipKit khud resolution aur bitrate set karega taaki video us size ke andar aaye.</p>
  <div class="seg" id="cm-t"><button type="button" data-v="16" class="on">16 MB<small>WhatsApp</small></button><button type="button" data-v="25">25 MB<small>Email</small></button><button type="button" data-v="50">50 MB<small>IG/Drive</small></button><button type="button" data-v="c">Custom</button></div>
  <label class="slider" id="cm-cw" hidden>Custom size (MB) <output id="o-cm"></output><input type="range" id="cm-c" min="2" max="200" step="1" value="10"></label>
  <div class="stat" id="cm-est"></div>
  <button class="btn gold" id="cm-go" type="button">🗜️ Compress</button>
  <div id="cm-job"></div><div id="cm-res"></div>`
  const q = (s: string) => root.querySelector(s) as any
  let target = 16
  q('#cm-t').addEventListener('click', (e: Event) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return
    q('#cm-t').querySelectorAll('button').forEach((x: Element) => x.classList.toggle('on', x === b))
    q('#cm-cw').hidden = b.dataset.v !== 'c'; target = b.dataset.v === 'c' ? +q('#cm-c').value : +b.dataset.v!; plan()
  })
  q('#cm-c').addEventListener('input', () => { target = +q('#cm-c').value; plan() })

  function plan() {
    q('#o-cm').textContent = q('#cm-c').value + ' MB'
    const m = S.meta; const f = S.file; if (!m || !f) return null
    const dur = m.dur || 1
    const totalK = (target * 8192 * 0.92) / dur
    const ak = totalK > 900 ? 128 : totalK > 400 ? 96 : 64
    const vk = Math.floor(totalK - ak)
    const srcShort = Math.min(m.w, m.h) || 1080
    let short = vk >= 3500 ? 1080 : vk >= 1500 ? 720 : vk >= 700 ? 540 : vk >= 350 ? 480 : 360
    short = Math.min(short, srcShort)
    const fps = m.fps > 30 && vk < 3000 ? 30 : 0
    const est = (vk + ak) * dur / 8192
    const el = q('#cm-est')
    if (!m.hasVideo) { el.innerHTML = 'Ye audio file hai — Audio tool use karo.'; return null }
    if (vk < 150) { el.innerHTML = `⚠️ ${target} MB me ${Math.round(dur)} sec ka video theek nahi dikhega. Bada size chuno ya pehle video chhota (trim) karo.`; q('#cm-go').disabled = true; return null }
    q('#cm-go').disabled = false
    el.innerHTML = `Abhi: <b>${fmtBytes(f.size)}</b> → andaazan <b>~${est.toFixed(1)} MB</b><br>${short}p · video ${vk} kbps · audio ${ak} kbps${fps ? ' · 30 fps' : ''}${f.size < target * 1048576 ? '<br>✅ File already is size se chhoti hai.' : ''}`
    return { vk, ak, short, fps }
  }

  q('#cm-go').addEventListener('click', async () => {
    const p = plan(); if (!p) return
    const m = S.meta!
    const res = q('#cm-res'); res.innerHTML = ''
    const job = startJob(q('#cm-job'), `Compress → ${target} MB`); if (!job) return
    try {
      const sc = m.w >= m.h ? `scale=-2:${p.short}` : `scale=${p.short}:-2`
      const vf = (Math.min(m.w, m.h) > p.short ? sc + ',' : '') + (p.fps ? `fps=${p.fps},` : '') + 'format=yuv420p'
      const r = await runFF({ file: S.file!, expectedDuration: m.dur, onProgress: (f, t) => job.set(f, t),
        args: () => ['-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', p.vk + 'k', '-maxrate', p.vk + 'k', '-bufsize', p.vk * 2 + 'k', '-c:a', 'aac', '-b:a', p.ak + 'k', '-ac', '2', '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] })
      const d = r.files['out.mp4']
      const ok = d.length <= target * 1048576
      job.done(ok ? `Ho gaya ✅ ${fmtBytes(S.file!.size)} → ${fmtBytes(d.length)}` : `Size ${fmtBytes(d.length)} aaya (target se thoda bada) — chhota target chuno.`)
      void even
      showResult(res, blobOf(d, 'video/mp4'), `${baseName(S.file!.name)}-${target}MB.mp4`, { kind: 'video', note: `${p.short}p · ${ok ? 'target ke andar ✅' : 'target se upar ⚠️'}`, chain: true, onChain: chain })
    } catch (e) { job.fail(e) }
  })
  return plan
}
