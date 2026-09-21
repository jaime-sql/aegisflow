# Ask Ops

**Ask** in the TopBar opens a slim drawer over the right rail. TopBar order is region picker, then **Tour**, then **Ask**. The map stays the primary view. Manager and Viewer can ask. Dispatch **Ack / Assign stays Manager-only**.

Ask answers only about the current Ops incident and how to use Ops (layers, lineage, roles, region, feeds). It is not free-form web Q&A. **Speak answer** reads only the latest Ask reply. Brief aloud is unchanged. There is no ElevenLabs conversational agent.

## Models

| Role | Id | Key |
| --- | --- | --- |
| Primary | OpenAI `gpt-4o-mini` | `OPENAI_API_KEY` (optional) |
| Backup | DeepSeek `deepseek-chat` | `DEEPSEEK_API_KEY` (optional) |
| Neither key, or both calls fail | Static FAQ / **SIM** | Ops stays up |

Context sent to the model: the region exec summary, up to 3 agent lines, and a short baked-in Ops help doc (`OPS_ASK_HELP`).

## Caps

| Action | Cap | At the cap |
| --- | --- | --- |
| Ask | **10** per browser session (session cookie `aegisflow_ask_n`) | Inline hint: `Session limit — 10 asks.` No toast. |
| Speak answer | **20** speaks per browser per UTC day, or **15,000** characters, whichever comes first (`aegisflow_speak_day`) | Speak disabled. Inline hint: `Daily limit`. No toast. |

Speak reuses the Brief aloud ElevenLabs path: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (default Rachel `21m00Tcm4TlvDq8ikWAM`), and `POST /v1/text-to-speech/{voice}`. Missing key or upstream failure → muted **SIM**, same as Brief aloud. The daily cap skips the ElevenLabs call.

Cloudflare Prod keeps the optional-secrets pattern in `scripts/select-worker-secrets.mjs`. Empty OpenAI, DeepSeek, and ElevenLabs values are not uploaded. No new required Worker secret.

## Routes

Under `basePath` `/aegisflow`:

- `POST /aegisflow/api/ops/ask`
- `POST /aegisflow/api/ops/ask-speak`

Local dev (empty `basePath`) uses `/api/ops/ask` and `/api/ops/ask-speak`.

## QA smoke

1. Open `/ops` locally, or `/aegisflow/ops` on the Worker path. TopBar order is region picker, then **Tour**, then **Ask**.
2. Open Ask. The map stays visible. Close with X, Escape, and a click on the map side.
3. With both LLM keys empty, ask “How do layers work?”. The reply is FAQ text and shows **SIM**. Ops does not blank.
4. Ask “What is the capital of France?”. The reply stays inside Ops scope (layers, lineage, roles, region, feeds).
5. With `OPENAI_API_KEY` set, a reply labels `gpt-4o-mini`. Stop the OpenAI call (or use a bad key) with `DEEPSEEK_API_KEY` set and the next reply labels `deepseek-chat`.
6. Ask 10 times in one browser session. The 11th shows `Session limit — 10 asks.` and does not toast.
7. On the latest reply, **Speak answer** plays audio when `ELEVENLABS_API_KEY` is set. Older replies have no Speak control. Brief aloud on the exec summary still play/stops on its own.
8. With the ElevenLabs key empty, Speak answer is muted **SIM**. After 20 speaks or 15,000 characters in a UTC day, Speak disables and shows `Daily limit`.
9. As Viewer (`/ops?role=viewer` on the dev bypass), Ask and Speak work. Ack / Assign stay locked.
