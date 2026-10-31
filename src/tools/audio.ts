import { S } from '../state'
import { runFF } from '../ff'
import { startJob, showResult } from '../job'
import { baseName, blobOf, fmtTime } from '../util'

export function audioTool(root: HTMLElement) {
  root.innerHTML = `
  <p class="hint">Video se gaana/voice nikaalo. <b>Loudness normalize</b> se awaaz platform ke hisaab se barabar (na bahut dhimi, na fat-ti) ho jaati hai.</p>
  <div class="row wrap">
    <label class="sel">Format <select id="au-f"><option value="mp3">MP3 (192 kbps)</option><option value="m4a">M4A / AAC</option><option value="wav">WAV (lossless)</option></select></label>
    <label class="sel">Loudness <select id="au-n"><option value="-14">Normalize −14 LUFS (YouTube/Insta)</option><option value="-16">Normalize −16 LUFS (podcast/voice)</option><option value="off">Off — jaisa hai waisa</option></select></label>
  </div>
  <button class="btn gold" id="au-go" type="button">🎵 Audio nikaalo</button>
  <div id="au-job"></div><div id="au-res"></div>`
  const q = (s: string) => root.querySelector(s) as any
  q('#au-go').addEventListener('click', async () => {
    const m = S.meta!; const res = q('#au-res'); res.innerHTML = ''
    const job = startJob(q('#au-job'), 'Audio extract'); if (!job) return
    try {
      const fmt = q('#au-f').value, norm = q('#au-n').value
      let af = '', note = '', I = 0
      const measure = async (file: File, from: number, span: number) => {
        const r1 = await runFF({ file, expectedDuration: m.dur, onProgress: (f) => job.set(from + f * span, 'Loudness naap raha hoon…'),
          args: () => ['-vn', '-af', `loudnorm=I=${I || -14}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-'], outputs: [] })
        const txt = r1.log.join('\n'); return JSON.parse(txt.slice(txt.lastIndexOf('{'), txt.lastIndexOf('}') + 1))
      }
      let inI = NaN
      if (norm !== 'off') {
        I = +norm
        const mj = await measure(S.file!, 0, 0.35)
        inI = parseFloat(mj.input_i)
        if (!isFinite(inI)) throw new Error('Is file me awaaz nahi mili (silent).')
        // Linear gain keeps the sound untouched; if that gain would clip the peaks, use loudnorm's dynamic mode (gentle limiter) instead.
        const linearOk = parseFloat(mj.input_tp) + (I - inI) <= -1.5
        af = `loudnorm=I=${I}:TP=-1.5:LRA=11:measured_I=${mj.input_i}:measured_TP=${mj.input_tp}:measured_LRA=${mj.input_lra}:measured_thresh=${mj.input_thresh}:offset=${mj.target_offset}:linear=${linearOk ? 'true' : 'false'},aresample=48000`
      }
      const out = 'out.' + fmt
      const codec = fmt === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k'] : fmt === 'm4a' ? ['-c:a', 'aac', '-b:a', '192k'] : ['-c:a', 'pcm_s16le']
      const r = await runFF({ file: S.file!, expectedDuration: m.dur, onProgress: (f, t) => job.set(norm === 'off' ? f : 0.35 + f * 0.45, t),
        args: () => ['-vn', ...(af ? ['-af', af] : []), ...(af ? [] : ['-ar', '48000']), ...codec, out], outputs: [out] })
      if (norm !== 'off') {
        const outF = new File([r.files[out] as BlobPart], out)
        const mo = await measure(outF, 0.8, 0.2)
        const outI = parseFloat(mo.input_i)
        note = `Loudness: ${inI.toFixed(1)} → ${outI.toFixed(1)} LUFS (target ${I})` + (outI < I - 1 ? ' — peaks bahut tez the, isliye clip kiye bina itna hi badhaya' : '')
      }
      job.done(note ? note + ' ✅' : undefined)
      showResult(res, blobOf(r.files[out], fmt === 'mp3' ? 'audio/mpeg' : fmt === 'm4a' ? 'audio/mp4' : 'audio/wav'), baseName(S.file!.name) + (norm !== 'off' ? '-normalized' : '') + '.' + fmt, { kind: 'audio', note: (note ? note + ' · ' : '') + fmtTime(m.dur) })
    } catch (e) { job.fail(e) }
  })
}
