---
kind: design
status: archived
updated: 2026-08-14
---

# THE CRUNCHY-CLUSTER REDESIGN — extraction depth · the wand · fork-clones-the-game · the sweep

> Design deliverable, 2026-07-28. MAX-effort investigation, DESIGN ONLY — no source touched. A builder
> executes from this. Every claim below was verified against the live tree at HEAD (`f09ba1b1` era —
> uncommitted panel/assembly churn in the working tree was read as-is); file:line cites are from that
> read. Law honored: `AGENTS.md` (read in full), D86 + D106–D110, the
> parity-plus spec (`docs/history/design/parity-plus-program-spec.md`), the panel redesign
> (`docs/history/design/mocks/panel-redesign/DESIGN.md` incl. §12), the memory canon named in the brief.
> KISS/YAGNI are SUSPENDED here — every solution is the maximal, extensible shape, derived not
> re-declared.
>
> **Interlock with the in-flight comprehensive lane (`a9361256`, workboard §COMPACT-SAFE SNAPSHOT):**
> that lane owns META-TABS, editability, dual-homing, per-field locks, inventory polish. This design
> does NOT re-plan its queue; where an item overlaps (§4.3, §4.2 partially) this doc states the design
> TARGET and defers execution sequencing to the orchestrator. Everything else here is NEW design.
>
> **OWNER REVIEW (2026-07-28, round 1 — RATIFIED):** recommendations for items 1–6 + 8 signed as-is
> (window\@4k + reconcile-every-10 · resync = host-principal consent · Regenerate dual-home · "Generate
> reply" naming — SUBSUMED by the new Response icon below · `generateOnEmptySend` ON — RE-HOMED onto
> the Response icon, NOT the Send button · fork copies all sheets · RESTORE\_MESSAGE restyle deferred).
> **#7 (deception → tracker-prose leak) stays OPEN**: orchestrator recommendation **A — the tracker
> tracks the players' SURFACE reality; the hidden truth stays in the reveal-eye / reasoning channel
> (host-gated by P3)**. Item 1 (extraction prompt) + item 3 (fork clone) are designed for **A** below;
> \#7 is flagged for final owner sign-off (§6.7). **The wand (§2.3) is REPLACED by the owner's concrete
> SillyTavern-style control map** — rewritten below, reinforced against the funnel + the confirmed
> defects, with the full draft/committed capability matrix the owner asked for.

---

## 0. The cluster on one screen

| # | Item | Root disease | The cure (one line) |
| - | - | - | - |
| 1 | Extraction context/depth | The state round is CONTEXT-BLIND: `{state JSON} + {one beat}` | The state round rides the character turn's OWN loaded canon — a bounded, knob-gated transcript window threaded through the existing `RpgTurnConnection` seam; + a reconcile cadence + a host Resync verb |
| 2 | Guided wand | The steer is INVISIBLE state — a hidden mode-switch on the composer + a menu anatomy that eats clicks | FOUR always-visible dual-mode guided icons (impersonate·swipe·response·continue) + a ✨ utility menu + the ☰ relocated chat-options; steer VISIBLE via hover cue; empty-Response generates (closes the fork-at-user-tail gap) |
| 3 | Forking | A fork drops the game (stopgap); pre-fix forks crash the panel | `ChatRpgOps.forkGame` — rpg clones its 6-table vertical through the fork's id maps, pointer-write-last; + a typed dangling-pointer heal both server and client side |
| 4 | The sweep | Empty narrator anchors render as blank "Group" bubbles AND ride the prompt; panel beauty diverges from the ratified mocks | State-anchor slots become prompt-excluded + surface-hidden by construction; a concrete mock-convergence punch list |

All four touch the SAME seam family: the chat↔rpg injected-op boundary (`ChatRpgOps` /
`ChatContext.rpg`), the turn engine's post-commit hooks, and the composer→`resolveGuidedSteer` funnel.
They are designed together so no item re-spells another's mechanism.

---

## 1. EXTRACTION CONTEXT / DEPTH — the headline

### 1.1 Current state (verified)

**The delivery model (D108/D109, landed and live-proven):** every rpg-lite exchange is the tool-less
CHARACTER turn followed by a dedicated post-commit STATE ROUND (`flushTurn`,
`packages/server/src/domain/rpg/chat-ops/flush.ts:139-151`), reliable = structured output, cheap = a
`tool_choice:"required"` tool round, both folding to one `RpgStateDelta`. The round rides the character
turn's already-resolved connection + consent (`RpgTurnConnection {connection, ownerConsented}`,
`packages/server/src/domain/chat/contract/context.ts:453`, threaded at
`engine.ts:1189 fireRpgTurnCompleted`).

**Both arms are context-ISOLATED.** The entire model-visible input is:

- `extractionUserPrompt(stateJson, beat)` = `CURRENT STATE:\n{JSON}\n\nLATEST BEAT:\n{text}`
  (`packages/server/src/entry/compose/rpg.ts:139-141`);
- `readBeat()` reads exactly ONE committed variant's content (`compose/rpg.ts:100-103`);
- reliable: `extractViaChat`/`extractViaStructured` send system + that one user prompt
  (`compose/rpg.ts:162-194`); cheap: `buildRunToolRound` sends
  `history:[{role:"user", content:[…extractionUserPrompt…]}]` — ONE synthesized message, never the
  transcript (`compose/rpg.ts:482-495`).

**What already landed that this design builds ON (never undoes):** establish-when-unset schema forcing —
`ExtractionRefs.establishScene` (`packages/contracts/src/rpg/extraction.ts:82-89`) +
`constrainExtractionSchema`'s `requireField`/`minItems:1` arms (`extraction.ts:175-202`), live-proven to
make the 8B populate scene/cast under xgrammar. The per-call ref enums (R1), the cast-field key enum
(§2.8), the `journalTitleFor` derive (ruling #10), the flush barrier (D109-3), and the total
observability set (`rpg.extraction.failed/unparseable/empty/phantom`, `rpg.flush.dropped`,
`barrier_timeout`) all stand.

### 1.2 The root problem

The extractor reasons about a STORY it cannot see. Consequences, each observed or structurally forced:

1. **No arc awareness.** A relationship that warmed over five beats reads as one ambiguous line; the
   extractor can only react to the latest sentence, so `relationship`/`thoughts`/`mood` evolve in
   stutters, not arcs.
2. **No inference surface.** "What she has on her" is inferable from three turns ago ("she pocketed the
   key") — invisible to a one-beat window, so inventory only moves when the latest beat *narrates* the
   movement.
3. **Reconcile is impossible.** Deep in a story the panel decays: planes the beats stopped mentioning
   (weather, outfit, thoughts, widgets) go stale, and the extractor has no evidence to refresh them —
   the owner's "maintain the whole panel" is unreachable from a delta-of-one-beat input.
4. **Plane under-service is prompt-drift, not model failure** (§1.6 audit): the reliable system prompt
   never mentions `plot`, `widgets`, or per-cast `customFields` — three renderable, schema-writable
   planes the model is never asked to fill.

The owner's key nuance, honored throughout: **"the delta diff is one beat" ≠ "the extractor sees one
turn."** The DELTA the round emits stays a one-beat-forward patch (the staging/flush/lock machinery is
untouched); only the EVIDENCE the model reasons from widens.

### 1.3 The design — the state round rides the turn's own transcript

**The load-bearing observation:** at the exact call site where the round is armed
(`engine.ts:1189`), the engine already holds `canonAll` — the turn's full loaded canon
(`runPreTurnCompaction` → `engine.ts:1033`), name-resolvable via the already-built
`historyMacroNames` (`engine.ts:1039-1042`) — and the committed reply (`view`). **Zero extra reads.**
The transcript the extraction needs is IN SCOPE; it just isn't threaded.

**Canon window, not the assembled request.** Two candidate feeds were weighed:

| Feed | Pros | Cons | Verdict |
| - | - | - | - |
| The wire request (`result.request.history`, `pipeline.ts:106-108` / `results.ts:118-119`) | byte-identical to what the char turn saw; includes world-info/persona | carries the depth-0 rpg reminder (duplicates CURRENT STATE), guided steers, persona scaffolding — injection noise the extractor must NOT treat as story; role-squashed/egocentric-shaped per speaker | rejected as default |
| The canon lineage (`canonAll`, selected variants, name-stamped) | pure STORY — exactly the evidence planes evolve from; stable across shape modes; no injection contamination | lacks world-info (acceptable: lore is setting, not state evidence) | **the feed** |

**The seam (one-directional-flow clean):** widen the object chat already threads. Rename/extend
`RpgTurnConnection` → **`RpgTurnContext`** in chat's contract (`contract/context.ts:453` — chat owns
the shape, rpg satisfies it, per the front-door type-import rule already governing `ChatRpgOps`):

```ts
/** What a completed character turn hands the rpg state round: the turn's resolved route + enforced
 *  consent verdict (D109-2, unchanged) PLUS the turn's own canon transcript — the story evidence the
 *  round reasons from. Projected by the ENGINE from the canon it already loaded (zero extra reads);
 *  rpg receives story text as DATA and reads no chat table (§2 one-directional flow). */
export interface RpgTurnContext {
  readonly connection: ResolvedConnection;
  readonly ownerConsented: boolean;
  /** The selected-lineage canon UP TO AND INCLUDING the committed reply, oldest→newest, name-stamped
   *  ("Mara", "You (Aldric)") — the FULL loaded canon; the CONSUMER slices to its window (the knob is
   *  rpg config, not chat's business). Hidden-class spans INTACT (the round is model-plane — the model
   *  always reads its own lies, D110 §3.6). */
  readonly transcript: readonly RpgTurnTranscriptMessage[];
}
export interface RpgTurnTranscriptMessage {
  readonly role: "user" | "assistant" | "system";
  readonly speakerName: string | null;   // resolved via historyMacroNames; null for system rows
  readonly content: string;              // stored body (post-freeze canon, macro-raw identity ok)
  readonly tokens: number;               // estimateTokens — lets the consumer budget-slice cheaply
}
```

