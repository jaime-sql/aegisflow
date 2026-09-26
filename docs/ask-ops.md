# Ask Ops

**Ask** in the TopBar opens a slim drawer over the right rail. TopBar order is region picker, then **Tour**, then **Ask**. The map stays the primary view. Manager and Viewer can ask. Dispatch **Ack / Assign stays Manager-only**.

Ask answers only about the current Ops incident and how to use Ops (layers, lineage, roles, region, feeds, and Manager-only dispatch). It is not free-form web Q&A. Replies match the user's language: Spanish in, Spanish out; English in, English out. A greeting is one warm line plus an invite, not a topic block. An off-topic refusal is one short friendly line in the ask language, then the same four topics: `layers / lineage / roles / region·feeds`. That shape is also what the static FAQ returns, and a live model answer that comes back as the long English refusal is replaced with it. **Speak answer** reads only the latest Ask reply (whatever language it came back in). Brief aloud stays the exec-summary one-shot. There is no ElevenLabs conversational agent and no floating orb.

The Ask drawer composer is **[ES|EN] · Mic · text field · Ask**, left to right. The locale control is a 22px segmented chip: labels are only **ES** and **EN**, idle text is `#64748B`, and the active chip is fill `#1E2A40` with text `#E2E8F0`. There is no globe icon. The tooltip is `Idioma del micrófono` while ES is active and `Mic language` while EN is active. The demo default is **ES**. That choice is stored in `localStorage` (`aegisflow.askOps.micLocale.v1`). ES sets Web Speech `lang` to `es-SV`, and falls back to `es-ES` if the browser reports `language-not-supported`. EN sets `en-US` and English asks stay English. Switching the chip while Mic is listening stops recognition and restarts it in the new locale. Mic does not follow `navigator.language`. Mic itself stays a 32×32 ghost icon (`#94A3B8` idle, `#22D3EE` while listening) with `aria-label="Ask with voice"`. It uses the browser **Web Speech API** (speech-to-text, no extra key). A finished phrase fills the input and runs the same Ask path (`gpt-4o-mini` → DeepSeek → FAQ / SIM). Reply language follows the ask: any clear Spanish token (`necesito`, `explica`, `cómo`/`como`, `hola`, `funciona`, `que`, and a bare `me` when the rest of the line is not English) locks Spanish even when the line starts with `hey`. Typed English stays English. That voice-originated ask auto-Speaks the reply on the existing Speak path when the daily Speak cap allows. While TTS plays, the Speak control shows **Speaking…** with a cyan pulse (`#22D3EE`), then returns to Speak. A typed Ask does not auto-Speak; **Speak answer** stays manual on the latest reply. Listening is a cyan fill plus a 1.5s pulse ring, not a red recording chrome. Denied or unsupported Mic is muted, shows **SIM**, and a tooltip `Mic unavailable · type instead`. TTS failure stays muted **SIM**.

## Models

| Role | Id | Key |
| --- | --- | --- |
| Primary | OpenAI `gpt-4o-mini` | `OPENAI_API_KEY` (optional) |
| Backup | DeepSeek `deepseek-chat` | `DEEPSEEK_API_KEY` (optional) |
| Neither key, or both calls fail | Static FAQ / **SIM** | Ops stays up |

Context sent to the model each turn is a compact **Ask brief** (not a vector index and not a Notion corpus): the region exec summary, FIRMS / Wind honesty (`LIVE` vs `DEMO FIXTURE`, `Wind · LIVE` / `Wind · fallback` / `Wind · offline`), the Predicted cone when the map has one, up to 3 agent lines, and short Ops how-to snippets in Spanish and English. The baked-in help doc (`OPS_ASK_HELP`) stays in the system prompt.

Phrases such as “qué está pasando”, “explicame que esta pasando”, “cómo funciona esto”, “what's going on”, and “how does this work” answer from that brief in the ask language. A situation ask returns the live summary plus honesty lines. A how-it-works ask returns the Ops how-to (layers, lineage, roles, region·feeds). They do not fall through to the off-topic refusal, and they do not return the long English refusal wall. Mic stays browser Web Speech API; this path does not add ElevenLabs speech-to-text.

## Caps

| Action | Cap | At the cap |
| --- | --- | --- |
| Ask | **10** per browser session (session cookie `aegisflow_ask_n`) | Inline hint: `Session limit — 10 asks.` No toast. |
| Speak answer | **20** speaks per browser per UTC day, or **15,000** characters, whichever comes first (`aegisflow_speak_day`) | Speak disabled. Hint under the control: `Daily Speak limit · ~20`. No toast. Voice asks do not auto-Speak once the cap is hit. |

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
4. Ask “What is the capital of France?”. The reply stays inside Ops scope, in English. Ask “¿Cuál es la capital de Francia?” and the refusal is Spanish. Ask “hey” and the reply is a short English greeting. Ask “hola” or “can you speak Spanish?” and the reply is a short Spanish yes, not an English refusal.
5. With `OPENAI_API_KEY` set, a reply labels `gpt-4o-mini`. Stop the OpenAI call (or use a bad key) with `DEEPSEEK_API_KEY` set and the next reply labels `deepseek-chat`.
6. Ask 10 times in one browser session. The 11th shows `Session limit — 10 asks.` and does not toast.
7. On the latest reply, **Speak answer** plays audio when `ELEVENLABS_API_KEY` is set. Older replies have no Speak control. Brief aloud on the exec summary still play/stops on its own.
8. With the ElevenLabs key empty, Speak answer is muted **SIM**. After 20 speaks or 15,000 characters in a UTC day, Speak disables and shows `Daily Speak limit · ~20` under the control.
9. As Viewer (`/ops?role=viewer` on the dev bypass), Ask, Mic, and Speak work. Ack / Assign stay locked.
10. Composer order is **[ES|EN]**, then the ghost **Mic**, then the field, then **Ask**. Mic is not in the TopBar and not a floating orb. TopBar **Ask** still only opens the drawer.
11. Speak a question into Mic. The input fills, Ask runs, and the latest reply shows **Speaking…** (cyan pulse) when the Speak cap allows, including when that reply is in Spanish. A typed Ask returns text only (no auto-Speak).
12. Block the mic or use a browser without the Web Speech API. Mic is muted with **SIM** and tooltip `Mic unavailable · type instead`. Typed Ask still works.
13. Locale chips default to **ES** (`es-SV`, fallback `es-ES`). The active chip is fill `#1E2A40` / text `#E2E8F0`; idle text is `#64748B`. Tooltip is `Idioma del micrófono` on ES and `Mic language` on EN. **EN** uses `en-US`. The choice is remembered in localStorage. Switching chips mid-listen restarts speech recognition in the new locale. Ask `hey necesito que me expliques como funciona` and the reply is Spanish. Type `How do layers work?` and the reply stays English. An off-topic ask still refuses in one short line plus `layers / lineage / roles / region·feeds`, in the ask language. A voice ask still auto-Speaks.
14. Typed Spanish, keys or not: “explicame que esta pasando” returns a Spanish situation brief (region summary, FIRMS / Wind honesty, Predicted cone when the map has one, up to three agent lines) — not the short refusal and not an English wall. “como funciona esto” and “hola necesito que me explicas como funciona esto” return the Spanish Ops how-to. “what's going on” and “how does this work” stay English. “hey necesito que me expliques” stays Spanish. These situation and how-to replies are the brief itself (**SIM**), including when an LLM key is set. Mic audio stays the browser Web Speech API; this path does not add ElevenLabs speech-to-text.
