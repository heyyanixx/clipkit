import './style.css'
import { S, parseProbe } from './state'
import { runFF, isLoaded } from './ff'
import { h, esc, fmtBytes, fmtTime, isPhone, toast } from './util'
import { silenceTool } from './tools/silence'
import { captionsTool } from './tools/captions'
import { reframeTool } from './tools/reframe'
import { compressTool } from './tools/compress'
import { thumbTool } from './tools/thumb'
import { audioTool } from './tools/audio'

const TOOLS = [
  { id: 'silence', icon: '✂️', name: 'Silence Cut', sub: 'Dead air auto-kaato', dev: 'phone', needVideo: false },
  { id: 'captions', icon: '💬', name: 'Auto Captions', sub: 'AI subtitles + SRT + burn-in', dev: 'pc', needVideo: false },
  { id: 'reframe', icon: '📐', name: 'Reframe', sub: '16:9 → 9:16 / 1:1 / 4:5', dev: 'phone', needVideo: true },
  { id: 'compress', icon: '🗜️', name: 'Compress', sub: 'WhatsApp / IG size', dev: 'phone', needVideo: true },
  { id: 'thumb', icon: '🖼️', name: 'Thumbnail', sub: 'Sharp frame + bada text', dev: 'phone', needVideo: true },
  { id: 'audio', icon: '🎵', name: 'MP3 + Loudness', sub: 'Audio nikaalo, level fix', dev: 'phone', needVideo: false },
] as const
const DEV: Record<string, string> = { phone: '<span class="dev ok">📱 Phone ✓</span>', pc: '<span class="dev pc">💻 Best on PC</span>' }

const app = document.getElementById('app')!
app.innerHTML = `
<header class="top">
  <a class="logo" href="./" aria-label="ClipKit home"><svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#060608"/><rect x="3" y="3" width="58" height="58" rx="12" fill="none" stroke="#e3b65a" stroke-width="3"/><path d="M24 18v28l22-14z" fill="#e3b65a"/><path d="M14 24h6M14 32h4M14 40h6" stroke="#e3b65a" stroke-width="3" stroke-linecap="round"/></svg><span>Clip<b>Kit</b></span></a>
  <a class="gh" href="https://github.com/heyyanixx/clipkit" target="_blank" rel="noopener">★ GitHub</a>
</header>
<main>
  <section class="hero">
    <p class="kicker">by HEYYANIXX · free · open-source</p>
    <h1>Editing ka boring kaam,<br><em>1 tap me.</em></h1>
    <p class="lead">Silence cut, auto captions, 9:16 reframe, WhatsApp compress, thumbnail, MP3 — sab tumhare browser me. <b>Video upload nahi hota.</b></p>
  </section>

  <section class="drop" id="drop" tabindex="0">
    <input type="file" id="file" accept="video/*,audio/*,.mkv,.mov,.m4a,.mp3,.wav" hidden>
    <div class="drop-empty" id="dropEmpty">
      <div class="drop-icon">🎬</div>
      <b>Video yahan daalo</b>
      <span>ya tap karke choose karo · MP4, MOV, WEBM, MP3…</span>
      <button class="btn gold" type="button" id="pick">📂 Video choose karo</button>
      <button class="btn ghost sm" type="button" id="sample">ya sample video se try karo</button>
    </div>
    <div class="drop-full" id="dropFull" hidden>
      <video id="vid" controls playsinline preload="metadata"></video>
      <div class="finfo" id="finfo"></div>
      <div id="fwarn"></div>
      <button class="btn ghost sm" type="button" id="change">↺ Doosri file</button>
    </div>
  </section>

  <section class="tools" id="tools">
    <h2>Tool chuno</h2>
    <div class="grid" id="grid">${TOOLS.map((t) => `<button class="tcard" type="button" data-t="${t.id}" disabled><span class="ti">${t.icon}</span><b>${t.name}</b><small>${t.sub}</small>${DEV[t.dev]}</button>`).join('')}</div>
    <div class="panel" id="panel" hidden><div class="panel-head"><h3 id="ptitle"></h3><button class="x" id="pclose" type="button" aria-label="close">✕</button></div><div id="pbody"></div></div>
  </section>

  <section class="how">
    <h2>Kaise kaam karta hai?</h2>
    <ol><li><b>Video daalo</b> — file tumhare device pe hi rehti hai.</li><li><b>Tool chuno</b> — pehli baar video engine (~31 MB) aur captions ke liye AI model download hota hai, phir cache.</li><li><b>Download</b> — ya "Isi result pe aur tool lagao" se chain karo: silence cut → captions → 9:16.</li></ol>
    <div class="faq">
      <details><summary>Kya video kahin upload hota hai?</summary><p>Nahi. Sab processing tumhare phone/PC ke browser me hoti hai (ffmpeg.wasm + Whisper AI). Internet sirf engine/model download ke liye chahiye.</p></details>
      <details><summary>Phone pe chalega?</summary><p>Haan — chhote clips (1–3 min) ke liye. Lambi/badi videos (200 MB+) aur Auto Captions PC/laptop pe Chrome me kaafi fast chalti hain. Phone pe processing ke time screen on rakho.</p></details>
      <details><summary>Speed kitni hai?</summary><p>Browser ka engine desktop apps se slow hota hai (single-thread). 720p option sabse fast hai. 30 sec ka clip PC pe aam taur pe 1 minute ke andar.</p></details>
      <details><summary>Hindi captions?</summary><p>Whisper Hindi samajhta hai, par accuracy rough hai — export se pehle captions edit kar lo. Roman Hinglish chahiye to Language = English try karo.</p></details>
    </div>
  </section>
</main>
<footer>
  <p>Made with ☕ by <b>HEYYANIXX</b> · <a href="https://github.com/heyyanixx/clipkit" target="_blank" rel="noopener">GitHub</a> · <a href="https://www.instagram.com/heyyy.anixx_/" target="_blank" rel="noopener">Instagram</a> · <a href="https://www.youtube.com/@smart_anish69" target="_blank" rel="noopener">YouTube</a></p>
  <p class="tiny">MIT License · Powered by open-source ffmpeg.wasm & Whisper (transformers.js) · More tools: <a href="https://heyyanixx-tools.sites.tab.bot/">ADCA Tools</a> · <a href="https://heyyanixx-learn.sites.tab.bot/">Learn Arcade</a> · <a href="https://heyyanixx.sites.tab.bot/">Portfolio</a></p>
</footer>`

