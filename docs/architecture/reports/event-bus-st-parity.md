# Event-bus parity audit — orbweaver vs SillyTavern (`event_types`)

> **Status: RESOLVED → ledger D50 (2026-06-28).** Acted on: `chatOpened` + `worldInfoActivated` added to
> `ChatBusEvent` (+ the `chat_events` CHECK regenerated into the squashed `0000_baseline`); `speakerCharacterId`
> added to `turnStarted`. **#4 (`character.deleted`/`asset.deleted`) REJECTED** — orbweaver evicts derived
> rows by FK `ON DELETE CASCADE`, so an eviction event would be a racy duplicate (boundaries-are-physics, not
> ST's event-driven eviction). Macros confirmed NOT event-driven (zero bus work). The prompt-mutation
> interceptor seam is recorded as a separate ordered `PromptTransform` pipeline step, NOT a bus event. The
> findings below are the evidence base for D50.
>
> **Status: PARITY AUDIT (2026-06-28).** Does orbweaver's planned event taxonomy cover every event the
> SillyTavern macro / STscript / Quick-Reply / extension layer actually hooks? Scope is the **automation
> surface** D46 Tier-1 (`on <event> where <predicate> do <action>`) and the D46 Tier-2 plugin host consume:
> the **closed, server-side, id-only** `ChatBusEvent` + `DomainEvent` unions. References:
> ledger **D46** (`reports/DECISIONS-LEDGER.md`), `proposals/scripting-automation-extensibility.md` §5.
>
> **Why this is born-compliant-before-Phase-5:** these events freeze into the `chat_events` table + the
> closed `ChatBusEvent`/`DomainEvent` unions. Widening the union *after* Phase 5 wires triggers to it is the
> exact retrofit D46 calls out ("chat events as a typed id-only closed union" is a pre-Phase-5 deliverable).
> The point of this audit is to land the union **complete** before chat is built.

---

## 1. orbweaver's current event surface (the baseline)

### `ChatBusEvent` — `packages/contracts/src/chat/index.ts` (~L368), persisted to `chat_events` with a per-chat `seq` replay cursor

Grouped:

- **Streaming:** `delta` (text|reasoning).
- **Canon mutations (carry `view?: MessageView`, the no-refetch carrier):** `messageCommitted`,
  `messageEdited`, `variantSelected`, `messagesDeleted`, `messagesReordered`, `reasoningEdited`,
  `reasoningCleared`, `reasoningStreamDone`.
- **Turn lifecycle (the explicit extensibility seam):** `turnStarted` (`intent: send|swipe|continue|generate|impersonate`, `api`, `source`, `model`, `targetMessageId`), `turnCompleted`, `turnAborted` (`reason: user|error|stale`).
- **Persona:** `personaSwitched` (per-participant active persona; `from`/`to`).
- **World-info (embedded `WiBusEvent` from `#world-info`):** `wiBookAttached`, `wiBookDetached`, `wiEntryAttached`, `wiEntryDetached`, `wiEntryScopeChanged` — all `surface: "chat"`, attachment-only (book/entry CONTENT edits are NOT here).
- **Chat existence:** `chatCreated`, `chatDeleted`.
- **Resume control (subscription-synthesized, never logged):** `historyTruncated`.
- **Catch-all (low-payload row changes — star/archive/title/variables/injections/compact):** `chatUpdated`.

Bus-payload allowlist is type-level: every member is branded ids + enum literals + scalars + `MessageView`;
no `unknown`/`Record`/index field, so secrets are **unrepresentable** (`.contract.test` pins it). No member
carries a caller id (D19 — attribution lives on the turn path). `CHAT_BUS_EVENT_TYPES satisfies
Record<ChatBusEvent["type"], true>` keeps the replay guard exhaustive.

### `DomainEvent` — `packages/contracts/src/events/index.ts` (in-process bus, D38)

- `character.updated` (CharacterId) — indexer re-embeds card-text.
- `asset.created` (AssetId) — indexer embeds both image lenses.

Closed, id-only; the subscriber **re-reads canon by id**, never trusting event-carried data. Emitted via an
injected `EmitDomainEvent` op (composition root), wired at `entry/compose/event-bus.ts`.

---

## 2. Are ST MACROS event-driven? — No (substitution-time, one tiny exception)

ST macros (`public/scripts/macros.js`, `MacrosParser.registerMacro`) are **expansion-time substitution**:
`{{char}}`/`{{user}}`/`{{roll}}`/`{{getvar}}` resolve when `substituteParams` walks a string during prompt
assembly. They are NOT subscribers to `eventSource`. The macro engine has exactly **two** `eventSource.on`
calls in the whole file, and both exist only to cache one scalar for one macro: `{{lastGenerationType}}`
listens to `GENERATION_STARTED` (record the type) and `CHAT_CHANGED` (reset it). That is a value cache, not
an event-driven engine.

**Implication:** macros need NO event-bus parity. orbweaver's `kit/macro` (already ahead on determinism +
DoS bounding per D46) is the right home, and its env-by-reference resolution at assembly time is the
equivalent of ST's substitution. The event surface that matters for parity is **STscript / Quick-Reply
event-triggers + extension `eventSource.on` subscribers** — that is what §3–§5 map.

