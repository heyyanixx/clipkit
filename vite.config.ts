import { defineConfig, type Plugin } from 'vite'
// ONNX Runtime wasm is fetched from jsDelivr at runtime (see src/asr.worker.ts), so the bundled copy is dropped.
const dropOrtWasm = (): Plugin => ({
  name: 'drop-ort-wasm',
  generateBundle(_o, bundle) { for (const k of Object.keys(bundle)) if (/ort-wasm.*\.(wasm|mjs)$/.test(k) && /\.wasm$/.test(k)) delete bundle[k] },
})
export default defineConfig({
  base: './',
  plugins: [dropOrtWasm()],
  worker: { format: 'es', plugins: () => [dropOrtWasm()] },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  build: { outDir: 'site', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1500 },
})