const q = (s: string) => document.querySelector(s) as any
const vid = q('#vid') as HTMLVideoElement
const fileIn = q('#file') as HTMLInputElement
let current = ''

function setFile(f: File) {
  if (S.busy) { toast('Pehle chal raha kaam khatam hone do', true); return }
  if (S.url) URL.revokeObjectURL(S.url)
  S.file = f; S.url = URL.createObjectURL(f); S.pcm = null
  S.meta = { dur: 0, w: 0, h: 0, hasVideo: f.type.startsWith('video') || /\.(mp4|mov|mkv|webm|avi|m4v|3gp)$/i.test(f.name), fps: 30, previewOk: false }
  q('#dropEmpty').hidden = true; q('#dropFull').hidden = false
  vid.src = S.url + '#t=0.1'
  const warn: string[] = []
  const mb = f.size / 1048576
  if (mb > 1900) warn.push('⛔ File 2 GB se badi hai — browser isko handle nahi kar payega. Pehle kisi app me trim/compress karo.')
  else if (isPhone() && mb > 200) warn.push(`⚠️ ${fmtBytes(f.size)} — phone ke liye badi file hai. Processing slow/crash ho sakti hai. Chhota clip ya PC/laptop (Chrome) best rahega.`)
  else if (mb > 800) warn.push(`⚠️ ${fmtBytes(f.size)} — badi file. PC pe chalega par time lagega; 720p options use karo.`)
  q('#fwarn').innerHTML = warn.map((w) => `<p class="warn">${w}</p>`).join('')
  renderInfo()
  document.querySelectorAll<HTMLButtonElement>('.tcard').forEach((b) => b.disabled = false)
  if (current) openTool(current)
  q('#tools').scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function renderInfo() {
  const m = S.meta!, f = S.file!
  q('#finfo').innerHTML = `<b>${esc(f.name)}</b><span>${fmtBytes(f.size)}${m.dur ? ' · ' + fmtTime(m.dur) : ''}${m.w ? ' · ' + m.w + '×' + m.h : ''}${m.hasVideo ? '' : ' · audio'}</span>`
  document.querySelectorAll<HTMLButtonElement>('.tcard').forEach((b) => {
    const t = TOOLS.find((x) => x.id === b.dataset.t)!
    b.classList.toggle('na', t.needVideo && !m.hasVideo)
  })
}
vid.addEventListener('loadedmetadata', () => {
  const m = S.meta; if (!m) return
  m.dur = vid.duration; m.w = vid.videoWidth; m.h = vid.videoHeight; m.hasVideo = vid.videoWidth > 0; m.previewOk = true
  renderInfo()
})
vid.addEventListener('error', async () => {
  // Browser can't preview this codec (e.g. HEVC/MKV) — read the facts with ffmpeg instead.
  const m = S.meta; if (!m || !S.file || m.previewOk) return
  q('#fwarn').insertAdjacentHTML('beforeend', '<p class="warn">ℹ️ Is format ka preview browser me nahi chal raha — tools phir bhi kaam karenge (Compress se MP4 bana sakte ho).</p>')
  try { const r = await runFF({ file: S.file, args: () => ['-t', '0', '-f', 'null', '-'], outputs: [] }); parseProbe(r.log, m); renderInfo() } catch {}
})

q('#pick').addEventListener('click', () => fileIn.click())
q('#change').addEventListener('click', () => fileIn.click())
fileIn.addEventListener('change', () => { const f = fileIn.files?.[0]; if (f) setFile(f); fileIn.value = '' })
q('#sample').addEventListener('click', async () => {
  try { const b = await (await fetch('sample.mp4')).blob(); setFile(new File([b], 'clipkit-sample.mp4', { type: 'video/mp4' })) } catch { toast('Sample load nahi hua', true) }
})
const drop = q('#drop') as HTMLElement
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over') })
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over') })
drop.addEventListener('drop', (e) => { const f = (e as DragEvent).dataTransfer?.files?.[0]; if (f) setFile(f) })
drop.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !S.file) fileIn.click() })

