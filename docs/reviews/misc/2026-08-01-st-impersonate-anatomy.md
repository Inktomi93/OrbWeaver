# SillyTavern impersonate — full anatomy (reference recon, 2026-08-01)

**Source:** local checkout `~/inktomi-stack/SillyTavern` @ `380e31e8` (current dev tip). Scouted
read-only with file:line receipts; comparison reference for orbweaver's `chat.impersonateStream`
design. Mechanics only — no design verdicts here.

## The shape

ONE generation pipeline (`Generate('impersonate')`); the special-casing is at the edges:

- **Prompt side (chat-completion):** a system message `identifier:'impersonate'` from the
  `impersonation_prompt` setting (default: "Write your next reply from the point of view of
  {{user}}… Don't write as {{char}}…") — `openai.js:104,1223,1370`. Instruct mode swaps the
  prompt name to the USER (`script.js:5038`); `force_name2` disabled (`4586`).
- **Anti-bleed is TWO LAYERS:** (1) `\n{{char}}:` becomes a STOP STRING (`getStoppingStrings`,
  `script.js:3010`; group chats stop on every member's name, `3018-3029`; chat-completion APIs skip
  built-in stops — custom only, `3001`); (2) `cleanUpMessage` DELETES the response if it starts
  with the character's name (`wrongName`, `6472-6489`) and strips matching stop-string tails
  char-by-char per tick (`6443`).
- **Sink:** per tick, cleaned text → `sendTextarea.value` + bubbling `input` event
  (`3617-3651`); start CLEARS the existing draft (`3603`); no message row ever created; completion
  fires `IMPERSONATE_READY` instead of the message-received events (`3775`); nothing persists.
- **Lifecycle:** the SAME module-level abortController + stop button + `is_send_press` lock as any
  generation (`629,5581,12103`); typing mid-stream is overwritten each tick.
- **Suppression lists:** tool calls, multi-swipe extraction, and the OAI group nudge are all
  excluded for `type === 'impersonate'` via four separate literal arrays
  (`tool-calling.js:685`, `openai.js:2740,898`, `script.js:6355`).
- **Claude quirk:** impersonate uses a DEDICATED assistant-prefill setting
  (`assistant_impersonation`, `openai.js:2825-2834`) distinct from the general prefill.
- **Groups:** `activateImpersonate` picks one RANDOM member as the framing context
  (`group-chats.js:1114`); auto-continue disabled in groups entirely (`script.js:5758`).

## Orbweaver cross-reference (as of `24989143` + local merges)

| ST mechanic | Orbweaver status |
| - | - |
| tool-call suppression on impersonate | ✓ equivalent by construction — terminal tools thread ONLY through executeTurn (D112 (5)) |
| separate event vocabulary (IMPERSONATE_READY) | ✓ equivalent — dedicated non-persisting subscription, never a message event |
| shared abort/stop lifecycle | ✗ was the gap — dedicated subscription needs managed lifecycle (the zombie-sub lane, in flight, wires the unsubscribe handle as the cancel lever) |
| char-name stop strings + wrong-name delete | ✓ BUILT (IMP-1, measured first) — `\n{{char}}:` stops per present cast member on the impersonate request (`foreignLabelStops`, one grammar with the receive-side truncate) + the fill-seam clean re-configured so an impersonate draft's "self" is the PERSONA and the whole cast is foreign (it previously stripped a leading `Seren:` off a line Seren wrote, LAUNDERING the bleed). **The measurement is the real finding:** the nudge holds 0/12 hosted and fails 10/36 (28%) on the local 8B, and ~all of that bleed is UNLABELLED first-person takeover that NEITHER ST layer can see. `scripts/probes/impersonate/RESULTS.md`. |
| per-tick cleanup before the sink | verify-item already on the zombie-sub lane |
| draft cleared at start vs preserved | deliberate divergence — ours keeps partial fill on cancel (review-flow UX); ST clears + overwrites |
| dedicated Claude impersonate prefill | park — preset territory, evaluate with the preset program |

**IMP-1 — CLOSED (2026-07-31), with one item left open.** The second layer was measured first and then
built: [`scripts/probes/impersonate/RESULTS.md`](../../../scripts/probes/impersonate/RESULTS.md). What the
layer removed is the LAUNDERING (2/36 generations), not the bleed rate — the wire stop never fired in 84
generations. STILL OPEN: ~28% of local-8B impersonate drafts are the character's voice with NO mechanical
tell, which is a prompt (or model-choice, or review-UI) problem, not a scrub one.

## Not covered

ST server-side (`src/`), third-party extension hooks on IMPERSONATE_READY, mobile wiring,
stability-across-versions.
