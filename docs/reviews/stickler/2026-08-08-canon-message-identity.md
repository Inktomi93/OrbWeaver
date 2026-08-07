# Canon message identity — design investigation (stickler, 2026-08-08)

> **Charge:** adjudicate + design the pre-shape MESSAGE IDENTITY model — the storage/contract shape that
> makes a canon row's PURPOSE a declared fact instead of an assembly-time inference — done ONCE, hedged
> against every parked future, on the pre-launch baseline-squash migration vehicle. Fourteen owner
> sections (8 original + 6 mid-run extensions + the §9 invalidation-contract addition), each with a
> verdict/design. Recommendation-grade only — nothing here was built.
>
> **Form:** current-state INVENTORY (receipts) → the seed idea adjudicated → per-concern sections
> (§1–§14) → THE RECOMMENDATION (one coherent shape) → test/gate lock-in → declared limits → owner
> calls, mantra-marked.

---

## 0. Method + evidence base (what this report's claims rest on)

Read IN FULL this session: `packages/db/src/schema/chat.ts` (701 lines — all ten tables + both CHECK
families); `@orb/kit/message-role` (44); `@orb/contracts/chat/{messages,assemble,content-classes}.ts`;
`domain/chat/assembly/{shape,names,injections,role-squash,trace,macros(→l.120)}.ts`;
`domain/chat/contract/foreign.ts` (the TurnTrigger union, whole file);
`domain/chat/verbs/post-narrator-message.ts` (whole); `engine/pipeline.ts` (l.1–480: the args shape,
reduceStream, receive transforms, the BUILD→SHAPE→FIT walk incl. the prefill/tools and
midConversationSystem gates); `memory/build/{digests,segments}.ts` headers +
`memory/build/substrate/transcript.ts` l.60–130 (blockHash/consolidationHash whole functions);
`memory/persistence/queries.ts::loadCanonThroughSeq` (whole); `verbs/compaction.ts` (the
projectBodyForSummary + excludedFromPrompt filter region); `db/schema/rpg.ts` l.280–340
(rpg_turn_tool_calls whole table). Law read in full: `AGENTS.md`, `Core-Laws-and-Precedents.md`,
`Core-0-Architecture-and-Structure.md` (incl. the §6 partitioning table), `Chat-Macro-Resolution.md`,
`docs/design/st-message-shaping-atlas.md` (583 lines), the D-ledger registry pages covering
D1–D128 (D26/D27/D28/D32/D34/D46/D48/D51/D53/D55/D56/D60/D64/D69/D106/D108–D128 read verbatim),
`proposed/INDEX.md`, `agent-principal-design/02-participants-and-attribution.md` (l.1–80), the dogfood
INJECT-NAMED-AS-PLAYER entry (l.640–830) + the ShapeTrace.rows lens entry (l.1660–1693), the
retro-workboard I-8 NARCOLOR block.

Live receipts pulled this session:

- **The actual DB** (`/api/_debug/db/stats` on :8788, x-debug-token from `.env`): 12 chats · 242
  `messages` · 242 `message_variants` (1:1 — the dev seed carries no swipes) · 32 participants ·
  0 chat_events. `/api/_debug/db/chats` returns the seeded example rooms.
- **The live wire spill** (`.cache/wire-capture/captures.jsonl`): 592 records, 76 real request bodies
  with `messages` (tail is unit-test debris — `chatId:"chat_a"`, `model:"m"`, `at:0`); last real record
  is a vLLM Qwen3-VL captioner call (system + image_url user part).
- **The ST golden corpus**: `scripts/probes/st-goldens/output/` = the 42-capture post-re-sweep arm the
  atlas measures; the atlas's own 13-claim re-derivation stands as the corpus authority (not re-run
  here — see Limits).
- Sweeps: `postNarratorMessage` writers, `midConversationSystem` consumers (6 non-test sites),
  `generateDigests/Segments` trigger sites (engine post-turn + backfill only), `leftSeq` spread
  (37 server files touch it; ~27 inline null-comparison spellings, incl. outside chat:
  `databank/persistence/scope.ts`, `export/verbs/export-chat.ts`, `automation/persistence/canon-reads.ts`),
  `TurnTrigger` homes (4 files), NARCOLOR client gate (`message-content.tsx` `narratorVoiced` prop).

Ledger cross-check per the design-review charge: Core-0 §6 has NO row for message identity/kind (the
partitioning table covers connection/preset/credentials/roles/regex/WI/labels/derived-data/economics/
cards); the D-ledger's nearest law is D26 (slot/variant split), D32 (the role axis), D51 (string
storage + macro model), D116 (injections one door), D124 (hand rows off the message plane). **No
existing ruling already answers "message kind" — the question is genuinely new**, but five rulings
constrain its shape hard (each cited where it bites below).

---

## 1. Current-state map — how a row's identity works today (receipts inline)

**The slot** (`messages`, D26): id · chatId · seq · `role ∈ MESSAGE_ROLES` (system|user|assistant, kit
tuple, D32) · attribution (`authorUserId`/`characterId`/`personaId`, all SET-NULL-degradable) ·
`selectedVariantId` · `excludedFromPrompt` · `initiator ∈ TURN_INITIATORS` + `automationDepth` ·
timestamps. Two CHECK families: `messages_attribution_shape` (characterId ⇒ assistant · personaId ⇒
user · never characterId AND authorUserId; all-NULL always legal so FK cascades never abort) and the
role/initiator list CHECKs derived from the tuples (schema/chat.ts l.276–286).

**The variant** (`message_variants`): content · reasoning (+ reasoningEffort · model · provider) ·
economics (7 fields) · `contextBoundaryMessageId` · toolCalls (`ToolCallRecord[]`, D48) ·
`variableDelta` (D46 fold plane) · `macroDraws` (`UserMacroDraws` — WAVE MU random-pick freeze record,
replayed byte-exact on swipe/continue) · params (`UserIntent`) · `promptSnapshot` (`AssembledPrompt`) ·
gen timestamps · `generationId` (OR handle) · continue-undo twins (content+reasoning ×2) · metadata.
The provider envelopes were deleted 2026-08-03 (header l.36 — "nothing ever wrote them").

**How "what kind of row is this" is answered today — four different mechanisms:**