`fireRpgTurnCompleted` builds it from `canonAll ∪ {view}` (append the committed reply — it IS the
latest beat). `onTurnCompleted`'s positional signature collapses to `(chatId, turn: RpgTurnCompleted)`
carrying `{messageId, variantId, turnId, context: RpgTurnContext}` — the 5-positional-param shape
already needed a `useMaxParams` suppression (`chat-ops/index.ts:72`); this is the moment to fix it.

**The window is the CONSUMER'S knob.** `buildRunExtraction`/`buildRunToolRound`
(`compose/rpg.ts:299-357, 468-509`) slice `turnContext.transcript` per the game's config before
prompting. `readBeat()` DIES — the beat is `transcript.at(-1)` (one less DB read per round, and the
gone-variant edge case evaporates).

**The knobs (additive `RpgGameConfig` fields, `contracts/rpg/config.ts` — self-healing defaults, the
`extractionMode` precedent, D107 wired-on-arrival):**

```ts
/** How much story the state round reads (the context knob beside extractionMode). */
export const RPG_EXTRACTION_CONTEXTS = ["beat", "window", "full"] as const;
// config additions:
extractionContext: z.enum(RPG_EXTRACTION_CONTEXTS).default("window"),
/** The `window` arm's token budget for transcript evidence (message-boundary sliced, newest-first
 *  fill). Bounded for the sad-path 8B ([[plan-for-small-hardware]]); a hosted room can raise it. */
extractionWindowTokens: z.number().int().min(512).max(32_768).default(4096),
/** Reconcile cadence — every Nth flush FORCES a full re-emission of the refreshable planes (scene +
 *  present cast required via the establishScene machinery, applied unconditionally that round) so a
 *  deep story's panel self-heals instead of decaying. 0 = off. */
reconcileEveryBeats: z.number().int().min(0).max(100).default(10),
```

- `beat` = today's behavior exactly (the escape hatch; byte-compatible; the 8B floor if a local model
  proves swamped).
- `window` (default) = last `extractionWindowTokens` of transcript, whole messages, oldest→newest
  order in the prompt. 4096 tokens ≈ 10–16 typical RP beats — the "recent arc". On the 8B: 4k extra
  prompt tokens is seconds of prefill, and xgrammar's grammar compile is UNCHANGED (the schema is the
  same; the enum sets stay small — the compile-cost note at `extraction.ts:64-67` still holds).
- `full` = the whole threaded canon (which is itself already compaction-bounded by the char turn's
  loading). For hosted rooms that want maximum inference; the GM console renders an honest
  consequence line ("every state round re-reads the whole story — slower, costs more").

**Prompt restructure (`EXTRACTION_SYSTEM` + `extractionUserPrompt`, `compose/rpg.ts:119-141`).** The
user prompt becomes three labeled blocks; the system prompt teaches the arc semantics:

```
RECENT STORY (oldest first):
<speaker>: <text>
…
CURRENT TRACKED STATE:
{json}

LATEST BEAT (the newest story turn above — your delta covers exactly this):
<text>
```

System-prompt additions (content-quality, the schema stays the enforcement lever):

- "The RECENT STORY is your evidence. The delta you output covers ONLY the LATEST BEAT — but you may
  use the whole story to understand it: a relationship that has been warming for several turns, an
  item a character picked up earlier and still carries, a quest implied across turns."
- "INFER what a character has on her from what the story showed — recording an item the story
  established is not inventing." (the owner's inventory ask, verbatim as doctrine)
- "RECONCILE: when the CURRENT TRACKED STATE contradicts the story (a character shown leaving is
  still listed present; an outfit the story replaced), fix it in this delta."
- The per-plane fragments come from the registry (§1.6) — plot/widgets/customFields stop being
  unprompted.

The same window + prompt-blocks feed the cheap tool round (`toolRoundSystem` keeps its checklist
decomposition nudge; the story block replaces its one-message history — `compose/rpg.ts:489`).

**The reconcile cadence (maintain, not just diff).** Every `reconcileEveryBeats`-th flush (counted
per game — derive it, don't stamp it: `count(rpg_snapshots where gameId) % N === 0` at
`stageStateRound`, one cheap COUNT on a table the flush already writes), the constraint layer applies
the establish forcing UNCONDITIONALLY: `establishScene = {location:true, timeOfDay:true,
presentCast:true}` regardless of current state, and the prompt gains one line: "This is a RECONCILE
beat: re-state the full scene and everyone present as the story currently stands." Locked fields stay
lock-protected at merge (the `fieldLocks` grammar is downstream and untouched) — a reconcile can never
clobber a hand-pinned value. This turns the landed establish-when-unset lever from a birth-only fix
into the standing anti-drift mechanism, at zero new machinery (the flag plumbing exists).

**"Resync from story" — the host escape hatch (a new verb).** `rpg.resyncFromStory` (host-gated,
`verbs/game/` group):

