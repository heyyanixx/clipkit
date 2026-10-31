import { h, esc } from './util'
import { cancelFF } from './ff'
import { S } from './state'

export interface Job { set(frac: number, text?: string): void; done(text?: string): void; fail(e: unknown): void; el: HTMLElement; cancelled: boolean }

/** Progress bar + status + cancel, inside a tool panel. Only one job runs at a time. */
export function startJob(box: HTMLElement, label: string, onCancel?: () => void): Job | null {
  if (S.busy) { alert('Ek kaam already chal raha hai — pehle usko khatam/cancel hone do.'); return null }
  S.busy = true
  document.body.classList.add('busy')
  box.innerHTML = ''
  const el = h(`<div class="job" role="status" aria-live="polite">
    <div class="job-top"><span class="job-label">${esc(label)}</span><span class="job-pct">0%</span></div>
    <div class="bar"><i style="width:0%"></i></div>
    <div class="job-text">Shuru ho raha hai…</div>
    <button class="btn ghost sm job-cancel" type="button">✕ Cancel</button></div>`)
  box.appendChild(el)
  const bar = el.querySelector('.bar i') as HTMLElement
  const pct = el.querySelector('.job-pct') as HTMLElement
  const txt = el.querySelector('.job-text') as HTMLElement
  const t0 = performance.now()
  let last = 0
  const job: Job = {
    el, cancelled: false,
    set(frac, text) {
      if (job.cancelled) return
      frac = Math.max(last, Math.min(1, frac)); last = frac
      bar.style.width = (frac * 100).toFixed(1) + '%'
      pct.textContent = Math.round(frac * 100) + '%'
      if (text) txt.textContent = text
      else if (frac > 0.02 && frac < 1) {
        const el = (performance.now() - t0) / 1000
        const left = el / frac - el
        txt.textContent = `Process ho raha hai… ~${left < 60 ? Math.ceil(left) + ' sec' : Math.ceil(left / 60) + ' min'} baaki`
      }
    },
    done(text) {
      S.busy = false; document.body.classList.remove('busy')
      bar.style.width = '100%'; pct.textContent = '100%'
      txt.textContent = text || `Ho gaya ✅ (${((performance.now() - t0) / 1000).toFixed(1)} sec)`
      el.classList.add('ok'); el.querySelector('.job-cancel')?.remove()
    },
    fail(e) {
      S.busy = false; document.body.classList.remove('busy')
      if (job.cancelled) return
      const msg = String((e as any)?.message || e)
      console.warn('[clipkit] job failed:', msg)
      el.classList.add('err')
      txt.innerHTML = '❌ ' + esc(msg.split('\n')[0]) + (/memory|OOM|Aborted|out of bounds/i.test(msg) ? '<br><small>File shayad phone ke liye bahut badi hai — chhota clip try karo ya PC pe Chrome use karo.</small>' : '')
      el.querySelector('.job-cancel')?.remove()
    },
  }
  el.querySelector('.job-cancel')!.addEventListener('click', () => {
    job.cancelled = true
    onCancel?.(); cancelFF()
    S.busy = false; document.body.classList.remove('busy')
    txt.textContent = 'Cancel kar diya.'; el.classList.add('err'); el.querySelector('.job-cancel')?.remove()
  })
  return job
}

/** Result card: preview + size + download (+ share on phones, + use as new input). */
export function showResult(box: HTMLElement, blob: Blob, name: string, opts: { kind: 'video' | 'audio' | 'image' | 'file'; note?: string; chain?: boolean; onChain?: (f: File) => void } ) {
  const url = URL.createObjectURL(blob)
  const media = opts.kind === 'video' ? `<video src="${url}" controls playsinline preload="metadata" class="res-media"></video>`
    : opts.kind === 'audio' ? `<audio src="${url}" controls class="res-audio"></audio>`
    : opts.kind === 'image' ? `<img src="${url}" class="res-media" alt="result">` : ''
  const el = h(`<div class="result">${media}
    <div class="res-info"><b>${esc(name)}</b> · ${(blob.size / 1048576).toFixed(2)} MB ${opts.note ? '<div class="res-note">' + opts.note + '</div>' : ''}</div>
    <div class="row wrap"><a class="btn gold" href="${url}" download="${esc(name)}">⬇ Download</a>
    ${'share' in navigator ? '<button class="btn ghost share" type="button">↗ Share</button>' : ''}
    ${opts.chain ? '<button class="btn ghost chain" type="button">↻ Isi result pe aur tool lagao</button>' : ''}</div></div>`)
  box.appendChild(el)
  el.querySelector('.share')?.addEventListener('click', async () => {
    try {
      const file = new File([blob], name, { type: blob.type })
      if ((navigator as any).canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name })
      else await navigator.share({ title: 'ClipKit', text: 'ClipKit — free video helper', url: location.href })
    } catch {}
  })
  el.querySelector('.chain')?.addEventListener('click', () => opts.onChain?.(new File([blob], name, { type: blob.type })))
  return el
}
