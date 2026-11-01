# AGENTS.md — ClipKit

Instructions for AI coding agents (Codex, OpenCode, Cursor, Claude Code, Copilot, etc.) working in this repo.
Owner: Anish (HEYYANIXX) · github.com/heyyanixx. Talk to him in simple English or Hinglish.

## What this repo is

ClipKit is a free **in-browser video helper** (silence cut, auto captions, reframe, compress, thumbnail, MP3/loudness). Everything runs on the user's device; **no upload, no signup, no paid API**. Keep it that way.
- **TypeScript + Vite 8**, no UI framework. Entry `src/main.ts`, tools in `src/tools/*.ts`, video engine `src/ff.ts` (ffmpeg.wasm 0.12), captions `src/asr.worker.ts` (Whisper via `@huggingface/transformers`, in a Web Worker).
- ffmpeg core and ONNX wasm load at runtime from jsDelivr/unpkg with **pinned versions**. Keep the versions pinned and the fallback CDN.

## Build, test, deploy

- Install: `npm ci` · Dev: `npm run dev` · Build: `npm run build` (output `site/`, git-ignored).
- E2E (optional, needs Python Playwright + ffmpeg): `bash test/make-media.sh` then `npm run build && npm run preview`, then `python3 test/e2e.py http://127.0.0.1:8795/ test/out`.
- **Every push to `main` deploys to GitHub Pages** (`.github/workflows/pages.yml`: `npm ci` + `npm run build`). Run `npm run build` locally before pushing; a broken build means a broken deploy.
- Don't edit `.github/workflows/`, `vite.config.ts`, or `package.json` unless the task is about the build.

## Project rules (ECC TypeScript + web rules, adapted)

- TypeScript: no `any` unless unavoidable (comment why); type function inputs/outputs; prefer `const` and returning new objects over mutating shared state.
- Heavy work (ffmpeg, Whisper) stays off the main thread. Show progress, allow cancel, and always free memory (revoke object URLs, delete ffmpeg FS files) after a job.
- Phones are the main target: keep 720p paths working, warn on big files, never block the UI.
- Be honest in UI and README about limits (Hindi accuracy, speed). No fake claims.
- Privacy is the product: never add analytics, trackers, or any request that sends the user's video or text anywhere.
- Look: black `#060608` + gold `#e3b65a`, Poppins / Noto Sans Devanagari (already bundled).

## Security (always)

Adapted from ECC `rules/common/security.md` + `rules/web/security.md`.

Before every commit, check:
- No secrets in the repo: no API keys, passwords, tokens, keystores (`*.jks`, `*.keystore`), `.env` files, or private URLs with tokens in them. If one slipped in, stop, remove it, and tell the owner to **rotate** it (deleting the commit is not enough; Git history keeps it).
- Secrets live only in GitHub Actions secrets or a local `.env` that is git-ignored. Never print a secret in logs, code comments, README, or screenshots.
- This is a **static / client-side** project: everything shipped to the browser is public. Never put a real API key in client JS. Any paid API (AI, payments) must go through a server or proxy you control.
- Never add the owner's phone number, home address, or other private details anywhere in the repo.
- Escape user input before putting it in HTML. Avoid `innerHTML` / `dangerouslySetInnerHTML` with user data; prefer `textContent`.
- External links use `rel="noopener"`. Third-party scripts only when really needed; pin the version.
- Error messages shown to users must not leak internal details.
- Add a dependency only if it is needed, maintained, and MIT/Apache/BSD-style licensed; note it in the README or notices.

## How to work (ECC workflow, short version)

Adapted from ECC `rules/common/development-workflow.md`, `coding-style.md`, `git-workflow.md`.

1. **Read first.** Read the files you will touch and the README before changing anything. Reuse what exists before writing new code.
2. **Plan small.** For anything bigger than a one-line fix, write a short plan (files to change, risks) and wait for the owner's OK.
3. **Keep it simple** (KISS, DRY, YAGNI). Small functions (< ~50 lines), small focused files, early returns instead of deep nesting, named constants instead of magic numbers, handle errors explicitly (never swallow them silently).
4. **Validate input** at the edges (forms, URL params, files the user drops in).
5. **Test before you say "done"** (commands below). If you could not test something, say so plainly.
6. **Review your own diff** before committing: only the files the task needs, nothing generated, no secrets, no debug logs.
7. **Commit message** in conventional format: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `refactor: ...`, `test: ...`, `ci: ...`.
8. Don't rewrite or reformat code that the task doesn't need. Don't add features that weren't asked for.
---

Rules adapted from [ECC (Everything Claude Code)](https://github.com/affaan-m/ECC) by Affaan Mustafa, MIT License (commit `b38be6a`). Only a small subset is used here; for the full skill/agent pack install ECC into your own coding tool (see ECC's README).
