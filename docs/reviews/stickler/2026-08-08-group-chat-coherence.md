# Group-chat design-coherence review — 2026-08-08

Charge (owner): the group-chat subsystem "feels crunchy" — bless the decomposition or name the real
mis-splits. Plus (mid-review scope additions): a vocabulary census of the room-concept synonym
families and the theatrical register, with a canonical-vocabulary table.

Reviewer: stickler (fresh context). Confirmed-findings-only bar; every claim below carries the
receipt produced this session.

---

## §0 VERDICT

**The decomposition is fundamentally SOUND — bless it, with four real mis-splits and a pile of small
confirmed defects.** The two-axis turn shape (output × cardScope), the arbitration seam, the one
shared macro atom, the prose-slot registry, and the injected-ops seams to rpg/persona/preview are
each carved at a real joint, enforced structurally, and consistent between server and client. The
crunchiness the owner feels is real but localized; it lives in exactly four places:

1. **The `policy` axis is dead theater on the narrator arm** (F1) — arbitration runs, costs a model
   call under `smart`, can emit a false warning, and its verdict is discarded.
2. **`pooled` is a lie** (F2) — byte-identical to `list`, sold to the user as "Round-robin".
3. **The template-home rule is not predictable** (F4) — D132(B)'s own test contradicts its own
   enumeration; the revealed rule is "the three slots the owner ruled preset are preset, the rest
   stayed user", which is a history, not a rule.
4. **The vocabulary** (§6) — one genuinely dead register (`crew`), one live symbol/copy split
   (`arbiter` in code vs "director" in copy), one dead knob (`groupCharacterId`), and a
   seat/roster/participant synonym pile that is \~80% load-bearing and \~20% drift.

The C4 ruling (mode-aware `main_prompt` default) is judged **the right fix, not a symptom** — see §4b.

---

## §1 FINDINGS (ranked)

### F1 · MEDIUM-HIGH — arbitration runs (and bills, and warns) on narrator rounds that discard it

- `packages/server/src/domain/chat/verbs/turn.ts:905-947` — `runAiRound` calls `arbitrate(...)`
  unconditionally, BEFORE the `output === "narrator"` fork. `packages/server/src/domain/chat/engine/round.ts:140-153` —
  `roundSpeakers` then ignores `params.speakers` entirely for narrator and returns the one synthetic
  cast turn.
