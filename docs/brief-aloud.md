# Brief aloud (ElevenLabs TTS)

Manager-only **Brief aloud** on the Ops **exec summary**. Short radio-style clip (~15–30s), played in Ops. Not a podcast. Not on the agent recommendation chip (v1).

WIND LIVE fill and deeper agent-key work stay parked.

## Product cut

| Rule | Behavior |
| --- | --- |
| Who | **Manager only.** Viewer never sees the control and cannot trigger the API (403). Hidden, not greyed half-working. |
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
| `ELEVENLABS_API_KEY` | Worker **secret**. Empty → muted SIM. Cloudflare Prod uploads GitHub Actions secret `ELEVENLABS_API_KEY`. Local: `npx wrangler secret put ELEVENLABS_API_KEY` or `.env.local`. |
| `ELEVENLABS_VOICE_ID` | Wrangler **var** / `.env`. Default **Rachel** `21m00Tcm4TlvDq8ikWAM`. Override with any voice id from the [ElevenLabs Voices](https://elevenlabs.io/app/voice-library) dashboard. |
| `ELEVENLABS_MODEL_ID` | Optional. Default `eleven_flash_v2_5`. |

CI unsets `ELEVENLABS_API_KEY`. Tests mock `fetch`. `npm test` must pass without an ElevenLabs account.

## Route

`GET` / `POST` `{basePath}/api/ops/brief-aloud?eventId=&region=`

- Clerk-protected like the rest of Ops (signed-in).
- Manager → `audio/mpeg`, or JSON `{ ok: false, sim: true, reason }` when the key is missing / upstream fails.
- Viewer → `403 { error: "manager_only" }` (no TTS call).
- Script is built server-side from the region exec summary. Clients cannot POST arbitrary text.

Header `X-AegisFlow-Tts`: `live` | `cache` | `sim`.

## Cache

Reuses the existing **WIND_CACHE** KV binding (no second namespace). Keys are `tts:evt_svwui_incident` / `tts:evt_aegisfire01_incident`. Envelope includes a text+voice+model hash so a summary change regenerates once.

Local `next dev` uses an in-process map when KV is unbound.

## Jaime

1. Create GitHub Actions secret `ELEVENLABS_API_KEY` on [jaime-sql/aegisflow](https://github.com/jaime-sql/aegisflow) (agents often lack `actions:write`).
2. Optional voice override: set Wrangler var `ELEVENLABS_VOICE_ID` (or `.env.local` for `next dev`).
3. Re-run **Actions → Cloudflare Prod** so the secret is uploaded to Worker `aegisflow`.
4. Sign in as Manager on `/aegisflow/ops`. Exec summary shows **Brief aloud**. Viewer (`publicMetadata.role=viewer` or `/ops?role=viewer` in DEV bypass) must not show it.
