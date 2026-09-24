# Brief aloud (ElevenLabs TTS)

**Brief aloud** on the Ops **exec summary** is listen-only play/stop for **Manager and Viewer**. Short radio-style clip (~15–30s), played in Ops. Not a podcast. Not on the agent recommendation chip (v1). Dispatch **Ack / Assign stays Manager-only**. Ask Ops Mic / Speak answer is a separate Q&A path (same ElevenLabs key and voice, not this control).

WIND LIVE fill and deeper agent-key work stay parked.

## Acceptance (Design + QA)

Both bars are PR acceptance. Jaime + BA 2026-09-21: Viewer can hear the brief.

| Bar | Rule |
| --- | --- |
| Design | One primary control on **Exec Summary only**. Label **Brief aloud**. No agent-rec control in v1. |
| Design | **Listen-only** play/stop for Manager **and** Viewer. Dispatch Ack/Assign stays Manager-only. |
| Design | Fail → muted/**SIM** on the control. Ops map/rail never break. |
| Design | Playing state: **Speaking…**. Click again to stop. |
| QA | Manager and Viewer Brief aloud plays a **short** clip without blanking Ops. |
| QA | Viewer can play/stop. Viewer cannot Ack/Assign. |
| QA | Same `eventId` replay hits cache (no second ElevenLabs burn). |
| QA | Missing key / API fail → quiet SIM or muted control. No crash, no toast spam. |
| QA | Control only on Exec Summary. Shows **Speaking…** while playing. |

## Product cut

| Rule | Behavior |
| --- | --- |
| Who | **Manager and Viewer.** Listen-only play/stop. `canSpeakBrief` is true for both. Ack/Assign stays Manager-only. |
| Where | One primary control on Exec Summary. Label **Brief aloud**. |
| Fail | Missing `ELEVENLABS_API_KEY` or ElevenLabs error → quiet **SIM** / muted control. Ops map/rail never crash. |
| Play | **Speaking…** while the clip runs. Click again to stop. |
| Cache | Last clip per `eventId` in KV (`tts:<eventId>`). Cache hit does not re-call ElevenLabs. |

## Credits

Jaime’s ElevenLabs credits expire first (~2 days from the 2026-09-18 cut). Default model is **Flash v2.5** (`eleven_flash_v2_5`). Cache TTL is 7 days so Ops refresh does not burn characters.

## Env

Never commit the key. Copy [`.env.example`](../.env.example) to `.env.local`.

| Variable | Purpose |
| --- | --- |
| `ELEVENLABS_API_KEY` | Worker **secret**, **optional for Prod**. Cloudflare Prod uploads GitHub Actions secret `ELEVENLABS_API_KEY` onto Worker `aegisflow` **only when it is non-empty** (same skip-if-empty list as LLM keys). Empty/missing → muted SIM; the pipeline still deploys. Local: `npx wrangler secret put ELEVENLABS_API_KEY` or `.env.local`. |
| `ELEVENLABS_VOICE_ID` | Optional Worker **secret** (uploaded only when set). Jaime did not pick a voice, so the default is premade **Rachel** `21m00Tcm4TlvDq8ikWAM` via `wrangler.jsonc` (calm, all-plan ElevenLabs voice; good for a short radio brief). Override with Actions secret `ELEVENLABS_VOICE_ID`, Wrangler var, or `.env.local`. Unset/empty still resolves to Rachel in code. |
| `ELEVENLABS_MODEL_ID` | Optional Wrangler var. Default `eleven_flash_v2_5` (cheap/fast 15–30s clip). |

CI unsets `ELEVENLABS_API_KEY`. Tests mock `fetch`. `npm test` must pass without an ElevenLabs account.

## Route

`GET` / `POST` `{basePath}/api/ops/brief-aloud?eventId=&region=`

- Clerk-protected like the rest of Ops (signed-in).
- Manager **and** Viewer → `audio/mpeg`, or JSON `{ ok: false, sim: true, reason }` when the key is missing / upstream fails.
- Script is built server-side from the region exec summary. Clients cannot POST arbitrary text.

Header `X-AegisFlow-Tts`: `live` | `cache` | `sim`.

## Cache

Reuses the existing **WIND_CACHE** KV binding (no second namespace). Keys are `tts:evt_svwui_incident` / `tts:evt_aegisfire01_incident`. Envelope includes a text+voice+model hash so a summary change regenerates once.

Local `next dev` uses an in-process map when KV is unbound.

## Jaime

1. GitHub Actions secret `ELEVENLABS_API_KEY` is already on [jaime-sql/aegisflow](https://github.com/jaime-sql/aegisflow). Cloudflare Prod uploads it as Worker secret `ELEVENLABS_API_KEY` on `aegisflow` **when the Actions secret is non-empty**. Empty OpenAI / DeepSeek / Modal keys must not block that upload — they are skipped. If ElevenLabs is empty, Brief aloud stays muted **SIM** and deploy still succeeds.
2. No preferred voice. Default is **Rachel** `21m00Tcm4TlvDq8ikWAM`. Optional override: Actions secret `ELEVENLABS_VOICE_ID` (also uploaded as a Worker secret) or Wrangler / `.env.local`. Browse ids in the [ElevenLabs Voices](https://elevenlabs.io/app/voice-library) dashboard.
3. Re-run **Actions → Cloudflare Prod** so the Worker secrets land.
4. Sign in as Manager **or** Viewer on `/aegisflow/ops`. Exec summary shows **Brief aloud** (play/stop). Viewer (`publicMetadata.role=viewer` or `/ops?role=viewer` in DEV bypass) can hear the brief; Ack/Assign stays locked.