- \*\*Failure scenario (narrator × smart, representable — the narrator arm carries the full
  `groupPolicySchema`, `contracts/chat/metadata.ts:109-118):** every send in a narrator room with
  `policy:"smart"` and ≥2 eligible characters fires a REAL side-LLM call
  (`engine/smart-arbitrate.ts:107`, `params.summarize(...)`) whose picked speaker is thrown away; on
  a degraded pick it ALSO emits `smart\_arbitration\_degraded` to the room (`turn.ts:752-754`) — a
  user-visible warning ("The turn director model wasn't available…",
  `client/src/features/chat/lib/warning-notice.ts:57`) about a decision that governs nothing.
  The auto-mode chain repeats the waste per chained turn (`turn.ts:816-857\` re-arbitrates; the
  narrator round again ignores the pick — arbitration there only decides chain-continue vs stop).
- Second face of the same mis-split: **policy semantics silently differ by arm.** `manual` on
  per-speaker means "nobody speaks unless forced"; `manual` on narrator still narrates every send
  (`drivesAnyTurn = args.group.output === "narrator" || …`, `turn.ts:943`). Nothing documents that.
- Evidence this is not deliberate: no comment anywhere claims narrator+smart is intended to pay the
  director call; the smart-arbitrate header says the call exists to "pick the ONE next speaker."
- Remedies (owner's pick): (a) short-circuit arbitration when `output === "narrator"` (keep the
  chain's continue/stop probe on the cheap deterministic path — never `smart`); and/or (b) revisit
  whether `policy` belongs on the narrator arm at all — the same unrepresentability rigor that
  omitted `cardScope` from that arm (the file's own stated standard, `metadata.ts:105-108`).
  Keeping the field for toggle-persistence is defensible; paying a model call for it is not.

### F2 · MEDIUM — `pooled` ≡ `list`, byte-identical; the UI sells a rotation that does not exist

- `packages/server/src/domain/chat/engine/select-speakers.ts:103-105`:
  ```ts
  case "list":
  case "pooled":
    return pool;
  ```
  Both return the ban-last-filtered pool in roster order. There is no rotation state anywhere
  (`pooled` appears at exactly ONE behavioral site — sweep receipt below).
- The in-file comment (`:101-102`, ":14") claims "round-robin — the banned last speaker is already
  excluded, so roster order is the rotation." **False by construction:** with the auto-chain's
  `maxSpeakers: 1` (`turn.ts:834`), pooled degenerates to a two-member ping-pong — A speaks → pool
  `[B,C]` → B (roster order) → pool `[A,C]` → A → … **C never speaks.** Without a cap, all N-1
  members speak every round — exactly `list`.
- User-facing: `client/src/features/chat/components/group-config-form.tsx:28-29` labels
  `list: "Everyone, in order"` and `pooled: "Round-robin"` — two Select options, one behavior.
- No test distinguishes them: `tests/server/domain/chat/engine/select-speakers.test.ts` mentions
  `pooled` only inside the `POLICIES` tuple (line 42); every behavioral assertion uses `list`.
- Sweep receipt: `pooled` in `packages/{server,client}` non-test = select-speakers.ts (3 lines) +
  group-config-form.tsx label + two unrelated "pooled ArrayBuffer" comments. (`/usr/bin/grep -arn
  pooled … --exclude-dir=node_modules`).
- Remedy: implement least-recently-spoken rotation state, or delete the member (5-member tuple → 4,
  tsc-forced coupled sites by design).

### F3 · MEDIUM — `groupConfigSchema.groupCharacterId` is a dead switch (D107 class), invisible to the knob gate, and travels in backups

- Declared `contracts/chat/metadata.ts:94-98` with the comment "Optional KEY (absent until minted)"
  — implying the mint writes it. **No writer exists:** `domain/character/verbs/mint-synthetic-group-character.ts`
  is a handle-keyed find-or-mint (`__group__<chatId>`, `substrate/group-character.ts:14`) and never
  touches chat metadata; the import path (`chat/persistence/import-write.ts:463-467`) and every
  runtime consumer (`verbs/turn.ts:929-937`, `substrate/group-bucket.ts:23`, `substrate/backfill.ts:208`,
  `substrate/assemble-gather.ts:204-208`) mint/find by handle.
- **No reader exists:** ast-grep `$X.groupCharacterId` over `-l ts` (scannedFileCount=2062) and
  `-l tsx` (scannedFileCount=576): the only `config.groupCharacterId` sites are the client form
  model's pure round-trip (`client/src/features/chat/lib/group-config-model.ts:46,60`); every other
  hit is the DIFFERENT `driveRound` parameter carrying the freshly-minted id. Grep corroborates.
- Why no gate caught it: `knob-wire-coverage`'s arm F keys on TOP-LEVEL `chatMetadataSchema` fields
  (`group` as a whole is written+read → green); a field nested INSIDE the `group` JSON sub-blob is
  invisible — the D134 "allow-list blind inside a JSON column" class, wearing the knob gate's
  clothes. No DOORWAY/DEFERRED registry entry names it (`scripts/check/gates/knob-wire-coverage.ts:24-56`).
- Compounding: `chats.metadata` travels VERBATIM in the portability bundle
  (`server/src/kit/serde/chat-bundle/index.ts:189-193`), so an exported room can carry a
  `groupCharacterId` that resolves to nothing on the target box — inert today only because the field
  is dead; the moment someone "wires" it per its comment, imported rooms carry a dangling foreign
  CharacterId (the exact class D136(C) exists to prevent).
- Remedy: delete the field (and the client round-trip arms), or wire it with a real writer + an
  import strip — plus a registry/gate story for group-sub-blob fields either way.

### F4 · MEDIUM — the template/prose home rule fails the predict-the-home test; D132(B) contradicts its own enumeration (ledger truth-repair + owner fork)

- D132(B) (`Core-Path-Registry.md:444`) states the whole test for a new slot: *"does this text
  resolve where a preset is in scope?"* — preset-homed if yes, user-homed (against the room host) if
  no — and then enumerates "the group-round framings" and "the anchor identity lead-in" on the
  per-USER side as "side generations."
- **They are not side generations and a preset IS in scope where they resolve.** The round nudges
  are the MAIN turn's trailing user row (`engine/round.ts:44-77` reads
  `base.assembleContext.prose`; the composed bag is built inside the turn's own context build,
  `assembly/context.ts:792`, where `input.promptConfig` — the resolved preset — is right there).
  The anchor identity lead-in fires in the main turn's card context
  (`assembly/context.ts:596-615`). The co-speaker headings (`alsoPresent`/`castMember`/
  `scenarioHeading`/`exampleHeading`) render inside the main section walk (`assembly/assemble.ts:207-233`).
- Meanwhile `chat.assembly.continuationNudge` — the SAME delivery class, a trailing user row on the
  same wire (`assembly/shape.ts:122-129,354-362`) — is preset-homed, with D132(C) celebrating it as
  the founding instance.
- So: **code complies with the ledger's enumeration; the ledger's stated test does not predict its
  own enumeration.** Two wrappers of identical delivery class home differently; a maintainer must
  memorize the list. That is precisely the "crunchy… how we split things apart" feeling.
- What actually distinguishes them (revealed, not stated): the three preset slots were individually
  owner-ruled on 2026-08-07; everything else kept its earlier decision-8 user-home. History wearing
  a test's clothes.
- Owner fork, both arms honest: **(a)** re-home the main-turn-resolving framings (group nudges,
  co-speaker headings, anchorIdentity) to the preset, making D132(B)'s test true — cost: NO-LEGACY
  re-home (D132(D) makes stale user-blob keys inert; host re-enters overrides in the Templates tab);
  or **(b)** truth-repair D132(B) to state the real rule (e.g. "authored wrapper text a preset's
  VOICE owns → preset; room-consistency framings that must not change when the host swaps presets →
  user, resolved against the host") and make the group framings' rationale explicit. Either way the
  clause's "no preset is in scope" claim for these items is false on the tree and owes repair.
- Related structural softness (LOW, same area): the no-cascade law is enforced only at
  `composeProse` (`contracts/prose/index.ts:109-122`); direct `resolveProseText(id, rawBlob)`
  callers (`verbs/compaction.ts:113`, `memory/build/digests.ts:159,283`, `turn.ts:746` →
  smart-arbitrate, automation `arm-executors.ts:276`) bypass the home filter. All of today's direct
  callers resolve user-homed ids against the user blob — verified clean — but nothing type-level
  stops a future caller resolving a preset-homed id off `resolveChatProse`'s raw blob and
  resurrecting the stale-key hazard. The committed-not-built prose-coverage gate (D132(G)) is the
  right home for this check.

### F5 · LOW-MEDIUM — stale law in the contract: "`smart` … falls back to `natural` until wired"

- `contracts/chat/metadata.ts:63-64` (the doc comment on the ONE importable policy tuple — per-domain
  law under the code-is-the-doc regime) still says `smart` "falls back to `natural` until wired."
- **Smart is wired and live:** `engine/smart-arbitrate.ts` (full side-LLM classify + roster-validating
  parse + loud degrade + abort seam), called at `verbs/turn.ts:732-748` whenever
  `policy === "smart"` with no forced target. The fallback-to-natural is now only the DEGRADE arm.
- Cost already measured: this review's own brief inherited the stale premise ("the smart policy is a
  stub"). The next cold agent reads the tuple first.
- One-line truth repair; the neighboring `select-speakers.ts` header (:14-16) is already accurate.

### F6 · LOW — the per-speaker union arm is the one non-strict object in an enforcer file

- `contracts/chat/metadata.ts:109-129`: the narrator arm is `z.strictObject` (stated in-file as "an
  enforcer, not prose"); the per-speaker arm is plain `z.object`. Every sibling boundary shape in
  the file is strict (`roomOverridesSchema:38`, `guidedSteerSchema:170`).
- Consequence: a stray/typo'd key on a per-speaker `setGroupConfig` write (e.g. `cardscope`,
  or a narrator-only future key) silently strips-and-heals instead of refusing loudly — the
  opposite posture of the narrator arm three lines up, with no stated reason for the asymmetry.
- Remedy: `z.strictObject` on the per-speaker arm too (the discriminated union supports it).

### F7 · LOW — `@mention` resolution: first-occurrence masking drops a later standalone mention

- `engine/select-speakers.ts:144-171` (`resolveMentions`): per name, `triggerText.search(...)` finds
  only the FIRST occurrence. Longest-first overlap masking then discards a shorter name whose first
  occurrence sits inside a longer name's consumed span — even when a later standalone occurrence
  exists. Concrete: cast `Aria` + `Aria Stormborn`, text `"@Aria Stormborn opens the door… @Aria,
  what do you think?"` → only Aria Stormborn is forced; the explicit later `@Aria` is silently
  dropped (the round falls to policy order for her). Confirmed by construction (single `search`
  per name; the masking check at :164 tests only that first hit).
- Also note (adjacent, informational): an `@mention` in a NARRATOR room has zero effect by design
  today (the narrator arm ignores arbitration — F1's shape). The owner confirmed forced-speaker
  coercion (`asPerSpeaker`) as intended for `forceCharacterTurn`/`requestTurn`; the send-path
  `@mention` is the third door for "force a named speaker" and is the only one that silently
  no-ops in a narrator room. If @mention should coerce like the other two doors, that is a
  one-line routing decision in `runAiRound`; if not, the metadata comment ("a hard override applied
  BEFORE the policy", `metadata.ts:63`) should state the narrator exception.

### F8 · LOW (ruling-violation cite; feeds §6) — live `crew`-named seams for a ruled-dead feature

- D59 disposition (`Core-Path-Registry.md:140`): "the rebuild-era owner ruling is crew DEAD … no
  `domain/crew` code exists on the tree." True for the domain — but the NAME is live in four places:
  1. `domain/chat/contract/context.ts` — `ChatCrewOps`/`ChatCrewGatherResult` + `ChatContext.crew`;
     consumed per-turn at `verbs/turn.ts:568-569`; wired permanently null at
     `entry/compose/chat.ts:1106-1108` (`crew: input.crew ?? null`; **no caller ever passes
     `input.crew`** — grep over `entry/`).
  2. `entry/lifecycle.ts:141,481-483` — `stopCrewScheduler`: declared null, torn down if non-null,
     **never assigned** (grep: 4 sites total). Dead scaffolding. (Sibling: `stopBuddyObserver`,
     :140/477-479, same shape for the purged buddy domain.)
  3. `contracts/world-info/index.ts:51-63` — `loreEntryCrewProvenanceSchema` + the
     `entryMetadata.crew` field: a LIVE, written-today provenance blob (the D46 automation writer
     stamps it, per `domain/world-info/verbs/entries/upsert-entries.ts:197-208`) named after the
     dead feature.
  4. \~30 comment citations of `chat-crew-design/*` across chat/automation/client contribution docs.
- These are sanctioned-doorway-shaped ("unwired ≠ worthless") — but a doorway for a feature the
  ledger rules DEAD, carrying a register the owner now wants gone, is the census's clearest
  rename/remove candidate. The LIVE `metadata.crew` field is the one that costs a data migration
  if renamed later rather than now (pre-launch NO-LEGACY window).

---

## §2 THE FIVE CHARGED AREAS — judgment with receipts

### (1) The modes (`groupConfigSchema`) — SOUND, two dents

The output discriminated union carves the right joint: what ONE generation voices. `narrator ⇒
merged` made unrepresentable by omitting `cardScope` + strictObject (`metadata.ts:105-118`) is the
right enforcement rung and is honored downstream (`speaker-card.ts:30-31` derives `CardScope` from
the per-speaker arm only; `round.ts:82` hard-codes merged for narrator). `memberCardVisibility` (D22)
and auto-mode fields deliberately on BOTH arms with `.catch().default()` fault isolation — correct.
Defaults (`DEFAULT_GROUP_CONFIG`) match D16's solo-is-roster-of-1 (byte-identical off path).
Representable-that-shouldn't-be: narrator×smart paying a director call (F1); the dead
`groupCharacterId` key (F3); the non-strict per-speaker arm (F6). Nothing product-wanted found
unrepresentable.

### (2) Turn-taking — SOUND except F1/F2/F7

- `selectSpeakers` is genuinely pure (injected PRNG, deterministic tie-break `keyed.sort(...key ||
  idx)`), the Efraimidis–Spirakis weights are correctly `u^(1/w)` desc with a positive floor, and
  ban-last's restore-on-empty gives the solo re-speak invariant for free (`select-speakers.ts:74-88`).
- The @mention hard-override is correctly eligibility-intersected and human-authored-only (the
  callers pass only the send's composer text / an explicit verb param — verified at
  `turn.ts:1443` and the two coercion doors).
- `smart` is NOT a stub (F5): full side-LLM path with a loud D41 degrade, an abort-classify seam
  (`CANCELLED` vs `fallback()`, `smart-arbitrate.ts:107-126`), single-eligible short-circuit, and a
  whole-word roster-validating parse. The `turnAccepted`-before-arbitration slot bookkeeping in
  `runAiRound`/`runChain` is total (every exit resolves the slot) — carefully done.
- `driveRound`'s mid-round `locked` yield and abort-carries-committed-truth semantics
  (`round.ts:110-136`) are correct and honest.
- `TurnPrep`'s two-axis shape (`buildSpeakerPrep`) is the right per-speaker projection of one
  immutable ctx; the narrator/per-speaker nudge fork (`buildRoundNudge`) is clean and its
  cast-of-one guards keep solo byte-identical.
- `asPerSpeaker` coercion (`turn.ts:776-792`) — owner-confirmed intent; the coerced literal
  faithfully carries every field except `groupCharacterId` (transient config, never persisted;
  `driveRound` takes the minted id as a separate arg — verified harmless).
- Auto-mode (`engine/auto-mode.ts`) is policy-free orchestration with correct stop taxonomy; one
  nuance: in a narrator chain, ban-last rotates on the ARBITRATED nominee while the committed rows
  carry the synthetic character — harmless today (narrator ignores the pick), part of F1's theater.

### (3) The macro split — SOUND; bless it

- The two identity planes are cleanly separated. IDENTITY macros: one atom
  (`kit/macro/row-macros.ts`), consumed by server ASSEMBLE (`assembly/macros.ts::renderHistoryMacros`
  → `shape.ts:445-471`) and client DISPLAY (`client/src/lib/message-render.ts:63-74`) with the SAME
  producer semantics — the historical client/server divergence the board once noted ("client
  consults cast only when characterId===null") is now simply the atom's own Ruling-B rule, identical
  on both sides. Names-only vs volatile-only registries are exact inverses sharing
  `registerVolatileMacros` (freeze axis cannot drift).
- The cast arm: `AssembleContext.speaker {kind:"cast"}` set exactly once (`speaker-card.ts:37-51`,
  narrator), read by `charForSpeaker` (`macros.ts:37-42`); `cardOwnerCtx` (`assemble.ts:139-141`)
  rebinds card-derived renders back to `{kind:"single"}` — the NARRATOR-CAST class fix — and the
  file-header invariant ("every `pinnedPersona` render binds against a single speaker") holds at
  every render site I walked (`renderOverridable:296`, `renderScenarioMarker:332`,
  `char_description:388`, `char_personality:401`, `dialogue_examples:405`, plus
  `renderMemberField`'s per-member sub-ctx:158-171). The empty-cast floor in
  `shapeContextForCast:44` closes the "You are  in an immersive…" hole.
- `castCharForHostRow` (Ruling-B for the rpg steeringNote) is passed at all five
  `buildTurnContext` call sites as `joinedCastName(room.castNames)` (turn.ts:1336, 1506, 1668,
  2172, 2361) and the preview derives the same value (`read.ts:496-501`) — one identity, no
  re-derived protagonist.
- USER macros (W1-W5): per-turn registry closures ride `TurnPrep`/build-input only, never the
  serializable ctx (enforced by comment + shape at `context.ts:345-351`, `turn.ts:340-345`); values
  in the per-chat sibling column via `loadStoredUserMacroValues` (turn.ts:385-395, skip-read
  optimization correct); draws frozen-at-commit and replayed byte-exact on swipe/continue
  (`turn.ts:1759,1819`); the greeting freeze threads the freeze registry with a per-ROW sink
  (`turn.ts:1016-1043` — the pooled-sink attribution bug explicitly designed out). The two planes
  meet only at the registry parameter — no entanglement found.

### (4) The template/prose split — the machinery is EXCELLENT; the home RULE is the mis-split (F4)

- The registry mechanics are the best-enforced surface in the review: `PROSE_SLOTS` annotated total
  Record + per-table `satisfies Partial<Record<…>>` (both drift directions tsc-forced), two-rung
  no-cascade resolution, home-filtered `composeProse` merge making stale re-homed keys inert,
  derived editor reachability (`USER_PROSE_SLOT_IDS`/`PRESET_PROSE_SLOT_IDS`), default-identity
  pinned per slot. The `castMember` vs `alsoPresent` twin-slot design (opposite semantics, selected
  on the speaker arm at `assemble.ts:207-209`) is exactly right.
- The map of who owns which model-facing sentence, as built: preset section templates
  (`DEFAULT_MARKER_TEMPLATES`, `preset/index.ts:1602`) · preset formatStrings (legacy-adapted slots:
  wiFormat, continue/impersonate/response nudges, newChatMarker) · preset prose blob (2 injection
  frames + continuation cue + the 11 rpg teaches) · user prose blob (side-gen prompts + group
  framings + anchor lead-in + recovery ask) · imagery per-user legacy fields. Every home is
  individually defensible; the RULE that would let a maintainer predict the next one does not exist
  on the tree (F4).

#### (4b) The C4 ruling — right fix, not a symptom

The scope asked whether mode-aware `main_prompt` defaults are a symptom of a deeper mis-split
(should turn-kind-varying text be slot-SELECTION instead of default-variant?). Judgment: **the
ruling is correct as made.** The house already has both shapes: slot-selection
(`memberHeadingSlot` — castMember vs alsoPresent, two overridable storages) and default-variant
(C4). The discriminator that picks between them is the EDIT PATH: `main_prompt`'s override is the
per-section preset `template` (deliberately un-slotted — `DEFAULT_MARKER_TEMPLATES`' own comment,
`preset/index.ts:1616-1619`), so splitting the DEFAULT by speaker kind while keeping ONE override
text is the only shape that doesn't mint a second edit door for the most-edited template in the
product. The mechanism (turn-time selection on speaker kind) is the same one memberHeadingSlot
already uses — the patterns converge, they don't fork. Residual to carry into the C4 build, not a
defect: a HOST-overridden main\_prompt is mode-blind by construction ("one text for both kinds",
owner-ruled), so an override written in per-speaker voice re-creates the C4 defect in that room —
worth an editor hint when the room is narrator-mode, nothing more.

### (5) The seams — SOUND

- **group × rpg:** injected ops only (`ctx.rpg` nullable: `resolvePresetOverride`,
  `gatherTurnContext`, `resolveUserMacros`, `onUserCommit`, `cancelStateRounds`,
  `resolveReasoningHostOnly`); turn.ts's import block contains zero rpg imports (read in full);
  every rpg spread is omit-when-absent so non-game turns are byte-identical.
- **group × persona:** anchor vs active vs row-stamp axes honored everywhere I walked; the
  presence-filtered `personaIds` (persona-BOOK pool) vs presence-UNfiltered `presentHumanUserIds`
  (consent set) distinction (`turn.ts:193-201, 240-248`) is subtle, documented at the declaration,
  and correct per D122.
- **group × preview:** `resolvePreviewInputs` threads the room's real `GroupConfig`;
  `buildPreviewContext:523-529` shapes on the room's own output axis with the honest pinned-merged
  caveat stated in-file (matches the board's recorded caveat). The GM-preset redirect parity between
  preview and turn is explicitly one-homed (`compose/chat.ts:702-710` comment).
- **portability:** the room blob travels verbatim with parse-on-read validation
  (`chat-bundle/index.ts:189-193`) — sound EXCEPT the dead `groupCharacterId` rider (F3). Narrator
  rows import correctly (kind preserved, synthetic identity re-minted by handle on the TARGET box,
  `import-write.ts:457-467`).
- **roster load:** `loadRoster` default-filters `leftSeq IS NULL` (roster.ts:82-89), so
  cast/candidates never carry departed seats; the candidate-level `leftSeq` re-check is
  belt-and-suspenders, not a hole.

---

## §3 VERIFIED CLEAN (what my silence covers)

- Read IN FULL: `contracts/chat/metadata.ts` · `engine/select-speakers.ts` · `engine/round.ts` ·
  `engine/smart-arbitrate.ts` · `engine/auto-mode.ts` · `verbs/turn.ts` (all 2418 lines, five
  chunks) · `assembly/context.ts` · `assembly/macros.ts` · `assembly/shape.ts` ·
  `assembly/speaker-card.ts` · `kit/macro/row-macros.ts` · `client/lib/message-render.ts` ·
  `client/features/chat/components/group-config-form.tsx` · `contracts/prose/index.ts` ·
  `contracts/chat/prose.ts` · `character/verbs/mint-synthetic-group-character.ts` · relevant regions
  of `assembly/assemble.ts` (1-450), `verbs/read.ts` (460-535 + preview surface greps),
  `substrate/assemble-gather.ts` (150-258), `engine/pipeline.ts` (400-460), `persistence/roster.ts`,
  `persistence/import-write.ts` (440-500), `kit/serde/chat-bundle/index.ts` (180-230),
  `preset/index.ts` (960-1040, 1580-1640), `entry/compose/chat.ts` (crew/prose regions),
  `entry/lifecycle.ts` (135-150, 475-490).
- Law read in full: constitution (`AGENTS.md`), `Core-Laws-and-Precedents.md`,
  `Chat-Macro-Resolution.md`, D16/D22/D51/D53/D59/D60/D107-D136 registry entries,
  `.claude/agent-doctrine.md`, workboard LIVE STATE + C-cluster rows.
- Sweeps run (receipts inline above): `groupCharacterId` (ast-grep `-l ts` scanned=2062 + `-l tsx`
  scanned=576 + grep corroboration) · `pooled` (server+client, non-test) · `crew` (39 files,
  per-file counts, every live symbol classified) · `resolveChatProse` consumers (all 6, each
  resolving a user-homed slot) · `shapeContextForSpeaker` callers (pipeline + preview only) ·
  `stopCrewScheduler`/`stopBuddyObserver` assignment census (never assigned) ·
  `mintSyntheticGroupCharacter` callers (all handle-keyed).
- **Gates NOT re-run by me:** three write lanes + a security lane are live on this tree (board LIVE
  STATE) and whole-tree `pnpm check`/battery in a lane is banned (doctrine §"Lane verification is
  SCOPED"). Standing receipt relied on: board 2026-08-08 evening — 197 gates green, fresh
  `verify --push` battery 17/19 with both reds root-caused elsewhere (orphan-ratchet refinery
  export; e2e-smoke seed env), `tests:node` whole vitest+CT GREEN.

---

## §4 NOT COVERED

- `engine/engine.ts` (\~1400 lines) read only at the memory-recall/group-bucket call sites; the
  runner/REQUEST/REDUCE half of the pipeline, streaming, and the terminal-tools thread were not
  re-reviewed (recently stickler-covered under D112).
- `verbs/read.ts` beyond the preview-inputs/preview-context region (member-visibility read
  projections reviewed under D110 §3.6 previously; not re-walked).
- The memory subsystem beyond `gatherMemory`/`resolveLiveWindowCutoffSeq`; world-info pool loading;
  `assembly/injections.ts` splice internals; `role-squash.ts`.
- No live drive / rendered verification (design review of a standing tree; no diff to render).
  The F1 narrator×smart waste and F2 ping-pong are established by construction, not by live capture
  — a one-round live drive would make both undeniable if the owner wants the receipt.
- ST-side comparative semantics for `pooled` were not re-derived from the SillyTavern tree; F2
  stands on our own code's comment/label vs behavior, not on ST parity.

---

## §5 UNCONFIRMED / LOW-PRIORITY NOTES (not findings)

- `client/lib/message-render.ts:79` floors the display-REGEX macro ctx `{{user}}` to `""` where the
  server macro path floors to `"User"` (`assembly/macros.ts:80`, which claims ONE spelling of the
  floor). Affects only a viewer's own display-tier regex scripts on a persona-less row; did not
  chase whether any script class can observe it.
- The greeting-swipe re-freeze gap is already documented law (`Chat-Macro-Resolution.md` §0 "Known
  gap") — noted, not re-filed.
- `chat_digest_speakers` / memory scope field `isGroup: true` (`engine.ts:1397`) is a data field
  name, not a D16 branch — glanced, not audited.

---

## §6 VOCABULARY CENSUS (owner-ordered; instrument: `pnpm ast ident` + grep token extraction over `packages/**/{ts,tsx}`, node\_modules excluded, both languages merged)

Counting notes: "occ" = raw occurrences in code files (identifiers + comments + strings — the
register lives in comments too, which is where the owner meets it); "sym" = distinct identifier
tokens containing the stem (top tokens listed in the working sweep). Excluded with receipts:
`castId` (286 occ) = the branded-id **type-cast** helper, not the theatrical cast · `act` substring
counts are noise (`action`/`active`/`character`); exact-ident `act`/`acts` = 10, all rpg plot data ·
`stage`/`staged` = build-pipeline + rpg staging-accumulator verb sense, zero theatrical usage found ·
`production` = deployment env · `troupe`/`ensemble`/`screenplay` = zero.

### The concept-space inventory

| Term | occ (ts+tsx) | files | Where it lives | Bucket | Verdict |
| - | - | - | - | - | - |
| **participant** | \~1590 | 210 | `chat_participants`, `PARTICIPANT_KINDS`, `requireParticipant` — the membership/authority axis (D16/D18 law) | (b) LOAD-BEARING | **Canonical** for "a seat row / the membership axis". |
| **roster** | \~1486 | 288 | `loadRoster`, `ChatRoster`, roster verbs (invite/kick/handoff), rpg `resolveRpgRoster`/`RosterRefIndex`, draft `rosterOverrides` | (b) LOAD-BEARING | **Canonical** for "one room's loaded seat list". Distinct from participant (the row) — merging loses the list-vs-row distinction the verbs are named by. |
| **cast** | \~1735 (excl. `castId`) | \~300 | `castNames`/`castCharacterIds`/`castMembers`/`CastName`/`castNotMuted`, the `{kind:"cast"}` speaker arm, `{{group}}` feed; rpg `cast:` actor-ref kind + `view.cast` (D113-ruled: "ROSTER-people semantics and stay"); client "cast bar" | (b) LOAD-BEARING | **Canonical** for "the AI-character subset of the roster" (roster ⊃ cast). Genuinely a different set (excludes humans); merging into roster loses it. Theatrical-adjacent but doing real work. |
| **speaker(s)** | \~1489 | 153 | `SpeakerRef`, `selectSpeakers`, `speakerCharacterId`, `speakerTags`, `lastSpeaker`, `chat_digest_speakers` | (b) LOAD-BEARING | **Canonical** for "this round's selection / the voicing identity" (cast ⊃ eligible ⊃ speakers). |
| **candidate** | \~458 | 109 | `ArbiterCandidate` (arbitration input); separately `InjectionCandidate` (budget walk) | (b) LOAD-BEARING | Keep — the eligible-INPUT projection (carries talkativeness/disabled), distinct from the speaker OUTPUT. The two Candidate types are different domains sharing a common noun; no collision in practice. |
| **member** | \~3513 | 603 | `ParticipantRole:"member"` (law), `memberCardVisibility` (D22), `castMembers`, `narratorMemberNames`, + heavy generic use | (b) LOAD-BEARING | Keep — "member" is the ROLE value and D22 vocabulary. Not renameable without touching law. |
| **seat / seated** | \~902 | 162 | `setSeatKnobs`/`SeatKnobs` (chat verb), `hostSeat`/`charSeat`, `resolveGmSeatHolderKind` (rpg), D60 "agent seat", pervasive comment prose | **(c) with a (b) core** | The fourth synonym for a participant row. The SYMBOLS are few (\~8 named); the register is mostly comment prose. Recommendation: rule `participant`/`roster` canonical, rename the handful of `Seat*` symbols opportunistically (`SeatKnobs` → participant-tuning naming), stop minting new "seat" names. D60's "agent seat" design prose re-words when it lands. |
| **group** | \~3069 | 494 | `GroupConfig`, group policies, synthetic group character, `{{group}}`, `chatMetadata.group` (D16 law) + generic (`ToggleGroup` etc.) | (b) LOAD-BEARING | Canonical for the multi-character room concept. Keep. |
| **narrator** | \~455 | 87 | `output:"narrator"`, `messages.kind:"narrator"` (D129), `postNarratorMessage`, nudge slots | (b) LOAD-BEARING | Keep — a mode AND a declared row purpose; renaming touches DB CHECK + policy record + wire. |
| **party** | 288 (excl. "third-party") | \~20 real | rpg only: `update_party` tool (MODEL-FACING wire name), party plane, `partyTotals` | (b) | Keep or re-rule knowingly: it is D\&D-genre vocabulary (D108: "the roster-∪-sheets projection IS the party"), not movie-production register — and the tool NAME reaches the model wire + stored `rpg_turn_tool_calls`, so a rename is a wire-vocabulary migration, not a sweep. |
| **crew** | 137 | 39 | See F8: null-wired `ChatContext.crew` seam, dead `stopCrewScheduler`, LIVE `entryMetadata.crew` provenance field, \~30 design-doc comment cites (+4 false positives: "screwdriver" in seeder prose) | **(c) — RULED-DEAD violation** | **Kill list, cite D59 disposition.** The live `metadata.crew` world-info field is the one with data-migration cost — cheapest renamed inside the pre-launch NO-LEGACY window. The null seam + scheduler var delete clean. |
| **director** | 32 | 12 | Comments (crew design + smart-arbitrate), prose-slot TITLE "Turn-director prompt" (`chat/prose.ts:92`), client warning copy "The turn director model…" (`warning-notice.ts:57`), settings search keyword, `observer` doc "Narrative Director seam" | **(c)** | **Kill list — the code already has the canonical name: `arbiter`** (`chat.arbiter.system`, `ArbiterCandidate`, `smartArbitrate`). Two user-facing strings + a slot title + comments say "director" for the same thing. Unify on arbiter (\~10 real sites; the slot ID itself needn't change). |
| **scene** | \~780 | 151 | rpg `update_scene` tool, `sceneState`, `{{rpgSceneState}}`, Scene cards/tab — D110/D111-ruled planes | (b) | Keep — rpg data vocabulary, model-facing. One UI-copy item on the kill list below. |
| **act / acts** | 10 (exact idents) | 4 | rpg `plot: {act, title, acts}` (D110 P5 plane) | (b) | Keep — stored + model-facing plot data, not flavor. |
| **audience** | 15 | \~6 | JWT audience (auth, unrelated) + D59 crew-design comment prose (`ChatInjection.audience` was never built — no such field on the tree) | (c) trace | Nothing to rename in code; dies with the crew comment cleanup. |
| **stage/staging** | \~1169 | 230 | Build/verify stages, rpg staging accumulator, `stageDirectory` — verb sense throughout | excluded | Not theatrical; no action. |
| **ember** | 71 word-start (real token names) | — | Token nickname vocabulary + dozens of CTs | **(a) RECORDED BRAND** | Cite: EMBER-VOCAB-SWEEP premise-kill (2026-08-03, memory-pinned) proved sweeping it does harm. RE-RULE-IF-OWNER-WANTS — his explicit call, never a sweep item. |
| **weave** | 150 | — | The Weave brand glyph/cell (D121-C: "the Weave glyph became a real named button"; §13.9 hand-authored brand ruling) | **(a) RECORDED BRAND** | Same: RE-RULE-IF-OWNER-WANTS, reversing a recorded ruling is his explicit word. |

### User-facing theatrical copy found (kill-list candidates, one screen each)

- `client/features/chat/lib/warning-notice.ts:57` — "The turn director model wasn't available…" →
  arbiter (or plainer: "The speaker-picker model…").
- `contracts/chat/prose.ts:92` — slot title "Turn-director prompt" (shows in the Prose settings
  editor) + its default TEXT opens "You are a turn director…" (model-facing bytes — changing the
  default is a slot re-version, D132(E) default-identity discipline applies).
- `client/features/rpg/components/rpg-scene-tab.tsx:182` — `presentCharacters: "the cast on stage"`
  (a lock-pin label). "on stage" is pure register; "the present cast" says the same thing.
- `group-config-form.tsx:29` — "Round-robin" (F2 — fix the behavior or the label with it).

### Proposed canonical table (owner rules; nobody renames in this pass)

| Concept (one real thing) | Canonical name | Renames-of (sized) | Must-survive distinction |
| - | - | - | - |
| The membership axis / one seat row | **participant** | "seat" prose + \~8 `Seat*` symbols (\~60 symbol occ) | participant(row) vs roster(list) vs cast(AI subset) vs speakers(round selection) — a strict containment chain; every link is load-bearing |
| One room's loaded seat list + seat management | **roster** | — | " |
| The AI-character subset (cards, arbitration pool, `{{group}}`) | **cast** | — | " |
| This round's selected voice(s) | **speaker** | — | " |
| Arbitration's eligible-input projection | **candidate** (`ArbiterCandidate`) | — | input (weights/mute/left) vs output (speakers) |
| The multi-character room concept + its config | **group** | — | law (D16) |
| The one-call whole-cast output mode / row purpose | **narrator** | — | law (D129) |
| The side-LLM speaker picker | **arbiter** | "director" (\~10 real sites, 2 user-facing) | none — pure synonym, kill |
| The machine-writer lore provenance | (owner names it — `automation`?) | `crew` (F8; 1 live schema field + null seam + \~30 comments) | none — ruled-dead register |
| rpg party/scene/act planes | keep as-is | — | model-facing wire + stored data; genre (D\&D), not movie-production |
| ember / weave | keep unless owner re-rules | — | recorded brand rulings (a) |

---

## Appendix — receipts index

- F1: turn.ts:903-947, round.ts:140-153, smart-arbitrate.ts:76-127, warning-notice.ts:57
- F2: select-speakers.ts:101-105 + :14, group-config-form.tsx:26-32, select-speakers.test.ts:42
  (sole `pooled` mention), pooled non-test sweep (7 hits total, 1 behavioral)
- F3: metadata.ts:94-98,137-149; mint-synthetic-group-character.ts (whole file);
  group-character.ts:14; ast-grep `$X.groupCharacterId` ts scanned=2062 / tsx scanned=576;
  group-config-model.ts:46,60; chat-bundle/index.ts:189-193; knob-wire-coverage.ts:24-56
- F4: Core-Path-Registry.md:444 (D132 B); chat/prose.ts:1-42,147-256; round.ts:44-77;
  context.ts:596-615,792; assemble.ts:207-233; shape.ts:122-129,354-362; preset/index.ts:960-988
- F5: metadata.ts:63-64 vs smart-arbitrate.ts (whole file) + turn.ts:732-748
- F6: metadata.ts:38,109-129,170
- F7: select-speakers.ts:144-171
- F8: contract/context.ts (ChatCrewOps), compose/chat.ts:298-300,1106-1108, turn.ts:568-569,
  lifecycle.ts:140-141,477-483, contracts/world-info/index.ts:44-63,
  upsert-entries.ts:197-208, Core-Path-Registry.md:140 (D59 disposition)
