# 06 — Persistent Guides: the Fifth Capability (labeled injections a side generation maintains)

> **Status: COMMITTED (D59, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** The OTHER half of the guided-generations extension. Orbweaver adopted its EPHEMERAL
> steering half in full (the 6 guided actions — `contracts/preset` + `kit/guided`; D56/D57 settled
> two adjacent scraps) but the PERSISTENT half had no owner doc: a side OOC generation ("what is
> each character thinking" / "what is everyone wearing") whose output is stashed as a **persistent
> labeled injection** maintained across turns, with per-guide auto-refresh, and edit/show/flush
> management. The substrate already exists (`chat_injections` persistent rows + `kit/injection`
> `{depth, role}`); this doc gives it the owner. Source evidence: the extension's
> `scripts/persistentGuides/` (AGPL; orbweaver is private — **verbatim template copying is
> sanctioned**; cited `(gg: <file>)`).

---

## 1. The shape — ONE generic mechanism, named guides as packaged TEMPLATES

**DECISION: one `guide` mechanism in `domain/crew`: a per-chat guide DEFINITION row
(`crew_guides`) + a side generation that refreshes ONE persistent chat injection
(`id = "guide:<key>"`, written via the injected `chat.setChatInjection` op — injections are
chat's data, the domain-of-affect rule again).** The extension's five named guides are packaged
TEMPLATE presets over this one mechanism, plus unlimited custom guides:

| Packaged template | Default prompt (STEAL verbatim, then trim shouting) | depth | label frame |
|---|---|---|---|
| `thinking` | *"[OOC: Answer me out of Character! Write what each character in the current scene is currently thinking, pure thought only. Do NOT continue the story or include narration or dialogue. Do not include {{user}}'s thoughts.]"* (gg: thinkingGuide.js) | 0 | `Characters are currently thinking: …` |
| `clothes` | the outfits list prompt (gg: clothesGuide.js — *"…the clothes and look… of all participating characters, including {{user}}, present in the current scene. Don't mention people or clothing pieces no longer relevant…"*) | 1 | `Relevant information for portraying characters: …` |
| `state` | the positions/physical-state prompt (gg: stateGuide.js — same frame, *"don't describe their clothes"*) | 1 | same frame |
| `situational` | the 4-point scene summary prompt (gg: situationalGuide.js — location/present/objects/recent-events, *"factual and neutral without speculation"*) | 3 | `Current situation: …` |
| `rules` | the learned-rules numbered list (gg: rulesGuide.js) | 0 | `Rules for the current scene: …` |
| *(custom)* | user-authored template | user | user (or raw — §3) |

*(Rejected: five hardcoded guide features à la the extension's five script files — one mechanism
with template rows is strictly more capable (users already hacked customGuide/customAutoGuide onto
the extension for exactly this reason) and costs one table instead of five toggles. Rejected: a
new `domain/guides` — the crew already owns per-chat model-brainwork config + the scheduler this
rides; a guide is a crew capability, not a domain. The extension's `funGuide` is just another
template candidate for the packaged set later; its `trackerGuide`/`trackerLogic` stat-tracker is
SUPERSEDED by rpg mode + the tracker-note-in-chatlog behavior is dropped — §6.)*

## 2. State — `crew_guides` (definition only; the CONTENT's one home is the injection row)

| Column | Type | Notes |
|---|---|---|
| `chatId` | text FK → `chats.id` CASCADE | composite PK `(chatId, guideKey)` |
| `guideKey` | text | slug (`thinking`, `clothes`, custom slugs); the injection id is `guide:<guideKey>` |
| `name` | text NOT NULL | display name |
| `template` | text NOT NULL | the side-generation prompt (user-editable; packaged guides seed it — editing never mutates the packaged constant) |
| `depth` | integer NOT NULL | injection depth (per-guide — the extension's per-guide `depthPrompt*` knobs, kept) |
| `role` | text CHECK `system\|user\|assistant` | **FLEXIBLE role — directive**: same rationale as guided actions (some APIs mistreat mid-conversation `system`); default `system` (gg: `injectionEndRole`) |
| `labeled` | integer (bool) NOT NULL default 1 | 1 = wrap output in the guide's label frame; 0 = raw injection (gg: `rawPrompt*` — kept as raw-vs-labeled on the OUTPUT; the extension's raw-GEN mode is subsumed by editing the template) |
| `autoRefresh` | integer (bool) NOT NULL default 0 | re-run after each completed assistant turn (gg: the auto-trigger toggles) |
| `enabled` | integer (bool) NOT NULL default 1 | disabled = definition kept, injection flushed |
| `lastRefreshSeq` / `lastRefreshAt` | integer / nullable | display + staleness hint |
| `createdAt` / `updatedAt` | integer | |

**The guide CONTENT lives in the `chat_injections` row only** (id `guide:<guideKey>`) — one home;
`crew_guides` is definition. The refresh core reads the previous content back through the injected
`chat.listChatInjections` when the template references `{{previousGuide}}` (a data-fed macro
supplied by the refresh core — this REPLACES the extension's `previousInjectionAction:"move"`
trick, which re-injected the old value at depth 4 as historical context during regen: same
continuity effect (outfits don't teleport), one injection instead of two). Guides are
`audience:"all"` — they are portray-consistency aids, not secrets; the whole room's turns render
them and any member may view them (§5).

## 3. The run mechanism — a VERB awaiting the sealed `agentTurn`, NOT a WorkloadKind

**DECISION: `crew.refreshGuide(chatId, guideKey)` is a normal crew verb that awaits ONE
free-text `agentTurn` completion in the request path and writes the injection before returning
(the buddy-`ask` precedent — a user-facing "think now" affordance IS a verb that awaits the
turn).** The side generation's input: the guide template (macro-resolved — `{{user}}`/`{{char}}`
against the chat's personas/cast, `{{previousGuide}}`) + a recent-window transcript slice (the
extension ran `/gen` inside the live chat context; here the crew builds an explicit slice — same
`canon-reads.ts` reader, ~last 32 messages token-trimmed). Output is FREE TEXT — no zod payload,
no bounded-retry machinery: an empty/blank completion is the only failure shape and it simply
refuses to overwrite (`GuideRefreshEmptyError` to the caller; the old injection stays).

*(Rejected: a `crew-guide-refresh` WorkloadKind — three real mismatches: (1) LATENCY: a manual
thinking-guide is interactive ("show me what they're thinking" wants seconds and the content in
the response); the queue poll + the GLOBAL single-active-per-kind index would serialize guide
refreshes across every chat behind one slot. (2) The workloads UI is the wrong surface for it —
nobody retries a stale thinking guide from an admin queue. (3) The members are structured-output
DISTILLERS with appliers; a guide is a free-text completion with one write. The four members stay
Workloads because their runs are batch-shaped and reviewable; guides are interactive. This is not
a second agent SYSTEM — it is the same sealed `agentTurn` op behind a verb, exactly buddy's `ask`.
Rejected: the extension's actual mechanism — an inline blocking composer flow with preset/profile
hot-swapping (gg: runGuide.js `handleSwitching`) — orbweaver never blocks the composer or hot-
swaps the chat's preset; the side generation is its OWN request on the `agent` role connection.)*

**AUTO refresh** (`autoRefresh:true`): the SAME core, fired **post-turn, fire-and-forget** from
`crew.onTurnCompleted` (04 §3 gains a step: after member enqueues, fire auto-guide refreshes —
catch-and-log, never throws into the bus loop, never blocks anything; a stale guide riding one
extra turn is the designed failure mode). The next user turn does NOT wait for in-flight
refreshes. Auto-refresh failure surfaces only as `guideRefreshed` not arriving + the panel's
stale-timestamp hint; manual refresh failures surface to the caller. D46 evolution: identical to
the members (05 §a) — auto-refresh stays scheduler-owned; the Phase-8 reserved action arm can
additionally trigger `refreshGuide` for rule-authored cadences.

**Cost note:** an auto guide is +1 completion per assistant turn PER enabled auto guide — the
config UI carries the same explicit-cost sentence as the every-turn prose audit (03 §4); packaged
guides ship with `autoRefresh:false`.

## 4. Verbs (additions to `CrewService`, 02 §8) + management UX = the extension's edit/show/flush

```ts
// guides (host-managed, member-visible)
listGuides(p): Promise<GuideView[]>                    // member; definition + current injection content + lastRefreshAt
upsertGuide(p): Promise<GuideView>                     // host; create custom / edit template-depth-role-labeled-auto
setGuideEnabled(p): Promise<GuideView>                 // host; disable flushes the injection, keeps the definition
refreshGuide(p): Promise<{ content: string }>          // host (§5); the awaiting verb — returns the new content
editGuideContent(p): Promise<void>                     // host; hand-edit the CURRENT content → chat.setChatInjection (gg: editGuides popup)
flushGuide(p) / flushAllGuides(p): Promise<void>       // host; delete the injection row(s), definitions kept (gg: flushGuides "All" option)
addPackagedGuide(p: { chatId; template: PackagedGuideKey }): Promise<GuideView>  // seed a packaged template row
```

`editGuideContent` and the flush pair are thin wrappers over chat's existing injection CRUD
(`setChatInjection`/`deleteChatInjection` — already authority-gated by chat); the wrappers exist
so guide edits also bump `lastRefreshAt`/emit `guideRefreshed` and so the panel has one API.
Bus events (additive to 04 §4's union): `guideRefreshed {chatId, guideKey}` ·
`guideFlushed {chatId, guideKey | "all"}` · `guideConfigChanged {chatId}`.

## 5. Multi-human — guides are ROOM state, host-managed, room-visible

A guide's injection lands in the SHARED prompt (every speaker's turn renders it) and its refresh
spends the host's money — so: **manage/refresh = HOST; view = any participant** (the guides panel
shows content read-only to members — no secrets here by design, `audience:"all"`). The extension
had no multi-user model at all; this is the D16 host-only-v1 conservatism applied, same as every
crew member. *(Rejected: per-participant private guides — that is the D46 reserved per-participant
injection/variable overlay's territory; a "my private thinking-guide" would have to inject into
only MY speaker's assembled turns, which is a per-participant prompt axis the room doesn't have
yet. Reserved-additive with that overlay, criterion: the overlay lands and someone asks.)*

Game chats: guides are NOT blocked by the rpg mutual exclusion (05 §h) — they are inert
prompt-side aids with no second-director problem; the rpg reminder and a clothes guide coexist.
(The exclusion stays scoped to the four MEMBERS.)

## 6. Adjacent findings — the rest of the extension, cataloged so nothing is lost

One line each; NOT designed here:

- **spellchecker** (`scripts/tools/`-side input polish) — a composer affordance (fix my typed
  message before send): Phase-6 CLIENT item — a composer button calling one cheap completion
  (the `agent` role) and replacing the draft; no domain state. Home: the chat composer feature +
  a tiny transport procedure; recommend building WITH the Phase-6 composer polish pass.
- **edit-intros** (rewrite greeting/intro variants) — a character-adjacent authoring tool:
  home = a guided-action-style rewrite over `characters.greetings` in the character editor
  (owner-only); recommend deferring until the character editor UX pass.
- **input recovery** — ALREADY DECIDED: D57 (client Zustand/TanStack Form concern; no backend).
- **trackerGuide / trackerLogic** (the stat-tracker chat-log notes) — SUPERSEDED: rpg mode owns
  stat tracking (D58); the tracker-note-in-chatlog rendering (collapsible HTML `<details>` blobs
  appended to canon messages — gg: runGuide.js `createTrackerNote`) is REJECTED as a pattern
  (writes presentation HTML into canon; orbweaver renders guides in the panel, canon stays prose).
- **updateCharacter.js** (fold guide learnings back into the card) — SUPERSEDED by
  `crew-card-evolution` (03 §2), which does it with review instead of in-place writes.
- **funGuide** — a packaged-template candidate for the guide library later; nothing structural.

## 7. Test plan additions (folded into 08 §3)

Refresh-core goldens (mocked agentTurn): labeled vs raw framing; `{{previousGuide}}` supplied from
the live injection; blank-completion refuses overwrite; injection id convention `guide:<key>`
pinned. Auto-refresh: fires post-turn only for `autoRefresh` rows, never throws into the bus loop,
skips when a refresh for that guide is already in flight (an in-process per-`(chatId,guideKey)`
latch, `ASSUMES(single-replica)` annotated — the buddy in-flight-Set pattern). Authority: host vs
member matrix over all seven verbs. Round-trip: disable → injection gone, definition kept →
re-enable + refresh → injection back at the same depth/role.