- Reads a DEEP transcript window via a new injected chat op `resolveCanonWindow(chatId, {maxTokens})`
  on the `rpgChatOps` bundle (`compose/chat.ts:985-993` — beside `resolveRpgRoster`; chat owns canon
  reads, room-plane per D106 "the prompt is the room's", selected lineage, name-stamped — the SAME
  projection the engine threads, one shared builder in chat so the two can't drift). Default budget:
  the model's context minus headroom, capped by a `RPG_RESYNC_MAX_TOKENS` const.
- Resolves connection + consent FRESH at the verb: this is NOT an out-of-turn call riding a committed
  turn (D109-2's precedent governs background work); it is a host-INITIATED interactive action, so the
  honest arm is the `resolveTrackersReadOnly` pattern — resolve the room's connection as the host via
  `resolveChat` (`compose/rpg.ts:580-609`) and gate consent on the CALLER being the host (the
  consenting human is at the keyboard). Flagged as a ruling in §6.
- Runs the extraction with establish-EVERYTHING forcing (scene + cast required, plus a
  `resync: true` prompt frame: "Rebuild EVERY plane from the story: who is present, what everyone
  carries and wears, active quests, the plot act, current conditions"), then applies the delta through
  the NORMAL staging→`writeStagedSnapshot` tail onto a state-anchor slot (§4.1's silent mint — never
  a blank bubble), `committed:1`. Locks honored (a resync repairs the model plane; it never fights the
  host's pins).
- Surfaced in the GM console (Game tab) as "Resync from story" with a consequence line ("re-reads up
  to N tokens of story; one model call"), and offered inline by the panel's empty/stale states (a
  DoorwayLine under an empty Scene: "Panel out of sync? Resync from story →" — host-only).

**Consent/routing law compliance:** the in-turn rounds keep riding the threaded verdict (D109-2 —
unchanged, now with more cargo on the same thread). The resync is the one NEW model-call site and it
resolves at a human-initiated verb with the host principal — no force-stamped consent, no second
hand-rolled seam inside a turn. The flush readonly gate (F2) and the barrier are untouched.

### 1.4 Wire/cost honesty (the sad-path argument)

- **8B/vLLM:** +4k prompt tokens ≈ prefill only (no decode cost); xgrammar compile unchanged. The
  window is message-sliced so a huge single beat degrades to fewer messages, never truncated
  mid-utterance. If live probing shows the 8B's quality DROPS with more context (attention dilution is
  real on small models), `extractionContext:"beat"` is the shipped escape hatch and the GM console
  says which games use what.
- **Hosted (OR / sub):** the round's economics stay in the provider-observability plane (spec §10.1a
  ruling, unchanged); the knob's consequence line in the GM console is the honest cost surface.
  `window` default at 4k keeps the per-turn overhead bounded and predictable.
- **Prefix caching:** the extraction's system prompt differs from the char turn's, so no shared
  prefix — accepted; the window bound is the real cost control. (Do NOT contort message order to chase
  cache hits; correctness of the block structure wins.)

### 1.5 What does NOT change (the invariant fence)

Staging accumulator · `applyLockedPatch` merge-clear · `writeStagedSnapshot` write-boundary validation
(D108 "canon never corrupted is STRUCTURAL") · the flush barrier + freshness indicator (D109-3) · the
ref-enum constraint machinery + establish-when-unset (extended, not replaced) · `toolCallsToExtraction`
· the errors-as-data empty-delta posture and the total observability set. The delta stays a
one-beat patch; swipe-consistency is untouched (the snapshot still keys the committed variant).

### 1.6 The plane audit — write-surface vs render-surface vs PROMPT-surface

Cross-referencing `rpgExtractionSchema`/tool args (`contracts/rpg/tools.ts`) against
`buildTrackerView` (`domain/rpg/chat-ops/tracker-view.ts:126-179`) against the two system prompts
(`compose/rpg.ts:119-136, 411-431`):

| Renderable plane | Model-writable? | Prompted (reliable)? | Prompted (cheap)? | Verdict |
| - | - | - | - | - |
| scene.location/timeOfDay/weather/calendarDate | ✓ `update_scene` | ✓ | ✓ (via update\_scene line) | ok |
| scene.day (structured dateMode) | ✓ (`day`) | ✗ | ✗ | **gap** — prompt the day counter ONLY when `dateMode:"structured"` (mode-aware fragment) |
| recentEvent → recentBeats | ✓ | ✓ | ✓ | ok |
| cast mood/appearance/outfit/thoughts/relationship | ✓ | ✓ | weak (one line) | ok after §1.3 restructure |
| cast `emoji` (portrait fallback, panel-DESIGN §12.5.7) | ✓ | ✗ | ✗ | **gap** — one clause: "give a new character a fitting emoji" |
| cast `customFields` (§2.8 host-defined) | ✓ enum-keyed | ✗ | ✗ | **gap** — fragment renders the DEFINED fields with their host hints: "Track for each present character: Corruption (0-100): <hint>…" (the hint plumbing exists in config; it currently reaches only the reminder) |
| party hp/pools/conditions/status | ✓ `update_party` | ✓ | ✓ | ok |
| inventory items + wallet | ✓ `update_inventory` | ✓ ("money") | ✓ | ok; name wallets explicitly ("walletDeltas — named currencies, e.g. gold") |
| widgets (`set_widget_value`) | ✓ enum-keyed | **✗ (never mentioned)** | ✓ (checklist line) | **gap (reliable)** — fragment enumerates the live widget labels (the refs already exist in `refs.widgetRefs`) |
| quests + objectives | ✓ `upsert_quest` | ✓ | ✓ | ok |
| plot act/title (P5 rail) | ✓ `update_scene.plot` | **✗ (never mentioned)** | **✗** | **gap** — fragment (gated on `features.plotProgression`): "When the story crosses into a new act, set scene.plot" |
| journal | ✓ | ✓ | ✓ | ok |
| level / sheet identity / poolDef max / item icon | ✗ by design (D110-2 hand-only) | correctly absent | correctly absent | ok — keep the projected-schema-string ABSENCE pin |

**The structural fix (not just prompt patches): a PER-PLANE PROMPT-FRAGMENT REGISTRY.** The drift
class exists because plane prose is hand-composed in two monolithic template literals. Home the
fragment WITH the plane, beside the shapes that already share a home
(`contracts/rpg/extraction.ts` or a sibling `extraction-prompt.ts` in contracts — pure data):

```ts
/** One row per model-writable plane: the schema field, its teaching fragment builder (config/refs
 *  aware — cast-field hints, widget labels, dateMode arm, plotProgression gate), and its tool name.
 *  BOTH system prompts (reliable extraction + cheap tool round) COMPOSE from this table; a new plane
 *  is a row, and the D110 "~7 coupled sites" list shrinks the prompt sites to one. */
export const EXTRACTION_PLANE_PROMPTS: ReadonlyArray<{
  plane: keyof RpgExtraction | "scene";
  fragment: (ctx: { config: RpgGameConfig; refs: ExtractionRefs }) => string | null; // null = plane off
}> = [ … ];
```

`extractionSystemWithRefs` and `toolRoundSystem` both walk it (shared header + per-arm framing).
Enforcer: a contract test asserting every `rpgExtractionSchema` top-level key has a registry row
(the D50 bus-coverage ratchet discipline — a new plane without a fragment is RED). Also strip
`fieldLocks` from the `CURRENT TRACKED STATE` JSON and render locked paths as one line ("Locked by
the players — do not rewrite: quests.q\_abc, location") — today `JSON.stringify(baseState)`
(`compose/rpg.ts:314`) leaks the lock record as model-facing noise.

**The #7 recommendation-A clause (deception → surface-only tracker, built into the registry).** When
the game is DECEPTION-ACTIVE (`isDeceptionActive(config.features)`, the ONE predicate that already
gates the reminder teaching, `contracts/rpg/config.ts:97-99`), the registry composes a standing
prefix onto EVERY plane fragment: *"This game has hidden layers. Record only the players' SURFACE
reality — what the scene openly shows: a character's outward words, visible actions, and apparent
state. Do NOT write a character's secret truth, hidden motive, or a lie's real answer into any
tracked plane (journal, beats, cast thoughts/mood/relationship, quests). The hidden layer lives in
your reasoning channel and the host's reveal-eye — never the panel."* This is the PREVENTION arm of
recommendation A: the truth never enters the tracker, so no downstream redaction (or fork-copy strip,
§3.2) is needed — the tracker plane is member-safe by construction on a deception game. The clause is
deception-gated (a non-deception game is byte-identical to today). **Pending owner sign-off (§6.7)** —
if the owner instead wants the truth tracked-but-redacted, the clause drops and §3.2's fork-strip
becomes load-bearing; A avoids that whole surface.

### 1.7 D-ledger touches + proposed entry

- **Extends D108/D109** (the delivery model): the state round's INPUT gains the turn transcript; the
  two-turn exchange, consent inheritance, barrier, and flush tail are unchanged.
- **Extends D110-2** (rpg data planes): the plane-prompt registry joins the coupled-site list; the
  schema-authoring law untouched.
- **D106 compliance:** the transcript rides the ROOM plane (turn assembly is deliberately unclamped —
  "the prompt is the room's"); no viewer floor applies to a model-facing read. Hidden spans stay IN
  (model-plane, D110 §3.6).
- **Proposed D111 (mint at build):** *"The rpg state round reads the story: `RpgTurnContext`
  threads the character turn's canon transcript to the round; `extractionContext {beat|window|full}` +
  `extractionWindowTokens` + `reconcileEveryBeats` are game config; `rpg.resyncFromStory` is the
  host's deep rebuild (fresh host-resolved connection — the one sanctioned non-inherited rpg model
  call, because the consenting human initiates it); plane teaching composes from
  `EXTRACTION_PLANE_PROMPTS` (a new plane = a row, ratchet-tested)."*

---

## 2. THE GUIDED-GENERATIONS WAND — composer/steer surface redesign

### 2.1 Current state (verified) — the funnel is clean, the surface is not

Server-side there is exactly ONE resolution funnel: `resolveGuidedSteer`
(`domain/chat/assembly/context.ts:478-516`) — steer → marker or depth-0 injection, gameSteer →
trusted template, marker-fallback warning. The verbs (`chat.generate/swipe/continueTurn/impersonate/
startChat`, `verbs/turn.ts`) all thread `guided` into GATHER→BUILD. **This is a client-surface rebuild
over the existing funnel plus ONE small additive server touch (`responseNudge`, §2.3a′) — the funnel
and the five verbs are otherwise byte-untouched.** Defects confirmed:

1. **Submenu click-swallow** — the wand is a Base UI `Menu` with THREE `MenuSubmenuRoot`s
   (speaker F5 `composer-wand.tsx:112-125`, Plot `:308-322`, Recent steers `:339-352`, plus
   `ImpersonateSubmenu`). With a submenu open, the first pointer activation on a sibling item is
   consumed dismissing the submenu (Base UI hover-intent semantics); "Rewrite is broken" is the
   perceived result.
2. **Rewrite dead primary** — `useRewriteModal.apply()` silently early-returns when
   `composeRewriteSteer` is empty (`composer-wand.tsx:208-217`): enabled-looking button, nothing
   happens, dialog stays open, no message.
3. **The hidden mode-switch** — `fireAndClear` (`composer-wand.tsx:72-75`) consumes the typed draft
   as an invisible steer and wipes the composer; NOTHING in the UI states the contract. The only
   recovery is failure-restore (F3) and the Recent-steers submenu.
4. **Dead-menu first impression** — fresh 1:1, tail = own user message, empty composer: Continue /
   Regenerate / Rewrite / Impersonate all disable (`useWandFlags:269-291`); reasons live ONLY in
   hover `title`s — invisible on touch, and the disabled gray fails glanceability.
5. **Duplication/jargon** — Regenerate lives in the wand AND the swipe strip; "Guided response" is
   insider vocabulary; the composer's three adjacent ghost icons (wand / image-gen / spark) are
   confusable (visible in `reports/snaps/freeform-game.png`, composer bottom-left).
6. **Recent-steers hygiene** — `key={steer}` (`composer-wand.tsx:346`): identical steers collide as
   React keys; long steers render at natural menu width (unbounded).
7. **The missing affordance** — empty-composer send on a USER tail is a hard no-op:
   `resolveContinueTarget` requires `tailRole === "assistant"`
   (`lib/continue-on-empty.ts:15-17,32-40`), and its own header documents the gap ("an empty send
   after a USER turn is just a no-op"). A fresh fork at your own message therefore has NO way to
   prompt a reply except opening the wand and knowing "Guided response" fires steer-less…which it
   doesn't — committed chats text-gate it (`primaryDisabled = committed && !hasText`,
   `composer-wand.tsx:81`). The gap is REAL and total.

### 2.2 Root problem

Two, compounding: **(i) the steer is invisible state** — the surface's core contract (typed text
becomes guidance) is never rendered, so every consumption reads as data loss and every text-gate reads
as breakage; **(ii) menu anatomy for a non-menu job** — a 5-item action set with three nested submenus,
per-item text-coupling, and hover-only explanations is the wrong primitive for a composer-coupled,
state-displaying surface.

### 2.3 The design — the SillyTavern-style control map (owner-specified, reinforced)

The owner replaced the popover-panel sketch with a concrete, ST-style composer bar: the guided actions
become FOUR always-visible dual-mode icons on the right, the wand becomes a UTILITY menu, and the
existing chat-options menu relocates to the composer's left. This is the *better* shape — it makes the
four highest-frequency actions one-click (no menu at all), and it dissolves every §2.1 defect
structurally rather than by tuning menu hover-intent. Verified against the funnel: `resolveGuidedSteer`

- the five verbs are byte-untouched; this is a client-surface rebuild plus ONE small server addition
  (`responseNudge`, §c). The composer wand file (`composer-wand.tsx`) is rewritten; `use-guided-actions.ts`
  gains the response-nudge threading and loses the text-gate.

**The control map (composer bar, left → right):**

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ☰   ✨   [ compose textarea …………………………………………… ]   🎭  ⟳  ▷  ⏩   ➤ │
│ └┬┘ └┬┘                                            └┬─────────┘  └┬┘│
│ chat  utility                                     the FOUR guided  send    │
│ options menu                                       (impersonate·swipe·response·continue) │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **☰ (left) = the EXISTING chat-options / three-dots menu, relocated.** Owner confirmed ☰ *is* our
  three-dots (`chat-options-menu.tsx` — rename/gallery/game-toggle/new-chat/selection-mode/delete/…).
  Pure relocation: the menu's contents + the `ChatOptionsMenu` component are unchanged; only its mount
  point moves from the topbar (`chat-options-topbar.tsx`) to the composer's left gutter. Flag: the
  topbar copy vs the composer copy — ONE home, don't render both (the topbar affordance is REMOVED when
  the composer one lands, or kept as the sole home if the owner prefers topbar; §6 decision — recommend
  composer-left per the owner's map, topbar ☰ removed).

- **✨ (beside ☰) = the UTILITY menu** (a plain single-level `Menu`, no submenus except Impersonate's
  perspective picker which is NOT here — see §b). Maps ST's wand set onto OURS, **omit-doctrine
  enforced — only items with a REAL backing verb render** (verified against the tree):

  **(owner-corrected round 2 — two items re-investigated against the tree.)**

  | Utility item | Backing (verified) | Render? |
  | - | - | - |
  | **Recover input** ("bring back the last steer you used") | client ring `pushFiredSteer`/`useRecentSteers` (`state/steer-recovery-store.ts`) — the fired-steer recall, D57. Owner-clarified intent: recall the LAST STEER YOU USED back into the composer — which is EXACTLY what this ring does (its header: "the 'I fired something earlier, put it back' recall"). The mapping is correct; NO separate unfired-draft store is wanted. | ✓ (top item = recall the most-recent fired steer into the composer; a submenu lists the rest of the ring — the §2.1.6-hygiene'd list. Label it for the intent: "Recall last steer".) |
  | **Corrections** (rewrite / OOC) | `RewriteDialog` + `guided.fireRewrite` → `chat.swipe` guided:rewrite (exists) | ✓ (opens the dialog — the §c-hardened one) |
  | **Undo continuation** | `chat.undoContinue` (`turn.ts:1696`) — per-slot, targets `tailAssistantMessageId` | ✓ (disabled-with-reason unless the tail assistant slot HAS a continuation — `hasContinuation`, the `message-actions-row.tsx:136` predicate lifted to a shared selector) |
  | **Revert continuation** | `chat.revertContinue` (`turn.ts:1709`) | ✓ (same gate, mirror) |
  | **Clear input** | pure client `onChange("")` | ✓ (disabled when the composer is empty) |
  | **Simple send** (post my message, do NOT auto-generate) | ⚠️ NO backing today. EXHAUSTIVELY verified: `SendParams` = `{content, personaId, blocks, attachmentAssetIds, intent, guided}` (`contract/params.ts:157`) — no suppress flag; `createSend` (`turn.ts:1067-1202`) ALWAYS runs `runAiRound` after `persistUserMessage` (the only skip is the host-offline DEFER, a different mechanism that STILL owes the turn); `UserIntent` (`contracts/preset/index.ts:196`) is pure generation config (sampling/budget/thinking — no suppress); `commitMessage`/`injectMessage` (the D56-named future for exactly this) are NOT BUILT (only the internal `persistUserMessage` helper exists). **D56 correction:** D56 deleted `simpleSend` as a byte-identical duplicate of a solo `send` (a roster-of-1 round that STILL generates) — it did NOT rule out post-without-generate; it EXPLICITLY NAMED that future as `commitMessage`/`injectMessage`. So this is a real, sanctioned gap, not a killed concept — the owner is right. | ✓ **as a small BUILD** (§2.3a-BUILD — the `commitMessage` verb D56 pre-named) |
  | **Reasoning / "Separated thinking" toggle** | *no backing* — no `UserSettings` reasoning-visibility flag exists (grep-verified: settings carries no such toggle) | ✗ OMIT (a dead stub is banned; flag as a doorway — if a reasoning-visibility pref is later added it becomes a real item) |
  | **Spellcheck toggle** | *no backing* — the composer textarea has no spellcheck control (grep-verified) | ✗ OMIT |
  | **Help / shortcuts** | *no backing* — no keyboard-shortcut help surface in chat | ✗ OMIT |

  Net utility menu (6 items): **Recover input (recall last steer) · Corrections · Undo continuation ·
  Revert continuation · Clear input · Simple send** — five already-backed (Recover/Corrections/Undo/
  Revert/Clear), ONE backed by the small `commitMessage` build in §2.3a-BUILD, three ST items still
  omitted with cited reasons (the omit-doctrine made visible — an item ships ONLY when a real verb/store
  backs it). Undo/Revert moving here is a genuine consolidation (they exist per-message today at
  `message-actions-row.tsx`; the wand copy targets the tail assistant slot, the message copy stays for
  older slots — a dual-home like Regenerate, §e).

**(a-BUILD) The `commitMessage` verb — Simple Send's backing (the one D56 pre-named).** A new chat verb
`chat.commitMessage`: commit the user row WITHOUT firing the AI turn. It is `createSend` minus
`runAiRound` — reuse the front half verbatim (membership gate · attachment/persona trust-boundary ·
`persistUserMessage` · `freezeGreetingVolatiles` on first user turn · `fireRpgUserCommit`), then RETURN
the committed `userView` (`§3.6`-projected like the defer-path return at `turn.ts:1159`) instead of
running the round. Factor the shared front half out of `createSend` so the two verbs can't drift (the
D56 "roster-of-1 = byte-identical" discipline applied to the COMMIT half). Scope + shape:

- `CommitMessageParams` = the send params minus `intent`/`guided` (no generation ⇒ no generation config,
  no steer): `{chatId, content, personaId?, blocks?, attachmentAssetIds?}`.

- The rpg commit hook (`fireRpgUserCommit`) STILL fires — a Simple Send is a real user beat that locks
  in the prior assistant's snapshot (D109 `onUserCommit`); only the AI round is skipped.

- Host-offline: `commitMessage` NEVER defers (there's no owed turn to defer — the whole point is no
  turn); it just commits. The `deferIfHostOffline` branch is absent from this verb.

- Sweep-classified (a new tRPC proc → \[\[new-router-needs-sweep-classification]]); membership-gated
  (`requireParticipant`), same as `send`.

- Client: the ✨ Simple-send item calls `chat.commitMessage` with the current composer text and clears
  the composer on success (a normal message-post gesture). Disabled-with-reason on an empty composer
  (nothing to post) and on a draft (no chat to post into — send your first message normally first;
  Simple Send is a committed-chat affordance since a DRAFT's first message IS a startChat). The
  placeholder/Send semantics are unchanged — Simple Send is the explicit "post, I'll generate later"
  path, and the ▷ Response icon is how you then generate.

- D56/D107 clean: `commitMessage` IS the verb D56 named; it ships wired to its one consumer.

- **The FOUR guided icons (right of the textarea), order `🎭 impersonate · ⟳ swipe · ▷ response ·
  ⏩ continue`** — ALWAYS VISIBLE, never hidden/swapped (\[\[no-separate-reduced-modes]] — the
  one-surface doctrine the owner named). Each is **DUAL-MODE**: empty composer = the plain action;
  typed text = the guided action (the text IS the steer, fired through the existing `steerFor` →
  `guided` funnel). Icons from the `@orb/ui/icons` seal (grow the allowlist per §11): impersonate =
  `Drama` (already imported), swipe = `RefreshCw`, response = a distinct generate glyph
  (`Sparkles`/`Play` — pick one NOT shared with the utility ✨ or the image-gen spark; §2.1.5
  confusability fix), continue = `FastForward`/`ChevronsRight`.

  - **🎭 Impersonate** — writes the user's next line. **Hover → perspective picker (1st/2nd/3rd
    person)** — reuse `ImpersonateSubmenu`'s `PERSON_LABEL` map + `GUIDED_IMPERSONATE_PERSONS`
    (`impersonate-submenu.tsx`), rendered as a small hover popover off the icon (not a nested Menu —
    the icon owns its own `Popover`, so no sibling-click-swallow). Empty composer + a picked person =
    plain perspective impersonate; typed text + person = guided. Fires `guided.fireImpersonate(input,
    person)` (exists).
  - **⟳ Swipe** — reroll the tail assistant (regenerate). Empty = plain reroll; typed = guided swipe
    (`guided.fireSwipe`). This IS the swipe-strip arrow's verb — a deliberate dual-home (§e). **Swipe
    does NOT clear the composer** (the reroll ergonomic, §a″): the steer STAYS so the user rerolls
    repeatedly with the SAME guidance until a variant lands — no re-typing per reroll.
  - **▷ Response** — generate the NEXT assistant reply. **This is where empty-send-generate lives**
    (revised from the prior §2.3d: the SEND button stays "send my message", unchanged). Empty =
    plain `chat.generate`; typed = guided response (`guided.fireResponse`). On a DRAFT it becomes
    "Generate opening" (`fireOpening` → `chat.startChat opening:generate`, already steer-less capable).
    **Fixes a confirmed bug:** today Guided-response cannot fire twice in a row — the wand gates it on
    `hasText` and `fireAndClear` wipes the composer (`composer-wand.tsx:72-81`), so a second empty
    fire is impossible. `createGenerate` (`turn.ts:1600`) is tail-agnostic + lock-free, so a
    text-gate-FREE Response icon makes consecutive replies just work (click, click, click). In a
    multi-character room the icon's hover reveals a speaker chip row (Auto · each cast member — the
    existing F5 `fireResponse(input, speakerCharacterId)` path); solo/1:1 fires Auto directly.
  - **⏩ Continue** — extend the last reply (`guided.fireContinue` → `chat.continueTurn`, exists).
    Empty = plain continue; typed = guided continue.

