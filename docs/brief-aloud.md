# Brief aloud (ElevenLabs TTS)

Manager-only **Brief aloud** on the Ops **exec summary**. Short radio-style clip (~15–30s), played in Ops. Not a podcast. Not on the agent recommendation chip (v1).

WIND LIVE fill and deeper agent-key work stay parked.

## Acceptance (Design + QA)

Both bars are PR acceptance. Design wins on Viewer chrome: the control is **hidden**, not locked-grey.

| Bar | Rule |
| --- | --- |
| Design | One primary control on **Exec Summary only**. Label **Brief aloud**. No agent-rec control in v1. |
| Design | **Manager only.** Viewer never sees or can trigger it (hidden, not greyed half-working). |
| Design | Fail → muted/**SIM** on the control. Ops map/rail never break. |
| Design | Playing state: **Speaking…**. Click again to stop. |
| QA | Manager Brief aloud plays a **short** clip without blanking Ops. |
| QA | Viewer never sees the control. Stays out of the Viewer rail. |
| QA | Same `eventId` replay hits cache (no second ElevenLabs burn). |
| QA | Missing key / API fail → quiet SIM or muted control. No crash, no toast spam. |
| QA | Control only on Exec Summary. Shows **Speaking…** while playing. |

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
| `ELEVENLABS_API_KEY` | Worker **secret**. Cloudflare Prod uploads GitHub Actions secret `ELEVENLABS_API_KEY` onto Worker `aegisflow` (same list as Clerk / FIRMS / LLM keys). Empty → muted SIM. Local: `npx wrangler secret put ELEVENLABS_API_KEY` or `.env.local`. |
| `ELEVENLABS_VOICE_ID` | Optional Worker **secret** (same Cloudflare Prod upload). Jaime did not pick a voice, so the default is premade **Rachel** `21m00Tcm4TlvDq8ikWAM` (calm, all-plan ElevenLabs voice; good for a short radio brief). Override with Actions secret `ELEVENLABS_VOICE_ID`, Wrangler var, or `.env.local`. Unset/empty still resolves to Rachel in code. |
| `ELEVENLABS_MODEL_ID` | Optional Wrangler var. Default `eleven_flash_v2_5` (cheap/fast 15–30s clip). |

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

1. GitHub Actions secret `ELEVENLABS_API_KEY` is already on [jaime-sql/aegisflow](https://github.com/jaime-sql/aegisflow). Cloudflare Prod **must** upload it as Worker secret `ELEVENLABS_API_KEY` on `aegisflow` (same `wrangler-action` `secrets:` list as the other keys).
2. No preferred voice. Default is **Rachel** `21m00Tcm4TlvDq8ikWAM`. Optional override: Actions secret `ELEVENLABS_VOICE_ID` (also uploaded as a Worker secret) or Wrangler / `.env.local`. Browse ids in the [ElevenLabs Voices](https://elevenlabs.io/app/voice-library) dashboard.
3. Re-run **Actions → Cloudflare Prod** so the Worker secrets land.
4. Sign in as Manager on `/aegisflow/ops`. Exec summary shows **Brief aloud**. Viewer (`publicMetadata.role=viewer` or `/ops?role=viewer` in DEV bypass) must not show it.