1. **Role + attribution pattern.** A narrator row = `role:'assistant'` + `characterId` = the lazily
   minted synthetic group character (`post-narrator-message.ts` l.49; engine narrator rounds mint the
   same identity — `turn.ts` runAiRound per the file's own comment). An agent row (D60 design) =
   assistant + `authorUserId` set + characterId NULL. A human row = user + authorUserId (+ optional
   personaId stamp). `role:'system'` has **no live canon writer** (schema header l.198–200) — system
   exists only on injections, and `toShapeCanon` DROPS canon system rows from the prompt
   (shape.ts l.441).
2. **Plane splits.** Per-chat prose steering = `chat_injections` (D116, ONE door); hand-written rpg
   state = `rpg_snapshots` hand rows OFF the message plane (D124); folded terminal tool calls =
   `rpg_turn_tool_calls`, deliberately NOT `message_variants.toolCalls` (schema/rpg.ts l.288–294 —
   filling chat's column "would change what `MessageView.toolCalls` MEANS for every reader").
3. **Derived-at-assembly observation.** `ShapeRowSource = canon|assembled|merged`
   (contracts/chat/assemble.ts l.263) — provenance resolved off the `messageId` discriminator;
   the `speakerless` marker (injections.ts l.185–207) — spliced-injection-internal, consumed by the
   name-stamp, never persisted, never on the wire.
4. **Span-level content classes.** `CONTENT_CLASS_POLICY: Record<ContentSpanKind, {reading, wire}>`
   (contracts/chat/content-classes.ts) — text/image/hidden/card/choices/unknown-directive, a closed
   compile-forced registry. This is IN-ROW vocabulary, orthogonal to row identity.

**ST's equivalent** (the atlas, all MEASURED/SOURCE-PINNED): `is_user` (the role axis) + `is_system`
(a VISIBILITY filter, not a role — a flagged row never enters assembly at all, prong 3) + `extra.type
=== 'NARRATOR'` (the stringly kind that promotes a chat row to wire `system`, prong 2) + free-text
`name` (the sole author discriminator among non-user rows) + `force_avatar` (a name-stamp trigger with
a hardcoded NARRATOR exclusion at openai.js:591). Three prongs, one string bag, exclusions by
special-case — the negative image of what a typed row-kind should be.

**Macro/identity storage today** (Chat-Macro-Resolution §0, verified against `assembly/macros.ts` +
`shape.ts`): content stores RAW; identity macros resolve per-view at read (the one shared atom +
per-chat name producer); volatile macros FREEZE at commit — **destructively baked into the stored
text** (user rows at SEND, pre-USER_INPUT-regex; greetings at first user turn). `macroDraws` records
only the WAVE-MU user-macro random picks — the `{{roll}}`/`{{random}}`/clock-family freeze leaves **no
record and no pre-freeze raw**. AI rows persist post-receive-transform text (AI_OUTPUT regex →
postProcess → per-speaker clean, pipeline.ts l.287–348); the raw model output survives only in the
ephemeral WIRE_CAPTURE ring.

---

## 2. The seed idea, adjudicated

**The proposal:** a typed, closed `kind` union on the message SLOT (`standard | narrator | comment |
…`), exhaustively dispatched (spine §5.5), deciding wire-role mapping + assembly treatment + render
chrome, ORTHOGONAL to role/attribution/excludedFromPrompt — declared intent at storage.

**The adversarial case against it, tested:**

- *"Narrator is already derivable — assistant + synthetic-group characterId."* TRUE today, and the
  derivation is **structurally fragile in exactly the way D26's attribution model promises it will
  be**: all three attribution FKs are `onDelete:'set null'` (schema l.205–213 — the deliberate
  history-preservation cascade). Delete the synthetic group character (or hard-delete a user) and the
  row's narrator-ness/agent-ness evaporates — render tint, speaker splitting, memory labeling, export
  mapping all silently reclassify the row as a degraded standard row. **Attribution is designed to
  degrade; PURPOSE must not.** An inference over degradable columns cannot carry purpose. That is the
  decisive argument, and it is D26's own text ("preserve the authored line") pointing at the gap.
- *"excludedFromPrompt already covers comments."* It covers the PROMPT half only, is a mutable
  per-row knob (any row can be hidden later — that history is indistinguishable from born-OOC), and —
  confirmed this session — **it does not govern memory**: `memory/persistence/queries.ts::
  loadCanonThroughSeq` (l.27–41) selects with NO `excludedFromPrompt` filter, so a hidden row's
  content is digested and can re-enter the prompt through `{{memory}}` recall. A declared `comment`
  kind gives every derived plane ONE dispatch surface instead of N knob-reads (§9).
- *"It duplicates the content-class registry."* No — CONTENT_CLASS_POLICY is span-level (bytes inside
  a row); kind is row-level (what the row IS). The registry is actually the house PRECEDENT for the
  shape: a closed axis + a total `Record` policy + two projection seams. Kind is the same pattern one
  level up.
- *"ST proves you can live without it."* ST lives with three prongs + a string bag, and the atlas
  documents the cost: the `is_system` three-prong confusion, the `force_avatar` special-case exclusion,
  and a NARRATOR mechanism whose own comment says "100% legal way" because nothing about the model
  makes it legal. Ours must be the typed house version — the owner's framing is correct.

**VERDICT: the seed idea SURVIVES adversarial review and is adopted, with two amendments:**

1. **Kind does NOT decide the canon `role`** — role stays the conversation-plane axis (D32,
   unchanged), and narrator rows stay `role:'assistant'` in canon. The wire-role mapping is a
   SHAPE-time dispatch on kind × capability (§7), never a storage fact — otherwise §12's
   provider-independence invariant dies at birth.
2. **Kind does NOT replace the synthetic group character** — the narrator's authoring identity keeps
   the D55 memory scoping (`__group__` bucket), the attribution chrome, and the host-owned mint.
   Kind is purpose; attribution remains voice. (Rejected arm B below.)

---

## 3. §1 — Raw-with-macros storage, linked to canon properly

### Inventory (what is lost today, precisely)

- **User rows:** the composer draft passes volatile-FREEZE (bakes `{{roll}}`/`{{random}}`/`{{pick}}`/
  clock-family values into the text) then the USER_INPUT regex, and the ONE post-transform text is
  persisted (Chat-Macro-Resolution §0, "both the WI haystack and the persisted row are the one
  post-transform text"). The pre-freeze raw and the drawn values are **discarded** — only the WAVE-MU
  user-macro picks survive (`macroDraws`).
- **Greetings:** frozen at the first user turn (`freezeGreetingVolatiles`), same destructive bake;
  the doc's own KNOWN GAP: a post-first-turn swipe to an unfrozen greeting variant is never re-frozen.
- **Assistant rows:** persist post-receive-transform (AI_OUTPUT regex → postProcess → per-speaker
  clean). Raw model output lives only in the ephemeral debug ring.
- **Identity macros** already re-resolve forever (stored raw + row stamps + the per-chat producer —
  the §2 atom). Reattribution (`reattributePersona`/`reattributeMessages`) already works BECAUSE
  storage is raw: re-stamp → producer re-resolves → both consumers update, content untouched
  (Chat-Macro-Resolution §5).

So "what SillyTavern can't" is ALREADY half-built: ST's `substituteParams` destroys identity macros at
prompt time with no stamps to re-resolve from; ours keeps identity raw + stamped. The un-built half is
the VOLATILE family: our freeze is byte-destructive with no record, so a re-render/re-attribution/
swipe can never re-resolve a `{{roll}}` row against new context — or even against the SAME context.

### Design space

- **Arm 1 — status quo** (bake, no record). Cost: the greeting-swipe gap stays open; a re-roll or a
  raw recovery is impossible; edit recovers identity tokens only (the doc says so explicitly).
- **Arm 2 — store raw INSTEAD of baked, resolve volatiles per-view against a recorded draw.** Rejected:
  it breaks D51's "one post-transform text everywhere" (the WI keyword haystack, the regex legs,
  memory hashing, export all read the ONE canonical text) and would re-litigate the owner-ruled freeze.
- **Arm 3 — RAW + FREEZE-RECORD as a variant sidecar, canonical `content` unchanged.** The
  `macroDraws` idiom generalized: keep `content` as the one canonical post-transform text every
  consumer reads today (zero behavior change), and add provenance that makes re-resolution POSSIBLE.

**VERDICT: Arm 3.** Schema delta (rides the baseline squash):

```
message_variants
  + rawContent   TEXT      -- the pre-freeze, pre-regex authored text (composer draft / raw model
                           -- output). NULL ⇔ byte-identical to `content` (the overwhelming common
                           -- case — write it only when a transform actually changed bytes).
  + macroFreezes JSON      -- the volatile-freeze RECORD: ordered occurrences
                           -- [{ name, args?, value }] written in the SAME batch as the variant
                           -- (the macroDraws discipline). NULL ⇔ nothing froze.
```

Contract homes: `macroFreezeRecordSchema` beside `userMacroDrawsSchema` in
`@orb/contracts/chat/messages.ts` (parsed at the read seam, never cast); the freeze registry gains a
record-emitting mode next to `createVolatileOnlyRegistry` — kit already has the exact inverse pair
(`createVolatileOnlyRegistry`/`createNamesOnlyRegistry` sharing `registerVolatileMacros`, macros.ts
l.18–20), so the record hook is a third consumer of the SAME shared axis, not a new axis.

What this buys, concretely: (a) **byte-identical re-resolution** — run the volatile-only registry over
`rawContent` with `macroFreezes` as frozen draws → reproduces `content`'s macro spans exactly (the
`frozenDraws` replay mechanism that already exists for user macros); (b) **intentional re-roll** — the
same run with fresh draws is a host affordance, not a data loss; (c) **closes the greeting-swipe KNOWN
GAP** — freeze-at-selection becomes possible because the unfrozen variant still has its raw;
(d) **reattribution/re-render against new context** — identity macros were already live; now the whole
row is re-derivable. This is the "surpass ST" claim made real: ST has neither the raw nor the record.

**Trust boundary (binding):** `rawContent` is HOST-PLANE. The AI_OUTPUT regex and per-speaker clean
exist partly to STRIP content (a host regex can remove hidden material); serving pre-strip bytes to a
member re-opens the D110 §3.6 class. `rawContent`/`macroFreezes` are served ONLY via the existing
host-gated `VariantWireView` (contracts/chat/assemble.ts l.391 — already the "what one generation
actually did" surface) — **never** on `MessageView`. The [[reasoning-cut-durable-replay-leak]] lesson
applies verbatim: no new member-reachable path is created because the only read surface is one that is
already host-gated at the verb.

---

## 4. §2 — Reasoning + its provenance

**Inventory:** reasoning lives on the variant (`reasoning` + `reasoningEffort` + `model` + `provider`),
with the continue-undo twins (`preContinueReasoning`/`lastContinuationReasoning`). The stream carries a
distinct `reasoning` delta kind (chat_stream_events tuple `["text","reasoning"]`). The `<think>` demux
runs at receive (pipeline.ts l.299–307) gated on empty-native-reasoning + `autoParse`. Member
visibility: reasoning is host-only on deception games, enforced on ALL THREE delivery paths (at-commit
read, live SSE, durable replay — the memory's fix history, incl. the 08-02 producer-stamped
`memberText` cold-scrubber fix).

**Verdict: the variant is already the right home and the identity redesign changes NOTHING here.**
Provenance is per-variant (model/provider/effort ride the swipe that produced them — D26 working as
designed). Two riders:

1. **Agent-sdk encrypted thinking blocks are NOT canon.** Whatever signed/encrypted reasoning material
   a stateful backend needs for replay is backend session state — D25 rules `chats` carries no backend
   session state and the agent-sdk session store (`session_entries`, D8) is its home. Do not add an
   `encryptedReasoning` column to variants; the readable `reasoning` text is the canon-plane fact.
   (Declared limit: I did not enumerate the SDK runner's reasoning arms this session — if a readable-
   vs-encrypted discriminator ever needs to render, it lands as a nullable `reasoningKind` text column
   in the same baseline squash, but nothing read this session demands it.)
2. Any NEW reasoning-adjacent surface (e.g. §3's rawContent, which can embed `<think>` prefixes on the
   raw model output before demux) inherits the host-plane rule above.

---

## 5. §3 — Stats

**Verdict: untouched by the identity redesign — deliberately.** Economics live per-variant (D26 ends
swipe-overwrite); stats owns the four per-owner rollups over disjoint `messages` projections with the
`stats-no-vector-tables` fence (Core-0 §6). Kind adds no economics arm: `comment` rows never generate
(no model call → no economics), `narrator` verbatim posts mint with no economics (post-narrator-message
writes `variant: { content: body }` only), and narrator TURNS already attribute their spend to the host
(D19/D60 posture). No rollup keys on a row-kind today and none should — the one thing to pin is the
NEGATIVE: a kind member must never become a stats dimension without its own D-entry (economics ≠
semantics is the standing fence). *(Not verified this session: the stats ingest projections' exact
column set — see Limits. Nothing in the design depends on it.)*

---

## 6. §4 — Debug: the declared-vs-derived split

**Inventory:** `ShapeTrace.rows` (`ShapeTraceRow {role, name?, source, chars}`) is the content-free
delivered-wire projection, built by walking the SAME `squashRuns` the wire ran (role-squash.ts l.47 —
one adjacency rule, two readers, cannot drift). `ShapeRowSource = canon|assembled|merged`, with
`merged` existing precisely because the INJECT-NAMED-AS-PLAYER fold would otherwise report as `canon`
(assemble.ts l.260–262). `AssembleTrace` is the BUILD-phase twin. RPG_TRACE + `/api/_debug/wire/
{captures,outcomes}` are the provider-plane rings (routes.ts l.248–263).

**Verdict + design:** the split the seed idea names is exactly right and both halves KEEP their jobs:
`kind` = DECLARED intent (storage, travels with the row forever); `ShapeRowSource` = DERIVED
observation (what assembly did THIS turn). Neither replaces the other — a `merged` verdict on a
`narrator`-kind row is precisely the debugging datum ("the narrator row got folded into the player's
turn") that neither axis alone can state. Delta: `ShapeTraceRow` gains an optional `kind?: MessageKind`
carried from the canon row (absent on `assembled` rows — they have no slot), one additive field on an
existing host-only surface; `MessageView` gains `kind` (member-visible and safe — it is chrome
vocabulary, not content). The wire-outcomes/RPG_TRACE rings are unaffected: they record provider-plane
facts and kind never reaches a provider (§12).

---

## 7. §5 — Multi-human, persona handling, and the squash/name-stamp order

**Inventory (all landed THIS WEEK, all read in full):** the `TurnTrigger` union
(contract/foreign.ts l.46–65) — `{kind:"human", userId, personaId|null} | {kind:"none"} | absent` —
replacing the nullable `triggerPersonaId` whose missing fourth state caused INVITE-JOIN-NULL-PERSONA
(a persona-less member's lines attributed to the host). The null-stamp guard
(`shape.ts::userRowAuthorName` l.338–367): a null-stamped row borrows this turn's `{{user}}` ONLY when
it is the trigger's OWN row (`authorUserId === triggerUserId`), else floors to `DEFAULT_PERSONA_NAME`
("Traveler", `@orb/kit/persona` l.21) — the server twin of the client's fail-closed render rule. D122:
persona presentation consents to the room via the OWNER's PRESENT membership
(`presentHumanUserIdsOf`, ONE home shared by verb + resolver).

**The names-before-demote check the charge ordered:** ST's law (atlas, SOURCE-PINNED
`mergeMessages` :882 then :935–937) is *names resolved and DELETED before system→user demotion* — a
demoted row is structurally incapable of acquiring a name. Ours runs the steps INVERTED (demote at the
splice, names later) — and the dogfood entry correctly called the bug "an ordering inversion, not a
missing guard". The landed fix (`34bdc39f3`) achieves ST's guarantee by a DIFFERENT mechanism:
`spliceInChatInjections` marks EVERY spliced row `speakerless` (injections.ts l.198–207 — "a
`ChatInjection.role` is WIRE PLACEMENT, never authorship"), `applyNamesBehavior` honors + CONSUMES the
marker (names.ts l.86–92), and the squash's `distinctCompletionName` disqualifier plus the
name-BEFORE-final-squash order (shape.ts l.289–301, names.ts header — the header's old "after squash"
lie was fixed 2026-08-07) keep merged blocks per-speaker-attributed. **Verdict: our ordering is
equivalent-by-construction to ST's names-before-demote, via a disqualifier rather than a sequence —
CONFIRMED, no change needed.** The end-to-end pin exists ("exactly ONE speaker label … no wire row
leaks `speakerless`", dogfood l.664–665).

**How `kind` interacts:** the `speakerless` marker is assembly-internal and stays (it marks SPLICED
rows, which have no slot and therefore can never carry a kind). Kind takes over the OTHER half of the
same question for CANON rows: `applyNamesBehavior`'s system-row guard (l.86) currently keys on
`role === "system"` — a role no canon row carries — plus the marker; with kind, a canon row's
"may this row be labelled?" becomes a kind dispatch (`narrator` rows label per NARCOLOR's own rules,
`comment` rows never reach the wire at all). Per-seat attribution is UNTOUCHED: the stamp model
(row personaId → producer → name) and the TurnTrigger arms already answer "whose words"; kind answers
"what sort of row" — orthogonal by construction, which is the seed's own requirement.

---

## 8. §6 — Narrator in group mode: splitting + coloring

**Inventory (NARCOLOR, `136139fc` + workboard I-8):** the narrator machinery is: `narratorNudge` +
`speakerTags` as PROSE-1 owner-editable slots; ONE tint producer (`speakerThemesByName`); stored canon
keeps inline `<speaker>NAME</speaker>` tags (the renderer colors by them); the wire strips them to the
plain `NAME:` attribution via `speakerTagsToPlain` (shape.ts l.384–402 — byte-identical no-op on
non-narrator rows); the tolerant line-start `Name:` parse is **gated to narrator assistant rows**,
client-side via the `narratorVoiced` prop (message-content.tsx l.137–150). The gate today is an
INFERENCE (group output mode + the synthetic-char attribution).

**What first-class `narrator` kind buys — three concrete failures it closes:**

1. **Config-flip survival:** a room switched narrator→per-speaker keeps its old narrator rows; an
   inference keyed on the CURRENT `GroupConfig.output` misclassifies every historical narrator row the
   moment the dial moves. Kind is per-row truth; the dial is per-room present tense.
2. **SET-NULL survival:** delete the synthetic group character → `characterId` nulls → the tint gate,
   the `Name:` parse gate, and memory's labeling all lose the row. Kind survives (the §2 argument).
3. **One spelling:** today "is this a narrator row?" has at least three ad-hoc spellings (client
   `narratorVoiced` derivation, server `speakerTagsToPlain` applying to ALL assistant rows and relying
   on tag-absence, memory's `NARRATOR_LABEL` fallback in transcript.ts l.48). Kind gives all three the
   same field read.

**Design:** narrator rows keep `role:'assistant'` + the synthetic-group-char attribution (memory's
`__group__` scoping and the host-owned mint are load-bearing — D55; rejected arm: characterId-NULL
narrator, which re-litigates D55 for zero gain). Writers that stamp `kind:'narrator'`: the engine's
narrator-round commit (`buildCommitPlan` under `output:"narrator"`), `postNarratorMessage`, and the
verbatim copy paths (fork/edit) which copy the slot wholesale and need no logic. The `<speaker>` tag
grammar, tint producer, and PROSE-1 slots are all UNCHANGED — kind slots under them as the gate they
were missing, not a replacement.

---

## 9. §7 — The mid-conversation system channel (capability-gated mapping)

**Inventory:** `ModelCapability.turns.midConversationSystem` exists (contracts/connection l.188,
TURNS_FLOOR default false) with 6 non-test consumers. Its PROVEN semantics are narrower than its name:
a **depth-0 (tail) system-authority channel** — injections.ts l.138–144 is explicit: "Depth > 0 system
injections ALWAYS demote (the only wire-tested channel is tail-positioned, and a real system row inside
the stable prefix would mutate cached bytes)". The squash keeps system rows merging only with each
other (role-squash.ts l.66–68); shape's ends-on-user invariant reads the last NON-system row (shape.ts
l.309–313); the agent-sdk arm folds tail system rows out of the prompt into the hook channel (same
comment).

**Design (the capability-gated narrator mapping):** with `kind:'narrator'` declared, the mapping
"narrator rows ship as wire `system` rows on capable models instead of assistant-voiced" becomes
expressible at exactly ONE site — the `toShapeCanon`/SHAPE dispatch — instead of a per-call-site hack.
But the mapping must NOT ride the existing bit:

- **Do not overload `midConversationSystem`.** It is wire-tested for the TAIL only; a narrator row is
  MID-HISTORY. Shipping history rows as system on the strength of a tail-tested bit is a category
  error the capability axis exists to prevent (D69: "derived per wire-shape … NEVER guessed at a
  callsite"). Mint a SIBLING fact — `turns.historySystemRows` — set per wire-shape by the same
  `deriveWireShape` + curated refinement, **default false everywhere until a live wire probe measures
  it per model** (the D68 fail-closed table precedent: absence means the behavior does not engage,
  never a guessed default).
- The dispatch, when the bit is true: narrator canon rows map `assistant→system` at SHAPE, byte-content
  unchanged (speaker tags already convert to plain `NAME:` lines); cache math is already conservative
  (a mid-history role change re-shapes the prefix → the breakpoint logic's existing abort arms cover
  it — computeHistoryBreakpoint takes the post-map rows); strict-alternation floors are unaffected
  because system rows are squash-isolated and the ends-on-user invariant already ignores them.
- When false (everything today): narrator ships as it does now — assistant-voiced with plain
  attributions. NO behavior change lands with the identity redesign itself; the mapping is a dormant
  dispatch arm waiting on a measured capability. That keeps §12's invariant clean: the same canon,
  two capabilities, two wires.
- Agent-sdk: the tail-fold mechanism does not generalize to mid-history; the sdk arm keeps the
  assistant-voiced mapping regardless of the bit (a per-wire delivery split, the `attachTools`/
  terminal-tools precedent — eligibility one predicate, delivery per wire).

---

## 10. §8 — Exhaustive tests + gates locking it in

(The lock-in set for the WHOLE recommendation; §-references to the design pieces above/below.)

**Contract/schema tier:**
- `MESSAGE_KINDS` tuple + `messageKindSchema` contract test; the db CHECK derives the tuple (D34) and
  the existing enum-mirror test idiom (schema header l.27–30) pins `.enumValues` equality.
- A `messages_kind_shape` CHECK test: `narrator ⇒ role='assistant'`; `standard`/`comment` arms
  unconstrained beyond the existing attribution CHECK (all-NULL degradation must stay legal — the
  CHECK-never-aborts-a-cascade rule, schema l.205–213, pinned by an FK-cascade test).
- `macroFreezeRecordSchema` parse-seam test (malformed blob degrades to null, the `parseChatMetadata`
  pattern); a freeze→record→replay round-trip property test (raw + record ⇒ byte-identical content;
  the determinism-through-nesting pin idiom from D110-MG).

**Writer belt (the attribution-invariant idiom, schema header l.188–204 — extend the derived-from-
EVERY-writer table):** one test per writer asserting its born kind — engine commit (standard;
narrator under narrator rounds), user-send (standard), greeting seed (standard), generate-image
(standard), postNarratorMessage (narrator), fork/edit (verbatim copy), ST import (per §16 mapping).
The test-presence gate already forces per-verb tests; the kind assertion joins the existing ones.

**Assembly dispatch totality:** every kind dispatch is a `Record<MessageKind, …>` or `assertNever` —
the existing `exhaustive-dispatch` + `no-inline-union-redecl` gates then make a fourth member a tsc
error at every site (spine §5.5; zero new gate code needed — this is why the union must be a real
exported tuple, not string literals).

**Wire-shape fixtures:** extend the 84-cell shape matrix (names.ts header l.32) with the kind axis:
kind × roleHandling × namesBehavior × midConversationSystem/historySystemRows × assistantPrefill for a
narrator-bearing multi-human history — pinning per cell: role sequence, label placement, that a
`comment` row NEVER appears, that a narrator row is never player-labelled, and the §12 canon
byte-identity (below). The ST-golden comparator gains a narrator fixture (the atlas's F-list already
schedules the corpus work; the ORB arm must read `name` — atlas Gaps table says the replay cannot
exercise multi-speaker today, R-fix owed).

**§12's invariant test (the two-profile pin):** one committed turn driven through two capability
profiles (strict floor + no-prefill vs none + prefill + midConv/historySystem true) with a stubbed
runner returning fixed output → assert the persisted slot+variant rows are BYTE-IDENTICAL across
profiles while the wire histories differ. This is D125's "reaches only the wire" generalized to the
whole pipeline.

**Memory/compaction dispatch tests (§13 here = §9 owner):** a comment row never enters
`loadCanonThroughSeq`'s output (or is filtered before `sliceBlocks`); a narrator row IS ingested and
labelled by kind not by characterId-inference; blockHash stability across a rename +
instability across reattribution (both axes — the transcript.ts doc-comment's own claims, currently
untested? not verified — see Limits).

**CT render arms:** one CT per kind chrome (standard / narrator tint + speaker split / comment OOC
treatment), against the `MessageView.kind` field — replacing the `narratorVoiced` inference prop.

**Swipe-determinism property test (§14 owner #11):** select A → B → A across a slot carrying
macroFreezes + variableDelta + (game) snapshots/tool-calls → every derived read (runtime vars, tracker
view, tool chips, draws) byte-identical to the first A read.

---

## 11. §9 — Memory + compaction interplay (+ the invalidation contract)

### What the identity model feeds today — receipts

- **Memory ingests EVERYTHING through seq:** `loadCanonThroughSeq` (memory/persistence/queries.ts
  l.27–41) has NO `excludedFromPrompt` filter and no role filter; the transcript labeler handles
  system rows (`SYSTEM_LABEL`, transcript.ts l.48) and falls back to `NARRATOR_LABEL` — i.e. memory
  RE-INFERS row purpose from attribution, exactly the class the charge names.
- **Compaction filters BOTH:** `verbs/compaction.ts` l.147–168 — `excludedFromPrompt` rows dropped
  (l.154, with the member-peekable rationale) AND hidden-class spans stripped via
  `projectBodyForSummary` (l.165–168, the D110 §3.6 fail-closed clause).
- **Divergence, confirmed:** memory strips NEITHER. A hidden (`excludedFromPrompt`) row's content and
  a `<lie>` span's covered truth both enter digests/segments. Digest text is model-plane (recall lands
  in the shared prompt — D106 room-plane, D110 model-always: fine BY TYPE), but (a) the
  excludedFromPrompt side-door means "hidden from the prompt" is not actually true once recall
  re-surfaces the bytes, and (b) whether digest TEXT ever reaches a member-visible read (memoryTrace,
  discovery surfaces, search results) was NOT swept this session — flagged, not asserted.

### Verdict/design

Memory must consume DECLARED intent: the ingest read dispatches on kind — `standard`/`narrator` →
ingest (both are story canon; a narrator recap is precisely what a digest wants), `comment` → EXCLUDE
(an OOC aside is not story). The dispatch home is the LOAD (`loadCanonThroughSeq` gains the kind
filter derived from the policy table, one site) so segments, digests, and speaker-joins all inherit
it. Two owner forks ride this section (§18): whether `excludedFromPrompt` should also gate memory
ingest, and whether digests should run `projectBodyForSummary`. Both are behavior changes to a working
system — designed here, not presumed.

Compaction × kinds: comment rows are already outside the summary window (they'd be excluded by the
kind filter the same way); narrator rows stay IN (they are prompt-eligible story). Compaction ×
variants: the checkpoint (`compactSummary`/`compactedAtSeq`) is a chat-level snapshot of the
selected-variant chain AT COMPACTION TIME — a later `selectVariant` below the checkpoint makes the
summary stale-vs-canon with no re-derivation. That is a deliberate checkpoint semantic (D25 calls it
portable canon), not a leak — but it belongs in §14's leak table as the one ACCEPTED cross-variant
survivor, stated rather than discovered.

### The invalidation contract (the owner's hash/cascade question, answered honestly)

**You do NOT need a new invalidation design — the machinery exists, is hash-keyed, and cascades
upward. Receipts:**

- **Segment/digest keying IS content-hashing:** `blockHash` (transcript.ts l.94–107) = SHA-256 over
  scope-prefix + per-row (stable speaker id `\x01` personaId `\x01` body). Its doc-comment states —
  and the implementation matches — that it is **name-INDEPENDENT** (a rename does not bust it; ids are
  folded, not names) and **reattribution-SENSITIVE on both axes** (a characterId re-voice AND a
  personaId re-stamp each change the hash; personaId is folded independently of the body bytes
  precisely so a persona re-stamp fires the gate even on a resolved-text collision).
- **The staleness gate:** a block re-digests iff missing or hash changed (`loadDigestHashes`, the
  digests.ts header "SELF-HEAL" clause); segments identically (`loadSegmentHashes`).
- **The upward cascade exists by construction:** `consolidationHash` (transcript.ts l.109–118) =
  SHA-256 over the CHILD content-hashes, order-significant — so a tier-0 re-digest changes its parent's
  key, which re-consolidates, which changes ITS parent's key: the "arc" tier (the code's own word —
  digests.ts l.281 "a blank arc digest") re-derives transitively. Embedding refresh rides the same
  write: a re-digested row goes back through `ctx.embeddingsStore` (the ONE vector-write path, D20).
- **The protected tip** (`maxSeq − verbatimWindow`) keeps live-tip swipes/edits from ever touching a
  settled block; only aged-out complete blocks digest.

**The one honest caveat — trigger LATENCY, not correctness:** the build runs post-turn
(engine.ts l.1362–1390) and on backfill (substrate/backfill.ts); an edit/swipe/reattribution deep in
history is stale-but-detected until the NEXT turn or backfill pass runs the self-heal. No eager
invalidation hook exists on the edit verbs (swept: `generateDigests`/`generateSegments` call sites are
exactly engine + backfill + service wiring). For a single-box roleplay app whose reads are
prompt-time, "heals before the next prompt that could use it" is the correct contract — the next turn
IS the next read. If an out-of-band reader (discovery over digests) must never see a stale row, that
is a bus-driven `ContentChanged`-style trigger to add — an additive emit, not a redesign.

**The §1 hook, decided:** the hash layer stays the RESOLVED-CANONICAL `content` + stamped IDS —
deliberately NOT `rawContent` and NOT resolved names. Rationale: `content` is the one post-transform
text every consumer shares (D51); identity macros resolve per-view but the hash folds the STAMPS
(ids), so per-view resolution can never produce per-viewer hashes; `rawContent` is provenance whose
re-resolution, when it changes anything, lands as a content EDIT — which busts the hash through the
front door. Adding rawContent/macroFreezes therefore requires ZERO change to the invalidation
contract. `kind` enters the contract only as the ingest FILTER (a comment row is outside the block
slicing entirely — same class as the excluded rows compaction already drops); it does NOT need to fold
into blockHash because a kind re-stamp is not a live mutation path (kind is written at mint and by
migration only — if a "convert to comment" verb ever lands, it must fold kind into blockHash in the
same change; recorded as a coupled-site note in the D-entry draft).

---

## 12. §10 — Agents in and outside the roster

**Inventory:** D60 (design of record; AP machinery purged 2026-07-25, dormant DDL kept — the
`chat_participants_kind_shape` agent/observer arms and `users_agent_shape` are on the tree,
schema/chat.ts l.480–496). The attribution CHECK ALREADY carries the agent voice: assistant rows are
`characterId XOR authorUserId` — an agent line is assistant + authorUserId(agent) + characterId NULL
(schema header l.194–197 names round.ts stamping `persist.authorUserId`). The proposed/ set
(02-participants) rules the roster half: `kind:'agent'` seats, `AI_DRIVEN_KINDS`/`USER_BACKED_KINDS`
derived sets, arbitration/macros/cast dispatch flips. `AssembleContext.castMembers: SpeakerRef[]`
already carries the D60 speaker axis (assemble.ts l.412–416). proposed/INDEX.md's "AP0–AP3-1 landed"
row predates the purge — cite D60's build-state rider, not the INDEX (the INDEX is reference, not
plan).

**The gap the charge names:** OUT-OF-BAND agent speech — reacting to room content without holding a
seat. Today it has NO home: an agent line as canon requires... nothing actually — the CHECK admits
assistant+authorUserId rows with no roster requirement (canon attribution is slot-level, roster is a
separate table). But an out-of-band line as a STANDARD row would enter the prompt, the memory
digests, and the arbitration transcript — turning an observer's aside into story canon. That is the
redesign-forcing shape the owner wants pre-empted.

**Design:** the `kind` axis IS the home, and it needs no third kind at mint time:

- **In-roster agent speech** = `kind:'standard'`, assistant + authorUserId(agent) — real canon,
  SELF-attributed, exactly D60's "agent room speech is real canon" clause. Enters prompt + memory like
  any character line (witnessing via its seat's join/leave horizons — the 02-doc's "witnessing free"
  argument).
- **Out-of-band agent speech** = `kind:'comment'` + authorUserId(agent): visible in the transcript
  (reading: show, with its own chrome), **never in the prompt, never in memory** — which is exactly
  the semantics an unseated reaction needs, and it falls out of the §11 policy table with zero new
  machinery. Attribution answers WHO (the agent's users row); kind answers that it is not story.
- If the seat wave later wants out-of-band agent lines that DO steer the model, that is not a message
  at all — it is the injections door (D116) or the gather-op seam, which is where non-canon
  model-facing prose already lives. The message plane never grows a "sort-of-canon" arm.
- **Doorway recorded, not built:** if agent asides outgrow comment chrome (need their own render/
  policy row), a 4th kind (`aside`) is one tuple member + N Record arms, tsc-forced — the D41
  no-code-without-an-emit-site rule says don't mint it before its writer exists. The D-entry text
  should name this doorway explicitly so the seat wave cites it instead of redesigning.

The `kind` union deliberately does NOT encode "agent-ness" (no `agent` kind): drive is the
PARTICIPANT axis (roster `kind`), authorship is attribution, purpose is message-kind. Three axes,
one home each — collapsing any two re-creates the XOR overload the 02-doc spent a section unwinding.

---

## 13. §11 — Swipe variance: replayable + deterministic, normal AND rpg

**The inventory (what is variant-keyed clean today — receipts):**

| Consequence | Key | Receipt |
| - | - | - |
| content/reasoning/economics/params/promptSnapshot | variant | D26, schema |
| tool exchanges (executed) | `message_variants.toolCalls` | D48 |
| terminal (folded) tool calls | `rpg_turn_tool_calls`, UNIQUE(variantId), CASCADE | schema/rpg.ts l.304–338 — "the swipe-rewind key" |
| rpg state | `rpg_snapshots` turn rows: variantId NOT NULL, partial-unique; "variant-keyed iff that variant's turn produced it" | D124 |
| runtime variables | `variableDelta` per variant, FOLDED over the selected chain into `chats.runtime_variables` (derive-don't-stamp) | D46; schema l.339–343 "kills ST's swipe-clobber #3263" |
| user-macro draws | `macroDraws` per variant, replayed as `frozenDraws` | schema l.344–349 |
| journal | variant-aware + lineage projection | D108 |
| fit boundary / OR billing handle | `contextBoundaryMessageId` / `generationId` per variant | schema |
| memory | derived from the SELECTED chain via content-hash self-heal (re-fold on swipe) | §11 above |

**Leaks/asymmetries named (the charge's explicit ask):**

1. **The volatile freeze** — a `{{roll}}` bake has no draw record, so a swipe's REPLAY cannot
   reconstruct the roll and the unfrozen-greeting-swipe gap stands (Chat-Macro-Resolution's own KNOWN
   GAP). **Closed by §3's `macroFreezes`** — after which EVERY nondeterministic input to a variant's
   turn is recorded per-variant (draws ∪ freezes ∪ params ∪ promptSnapshot).
2. **`chats.compactSummary`/`compactedAtSeq`** — chat-level, checkpoint semantics; a pointer flip
   below the checkpoint is not re-summarized. ACCEPTED (D25's portable-checkpoint design), now stated
   as the one deliberate cross-variant survivor rather than left to be re-discovered.
3. **`message_assets`** keys on the SLOT (schema l.384–388 — deliberate: "the attachment belongs to
   the authored message, not a swipe variant; a user turn has exactly one variant"). Not a leak —
   assistant swipes don't attach — but the invariant's wording must carve it out (slot-plane by
   ruling, not oversight).

**The invariant, stated for the D-entry:** *every consequence of a generation is (a) a column/row
keyed on the producing `variantId`, or (b) DERIVED by folding the selected-variant chain, recomputable
from (a); a chat-level cache must be re-derivable from the chain (runtime_variables is the exemplar;
compactSummary is the one ruled checkpoint exception; message_assets is slot-plane by D26's
attribution rule).* Enforced by the §10 swipe-replay property test (A→B→A byte-identity across every
derived read) — the test IS the invariant's gate; a future feature adding a chat-level stamp that a
swipe can't rewind fails it.

---

## 14. §12 — Canon is provider-independent; shaping is a one-way projection

**Verified this session (by reading every transform on both paths):**

- The SHAPE-side transforms — scope-fold, splice, demote (`resolveSpliceRole`), name-stamp, squash,
  nudges, `speakerTagsToPlain`, the PROMPT_HISTORY regex leg — all operate on COPIES (`toShapeCanon`
  maps to new `CanonRow`s; shape.ts l.443–446 says it in so many words: "the leg rewrites that
  resolved text and returns copies — `rows` itself is what gets discarded, and the `messages` rows it
  was read from were never touched"). D125 pinned this for the regex leg ("stored canon, the
  compaction digest, an export bundle and a fork's copied rows are all byte-identical afterwards, by
  construction; the leg holds no `Db`").
- The PERSIST-side transforms (what DOES change stored bytes) are all **provider-blind**: the volatile
  freeze (clock+PRNG), USER_INPUT regex (host config), receive transforms (AI_OUTPUT regex — host
  config; postProcess — preset config; per-speaker clean — output-mode config, pipeline.ts
  l.244–258). None reads `connection`/`capability`/`runner`/`family`. The capability facts
  (assistantPrefill, midConversationSystem, roleHandlingFloor) are consumed at SHAPE only
  (pipeline.ts l.464–470).
- The only provider-adjacent persisted fields are PROVENANCE (`model`/`provider`/`generationId`/
  `promptSnapshot`) — records of what happened, never inputs to canon text.

**Verdict: the invariant HOLDS on today's tree** — ST's provider-varying chat-log disease has no
foothold. What is missing is the invariant AS LAW + its test: nothing today stops a future runner
"helpfully" writing its merged/demoted history back, and D125's clause covers one leg only.

**Design:** mint the clause into the D-entry — *"CANON IS PROVIDER-INDEPENDENT: a persisted
slot/variant byte is a function of (author input | model output | host/preset persist-time transforms)
only; capability and wire facts may select DELIVERY, never storage; every wire-shaping transform
operates on copies"* — and pin it with the §10 two-profile test (same stubbed output, two capability
profiles → byte-identical rows, differing wires). The `kind` design was shaped BY this invariant
twice: narrator canon role stays `assistant` regardless of the §9 system-channel mapping, and the
mapping itself is a SHAPE dispatch, not a stored fact.

---

## 15. §13 — Group membership HISTORY vs PRESENT

**Inventory:** the seam is `chat_participants.joinSeq`/`leftSeq` (`leftSeq IS NULL` = present); D106
made the interval algebra ONE home for floor + witnessing (`spanWitnessed`, `[joinSeq, leftSeq)`,
join-inclusive); D122's consent set is `presentHumanUserIdsOf` (ONE home, shared by verb + resolver —
its own design note says why); the host lookup is `roster-host.ts::hostSeatOf/hostUserIdOf` (D121-A's
"one helper, never N inline spellings"). The macro-name PRODUCER is deliberately HISTORY-inclusive
(Chat-Macro-Resolution §1: every id the chat references, incl. since-switched personas — the
roster-vs-referenced-producers rule), while the prompt CAST is present-members. Exports copy canon
verbatim with stamp attribution (history-inclusive by construction).

**The measured gap:** the PRESENT predicate itself is re-spelled ~27 times across 37 server files —
**including outside chat** (`databank/persistence/scope.ts`, `export/verbs/export-chat.ts`,
`automation/persistence/canon-reads.ts` each carry their own `leftSeq` null-comparison). Each inline
spelling is a place the vocabulary can silently diverge (e.g. one consumer forgetting `disabled`, or
treating leftSeq=0 wrong).

**Design (modest, structure-not-prose):** one vocabulary module —
`domain/chat/substrate/presence.ts` (or folded into the existing `roster-humans.ts`) exporting the
THREE named predicates: `isPresent(row)` (`leftSeq === null`), `wasEverMember(row)` (a row exists),
`witnessedSpan(row, span)` (delegating to the ONE interval algebra) — with the SQL twins beside them
(the drizzle `isNull(chatParticipants.leftSeq)` fragment as an exported helper). Cross-domain
consumers (databank/export/automation) reach it through their injected ops/joins — where they cannot
(a raw persistence join), the D-entry names the spelling as the ONE sanctioned form and a
`presence-predicate` sweep (grep-tier, the dynamic-seam-ships-its-lens rule) keeps count. Consumers'
correct axes, stated for the record: attribution = stamps + producer (history) · prompt cast = present
· persona consent = present owner (D122) · floor/witnessing = interval · exports = history. No
consumer changes; the change is that none of them re-derives the words.

---

## 16. §14 — Persona unification across modes

**Inventory — the three axes as built (all landed, all coherent with each other):**

1. **Anchor** (`chats.anchorPersonaId` → `pinnedPersona`): the chat-invariant `{{user}}` for
   CARD-derived sections + the null-stamp fallback for history rows (ruling A). Pin=anchor
   ([[persona-pin-prompt-resolution]]); host-set in multi-human; consent-gated on the owner's PRESENT
   membership (D122 — a departed owner's pin stops pinning, never copied: heal-the-pointer).
2. **Active** (the TRIGGERING human's persona, bound via `TurnTrigger` — never `personaIds[0]` on a
   live turn): `{{user}}` for prompt-config/user-authored sections; the null-personaId human arm
   floors to "User"/DEFAULT_PERSONA_NAME and NEVER reaches the anchor (foreign.ts l.56–58 — the
   INVITE-JOIN-NULL-PERSONA fix).
3. **Row stamp** (`messages.personaId`): history `{{user}}` + attribution chrome; changed only by
   reattribution; null-stamp borrows the trigger's identity ONLY on the trigger's own row, else the
   floor (shape.ts null-stamp guard).

**Verdict: this is ALREADY one model, not three overlapping rules** — the axes partition cleanly by
QUESTION (whose chat / whose turn / whose row), single-player is the degenerate case (anchor == active
== the one persona unless deliberately split), and each axis has exactly one home + one fallback
chain. The unification the owner wants is 90% DONE and the report's job is to say so with receipts
rather than invent a fourth rule. Chat-Macro-Resolution §3's five-context table is the canonical
statement; nothing read this session contradicts it.

**The two residues that keep it from 100%:**

1. **The `absent`-trigger fallback `personaIds[0]`** (foreign.ts l.62–63: "the documented fallback
   chain, personaIds[0] then nothing" for previews/host instruments) — the ONE remaining
   presence-order-arbitrary binding. It predates the union and survives only for trigger-less
   contexts. Killing it (previews pass an explicit `{kind:"none"}` → anchor, or the real trigger)
   removes the last place `{{user}}` can bind to "whoever joined first". **Owner call** (§18): it
   changes preview semantics for personaless hosts, and D122's three-state contract text would gain a
   clarifying sentence, not an amendment — the union's arms are untouched.
2. **The rpg persona-pin linkage** is PARKED WITH ITS RULED FLAVOR (workboard I-8: relations pin to
   the persona they were formed under; a swap opens parallel context, never a re-point) — the
   identity redesign must not touch it, and doesn't: kind/raw/freeze are all orthogonal to which
   persona a state row keys on. Stated so nobody re-opens it through this design.

**Explicitly: NO D122 amendment is required by this design.** The kind axis never reads personas; the
TurnTrigger union stays as landed.

---

## 17. THE RECOMMENDATION — one coherent shape

**R1 — the kind axis (the core).**
- `MESSAGE_KINDS = ["standard", "narrator", "comment"] as const` + `messageKindSchema`, homed
  `@orb/contracts/chat` (participants.ts, beside PARTICIPANT_KINDS). NOT kit: no kit engine dispatches
  on it (D54 reachability decides the home; MESSAGE_ROLES sits in kit only because the ST bimap +
  resolvers need it there).
- `MESSAGE_KIND_POLICY: Readonly<Record<MessageKind, {prompt: "conversation"|"system-channel"|"never";
  memory: "ingest"|"exclude"; reading: "show"}>>` in contracts — the CONTENT_CLASS_POLICY pattern one
  level up; the compile-force for every future member:
  `standard {conversation, ingest, show}` · `narrator {system-channel*, ingest, show}` ·
  `comment {never, exclude, show}` (*"system-channel" = the capability-gated mapping, resolved at
  SHAPE per §9 — assistant-voiced everywhere the `turns.historySystemRows` bit is false, i.e.
  everywhere at launch).
- DB: `messages.kind` text NOT NULL DEFAULT `'standard'`, CHECK from the tuple (D34) + a
  `messages_kind_shape` arm (`kind='narrator' ⇒ role='assistant'`); indexes unchanged (kind is never
  a lookup key). Canon `role` semantics UNCHANGED (D32 untouched; `system` remains injection-plane).
- Dispatch sites (each a total Record/assertNever, existing gates enforce): `toShapeCanon` (prompt
  policy — replaces the bare `role === "system"` drop), `applyNamesBehavior` (label policy for canon
  rows; `speakerless` stays for spliced rows), memory `loadCanonThroughSeq` (ingest policy), client
  render chrome (replaces `narratorVoiced` inference), export/import serde (§R4), `MessageView` +
  `ShapeTraceRow.kind?` (surfaces).
- Writers stamping non-default kind: `postNarratorMessage` + the engine narrator-round commit
  (`narrator`); everything else is born `standard`; fork/edit copy verbatim. Out-of-band agent speech
  lands later as `comment`-kind rows (§12); an `aside` kind is a NAMED DOORWAY, not minted.

**R2 — raw + freeze provenance (the re-resolution substrate).**
`message_variants.rawContent` (TEXT, null ⇔ identical) + `message_variants.macroFreezes` (JSON,
ordered `{name, args?, value}` occurrences), written in the variant's own batch; kit freeze registry
gains the record-emitting mode over the SHARED `registerVolatileMacros` axis; served ONLY via the
host-gated `VariantWireView`. Canonical `content` and every existing consumer unchanged. Closes the
greeting-swipe gap; completes the per-variant determinism set (§13).

**R3 — the two invariants minted as law.**
(a) CANON IS PROVIDER-INDEPENDENT (§14's clause verbatim) with the two-profile byte-identity test;
(b) the VARIANT-KEYED CONSEQUENCE invariant (§13's clause) with the A→B→A swipe-replay property test.
Both are D125's posture generalized; both belong in the D-entry text so the next feature cites them.

**R4 — ST serde mapping (one-way-honest, the D116 posture):**
import: `is_user` → role; `extra.type === NARRATOR` → `kind:'narrator'` (attribution = the synthetic
group char, minted as needed); `is_system:true` → `kind:'comment'` (the visibility-filter semantic —
preserving the row instead of ST's assembly-drop); absent flags → standard. Export: narrator →
`extra.type NARRATOR` + `is_system:false` (the atlas's prong-2/3 disjointness, measured); comment →
`is_system:true`; standard → plain. A lossy edge (our comment chrome vs ST's) is flagged in the
export, never hidden.

**R5 — migration posture:** ALL of it rides ONE `0000_baseline.sql` regen (the sanctioned pre-launch
vehicle; D124's amendment already normalized "squash + regen, dev DBs regenerate"). No compat shims,
no incremental 0001, no back-fill machinery: existing rows are born `standard` by DEFAULT; existing
narrator rows in dev DBs are regenerated seed data anyway. One coupled anti-forgetting note for the
D-entry: `structure:db-baseline` is regime-1-shaped (workboard I-10) — this lands BEFORE launch day or
joins the two-switch flip.

**R6 — the §9 memory dispatch** (kind filter at the load) + the §15 presence one-home. Both small,
both listed so the D-entry's coupled-site count is honest: a new kind member costs ~7 sites (tuple ·
policy row · shape dispatch · names dispatch · memory load · client chrome Record · serde arms), all
tsc-forced but the serde arms.

**Build order:** R1+R5 together (schema + tuple + dispatches, one wave — a machine ships WITH its
seal, D72: the writer belts + matrix cells land in the same wave); R2 second (independent columns,
same baseline window); R3's tests with R1 (they pin the wave); R4 with R1's serde arm; R6 riders.

---

## 18. Owner calls (mantra-marked — each is a fork with my recommendation, none pre-decided)

1. **⟨he decides the vocabulary⟩ The launch kind set.** I recommend exactly three
   (`standard|narrator|comment`) — every additional candidate examined (system-note → narrator covers
   it; aside → doorway; tool → D48 ruled tool exchanges variant-plane) failed the has-a-writer test.
   If he wants `comment` deferred too, the design degrades cleanly to two — but comment is the arm
   that gives out-of-band agents their home (§12), so dropping it re-opens that question later.
2. **⟨hidden means hidden⟩ Should `excludedFromPrompt` also gate MEMORY ingest?** Today it does not
   (confirmed, §11) — a hidden row's content can re-enter the prompt via recall. I recommend YES
   (filter at the same load as the kind dispatch; self-heal re-digests affected blocks
   automatically since the block content changes → hash changes). It is a behavior change to settled
   digests and touches his "memory is not summarization" system — his call, not mine.
3. **⟨one strip law or two⟩ Should digests run `projectBodyForSummary` (hidden-SPAN strip) like
   compaction does?** Model-plane reasoning says no (the model must remember its own lie —
   D110 model-always; recall is prompt-bound); the risk is any member-visible digest-text surface I
   did not sweep (declared limit). Recommend: sweep first, strip only if a member-reachable read
   exists — otherwise the lie-aware D111 ruling-A prompt clause already governs what ENTERS digests
   on deception games.
4. **⟨kill the bystander binding⟩ Retire the `personaIds[0]` absent-trigger fallback** (§16) so every
   `{{user}}` binding is trigger's/anchor's/floor — previews pass an explicit arm. Small, semantic,
   his word (it grazes D122's documented fallback chain).
5. **⟨measure before you promote⟩ The narrator-as-system mapping** ships DORMANT behind the new
   `turns.historySystemRows` capability fact, activated per-model by wire probe only (§9). If he
   wants it live for the newer Opus models at launch, the probe is the gate — never a model-name
   regex (D69).
6. **⟨what a comment looks like⟩** Comment-row chrome + whether members can author comments (an OOC
   channel is a product feature riding this schema) — pure product surface, out of this report's
   scope, named so the client wave has its question ready.

---

## 19. Declared limits — what I did NOT verify

- **Not read:** the stats domain's ingest projections (§5's claim rests on Core-0 §6 + the absence of
  economics on narrator/comment writers, not on reading stats code); the client render pipeline beyond
  `message-content.tsx`'s prop surface; `verbs/turn.ts` in full (2300+ lines — read targeted regions:
  the narrator-round comments via grep, not the whole file); `engine/engine.ts` beyond the memory
  trigger sites; the export/import verbs in full (R4's mapping is designed against the atlas +
  D116's precedent, not against `import-write.ts` line-reads).
- **Not swept:** every read surface that serves digest TEXT (the §18-3 fork depends on it); whether
  blockHash's rename-independence/reattribution-sensitivity claims carry their own pin tests; the
  agent-sdk runner's reasoning arms (readable vs encrypted — §4's rider).
- **Not re-derived:** the atlas's 13 MEASURED claims (the atlas states they were re-derived twice on
  2026-08-07; I treated that document as the corpus authority rather than re-running jq over the 42
  captures).
- **Instrument note:** an early `ast-grep -p 'leftSeq'` count returned 2 files — a bare-identifier
  pattern that cannot match property positions (the doctrine's own always_force_name2 trap); the
  §15 numbers come from the corrected `/usr/bin/grep -a` sweep (37 files / ~27 null-comparisons) and
  the ast-grep figure is retracted.
- **Confirmed-findings ledger for this report** (defect-grade, all reproduced this session):
  (F-A) memory ingests `excludedFromPrompt` rows — `loadCanonThroughSeq` has no filter while
  compaction filters at l.154 (§11, feeds owner call 2); (F-B) narrator/agent row-purpose is carried
  by SET-NULL-degradable attribution and by per-room config inference — purpose is lost on identity
  delete or config flip (§2/§8 — the defect the kind axis closes); (F-C) the volatile freeze is
  record-less, making the documented greeting-swipe gap unfixable and swipe replay incomplete
  (§3/§13). Everything else in this report is design, not defect.

---

*stickler · fresh-context design review · sources and receipts inline throughout; nothing in this
report modified repo source.*

---

## 20. §15 (final scope rider) — Media in messages: the parts model

### Inventory — three contracts, one stored asset, all read this session

- **Storage (D51, unchanged by anything above):** a message body is ONE string; media are embedded
  refs — `![alt](asset:<id>)` for owned CAS bytes, gated external URLs otherwise. The RETAINING link
  is `message_assets` (slot-keyed junction, CASCADE both ways, the asset-ref registry's GC anchor —
  schema/chat.ts l.378–412; slot-plane by D26's rule: the attachment belongs to the authored message,
  §13's carve-out).
- **The RENDER model** (`@orb/contracts/chat/content-blocks.ts`, D44 §12.4): `MessageContentBlock =
  markdown | media | html-card | choices`, where the media arm is **already video-shaped**:
  `messageMediaKindSchema = z.enum(["image","audio","video"])` and `messageMediaSrcSchema =
  {kind:"asset"} | {kind:"external"}` — a typed-closed discriminated union, exactly the discipline the
  charge asks for, ALREADY LANDED. D44 carries the render law for the audio/video arms (untrusted A/V:
  autoplay forced off, controls required, click-to-load external).
- **The WIRE model** (D45/D48): `ChatContentPart` — produced EXACTLY ONCE at the engine REQUEST seam
  (D51): `tokenizeContent` (kit) → `WIRE_PART_HANDLERS`, a **total
  `Record<ContentSpanKind, handler>`** (pipeline.ts l.901–928 — "a new class fails to build until it
  registers here"). The image arm is the exemplar of capability-gated parts: `isUserAttachment`
  (l.819–821 — asset-ref AND user-role AND user-authored, both halves structural, with the scoped-fold
  demotion explicitly rejected) → `visionOk` → resolve-or-drop-to-alt; every non-attachment image is
  DISPLAY-ONLY and collapses to its `[image: alt]` marker (CONTENT_CLASS_POLICY `image {show, drop}`).

### Verdict: the part vocabulary ALREADY IS the typed-closed-union discipline — no redo needed for video

The generalization path is additive at every layer, receipts in hand: a `video`/`audio` attachment is
(1) a render-model arm that EXISTS today; (2) a span-kind member (`CONTENT_SPAN_KINDS` + its
`CONTENT_CLASS_POLICY` row + its `WIRE_PART_HANDLERS` arm — all three compile-forced, the
content-class-wire coupled-site memory); (3) a wire-part member gated on a future capability fact
(`input.audio`/`input.video` beside `input.vision` — the D45 pattern verbatim); (4) the SAME
`message_assets` retaining row and CAS blob. Nothing in the message-identity redesign has to move for
this — which is itself a finding: **the parts plane was built extensible and should be left alone.**
One rule to mint so it stays that way: media NEVER becomes a message `kind` (a narrator row with an
illustration is still a narrator row — postNarratorMessage already composes text+refs into one body)
and never a variant column — the ref-in-content + junction + typed-projection triple is the ONE shape.

### Interaction with the raw/resolved design (§3)

A media ref is TEXT, and none of the persist-time transforms mint or rewrite refs (the freeze is
macro-only; regex COULD rewrite one — a host regex is host-authored, provider-blind, and its output is
the canonical content like any other edit). Therefore: refs live in raw AND resolved **identically in
the common case**; where a transform did touch one, `rawContent` records the pre-transform ref like
any other byte — no special media arm needed. `message_assets` rows key on the SLOT and are minted by
the attachment machinery at compose time, so raw-vs-resolved never changes the GC anchor.

### Interaction with the hash/reindex contract (§11)

An attachment swap is a CONTENT EDIT (the ref bytes change) → `blockHash` folds `r.content` → the
block re-digests and the consolidation cascade re-derives — **covered by the existing machinery, no
media-specific invalidation needed.** The memory transcript renders the ref text (the alt/marker) —
media BYTES never enter digests, which is correct (the digest is prose). *(Not verified: whether the
edit verb re-syncs `message_assets` rows when an edit adds/removes a ref — flagged in Limits; it is a
GC-correctness question, not an identity-model one.)*

### The bracket-framing × card-fencing layering (the FYI-lead, made decidable)

The owner's suspected class — a card near/inside `[…]` demote framing stubbing differently — sits at a
REAL layering seam, and the design should name which layer owns what:

- **Bracket framing is WIRE-PLANE PROSE** (`frameInjection`/`resolveProseText`, assembly — applied to
  spliced injection rows only, never stored, PROSE-1 host-editable).
- **Card fencing is CONTENT-PLANE GRAMMAR** (kit `tokenizeContent` over row bytes at the REQUEST
  seam — which runs AFTER framing, over delivered rows that can CONTAIN framed injection text merged
  into user turns).
- The CARD-KEEP fixes closed the WINDOW half of the class (id-less/synthetic rows are
  instruction-exempt: `resolveFullCards` l.845–852 — a card in a spliced injection never stubs and
  never consumes the window). The RESIDUAL half is tokenization-sensitivity: `[Note from system: `
  prefixes the note's FIRST line, so a fence opening on that line loses its line-start position and
  may not tokenize as a card at all — text rides verbatim (wire "full", harmless on the wire) but the
  same bytes could tokenize DIFFERENTLY depending on where in the note the fence sits, which is
  exactly the "possibly already dead, possibly live" ambiguity he reports.
- **The decidability rule to adopt:** *a prose frame must be TOKENIZER-NEUTRAL* — the frame's own
  bytes land on their OWN lines (prefix-line `\n` body `\n` suffix-line) so framing can never change
  any body byte's line-start status, and therefore can never change what the content grammar
  recognizes. That makes the class STRUCTURALLY EMPTY rather than repro-dependent: whatever the note
  contains, it tokenizes the same framed or bare. One-line change class in `frameInjection`'s two
  PROSE-1 templates + a pin (same fence, framed vs bare → identical span kinds); the repro itself
  stays with the board lead, not this report.

*(This section joins the recommendation as R7: no schema delta; the media-never-a-kind rule + the
tokenizer-neutral-frame rule land as D-entry clauses; the video/audio doorway is recorded as
additive-by-construction with the four-layer receipt above.)*