- **➤ Send (far right) = send my message, UNCHANGED.** The send-button branch keeps its current
  `canSubmit` semantics; the empty-send `continue`/`generate` re-homing means Send NO LONGER carries
  the empty-send-generate arm (revise §2.3d accordingly, below). The `continueOnSend` pref's
  empty-send-continue behavior is superseded by the Continue icon; keep the pref as an explicit
  keyboard convenience but the CANONICAL affordance is the icon (§6 decision — recommend: keep the
  pref, the icon is the discoverable home).

**(a′) `responseNudge` — the new server addition (the one non-client change).** A plain empty-composer
Response on an ASSISTANT tail is currently rudderless — `createGenerate` sends no `appendUserTurn`
nudge (unlike `continue`/`impersonate` which use `nudgeOf`, `turn.ts:126-127,1540,1586`). ST's
guided-generations injects an ephemeral instruct (`promptGuidedResponse`) so "generate a reply after
your own last message" is coherent. Mirror the existing nudge mechanism exactly:

- Add `responseNudge` to `DEFAULT_FORMAT_STRINGS` (`contracts/preset/index.ts:649`) +
  `promptConfig.formatStrings` (the `:815` schema block) — the editable/ST-importable home the other
  nudges already have. Default text (RP-tuned): `"[Continue the scene: write the next reply, moving
  the story forward from where it stands. Do not restate or recap.]"`.