---

## 3. The full mapping table (ST `event_types` → orbweaver disposition)

`event_types` has ~85 entries. Disposition: **COVERED** (maps to an existing member), **GAP**
(automation-relevant, no equivalent — actionable), **N/A** (client-DOM/UI, credential, or D49-rejected),
**HOOK** (a *mutating* pre-send interceptor, NOT a fire-and-forget event — see §6).

| ST event | Category | Disposition | Maps to / note |
|---|---|---|---|
| `MESSAGE_SENT` | chat lifecycle | **COVERED** | `messageCommitted` (role=user) |
| `MESSAGE_RECEIVED` | chat lifecycle | **COVERED** | `messageCommitted` (role=assistant) |
| `USER_MESSAGE_RENDERED` | render (DOM) | **COVERED** | `messageCommitted`; render≠commit is client-only |
| `CHARACTER_MESSAGE_RENDERED` | render (DOM) | **COVERED** | `messageCommitted`; heaviest extension hook (expressions/regex post-process) — server equiv is commit |
| `MESSAGE_EDITED` | chat lifecycle | **COVERED** | `messageEdited` |
| `MESSAGE_UPDATED` | chat lifecycle | **COVERED** | `messageEdited` (post-edit commit) |
| `MESSAGE_DELETED` | chat lifecycle | **COVERED** | `messagesDeleted` |
| `MESSAGE_SWIPED` | chat lifecycle | **COVERED** | `variantSelected` (flip to existing) + `turnStarted{intent:swipe}`/`turnCompleted` (swipe-generate) |
| `MESSAGE_SWIPE_DELETED` | chat lifecycle | **COVERED** | `variantSelected` re-emits the surviving view (a variant delete repoints the slot); `messageEdited` view carries `variantCount` |
| `MESSAGE_REASONING_EDITED` | chat lifecycle | **COVERED** | `reasoningEdited` |
| `MESSAGE_REASONING_DELETED` | chat lifecycle | **COVERED** | `reasoningCleared` |
| `STREAM_TOKEN_RECEIVED` (+`SMOOTH_…` alias) | generation | **COVERED** | `delta{kind:text}` |
| `STREAM_REASONING_DONE` | generation | **COVERED** | `reasoningStreamDone` |
| `GENERATION_STARTED` | generation | **COVERED** | `turnStarted` |
| `GENERATION_ENDED` | generation | **COVERED** | `turnCompleted` |
| `GENERATION_STOPPED` | generation | **COVERED** | `turnAborted{reason:user}` |
| `IMPERSONATE_READY` | generation | **COVERED** | `turnCompleted{intent:impersonate}` (impersonate result; orbweaver's `TurnIntent` includes `impersonate`) |
| `CHAT_CREATED` / `GROUP_CHAT_CREATED` | chat existence | **COVERED** | `chatCreated` (solo=degenerate group, D16 — one event) |
| `CHAT_DELETED` / `GROUP_CHAT_DELETED` | chat existence | **COVERED** | `chatDeleted` |
| `CHAT_RENAMED` | chat existence | **COVERED** | `chatUpdated` (title is a low-payload row change) |
| `PERSONA_CHANGED` | persona | **COVERED** | `personaSwitched` (per-chat active persona) |
| `WORLDINFO_*` attach/detach (implicit) | world-info | **COVERED** | `wiBookAttached/Detached`, `wiEntryAttached/Detached`, `wiEntryScopeChanged` |
| `CHARACTER_EDITED` / `CHARACTER_RENAMED` / `CHARACTER_DUPLICATED` | character | **COVERED** | `DomainEvent character.updated` |
| **`CHAT_CHANGED`** | chat lifecycle / nav | **GAP** | proposal's flagship trigger ("on chat open, set POV") has no member — see §5 #1 |
| **`WORLD_INFO_ACTIVATED`** | generation/WI | **GAP** | "which lore entries fired this turn" — QR+expressions hook it; only `AssembleTrace` (debug) exists — see §5 #2 |
| **`GROUP_MEMBER_DRAFTED`** | group arbitration | **GAP** | speaker chosen before generation; `turnStarted` carries NO speaker id — see §5 #3 |
| **`CHARACTER_DELETED`** | character | **GAP** | no `DomainEvent character.deleted` → indexer can't evict embeddings — see §5 #4 |
| `GENERATION_AFTER_COMMANDS` | generation | **COVERED**(+HOOK) | fire-and-forget side = `turnStarted`; the "still mutate input before assembly" side = the §6 interceptor seam |
| `GENERATE_BEFORE_COMBINE_PROMPTS` | prompt assembly | **HOOK** | mutating pre-send — §6, NOT a bus event |
| `GENERATE_AFTER_COMBINE_PROMPTS` | prompt assembly | **HOOK** | mutating pre-send — §6 |
| `GENERATE_AFTER_DATA` | prompt assembly | **HOOK** | mutating wire-data — §6 |
| `CHAT_COMPLETION_PROMPT_READY` | prompt assembly | **HOOK** | the big one — extensions rewrite the final prompt array — §6 |
| `CHAT_COMPLETION_SETTINGS_READY` / `TEXT_COMPLETION_SETTINGS_READY` | prompt assembly | **HOOK**/N-A | mutate gen params pre-send (text-completion family is D49 by-design-out) |
| `WORLDINFO_FORCE_ACTIVATE` | world-info | N/A (action) | a script *action* (force an entry), not a trigger → a D46 Tier-1 action, not an event |
| `SETTINGS_UPDATED` | settings | GAP (LOW) | no server settings-changed event; low automation demand — see §5 #5 |
| `GROUP_UPDATED` | group/roster | GAP (LOW)/COVERED | roster/config change ≈ `chatUpdated`; a discrete `rosterChanged` (member joined/left) is reserved-additive — see §5 #5 |
| `WORLDINFO_UPDATED` | world-info | GAP (LOW) | WI *book content* edit (vs attach); `DomainEvent worldinfo.updated` if WI ever gets embedded — §5 #5 |
| `PRESET_CHANGED/DELETED/RENAMED(_BEFORE)` | preset | N/A (LOW) | preset CRUD; `DomainEvent preset.updated` only if a subscriber appears — reserved-additive |
| `PERSONA_CREATED/UPDATED/RENAMED/DELETED` | persona | N/A | persona CRUD; no indexer/automation subscriber — re-read on demand |
| `CONNECTION_PROFILE_LOADED/CREATED/DELETED/UPDATED` | connection/settings | N/A | client connection-profile UI; server connection domain re-reads |
| `TOOL_CALLS_PERFORMED` | tool use | GAP (LOW) | D48 owns the loop; tool calls persist on the variant — an "on tool call" trigger is reserved-additive, not pre-Phase-5 |
| `TOOL_CALLS_RENDERED` | render | N/A | DOM render of tool cards |
| `SD_PROMPT_PROCESSING` / `IMAGE_SWIPED` | imagery | N/A | D49 `domain/imagery` (mutate-the-SD-prompt hook lives there, not the chat bus) |
| `FORCE_SET_BACKGROUND` | theming | N/A | D49 — background is a `ThemeOverride` token, not an event |
| `MESSAGE_FILE_EMBEDDED` / `FILE_ATTACHMENT_DELETED` / `MEDIA_ATTACHMENT_DELETED` | databank | N/A (deferred) | D49 databank graft; its own events land with that leaf |
| `TTS_JOB_STARTED/AUDIO_READY/JOB_COMPLETE` | tts | N/A | D49 by-design-out (no audio transport) |
| `EXTRAS_CONNECTED` / `ONLINE_STATUS_CHANGED` / `MAIN_API_CHANGED` / `CHATCOMPLETION_SOURCE_CHANGED` / `CHATCOMPLETION_MODEL_CHANGED` | connection/UI | N/A | client connection state; no server bus meaning |
| `SECRET_WRITTEN/DELETED/ROTATED/EDITED` | credentials | N/A (by design) | the credential firewall — these are precisely what orbweaver's bus-payload allowlist BANS from a bus |
| `APP_INITIALIZED`/`APP_READY`/`EXTENSIONS_FIRST_LOAD`/`EXTENSION_SETTINGS_LOADED`/`SETTINGS_LOADED(_BEFORE/_AFTER)`/`CHAT_LOADED`/`MORE_MESSAGES_LOADED` | app/UI | N/A | client lifecycle/DOM; no server-side meaning |
| `MOVABLE_PANELS_RESET`/`CHARACTER_EDITOR_OPENED`/`CHARACTER_PAGE_LOADED`/`CHARACTER_GROUP_OVERLAY_STATE_CHANGE_*`/`CHARACTER_FIRST_MESSAGE_SELECTED`/`CHARACTER_MANAGEMENT_DROPDOWN`/`OPEN_CHARACTER_LIBRARY`/`WORLDINFO_SETTINGS_UPDATED`/`WORLDINFO_ENTRIES_LOADED` | UI/DOM | N/A | pure client-DOM panel/editor events |
| `OAI_PRESET_*`/`ITEMIZED_PROMPTS_*` | UI | N/A | preset-export/token-itemizer UI |
| `WORLDINFO_SCAN_DONE` | WI | N/A | covered by `AssembleTrace` (debug surface), not an automation trigger |
| `GROUP_WRAPPER_STARTED/FINISHED` | group internal | N/A | ST's internal group-turn-loop bracketing; orbweaver's loop is server-internal |
| `CHARACTER_RENAMED_IN_PAST_CHAT` | data migration | N/A | a one-shot data-fix, not a trigger |

---

## 4. ST MACROS — restated finding

Confirmed in §2: ST macros are **substitution-time**, not event subscribers (one scalar-cache exception).
**No macro parity work is required on the event bus.** Macro parity is the `kit/macro` engine + DX layer
(D46), entirely separate from this audit.

---

## 5. The GAP list — actionable born-compliant additions (ranked by real automation dependence)

Each is id-only, re-read-canon, and named per the closed-union discipline. Ordered by how much real ST
automation depends on it.

1. **`chatOpened` — HIGH — add to `ChatBusEvent`.** Payload: `{ type: "chatOpened"; chatId: ChatId }`.
   The proposal's headline Tier-1 example ("on chat open, set POV") and ST's most-subscribed automation
   trigger (`CHAT_CHANGED`, 7+ extension subscribers incl. Quick-Reply's `onChatChanged`) have **no
   equivalent**. `chatCreated` fires once at birth; this is the recurring "this chat became the active
   context for a participant" signal. Treat it like `historyTruncated` — **subscription-synthesized** when a
   participant's stream attaches to a chat (server-side, not a client nav echo), so it is honestly a
   server event, not a DOM relay. Without it, the single most common ST automation pattern cannot be
   written. **This is the one true must-land gap.**

2. **`worldInfoActivated` — MEDIUM-HIGH — add to `ChatBusEvent`.** Payload:
   `{ type: "worldInfoActivated"; chatId: ChatId; entryIds: WorldEntryId[] }`. ST's `WORLD_INFO_ACTIVATED`
   is the "these lore entries fired this turn" signal Quick-Reply and the expressions extension hook to
   react to lore. orbweaver computes exactly this in `AssembleTrace.matchedKeys`/`wiTrace` but only as a
   debug payload — there is no bus trigger. id-only is clean (the entry ids; the subscriber re-reads
   contents). Enables "when lore entry X activates, do Y" — a genuine power-user pattern.

3. **Speaker identity on `turnStarted` (or a `speakerDrafted` event) — MEDIUM — amend `ChatBusEvent`.**
   ST's `GROUP_MEMBER_DRAFTED` (Quick-Reply's `onGroupMemberDraft`) fires when arbitration picks the next
   speaker, *before* generation. orbweaver's `turnStarted` carries `intent/api/source/model/targetMessageId`
   but **no speaker character id** — so "when it's X's turn, inject Y" is unwritable. Cheapest fix: add
   `speakerCharacterId: CharacterId | null` to `turnStarted` (null for user/narrator turns). Avoids a new
   member; folds the drafted-speaker signal into the turn it belongs to. (A separate `speakerDrafted` is
   only warranted if automation must run *between* draft and assembly — that overlaps the §6 hook seam.)

4. **`character.deleted` (+ `asset.deleted`) — MEDIUM — add to `DomainEvent`.** Payloads:
   `{ type: "character.deleted"; characterId }`, `{ type: "asset.deleted"; assetId }`. The indexer has
   `character.updated`/`asset.created` but **no deletion counterpart** — embeddings for a deleted card/asset
   are never evicted (an indexer-correctness gap more than an automation one, but it freezes into the same
   closed union, so land it now). ST tracks both (`CHARACTER_DELETED`, `MEDIA_ATTACHMENT_DELETED`).

5. **LOW / reserved-additive (note, don't necessarily land pre-Phase-5):**
   - `settings.updated` / `preset.updated` (`DomainEvent`) — ST `SETTINGS_UPDATED`/`PRESET_CHANGED`; no
     orbweaver subscriber today, re-read on demand. Add when a real subscriber appears.
   - `rosterChanged` (`ChatBusEvent`) — discrete member joined/left (ST `GROUP_UPDATED`). `chatUpdated`
     covers the coarse case today; promote to a dedicated member if member-presence automation lands.
   - `worldinfo.updated` (`DomainEvent`) — WI *book content* edit; only matters if WI entries become an
     embedding lens (they aren't currently).
   - `toolCallPerformed` (`ChatBusEvent`) — ST `TOOL_CALLS_PERFORMED`; D48 owns the loop and persists on
     the variant, so an "on tool call" trigger is reserved-additive, not pre-Phase-5.

---

## 6. The pre-send interceptor / prompt-mutation seam — NOT an event (called out separately)

A cluster of ST "events" are **mutating pre-send hooks**, fundamentally different from a fire-and-forget
bus event — they hand the extension the chat/prompt and let it **rewrite or abort** before send:

- **Extension interceptors** (`generate_interceptor` manifest field → `runGenerationInterceptors`,
  `extensions.js:2024`, invoked at `script.js:4537`): each gets `(chat, contextSize, abort, type)` and may
  **mutate `chat` in place or set `abort`**. The Vectors and Stable-Diffusion extensions ship one.
- **`setExtensionPrompt(key, value, position, depth, …)`** (`script.js:8899`): registers prompt text the
  assembler splices at a position/depth.
- **Regex** (`getRegexedString`, `regex_placement.*`): rewrites user input / AI output / reasoning around
  send and render.
- **`GENERATE_BEFORE/AFTER_COMBINE_PROMPTS`, `GENERATE_AFTER_DATA`, `CHAT_COMPLETION_PROMPT_READY`,
  `CHAT_COMPLETION_SETTINGS_READY`**: emitted with a mutable payload the listener edits in place.

**These must NOT be modeled as `ChatBusEvent` members.** orbweaver's bus is id-only and re-read-canon — a
member literally cannot carry the mutable prompt buffer (the allowlist makes it unrepresentable), and a
fire-and-forget subscriber cannot block/rewrite the turn. The correct homes already exist in the
architecture and D46:

- **`kit/injection`** (`InjectionPlacement {depth, role}`) + `ChatInjection`/`chat_injections` — the
  declarative "splice text at a position/depth" surface = ST's `setExtensionPrompt`.
- **The assembly pipeline** (`AssembleContext` → BUILD/SHAPE in `domain/chat`) — the deterministic ordered
  place where overrides/sections/WI resolve = ST's `*_COMBINE_PROMPTS`/`PROMPT_READY`.
- **D46 Tier-1 actions** ("run a macro template over the draft", "insert a world-info entry") and **Tier-2**
  (a sandboxed transform under `can()`) — the *governed* mutation path, capability-checked + budgeted,
  unlike ST's any-extension-mutates-anything model.

**Recommendation:** keep prompt mutation entirely out of the event union; document that the interceptor seam
= `kit/injection` + the assembly pipeline + D46 Tier-1/2 actions. If a synchronous "transform the draft
before send" plugin hook is wanted, it is a **registered ordered transform on the turn pipeline** (a
`PromptTransform` step injected at the composition root), NOT a bus subscription — a distinct mechanism that
should be named as such so a cold agent never tries to shove mutation through `ChatBusEvent`.

---

## 7. Verdict

**The taxonomy is ~90% complete and structurally sound — the chat/turn/message lifecycle, streaming, swipes,
reasoning, persona, WI-attachment, and chat existence all map cleanly, and orbweaver is actually *ahead* of
ST in places (`delta`, `historyTruncated`, `messagesReordered`, the `chatUpdated` catch-all, the exhaustive
replay guard).** But there are **four real, automation-relevant gaps to land before Phase 5 freezes the
closed union**: (1) **`chatOpened`** — the single highest-value miss, since the proposal's flagship "on chat
open" trigger and ST's most-subscribed automation event have no equivalent; (2) **`worldInfoActivated`** —
the lore-fired trigger, computed but not emitted; (3) a **speaker id on `turnStarted`** — without it group
"whose turn" automation is unwritable; and (4) **`character.deleted`/`asset.deleted`** on the `DomainEvent`
bus for indexer correctness. Everything else is COVERED, LOW/reserved-additive, or correctly N/A (client-DOM,
credential, or D49-rejected). Separately and importantly: ST's prompt-mutation "events" (interceptors /
`setExtensionPrompt` / regex / `*_PROMPT_READY`) are **not** events — do not port them into the bus; they
are the `kit/injection` + assembly-pipeline + D46-action seam. Land the four members, add the speaker field,
and the union is parity-complete and born-compliant for Phase 5.
