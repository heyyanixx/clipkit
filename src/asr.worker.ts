// Whisper speech-to-text in a Web Worker (transformers.js). The model downloads once from the Hugging Face hub
// and is cached by the browser. Runs on CPU (wasm); WebGPU is used when the browser offers it.
import { pipeline, env } from '@huggingface/transformers'
env.allowLocalModels = false
const ortVer = (env as any).backends?.onnx?.versions?.web
if (ortVer && (env as any).backends?.onnx?.wasm) (env as any).backends.onnx.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ortVer}/dist/`
const post = (m: any) => (self as any).postMessage(m)
const pipes: Record<string, any> = {}

self.onmessage = async (e: MessageEvent) => {
  const { id, model, audio, language } = e.data
  try {
    if (!pipes[model]) {
      const files: Record<string, { loaded: number; total: number }> = {}
      pipes[model] = await pipeline('automatic-speech-recognition', model, {
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } as any,
        progress_callback: (p: any) => {
          if (p.file && (p.status === 'progress' || p.status === 'done')) {
            files[p.file] = { loaded: p.loaded ?? files[p.file]?.total ?? 0, total: p.total ?? files[p.file]?.total ?? 0 }
            let l = 0, t = 0
            for (const k in files) { l += files[k].loaded || 0; t += files[k].total || 0 }
            post({ id, type: 'download', loaded: l, total: t })
          }
        },
      })
    }
    post({ id, type: 'status', text: 'Sun raha hoon… (lamba audio = zyada time)' })
    const asr = pipes[model]
    const total = audio.length / 16000
    // Transcribe in 30 s windows so we can report progress and keep memory low on phones.
    const WIN = 30
    const chunks: { text: string; timestamp: [number, number] }[] = []
    for (let s = 0; s < total; s += WIN) {
      const part = audio.subarray(Math.floor(s * 16000), Math.min(audio.length, Math.floor((s + WIN) * 16000)))
      if (part.length < 1600) break
      const r = await asr(part, { language: language || null, task: 'transcribe', return_timestamps: true })
      const cs = (r.chunks || [{ text: r.text, timestamp: [0, part.length / 16000] }]) as any[]
      for (const c of cs) {
        const a = (c.timestamp?.[0] ?? 0) + s
        let b = c.timestamp?.[1]
        b = (b == null ? Math.min(total, s + WIN) : b + s)
        const text = String(c.text || '').trim()
        if (text) chunks.push({ text, timestamp: [a, Math.max(a + 0.3, b)] })
      }
      post({ id, type: 'progress', frac: Math.min(1, (s + WIN) / total), partial: chunks.length })
    }
    post({ id, type: 'done', chunks })
  } catch (err: any) {
    post({ id, type: 'error', error: String(err?.message || err) })
  }
}