- `nudgeOf`'s key union widens to `"continueNudge" | "impersonateNudge" | "responseNudge"`.
- `createGenerate` sets `appendUserTurn: nudgeOf(assembleContext, "responseNudge")` **ONLY when the
  tail is an assistant turn AND no user turn is being appended** (a Response right after a USER message
  needs no nudge — the user message IS the prompt; a Response after an ASSISTANT message needs the
  nudge to have something to respond to). The tail-role check is a cheap read `createGenerate` can do
  from `room`/canon, or the client passes an explicit `afterAssistant: boolean` flag on the generate
  vars (cleaner — the client already knows `tailAssistantMessageId`). A typed guided steer COMPOSES
  with the nudge (the `guided` injection + the nudge appendUserTurn are independent channels — same as
  continue/impersonate today).
- Wiring is D107-clean (the format string ships with its consumer). This is the ONLY server touch in
  the whole wand redesign.

**(a″) The per-action composer-clear matrix (owner-specified — the reroll ergonomic).** The typed steer
is CONSUMED (composer clears) on the one-shot actions but PRESERVED on the repeatable one, so a user
rerolls with the same guidance without re-typing:

| Icon | On fire | On failure | Why |
| - | - | - | - |
| **🎭 Impersonate** | CONSUME — clear the composer (`fireAndClear`) | restore the just-fired steer to the composer (`onFireError` → `onChange`, D57) | one-shot: the impersonated line lands; the steer is spent |
| **▷ Response** | CONSUME — clear | restore (same path) | one-shot: the reply lands; the steer is spent |
| **⏩ Continue** | CONSUME — clear | restore (same path) | one-shot (owner's stated assumption; owner will flag if he wants Swipe-like retention) |
| **⟳ Swipe** | **KEEP — do NOT clear** the composer; the steer stays | n/a (nothing was consumed) | REROLL ergonomic: swipe again and again with the SAME guidance until a variant satisfies; the steer persists across rerolls, never re-typed |

Mechanically: the three consume-actions keep the current `fireAndClear` wrapper (`composer-wand.tsx:72`)

- the `onFireError` restore (`use-guided-actions.ts` `perFire`/`onFireError`, D57 client-only). Swipe
  fires WITHOUT the `onChange("")` clear — a one-line divergence in the Swipe icon's handler (fire the
  steer, leave the composer). The steer text still lands on the `pushFiredSteer` ring on every fire
  (consume or keep) so "Recover input" recalls it regardless. A user clears the retained Swipe steer with
  the ✨ Clear input item (or by editing/sending) when they're done rerolling.

