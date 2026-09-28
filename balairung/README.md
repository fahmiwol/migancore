# Balairung

The MiganCore Jarvis command hall — a self-hosted, privacy-first executive AI dashboard. Next.js + Tailwind + Three.js. Zero vendor dependency (our own vault/motion, no Obsidian cloud, no motionsites service).

> Codenames follow `../docs/jarvis/PRIMBON_LEXICON.md`. The Primbon is law.

## Run
```bash
cd balairung
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_BRAIN_URL to your MiganCore brain
npm run dev                  # http://localhost:3000
```

## Modules (Primbon → code)
| Sandi | File | Role |
|-------|------|------|
| Balairung | `app/page.tsx` | the dashboard / command hall |
| Rupa | `components/Rupa.tsx` | particle-face hologram avatar (→ MediaPipe FaceMesh from photo) |
| Lisan | `components/Lisan.tsx` | voice + command bar (STT/TTS) |
| Sasmita | `components/Sasmita.tsx` | social listening + sentiment |
| Pusaka | `components/Pusaka.tsx` | HUD glass panel |
| Denyut | `components/Denyut.tsx` | motion layer (Lenis smooth scroll; + GSAP later) |
| Khazanah | _(planned)_ `components/khazanah/` | local-first knowledge vault (markdown + backlinks + graph) |
| brain client | `lib/migancore.ts` | talks to MiganCore `/v1` only (Amanah: no third-party) |

## Stack (zero-dependency adoption)
- **Vault (our Obsidian):** unified/remark + `@portaljs/remark-wiki-link` + gray-matter + react-force-graph + Orama + existing Qdrant.
- **Motion (our motionsites):** Lenis + GSAP + Motion (Framer) + React-Three-Fiber + postprocessing.
- **Avatar:** Three.js particles; photo→face via MediaPipe FaceMesh (gated by Wasiat consent).
- **Voice:** Web Speech (proto) → faster-whisper / ElevenLabs.

## Status
Scaffold (M0). Next: `npm install`, wire `lib/migancore.ts` SSE to the real `/v1/chat`, build Khazanah, real Sasmita via Bright Data. See `../docs/jarvis/02_SPRINT_PLAN.md`.
