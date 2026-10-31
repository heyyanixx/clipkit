export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
export function h(html: string): HTMLElement {
  const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement
}
export const isPhone = () => matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
export function fmtBytes(n: number) { if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB'; return (n / 1073741824).toFixed(2) + ' GB' }
export function fmtTime(s: number) { if (!isFinite(s)) return '–'; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(1).padStart(4, '0')}` }
export function srtTime(s: number) { const ms = Math.round(s * 1000); const hh = Math.floor(ms / 3600000), mm = Math.floor(ms / 60000) % 60, ss = Math.floor(ms / 1000) % 60, mmm = ms % 1000; return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(mmm).padStart(3, '0')}` }
export function assTime(s: number) { const cs = Math.round(s * 100); const hh = Math.floor(cs / 360000), mm = Math.floor(cs / 6000) % 60, ss = Math.floor(cs / 100) % 60, c = cs % 100; return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(c).padStart(2, '0')}` }
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
export function baseName(name: string) { return name.replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'clip' }
export function toast(msg: string, bad = false) {
  const t = h(`<div class="toast ${bad ? 'bad' : ''}">${esc(msg)}</div>`); document.body.appendChild(t)
  setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3200)
}
export function blobOf(d: Uint8Array, type: string) { return new Blob([d as BlobPart], { type }) }
export function download(blob: Blob, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 4000)
}
