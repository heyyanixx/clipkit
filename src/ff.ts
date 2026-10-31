// ffmpeg.wasm wrapper — single-thread core (works without cross-origin isolation / SharedArrayBuffer).
// The core (~31 MB) downloads once from a CDN and is kept in the browser's Cache Storage.
import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'

const CORE_VER = '0.12.10'
const CDNS = [`https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VER}/dist/esm`, `https://unpkg.com/@ffmpeg/core@${CORE_VER}/dist/esm`]
const CACHE = 'clipkit-core-v1'

let inst: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null
let coreURLs: { coreURL: string; wasmURL: string } | null = null
let logTail: string[] = []
let logListener: ((s: string) => void) | null = null

async function fetchCached(url: string, mime: string, onProg?: (loaded: number, total: number) => void): Promise<string> {
  let res: Response | undefined
  let cache: Cache | null = null
  try { cache = await caches.open(CACHE); res = (await cache.match(url)) || undefined } catch { cache = null }
  if (!res) {
    const r = await fetch(url)
    if (!r.ok || !r.body) throw new Error('Download failed (' + r.status + ')')
    const total = Number(r.headers.get('content-length')) || 0
    const reader = r.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value); loaded += value.length
      onProg?.(loaded, total)
    }
    const blob = new Blob(chunks as BlobPart[], { type: mime })
    if (cache) { try { await cache.put(url, new Response(blob, { headers: { 'content-type': mime } })) } catch {} }
    return URL.createObjectURL(blob)
  }
  const blob = await res.blob()
  onProg?.(blob.size, blob.size)
  return URL.createObjectURL(new Blob([blob], { type: mime }))
}

export function isLoaded() { return !!inst }

export async function getFF(onStatus?: (text: string, frac: number) => void): Promise<FFmpeg> {
  if (inst) return inst
  if (!loading) loading = (async () => {
    if (!coreURLs) {
      let lastErr: unknown
      for (const base of CDNS) {
        try {
          const coreURL = await fetchCached(`${base}/ffmpeg-core.js`, 'text/javascript')
          const wasmURL = await fetchCached(`${base}/ffmpeg-core.wasm`, 'application/wasm', (l, t) => onStatus?.(`Video engine download ho raha hai… ${(l / 1048576).toFixed(1)} MB${t ? ' / ' + (t / 1048576).toFixed(0) + ' MB' : ''} (sirf pehli baar)`, t ? l / t : 0))
          coreURLs = { coreURL, wasmURL }
          break
        } catch (e) { lastErr = e }
      }
      if (!coreURLs) throw new Error('Video engine download nahi hua. Internet check karo. ' + String((lastErr as any)?.message || lastErr))
    }
    onStatus?.('Video engine start ho raha hai…', 1)
    const f = new FFmpeg()
    f.on('log', ({ message }) => {
      logTail.push(message); if (logTail.length > 400) logTail.splice(0, 200)
      logListener?.(message)
    })
    await f.load(coreURLs)
    inst = f
    return f
  })().catch((e) => { loading = null; throw e })
  return loading
}

/** Kill the running job (ffmpeg.wasm can only be stopped by terminating its worker). */
export function cancelFF() {
  if (inst) { try { inst.terminate() } catch {} }
  inst = null; loading = null
}

export interface RunOpts {
  file: File
  args: (input: string) => string[]   // args AFTER the input; output names inside
  outputs: string[]                    // files to read back after exec
  extraFiles?: { name: string; data: Uint8Array | string }[]
  expectedDuration?: number            // seconds of output, for progress
  onProgress?: (frac: number, text?: string) => void
  onLog?: (s: string) => void
  preInput?: string[]
}

function parseTime(s: string): number | null {
  const m = /time=\s*(-?\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s)
  if (!m) return null
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
}

let jobId = 0
export async function runFF(o: RunOpts): Promise<{ files: Record<string, Uint8Array>; log: string[] }> {
  const f = await getFF((t, p) => o.onProgress?.(p * 0.05, t))
  const id = ++jobId
  const dir = `/job${id}`
  let input = ''
  let mounted = false
  logTail = []
  const myLog: string[] = []
  logListener = (s) => {
    myLog.push(s); if (myLog.length > 2000) myLog.splice(0, 1000)
    o.onLog?.(s)
    const t = parseTime(s)
    if (t != null && o.expectedDuration && o.expectedDuration > 0) o.onProgress?.(Math.max(0, Math.min(0.99, t / o.expectedDuration)))
  }
  try {
    await f.createDir(dir)
    // WORKERFS reads the File lazily — big files are not copied into wasm memory.
    try {
      await f.mount(FFFSType.WORKERFS, { files: [o.file] }, dir)
      mounted = true
      input = `${dir}/${o.file.name}`
    } catch {
      input = `/in_${id}_${o.file.name.replace(/[^\w.\-]/g, '_')}`
      await f.writeFile(input, new Uint8Array(await o.file.arrayBuffer()))
    }
    for (const x of o.extraFiles || []) {
      const d = x.name.substring(0, x.name.lastIndexOf('/'))
      if (d) { try { await f.createDir(d) } catch {} }
      await f.writeFile(x.name, x.data as any)
    }
    const code = await f.exec([...(o.preInput || []), '-i', input, ...o.args(input)])
    if (code !== 0) {
      const tail = myLog.slice(-6).join('\n')
      throw new Error('Processing fail ho gaya (code ' + code + ').\n' + tail)
    }
    const files: Record<string, Uint8Array> = {}
    for (const name of o.outputs) {
      const d = (await f.readFile(name)) as Uint8Array
      files[name] = d
      try { await f.deleteFile(name) } catch {}
    }
    o.onProgress?.(1)
    return { files, log: myLog }
  } finally {
    logListener = null
    if (inst === f) {
      if (mounted) { try { await f.unmount(dir) } catch {} }
      try { await f.deleteDir(dir) } catch {}
      if (!mounted && input) { try { await f.deleteFile(input) } catch {} }
      for (const x of o.extraFiles || []) { try { await f.deleteFile(x.name) } catch {} }
    }
  }
}