**(b) The visible-steer cue (owner insight #1, folded in).** The invisible mode-switch — typed text
silently becoming a steer — is defused WITHOUT a persistent panel:

1. **Hover cue on any guided icon while text is present:** the icon's `title`/tooltip reads
   `"Uses your typed text as direction"` (impersonate: "…as impersonation direction"; swipe: "…to
   steer the reroll"; etc.). So a user about to click a guided icon with a draft in the box is told,
   at the point of action, that their text becomes guidance. (This replaces the persistent "Steering
   with:" header from the dropped panel design — lighter, and it fires exactly when it matters.)
2. **The icons charge up when the composer has text:** the four guided icons swap to their
   filled/ember-tinted variant whenever `hasText` (a one-class visual state), so "your text is loaded
   as a steer" is glanceable across the whole cluster — and it visually separates the guided cluster
   from the neutral Send + the utility ✨ (the §2.1.5 confusability fix, applied to the whole right
   group).
3. **Recover input = recall the last steer you used (owner insight #2, owner-clarified intent):** every
   guided fire (consume OR keep — §a″) records the steer on the `pushFiredSteer` ring; **Recover input**
   in the ✨ utility menu recalls the most-recent fired steer into the composer (a submenu lists the
   rest). This is the D57 client-only recall, already built — the wand surfaces it as a named item
   instead of only the failure-path restore. (Owner-confirmed: this is "bring back the last steer you
   USED", NOT unfired-draft recovery — the fired-steer ring is exactly right; no separate draft store.)
   Note the two recovery paths are distinct and complementary: the per-action `onFireError` restore
   (§a″) puts a FAILED steer straight back automatically; Recover input MANUALLY recalls a SUCCESSFUL
   (or any earlier) steer on demand.

**(c) Corrections (rewrite) dialog hardening** (unchanged from the prior design, still required): the
Apply button is `disabled` until `instruction.trim() ≠ "" || toggles.size > 0`, with a persistent
helper line ("Add an instruction or pick at least one fix"), killing the silent `apply()` early-return
(`composer-wand.tsx:208-217`). Title/subtext teach the variant semantics ("lands as a new variant —
your original stays a swipe away"). Reached from the ✨ utility menu (Corrections).

**(d) Empty-send-generate — RE-HOMED onto the Response icon (revises the prior §2.3d).** The prior
design put empty-send-generate on the Send button; the owner correctly moves it to the ▷ Response icon
so Send stays unambiguously "send my message". Mechanics:

- The Response icon's empty-composer arm fires `chat.generate` (committed) / `chat.startChat
  opening:generate` (draft) — verified tail-agnostic + lock-free (`turn.ts:1600-1665`), zero server
  work beyond `responseNudge` (§a′). D56 untouched (nothing commits without a turn).
- `generateOnEmptySend` (the pref the owner ratified ON) governs whether a **bare Enter on an empty
  composer** ALSO triggers Response (the keyboard convenience) — default ON. The pure resolver
  (`resolveEmptySendAction`, `lib/continue-on-empty.ts`) still exists and still classifies
  {continue | generate | null} for the KEYBOARD path (empty Enter), but the ICON is the discoverable,
  always-available home. So: empty Enter → continue (assistant tail, `continueOnSend`) OR generate
  (any non-assistant tail, `generateOnEmptySend`) OR nothing; the four icons are the explicit,
  phase-gated equivalents that don't depend on which tail you're on.
- The composer placeholder still teaches (`resolvePlaceholder`, `composer.tsx:237`): assistant tail →
  "Continue, or type a message…"; user tail → "Type a message, or hit ▷ to let <primary> reply…"
  (name the icon so the affordance is discoverable from the empty state).

**(e) De-duplication (owner-consistent):**

- **Swipe/Regenerate dual-home:** the ⟳ icon (composer) and the swipe-strip arrow (message) are the
  same verb in two homes — one at the composer with optional steer, one at the message for plain
  reroll. Owner ratified "Regenerate dual-home"; kept.
- **Undo/Revert dual-home:** the ✨ menu items (target the tail assistant slot) and the per-message
  `message-actions-row.tsx` buttons (target any slot) coexist — the wand copy is the "act on the most
  recent reply" convenience; the message copy is the "act on THIS reply" precision. Same dual-home
  logic as Regenerate.
- **Naming:** the four icons need no text labels (icon + tooltip); the tooltips are the plain-language
  names ("Impersonate", "Regenerate", "Generate reply", "Continue") — "guided" vocabulary disappears
  entirely (the steer is conveyed by the hover cue + charge state, not a jargon label). The utility
  menu items are plainly named. "Generate reply" (owner-ratified rename) IS the Response icon's tooltip.

**(f) What stays untouched:** `resolveGuidedSteer` + the five verbs' `guided` threading; `steerFor`'s
empty-steer-omits-object contract; the `pushFiredSteer` ring; `fireGameSteer`'s trusted-template path
(ruling-#9) — the **game section (Plot submenu + "Offer choices")** re-homes into the ✨ utility menu
(or a small game sub-group there) when the chat is a game, APPLICABILITY-gated on `plotProgression`
exactly as today (D110-4); it is NOT one of the four core icons (it's game-only). One surface across
draft + committed — the four icons render always, phase gates them (§2.3.1).

#### 2.3.1 The DRAFT vs COMMITTED capability matrix (owner ask — SPECIFIED + ENFORCED)

**The show-everything requirement:** all four guided icons ALWAYS render — never hidden, never swapped
for a sibling (\[\[no-separate-reduced-modes]]). A phase-unavailable icon is `aria-disabled` +
`focusableWhenDisabled` (the `composer.tsx:372` idiom — stays hoverable/focusable) with its reason
rendered **legibly and touch-accessibly**, not hover-only low-contrast (that was the §2.1.4 defect).
Concretely: a disabled icon shows a small reason on `title` AND, because touch has no hover, the
composer surfaces the reason on tap via a brief inline toast/popover (the disabled-affordance law —
`composer.tsx:58-62` `resolveImageGenReason` precedent, which already surfaces an unavailable offer's
reason on activation instead of silently no-oping). The four reasons live as named constants beside
`WAND_NEEDS_TEXT`/`NEEDS_ASSISTANT_REPLY`/`DRAFT_UNLOCK_AFTER_SEND` (`#lib`).

Matrix — icon × phase (✓ = live, plain + guided both work; ⛔ = disabled-with-reason):

| Icon | DRAFT (no committed chat) | COMMITTED · user tail | COMMITTED · assistant tail |
| - | - | - | - |
| **🎭 Impersonate** | ⛔ `IMPERSONATE_NEEDS_CHAT` | ✓ writes a USER line — VALID (it doesn't need an assistant tail; it appends the user's next line regardless) | ✓ |
| **⟳ Swipe** | ⛔ `SWIPE_NEEDS_REPLY` | ⛔ `SWIPE_NEEDS_REPLY` (no assistant tail to reroll) | ✓ |
| **▷ Response** | ✓ **"Generate opening"** (`fireOpening` → `startChat opening:generate`; empty = plain opening, text = guided opening) | ✓ generate reply (empty = plain, **repeatable** — the consecutive-fire bug fixed; text = guided) | ✓ generate reply (with `responseNudge`, §a′) |
| **⏩ Continue** | ⛔ `CONTINUE_NEEDS_REPLY` | ⛔ `CONTINUE_NEEDS_REPLY` (no assistant tail to extend) | ✓ |

Reason strings (named, legible, plain-language — no jargon):

- `IMPERSONATE_NEEDS_CHAT = "Send your first message to impersonate a reply."`
- `SWIPE_NEEDS_REPLY = "Needs a reply to regenerate."`
- `CONTINUE_NEEDS_REPLY = "Needs a reply to continue."`
- Response is never disabled (it always has a valid arm across all three phases — it is the always-live
  action, which is exactly why it hosts empty-send-generate). Its DRAFT tooltip is "Generate opening";
  its committed tooltip is "Generate reply".

Phase resolution reuses the existing derivations: DRAFT vs committed = `isCommitted(handle)`; the
assistant-tail check = `tailAssistantMessageId !== null` (`use-guided-actions.ts:162-165`); the
transient busy gate (`turnBusy || isPending || busy`) disables ALL FOUR during a live turn (with a
transient reason, or no reason — a spinner suffices). Impersonate's user-tail validity is the one
subtlety the owner named: it appends a user line and needs no assistant tail, so it's live on both
committed phases (draft-disabled only because impersonate needs the turn machinery a committed chat has).

### 2.4 D-ledger touches

D33 (guided config home) untouched — `responseNudge` joins `continueNudge`/`impersonateNudge` in the
SAME `formatStrings` home (the nudge-is-preset-config precedent, not a new home) · D57 (input recovery
client-only) obeyed by Recover-input + the fired-steer ring · **D56 REALIZED, not contradicted — the
`commitMessage` verb IS the "commit without turn" future D56 explicitly named** (D56 killed
`simpleSend` as a byte-identical duplicate of a solo `send` that STILL generates; post-without-generate
is a DISTINCT capability it named `commitMessage`/`injectMessage` for — this builds it) · D107 (the
`responseNudge` format string + the `generateOnEmptySend` pref + the `commitMessage` verb all ship WITH
their consumers) · extends the P5 wand re-home (D110-4 — the game steers move into the utility menu).
**Proposed D111 clause:** *"The composer control map is ST-style: ☰ = the relocated chat-options menu ·
✨ = the utility menu (Recover input \[recall last fired steer] · Corrections · Undo/Revert continuation ·
Clear input · Simple send \[`chat.commitMessage` — commit the user row without firing the AI turn, the
D56-named `commitMessage` future] — omit-doctrine drops any ST item with no backing verb: reasoning
toggle / spellcheck / help) · four always-visible dual-mode guided icons (impersonate·swipe·response·
continue), phase-gated with legible disabled-reasons, never hidden or swapped; the one-shot three
CONSUME+restore-on-fail, Swipe KEEPS the steer for repeated rerolls · empty-Response generates (the
fork-at-user-tail affordance, `responseNudge` making an assistant-tail reply coherent) · Send stays
send-my-message. The typed-text-becomes-steer contract is taught by the at-action hover cue + the
icons' charge state, recovered via Recover input."*

---

## 3. FORKING — fork clones the game

### 3.1 Current state (verified)

`forkChat` (`domain/chat/verbs/fork.ts:277-415`) deep-copies chat/roster/canon/injections with fresh
ids via `slotIdMap` + `variantIdMap` (`buildCanonCopy:105-158`), floor-clamped (D106), member-stripped
(D110 §3.6), atomic batch. The stopgap (`8306a2b9`): `forkMetadataWithoutGame` (`fork.ts:265-275,
361-365`) DROPS `metadata.rpg` so the fork is a valid plain chat. rpg keying (`db/schema/rpg.ts`):
per-game = `rpg_games (chatId UNIQUE)` / `rpg_sheets (gameId, actor XOR)` / `rpg_hud_widgets (gameId)`;
per-variant = `rpg_snapshots (variantId UNIQUE, CASCADE)` / `rpg_journal (gameId, variantId nullable)`;
`rpg_checkpoints (gameId, snapshotId RESTRICT)`. Pre-fix forks carry a dangling pointer and
`useSuspenseQueries` on `rpg.getGame`/`getTrackerView`
(`features/rpg/hooks/use-rpg-context-state.ts:58-66`) throws NOT\_FOUND into a boundary whose only arm
is "Couldn't load the scene. Retry" (`rpg-error-state.tsx`) — a permanent retry loop.

### 3.2 The design — `ChatRpgOps.forkGame`, pointer-write-LAST

**The op (chat's contract, rpg's impl — the one-directional pattern already carrying
`onTurnCompleted`):**

```ts
/** Clone the source chat's game onto a freshly-forked chat. Chat calls this AFTER its atomic fork
 *  batch commits; rpg copies its whole vertical through the fork's id maps and writes the fork's
 *  metadata.rpg pointer LAST (setRpgPointer) — so a crash/failure at any point leaves the fork a
 *  valid PLAIN chat (the 8306a2b9 stopgap is the structural fallback, not a code path). No-op
 *  (cloned:false) for a non-game source. */
readonly forkGame: (args: {
  readonly sourceChatId: ChatId;
  readonly newChatId: ChatId;
  /** The fork's message/variant remaps — snapshots/journal re-key THROUGH these; an entry whose
   *  variant wasn't copied (past throughSeq / below the forker's floor) is dropped by construction. */
  readonly slotIdMap: ReadonlyMap<MessageId, MessageId>;
  readonly variantIdMap: ReadonlyMap<MessageVariantId, MessageVariantId>;
  /** The forker's SOURCE-room posture — drives the config strip (host secrets never launder across
   *  the member→host transition, the §3.6 fork precedent applied to game data). */
  readonly forker: { readonly userId: UserId; readonly readsHidden: boolean };
}) => Promise<{ readonly cloned: boolean }>;
```

**fork.ts changes:** `buildCanonCopy` returns its `variantIdMap` (it already builds it,
`fork.ts:144`); after `db.batch` + emits, `forkChat` awaits `ctx.rpg?.forkGame(…)` in a
try/catch-log — a clone failure logs (`chat.fork.game_clone_failed`) and the fork ships plain
(degraded, never broken). `forkMetadataWithoutGame` STAYS byte-identical (the op writes the fork's own
pointer; the copied-metadata strip remains correct).

**The copy rules (rpg-side, one `db.batch`):**

| Table | Rule |
| - | - |
| `rpg_games` | new id; `chatId = newChatId`; copy mode/status/sessionNumber/config (post-strip, below); `gmUserId` → null in lite (seatless) — carry-if-forker-is-holder when full lands; `gmPresetId` → carried ONLY if the forker owns the preset (a foreign presetId in a game the forker now hosts is a cross-tenant read the moment `resolvePresetOverride` feeds it into their turns — the \[\[injected-op-caller-gate]] class). rpg can't read presets: compose wires a `resolvePresetOwned(presetId, userId) → boolean` op into `RpgContext` (`compose/rpg.ts` deps, off the preset front door — the `resolveHostPrincipal` precedent). |
| config strip | non-`readsHidden` forker: `lite.steeringNote` → `""` (host-secret — `RpgConfigView` deliberately never serves it to members, `views.ts:132-136`; a fork must not launder it). Everything else (statProfile, features, extraction knobs, userMacros) carries — play-style, member-visible by design. |
| `rpg_sheets` | copy rows whose actor is IN the fork: the forker's `user` row + rows for `characterId ∈ keptCharacterSeats` (chat passes the kept set? No — rpg derives it: copy rows whose characterId maps to a fork participant via `resolveRoster(newChatId)`, or simpler and MAXIMAL: copy ALL sheet rows verbatim (new ids, new gameId) — the roster∪sheets projection (`tracker-view.ts:126-142`) only renders roster members, so a dropped seat's sheet is invisible-but-preserved, and a later re-invite/re-seat finds its sheet waiting. **Recommended: copy all** — it is the derive-don't-decide arm and costs rows, not correctness. Other humans' `user` sheets: copy too (same argument — an invited-back member finds their sheet). |
| `rpg_hud_widgets` | copy all (new ids, new gameId). |
| `rpg_snapshots` | copy rows where `variantId ∈ variantIdMap` (throughSeq + floor respected by construction — the maps only contain copied rows); remap id/gameId/messageId/variantId; state columns verbatim (locks carry — pins are room truth); `committed` carries as-is (an uncommitted head stays uncommitted; the fork's next send commits it via the normal `onUserCommit`). |
| `rpg_journal` | model entries (`variantId ≠ null`): copy iff `variantId ∈ variantIdMap` (remap; `sourceMessageId` remapped via slotIdMap else null). Hand entries (`variantId = null`): copy all (room truth on every lineage), `sourceMessageId` remapped-or-null. |
| `rpg_checkpoints` | copy iff its `snapshotId` was copied (remap). RESTRICT is satisfied by insert order: snapshots before checkpoints in the batch. |
| pointer | LAST: `ctx.setPointer(newChatId, {gameId: newId, engaged: config.engaged})` — the crash-safety hinge. |

**Hidden-content audit (design-time proof, record in the op header).** snapshots/journal store
model-extracted STATE, not tagged prose — the P3 `<lie>/<ofilter>` spans live in message bodies, which
`copyVariantStmt` already strips for a non-host forker (`fork.ts:83-99`). One theoretical vector: a
journal entry or `recentEvents` beat whose TEXT quotes a veiled truth (the extractor read the
model-plane body). **Under recommendation A (§1.6 clause, owner-recommended for #7) this vector is
CLOSED AT THE SOURCE:** on a deception-active game the extraction is instructed to write only surface
reality, so tracker prose never carries the hidden truth — the fork copies member-safe data, no strip
needed. The fork clone therefore does NOT redact tracker prose (there's nothing to redact under A);
it relies on the §1.6 prevention. \*\*Belt (defense-in-depth, cheap): the fork strips `steeringNote`
(host secret) regardless, and — pending the #7 sign-off — a non-host forker's snapshot `recentEvents`

- journal content MAY optionally run the same `stripHiddenSpans` the bodies get, in case a model ignored
  the surface-only clause. Recommend building the strip belt (it's a `stripHiddenSpans` call over two text
  fields, matching the body-copy precedent) so the fork is safe under BOTH #7 outcomes.\*\* FLAGGED for the
  security-executor at W-F build (the fork batch is a cross-tenant write surface — the D108 carve rule 1
  lens applies to every new by-id copy) and for the owner's #7 sign-off (§6.7).

**Tests (the load-bearing set):** fork-with-game → panel renders on the fork (getGame + tracker view
byte-equal modulo ids at the fork head) · swipe-consistency across the fork (fork at a slot with 2
variants: each fork variant resolves ITS copied snapshot) · truncated fork (`throughSeq`) drops
later snapshots/journal/checkpoints · non-host forker: steeringNote stripped, foreign gmPresetId
nulled, hidden-span bodies stripped (existing) while the game still clones · clone-failure → plain
chat, no pointer, no crash · member-floor fork (`from-join`): snapshots below the floor are absent
because their variants are (by-construction assert). Cross-tenant probe per the W2 sweep discipline.

### 3.3 Resilience — the dangling-pointer heal (pre-fix forks + any future desync)

Two arms, both built (defense in depth):

1. **Client: a typed NOT\_FOUND state, not a retry loop.** The takeover's `QueryBoundary` gains a
   NOT\_FOUND discrimination (tRPC error code — transport already maps `DomainNotFoundError`):
   `RpgErrorState` grows a second arm rendering "This chat points at a game that no longer exists."
   with, for the HOST only, a "Detach game" action; members see the copy + nothing (PERMISSION-omit).
   Transient errors keep the Retry arm. (`rpg-error-state.tsx` is the home; the boundary already
   wraps band + body separately — both route the same discrimination.)
2. **Server: the heal verb.** `rpg.detachDanglingPointer(chatId)` — host-gated
   (`requireHost` via the membership op), verifies `findGameByChat === undefined` (refuses to detach
   a LIVE game — that's `#40 engaged:false`'s job), then clears the pointer via a widened
   `setPointer(chatId, null)` (the chat op accepts null = delete the `metadata.rpg` sub-blob; today
   it only writes). One verb, sweep-classified (D-entry: \[\[new-router-needs-sweep-classification]]),
   plus optional boot-time reporting is NOT built (a scan for dangling pointers is a scripts/probe,
   not product).

### 3.4 D-ledger touches + proposed entry clause

D27 (forks = copy + parentChatId, one branch axis) — the game clone is the same copy discipline
extended to the feature that owns the data; D18/D23 (no ownerId; authority via chat FK) — the clone
re-keys the FK chain, nothing else; D106 (floor) — inherited by construction from the id maps; D110
§3.6 — the steeringNote/gmPresetId strips extend the member→host laundering rule to game data.
**D111 clause:** *"A fork CLONES the game: `ChatRpgOps.forkGame` re-keys the rpg vertical through the
fork's id maps, strips host-secret config for a non-host forker, and writes the fork's pointer LAST;
a failed clone ships a plain fork. Dangling pointers render the typed gone-state and heal via the
host-gated `rpg.detachDanglingPointer`."*

---

## 4. THE SWEEP — the rest of the crunch

### 4.1 Blank "Group" bubbles — state-anchor slots become silent by construction

**Root cause (found):** `applyHandEdit` on a committed head clones forward onto a fresh narrator slot
minted with EMPTY content — `ctx.postNarratorMessage(game.chatId, "")`
(`domain/rpg/snapshot-edit.ts:92-106`). Every between-turns hand edit (and the seeder's setup edits —
the three blank "Group 10:16 AM" bubbles in `reports/snaps/freeform-game.png` /
`_probe-d20-panel.png`) mints an empty assistant canon row that (a) renders as a blank bubble
attributed to the group bucket, and (b) RIDES THE PROMPT as an empty assistant turn (canon is loaded
whole — context pollution + a per-edit cache-buster).

**The design:** the anchor is a first-class SILENT slot, not an empty message.

- `postNarratorMessage` gains `opts?: { anchor?: boolean }`. An anchor mint sets the SLOT's
  `excludedFromPrompt: true` (the D26 column exists precisely for canon-that-isn't-prompt) at insert.
  Wire/prompt half: assembly already honors `excludedFromPrompt` — the empty row leaves the prompt.
- Reading surface half: the message list hides a row that is `excludedFromPrompt && content === ""`
  (both flags — an excluded row WITH content, e.g. the checkpoint-restore notice, still renders).
  Registry framing: this is a D110 §3 content-class in spirit (`{reading: hide, wire: drop}`), but it
  needs no walker/grammar row — the classification is structural (two column reads), so a registry
  row would be ceremony; note the equivalence in the code header instead.
- Call sites: `applyHandEdit`'s clone-forward and §1.3's resync write mint anchors;
  `restoreCheckpoint`'s `RESTORE_MESSAGE` stays a VISIBLE narrator line (it is room-facing news) —
  optionally restyled as a system chip by the reading surface (defer to the a9361256 lane's taste
  pass).
- Swipe/undo semantics: anchors are real slots (snapshots key their variants) — hiding them from the
  surface must NOT break seq-based navigation; the hide is a render filter, never a load filter (the
  virtualizer sees the row, renders zero-height — the existing hidden-row idiom).

### 4.2 Panel beauty — the mock-convergence punch list (route: builder lane + side-eye)

The ratified target EXISTS (`panel-redesign/DESIGN.md` §1–§12 + the html mocks); the live panel
(snaps above) diverges. The specific deltas, each cited to its mock rule — this is the punch list the
builder executes and side-eye verifies against (\[\[side-eye-fix-all-findings]]):

1. **Waystone illegible** — live \~40px circle with unreadable overlay. Mock: 76px desktop / 64px
   mobile, dial ring + sky + horizon (`header-band.html`; DESIGN §2). Build the real
   kit composite (charts/meter sibling, §11 map) at mock size; `aria-hidden`, band text = datum.
   Unset state per §12.2.1.
2. **Orb duplicate numbers** — live renders the value INSIDE the ring AND `28/40` beneath. Mock rule:
   TEXT IS THE DATUM — label + `value/max` line beneath, ring aria-hidden, ONE number surface
   (DESIGN §2 satellites; the tracker-kit a11y model). Drop the in-orb numeral (the ring's arc is the
   glance; the text line is the read). GOLD is a max-less quantity → the coin DISC, not a ring
   (§8.1 — the live GOLD orb wearing a gauge ring is the exact "lie of shape" the mock killed).
3. **Roster asymmetry** — live: viewer card = 3 full meters; NPC card = name + "status…" + "+
   condition" stub. Mock (`status.html`): EVERY roster card is the same instrument card — portrait,
   name line with relationship badge (when cast-joined, §12.2.3), volatile `status` line, meters WHEN
   volatile exists, honest absence otherwise ("the story fills it" microcopy — never a phantom
   meter). The card component must be ONE component with data-driven rows, not a self-card and a
   stub-card.
4. **Dead vertical space** — half the viewport empty below the roster. Status is the roster's
   game-state LENS (mock: encounter banner + roster + veiled ledger); with 2 actors it is legitimately
   short — the fix is density + completeness, not filler: render the veiled section (host), the
   §12.1.5 doorway lines, and let the tab's natural height stand — but ALSO fix the band/strip
   proportions so the viewport doesn't read as a void (the mock's card density is \~2× the live).
   NO decorative fill (Chanel pass, §9).
5. **Bar-color grammar** — implement `trackColor(ordinal)` as specified (§12.1.2): ordinal in
   `poolDefs` order → `--color-track-{1..6}`, ONE derivation feeding GM swatch, orb, bar, budget
   slice; `widget.accent` warded to the vocabulary. Kill any per-surface color picks.
6. **Header hierarchy** — the band is location-first bold with day·time·weather + cues row
   (`header-band.html`); the live band approximates it but the freshness chip ("As of last beat")
   crowds line 2 — move it to the cues row with the veiled count + read-only pill (DESIGN §2 cues).
7. **Blank-bubble fix (§4.1)** clears the transcript side of the game-chat first impression.

### 4.3 META-TABS (settings / injections / preview) — scoped, owned elsewhere

The redesign targets are ratified in the mocks (`settings.html` — CP-1 consolidated body in takeover
density + the "This game" display-prefs group; `injections.html` — class-grouped guides/notes + the
one-seam cross-link card; `preview.html` — the swatch-keyed stacked budget bar + verbatim state
block, veiled line crown-gold). The a9361256 lane holds this queue (workboard item 1). Design
addendum from THIS investigation only: the Preview tab's budget slices must key to the SAME
`trackColor` vocabulary as §4.2.5 (one ramp everywhere), and the Injections tab's cross-link card
should name the §1.3 reminder explicitly ("trackers ride this channel") so the extraction/steering
story reads as one system.

### 4.4 Additional crunch surfaced (fold into waves)

- **`JSON.stringify(baseState)` leaks plumbing to the model** — `fieldLocks` (and quest/objective
  ids) ride the CURRENT STATE block (`compose/rpg.ts:314`). Fix with §1.6's model-facing state
  projection (strip locks → a "locked paths" prose line; ids stay — quest identity matters for
  update-by-name disambiguation… verify: extraction targets quests by NAME (`upsertQuestArgsSchema`),
  so ids are noise → strip them too).
- **Recent-steers ring dedupe** (§2.3a) — client-only.
- **`resolveTrackersReadOnly` cost** — every `getTrackerView` read resolves host principal + room
  connection (`compose/rpg.ts:580-609`). Correct but hot (panel + gather). NOT redesigned (the gather
  already reuses one verdict per turn); noted for a memoize-with-TTL if profiling ever bites.
- **Wand `fireGameSteer` has no failure restore** — deliberate (no typed text to lose,
  `use-guided-actions.ts:207-213`); confirmed correct, no change.

---

## 5. BUILD SEQUENCE

Ordered for dependency + risk; each wave is whole-tree-gated per the constitution. **Lane routing per
\[\[fable-5-orchestration-audit]]: the two SECURITY-SENSITIVE waves route to `security-executor` (not
self-implemented, not Fable) — W-F (fork cross-tenant copy + host-secret strips + `resolvePresetOwned`)
and W-C (`rpg.resyncFromStory` host-principal model-call verb).** The other waves are executor-lane
(non-security) and GREENLIT to build after the owner signs this update; side-eye on every visible
surface; verifier on every non-trivial claim.

| Wave | Lane | Contents | Depends on | Verification |
| - | - | - | - | - |
| **W-A** | executor | §4.1 state-anchor silent slots (postNarratorMessage opts + render filter) — small, unblocks every game-chat screenshot | — | verifier + side-eye (transcript) |
| **W-B** | executor | §1.3 transcript threading: `RpgTurnContext` + engine projection + window slicing + prompt restructure + knobs (`extractionContext`/`extractionWindowTokens`/`reconcileEveryBeats`) + §1.6 plane-prompt registry + ratchet test + state-projection strip (§4.4) | — | verifier (composed-real int: window content, byte-compat `beat` arm) + LIVE probe on the 8B (\[\[e2e-live-verification-facts]] rig) — the 8B-quality question is empirically settled here |
| **W-C** | **security-executor** | §1.3 reconcile cadence + `rpg.resyncFromStory` (+ `resolveCanonWindow` chat op, GM console surface, panel doorway) — a NEW host-principal model-call site (the D109-F1 consent-seam class) | W-B | security-executor implements; verifier confirms |
| **W-D** | executor | §2.3 wand control map: ☰ relocation · ✨ utility menu (omit-doctrine) · four dual-mode guided icons · `responseNudge` (one server touch, §a′) · `commitMessage` verb (Simple send, §a-BUILD — the other server touch: `createSend` front-half factored + a commit-only verb + sweep classification) · the per-action clear matrix (§a″ — Swipe keeps the steer) · the visible-steer hover cue + charge state · Corrections hardening · the draft/committed matrix (§2.3.1) | — | side-eye (mandatory — THE visible surface) + CT matrix (each icon × draft/user-tail/assistant-tail × empty/text × solo/multi; the Swipe-keeps-steer reroll ergonomic) + a verifier pass on `commitMessage` (the extracted `createSend` front-half must stay byte-identical) + the disabled-reason legibility/touch check |
| **W-E** | executor | §2.3d empty-Response generate keyboard arm (`resolveEmptySendAction` generate branch + `generateOnEmptySend` pref + placeholder/glyph) — the icon home lands in W-D; this is the bare-Enter convenience | W-D (shared composer files) | verifier + side-eye; unit tests on the pure resolver |
| **W-F** | **security-executor** | §3.2 forkGame op + fork.ts call + config strips (steeringNote/gmPresetId) + `resolvePresetOwned` op + the cross-tenant test set — a cross-tenant copy surface (D108 carve rule 1) | — | security-executor implements + the hidden-content audit (§3.2); verifier confirms |
| **W-G** | executor | §3.3 dangling-pointer heal (client typed NOT\_FOUND arm + `rpg.detachDanglingPointer` host verb + setPointer(null) widening) | — (unblocks pre-fix forks immediately; can land before W-F) | verifier + sweep classification |
| **W-H** | executor | §4.2 panel punch list + §4.3 coordination | a9361256 lane state | side-eye against the mocks, fix-ALL loop |
| **W-I** | orchestrator | D111 mint + spec change-logs (parity-plus §change-log, lite-plus spec, workboard rows) | all | docs gate (`pnpm check:docs`) |

Independence: W-A / W-D / W-G (and W-F once security-executor picks it up) are mutually disjoint —
parallelizable in worktrees per \[\[worktree-isolate-concurrent-lanes]] (serialize main-tree commits per
\[\[concurrent-main-lanes-gate-thrash]]). W-B is the critical path for the headline feature (W-C depends
on it). Every wave lands with its tests in the same commit (test-presence); every schema-visible change
is additive (no baseline regen — config blobs self-heal; the one column touched,
`messages.excludedFromPrompt`, already exists; `responseNudge` is an additive `formatStrings` field).

---

## 6. OWNER DECISIONS

**RATIFIED round 1 (signed, no further action):** (1) extraction `window`@4096 + reconcile-every-10;
(2) resync = host-principal consent at the verb; (3) Regenerate dual-home; (4) "Generate reply" rename
(now the Response icon tooltip); (5) `generateOnEmptySend` ON — RE-HOMED onto the Response icon, Send
unchanged; (6) fork copies ALL sheets; (8) `RESTORE_MESSAGE` restyle deferred to the a9361256 lane.

**OPEN — final owner sign-off needed:**

7. **#7 — deception → tracker-prose leak.** Orchestrator recommendation **A (designed-in below,
   awaiting owner confirm): the tracker tracks the PLAYERS' SURFACE reality; the hidden truth stays in
   the reveal-eye / reasoning channel (host-gated by P3).** Under A the extraction prompt (§1.6 plane
   registry) gains a standing clause on a DECEPTION-ACTIVE game: *"Record only what the SCENE openly
   shows — a character's outward words and actions. Do NOT write a character's secret truth, hidden
   motive, or a lie's real answer into any tracked plane (journal, beats, cast thoughts, relationship);
   the hidden layer belongs to the reasoning channel and the host's reveal-eye, never the panel."* This
   keeps deception airtight WITHOUT re-opening the P3 member-strip surface (the tracker never carries
   the truth in the first place, so the fork §3.2 leak vector evaporates — journal/beats hold only
   surface reality). It also aligns the tracker's semantics with what the panel is *for* (the players'
   live view). Recommendation: **adopt A** — it is the cleaner boundary (prevention over redaction) and
   costs one prompt clause. Confirm, and item 1 (W-B) + item 3 (W-F) build to it.

**NEW decisions from the owner-specified wand (recommendations inline):**

9. **☰ single home** — relocate chat-options to the composer's left AND remove the topbar ☰, or keep
   both. Recommend: composer-left only (the owner's map), topbar affordance removed (one home).
10. **✨ utility menu composition (round-2 corrected).** Reasoning-toggle / spellcheck / help stay
    OMITTED — no backing verb/pref exists for any (grep-verified); "Separated thinking" becomes a
    doorway if a reasoning-visibility pref is ever added. **Simple send is IN — as a small build:** no
    send-without-generate path exists today (exhaustively verified — `createSend` always generates,
    `UserIntent` has no suppress flag, `commitMessage`/`injectMessage` unbuilt), so it ships as the
    `chat.commitMessage` verb D56 pre-named (§2.3a-BUILD). **Recover input stays mapped to the
    fired-steer ring** (owner-clarified: the intent is "recall the last steer you used", which the ring
    already does — no separate draft-recovery store). Recommend: accept the six-item menu (Recover
    input · Corrections · Undo · Revert · Clear · Simple send).
11. **`continueOnSend` pref vs the Continue icon** — the icon is the discoverable home; keep the pref
    as a bare-Enter convenience or retire it. Recommend: keep the pref (harmless, keyboard-fast).

---

*Investigation evidence base: compose/rpg.ts · contracts/rpg/{extraction,tools,config,snapshot,views,
actor,pointer}.ts · domain/rpg/{chat-ops/*,flush-barrier,snapshot-edit}.ts · domain/chat/{verbs/fork,
verbs/turn,assembly/context,engine/engine,engine/pipeline,contract/{context,results}}.ts ·
db/schema/rpg.ts · client features/chat/{components/{composer,composer-wand,rewrite-dialog},
hooks/use-guided-actions,lib/continue-on-empty} · features/rpg/{hooks/use-rpg-context-state,
components/rpg-error-state} · reports/snaps/{freeform-game,\_probe-d20-panel}.png · the D-ledger ·
parity-plus spec §2.7/§3/§10.1/§10.1a · panel-redesign DESIGN.md §12 · docs/history/retro-workboard-2026-08-14.md.\*