function chain(f: File) { setFile(f); toast('Result ab naya input hai ✅ — agla tool chuno') }

function openTool(id: string) {
  if (!S.file) return
  if (S.busy && current !== id) { toast('Ek kaam chal raha hai — pehle khatam hone do', true); return }
  current = id
  const t = TOOLS.find((x) => x.id === id)!
  document.querySelectorAll('.tcard').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.t === id))
  q('#panel').hidden = false
  q('#ptitle').innerHTML = `${t.icon} ${t.name} ${DEV[t.dev]}`
  const body = q('#pbody') as HTMLElement
  body.innerHTML = ''
  if (t.needVideo && !S.meta?.hasVideo) { body.innerHTML = '<p class="warn">Is tool ke liye video file chahiye (abhi audio file hai).</p>'; return }
  if (!isLoaded() && id !== 'thumb') body.insertAdjacentHTML('beforeend', '<p class="tiny engine-note">Pehli baar video engine (~31 MB) download hoga — phir cache ho jaata hai.</p>')
  const wrap = document.createElement('div'); body.appendChild(wrap)
  if (id === 'silence') silenceTool(wrap, chain)
  else if (id === 'captions') captionsTool(wrap, chain)
  else if (id === 'reframe') reframeTool(wrap, chain, vid)
  else if (id === 'compress') compressTool(wrap, chain)()
  else if (id === 'thumb') thumbTool(wrap)
  else if (id === 'audio') audioTool(wrap)
  q('#panel').scrollIntoView({ behavior: 'smooth', block: 'start' })
}
q('#grid').addEventListener('click', (e: Event) => { const b = (e.target as HTMLElement).closest('.tcard') as HTMLElement; if (b && !(b as HTMLButtonElement).disabled) openTool(b.dataset.t!) })
q('#pclose').addEventListener('click', () => { if (S.busy) { toast('Kaam chal raha hai', true); return } q('#panel').hidden = true; current = ''; document.querySelectorAll('.tcard').forEach((b) => b.classList.remove('on')) })
addEventListener('beforeunload', (e) => { if (S.busy) { e.preventDefault(); (e as any).returnValue = '' } })
void h
// expose for automated tests
;(window as any).__clipkit = { S, setFile }
