import { runFF } from './ff'
export interface Meta { dur: number; w: number; h: number; hasVideo: boolean; fps: number; previewOk: boolean }
export const S: { file: File | null; url: string; meta: Meta | null; pcm: Float32Array | null; busy: boolean; onChange: (() => void)[] } = { file: null, url: '', meta: null, pcm: null, busy: false, onChange: [] }

export function parseProbe(log: string[], meta: Meta) {
  for (const l of log) {
    const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(l)
    if (d && !(meta.dur > 0)) meta.dur = +d[1] * 3600 + +d[2] * 60 + +d[3]
    if (/Stream #.*Video:/.test(l)) {
      meta.hasVideo = true
      const r = /, (\d{2,5})x(\d{2,5})/.exec(l); if (r && !meta.w) { meta.w = +r[1]; meta.h = +r[2] }
      const f = /([\d.]+) fps/.exec(l); if (f) meta.fps = Math.min(60, Math.max(10, Math.round(+f[1])))
      // phone videos often carry a rotation flag
      if (/rotate|displaymatrix: rotation of -?90/.test(l) && meta.w > meta.h && !meta.previewOk) { const t = meta.w; meta.w = meta.h; meta.h = t }
    }
  }
}

/** Mono 16 kHz float PCM of the file's audio — shared by Silence Cut (waveform) and Captions (Whisper). */
export async function getPCM(onProgress: (f: number, t?: string) => void): Promise<Float32Array> {
  if (S.pcm) return S.pcm
  const f = S.file!
  const r = await runFF({ file: f, args: () => ['-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pcm.raw'], outputs: ['pcm.raw'], expectedDuration: S.meta?.dur, onProgress })
  if (S.meta) parseProbe(r.log, S.meta)
  const d = r.files['pcm.raw']
  if (!d.length) throw new Error('Is file me audio nahi mila.')
  S.pcm = new Float32Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength))
  return S.pcm
}
