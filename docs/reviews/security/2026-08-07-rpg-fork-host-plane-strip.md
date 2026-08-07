---
kind: review
status: executed
updated: 2026-08-07
---

# rpg fork host-plane strip — the leak was INSIDE a JSON column (lane RPGFORK)

> **EXECUTED RECORD, 2026-08-07.** The fix landed in the same lane (`domain/rpg/chat-ops/fork-game.ts` +
> `tests/server/domain/rpg/chat-ops/fork-game.int.test.ts`). Sibling record and the rule this applies:
> [`2026-08-07-fork-host-plane-strip.md`](2026-08-07-fork-host-plane-strip.md) (lane FORKSTRIP, chat's fork).
> The ledger mint is the orchestrator's, batched separately.

## The finding

`forkGame` cloned five rpg planes by spreading `...row` and subtracting a hand-maintained strip list — the same
defect generator FORKSTRIP inverted on `message_variants` hours earlier. The four ROW planes turned out clean;
**every host-plane byte on this surface lives inside ONE column, `rpg_games.config`**, and the strip list there
covered exactly one field (`lite.steeringNote`), written before three more host-plane fields landed.

| leaked field | how it slipped | live? |
| - | - | - |
| `config.userMacros[].body` / `.args` | WAVE MU added game-authored macros after the strip list was written | **YES** |
| `config.features.relationshipHints` | M1 added the gloss map; never classified | **YES** |
| `config.features.journalTypeHints` | R4c added its sibling map; never classified | **YES** |
| `rpg_snapshots.recentEvents` beyond the beat window | classified COPIED on a CLASS argument that did not survive a driven counterexample (see "the retracted call") | **YES** |

## THE GENERALIZATION THIS LANE ADDS: a table-level allow-list is blind inside a JSON column

FORKSTRIP's `Required<typeof X.$inferInsert>` inversion makes a new COLUMN fail `tsc`. It proves the column
`config` is named and proves **nothing about what is inside it** — and on this surface that is where the entire
trust boundary lives. `rpg_games.config` holds a dozen independently-gated fields: some on the member-gated
`getGame.publicConfig`, some on the member-gated `getTrackerView.trackerDefs`, some served ONLY by the
host-gated `getConfigView`.

**So a JSON column whose fields are independently gated needs its OWN exhaustive-literal ratchet.**
`stripConfigForForker`/`stripFeaturesForForker` build `RpgGameConfig`/`RpgGameFeatures` from explicit literals
with no spread, so a new config field is a missing property and fails the build until its author classifies it.
Two ratchets, one law.

## The exploit path (LOW severity, reachable today)

1. Host `H` runs a game room with member `M`. `H` authors GM material through the console: a steering note, a
   custom relationship label + its gloss ("she obeys but will betray him"), a journal-type gloss, and a game
   user-macro whose BODY is a prompt template.
2. `H` leaves without a host handoff. `M` is the sole present human.
3. `M` calls `chat.forkChat` — ALLOWED by the solo arm of `assertForkAllowed` (the fork gate deliberately
   sanctions the sole remaining human forking their own room). `M` becomes HOST of the copy.
4. `M` calls `rpg.getConfigView(forkChatId)`. The host gate passes on the fork, and `M` reads `H`'s hint glosses
   and macro bodies — material no member-gated surface in the source room ever exposed.

**What the source withheld, precisely:** `chat.getUserMacroPicks` is member-gated and projects a game macro as
`name` + `description` + `inputs` only, with the body/args deliberately withheld as prompt content
(`chat-lifecycle.ts::toPickDef`) — and a macro declaring zero inputs is not projected at all, so its entire
existence is host-only. The two hint maps have no member-gated reader whatsoever: they render on the GM console
off `getConfigView`, and they are consumed only into the assembled PROMPT (the reminder's actor line, the delta
block, the extraction ask).

**Severity LOW:** requires an abandoned/solo room, and what leaks is GM steering prose and prompt templates, not
player data. It is nonetheless the identical class as `steeringNote`, which has been stripped since the verb was
written.

## The gate matrix (derived from the verbs, not from column names)

rpg has NO `ownerId` — authority is chat-FK-derived (D18/D20) through the injected `getMembership` op at
`domain/rpg/guard.ts`. The whole read surface:

| read verb | gate | serves |
| - | - | - |
| `getGame` | `resolveMember` | mode · status · extractionMode · delivery verdicts · `publicConfig` (statProfile, dateMode, immersiveHtml, cyoa, cyoaChoiceBehavior, plotProgression) |
| `getTrackerView` | `resolveMember` | the resolved-current snapshot WHOLE (ambient · actors incl. sheets + actorState · cast · quests · plot · lockedPaths) + `trackerDefs` = `config.trackers` |
| `listJournal` | `resolveMember` | type · label · title · content (active lineage) |
| `listCheckpoints` | `resolveMember` | the checkpoint ROW (label + trigger included) |
| `listTurnToolCalls` | `resolveMember` | the recorded folded-turn calls |
| **`getConfigView`** | **`resolveHost`** | statProfile · **steeringNote** · gmPresetId · the extraction knobs · trackers · **relationshipHints** · **journalTypeHints** · **userMacros** · the feature knobs |
| **`revealHidden`** | **`resolveHost`** | the parsed hidden-span truth (derived from bodies — no rpg column) |

Two host-gated reads, and only one of them touches an rpg column. That is why the classification collapses onto
`config`.

## The full classification

### `rpg_games` (10 columns)

| column | class | reason |
| - | - | - |
| `id` `chatId` | remapped | fresh mint / the fork chat |
| `gmUserId` | dropped | lite is seatless (`NULL` always) — pre-existing |
| `gmPresetId` | gated | `resolveForkGmPreset`: carries only if the FORKER can read it — pre-existing |
| `config` | **mixed** | see the per-field table below |
| `mode` `status` | copied | both on the member-gated `getGame` |
| `sessionNumber` | copied | born 1, never written again in lite; its only reader is the owner-gated `/api/_debug` inspector — a counter, no authored bytes |
| `createdAt` `updatedAt` | stamped | the copy's own clock |

### `rpg_games.config` (11 fields + 12 in `features`)

| field | class | reason |
| - | - | - |
| `engaged` | copied | mirrored onto `ChatRpgPointer` → every viewer's `ChatDetail` |
| `statProfile` `dateMode` | copied | `getGame.publicConfig` |
| `trackers` | copied | IS `getTrackerView.trackerDefs`, projected whole (each def's `hint` included) |
| `extractionMode` | copied | on `getGame` |
| `extractionContext` `extractionWindowTokens` `reconcileEveryBeats` | copied | host-only but SCALAR — an enum and two bounded numbers; no authored prose is representable, and blanking them silently re-tunes the fork's own game (the `reasoningEffort`/`maxOutputTokens` carve-out FORKSTRIP made on the same law) |
| `lite.steeringNote` | **host-plane** | the GM directive; `getConfigView` only — pre-existing strip |
| `userMacros` | **host-plane (NEW)** | bodies/args withheld from the member-gated picks pane by design; an input-less macro has no member-visible existence at all. Dropped WHOLE — a body-less macro that silently expands to `""` is worse than an absent one (the `steeringNote` precedent) |
| `features.relationshipHints` | **host-plane (NEW)** | host-authored steering prose; GM console + prompt only |
| `features.journalTypeHints` | **host-plane (NEW)** | its exact sibling |
| `features.immersiveHtml` `cyoa` `cyoaChoiceBehavior` `plotProgression` | copied | `getGame.publicConfig` |
| `features.deception` `omniscience` `hiddenContentReveal` `recentBeatsKeepLast` `immersiveHtmlInteractive` `cardKeepLastX` | copied | host-only but scalar (same carve-out); stripping `deception` would additionally flip the fork's hidden-channel mechanics — a mechanics change, not a strip |

### `rpg_sheets` (7) — every column COPIED

`getTrackerView` (member) projects each roster actor's whole sheet: className · attributes · flavor · level ·
trackerGrants · trackerRevokes. A sheet whose actor is NOT on the roster is projected nowhere — in the source AND
in the fork — so the owner-ratified copy-all-sheets rule grants no new read. `characterId`/`userId` carry (actor
identity), `id`/`gameId` remap, timestamps stamp.

### `rpg_snapshots` (18)

`id` `gameId` `messageId` `variantId` `asOfMessageId` remapped (the D124 two-arm re-key, pre-existing).
**`recentEvents` is MEMBER-PROJECTED by TWO belts: the beat WINDOW (host-plane — see the retracted call above)
and then the hidden-span strip.** Every other state column is COPIED —
`getTrackerView` projects the resolved-current snapshot whole: `clock`/`calendarDate`/`location`/`weather` as
`ambient`, `presentCharacters` as `cast`, `actorState` as `actors` (identity + volatile), `trackerValues`,
`quests`, `plot`, and `fieldLocks` as `lockedPaths`. `committed` is an internal commit-lifecycle bit with no
caller-facing reader at all (the `metadata` precedent: a server-internal field whose drop would only desync the
copy).

### `rpg_journal` (9) — `content` member-projected, the rest COPIED

`listJournal` is member-gated and serves `type`/`label`/`title`/`content`, so the archive is already
member-readable. `content` additionally runs the hidden-span belt; `title` does not, deliberately — the source's
own member read serves it unstripped, and the fork must not be the only place a title differs.

### `rpg_checkpoints` (6) — `label` + `trigger` COPIED

`listCheckpoints` is MEMBER-gated and returns the ROW, so a host-authored bookmark label is already
member-readable. Only RESTORE is host-gated, and that is authority over room state, not a read gate. (The brief
flagged checkpoint labels as a prime suspect; the gate matrix cleared them — which is the value of deriving the
matrix instead of guessing from names.)

## THE RETRACTED CALL — a class argument is not a field argument (verifier counterexample, 2026-08-07)

**This lane's first pass classified `recentEvents` COPIED and was WRONG.** The rationale was: "the durable beat
log's tail is technically host-only, but the same distillation class is served to every member unbounded by
`listJournal`, so slicing it would be strip-theater." A verifier drove the counterexample and it does not
survive.

**The counterexample.** Host sets `recentBeatsKeepLast: 2`; the head snapshot holds 5 beats. The member-gated
`buildTrackerView` returns `["beat-4","beat-5"]` and nothing else — `tracker-view.ts` slices by `keepLast`, and
`keepLast` is writable ONLY through the host-gated `updateConfig`. So beats 1-3 have **no member-gated reader in
the source room**. A non-host forks, carries all 5, becomes HOST, widens the knob, and reads what was
unreadable. The sharper arm: `recentBeatsKeepLast: 0` means ZERO beats are readable by any member, and the
ENTIRE log crossed.

**Why the original reasoning failed, stated so the shape is recognizable next time.** The law is about BYTES
BEHIND A GATE, and the retracted argument answered a different question — whether bytes *of that kind* are
available elsewhere. `listJournal` serves journal ROWS; those are not these bytes. A "same class of content"
defence can be true and irrelevant simultaneously, and it reads as rigorous because it cites a real
member-gated surface. **A COPIED verdict must name the member-gated reader OF THAT FIELD, not of its genre.**

**Two aggravators the verifier named.** The beat log is append-only across the WHOLE game, so a fork whose
`slotIdMap` holds a single slot still carries beats distilled from turns below a D16-clamped member's history
floor — precisely the leak class `verbs/fork.ts` cites as its reason for making `promptSnapshot` host-plane.

**The fix:** `stripBeatsForForker` now slices to `keepLastBeats(log, SOURCE keepLast)` before the hidden-span
belt, so a non-host forker carries exactly the window the source room served them. `keepLastBeats` is EXPORTED
from `tracker-view.ts` rather than re-spelled — it is the definition of "which beats a member can read", and a
second copy of that slice could drift from the panel and silently widen the boundary.

**Note the asymmetry this creates, and keep it:** `recentBeatsKeepLast` the KNOB copies (it is a prose-free
scalar) while the DATA it gated does not. A host-only scalar is still a gate over member-visible bytes, and
carrying the gate is not the same as carrying what it hid.

### Does the D16 floor bite further? No — decided, with the reason

1. The window strip already fires for **every** clamped forker: `readsHidden === false` is the superset
   condition (a clamped forker is necessarily a non-host — `verbs/fork.ts` F2).
2. The window IS what the source's own member-gated read served that person, floor or no floor —
   `getTrackerView` resolves the current snapshot with **no `resolveHistoryFloorSeq` anywhere in its path**
   (verified: the rpg snapshot resolution has no floor resolver at all).
3. Flooring the fork harder would make it carry LESS than the panel showed the same human, and would leave the
   real question open in the SOURCE, where every member still reads it.

So the residual is reported, not stripped: **`getTrackerView` is not floor-clamped**, so a clamped member's beat
window may quote turns below their own floor. That is a source-side member-visibility question (the D16 plane),
not a fork laundering defect, and fixing it at the fork alone would hide it.

## The judgement call that held

**A WRITE gate is not a read-secrecy boundary.** Two classes of rpg data are reachable in the source room only by
a host: journal entries on a NON-SELECTED variant lineage (`selectVariant` is author-or-host, and an assistant
slot's `authorUserId` is null, so only the host can flip it) and old snapshots behind a checkpoint
(`restoreCheckpoint` is host-gated). Both gates exist because the action CHANGES what the whole room sees — they
are authority over room state, not secrecy. The content behind them is model narrative of the same class the
member reads in-lineage, and the fork's own canon already carries those variants. Classified COPIED. (Note this
is NOT the retracted argument above: here the gate itself is a write, so there is no withheld read to launder —
the member could always see these bytes, on the lineage the room was showing.)

## The fix, and both ratchets probed

| ratchet | probe | receipt |
| - | - | - |
| compile-time (snapshots plane) | planted `rpgforkProbeSnapshotColumn` on `rpg_snapshots` | `fork-game.ts(221,3): error TS2741: Property 'rpgforkProbeSnapshotColumn' is missing … in type 'Required<…>'` |
| compile-time (checkpoints plane) | planted `rpgforkProbeCheckpointColumn` on `rpg_checkpoints` | `fork-game.ts(324,3): error TS2741: Property 'rpgforkProbeCheckpointColumn' is missing` |
| **compile-time (the JSON blob)** | planted `rpgforkProbeConfigField` on `rpgGameConfigSchema` | `fork-game.ts(86,3): error TS2741: Property 'rpgforkProbeConfigField' is missing` — the arm a table-level allow-list cannot produce |
| behavioral (column census) | same planted column | `EVERY rpg column is classified` RED — the live `getTableColumns(rpgSnapshots)` set no longer matched |
| behavioral (config census) | same planted field | `EVERY rpg_games.config FIELD is classified` RED — read off the live `rpgGameConfigSchema.shape` |
| behavioral (the leak itself) | reverted the four config strips to verbatim copy | one assertion named all four: `expected [ 'lite.steeringNote', 'userMacros', 'features.relationshipHints', 'features.journalTypeHints' ] to deeply equal []` |
| behavioral (the beat window) | a keepLast-2 source with a 5-beat log, driven RED before the fix | `expected [ 'beat-1' … 'beat-5' ] to deeply equal [ 'beat-4', 'beat-5' ]` |
| behavioral (the sharp arm) | a keepLast-0 source with the same log | `expected [ 'beat-1' … 'beat-5' ] to deeply equal []` |
| behavioral (the host arm) | the same source, `readsHidden: true` | all five beats carry — green BEFORE and AFTER the fix, so the window strip is proven non-vacuous and host-neutral |
| behavioral (the DROP arm) | a fully-populated source game | `no COPIED column is silently dropped` — per-column comparison across all four row planes, the failure mode that lost `chats.userMacroValues` on the chat fork |

## Not fixed here — reported

1. **`rpg_turn_tool_calls` is the SIXTH rpg table and `forkGame` does not copy it.** The file header claimed a
   "whole 6-table vertical", which is what made the omission invisible to a sweep — the header is truth-repaired
   in this commit; the copy decision is a product call, boarded. Not a leak: the rows are MEMBER-readable by
   design (`listTurnToolCalls` is `resolveMember`), so copying them would be safe.
2. **`getTrackerView` is not D16-floor-clamped** — a clamped member's beat window (and the resolved snapshot
   generally) may quote turns below their own history floor. Source-side member-visibility question, surfaced by
   the beat-window counterexample; see "Does the D16 floor bite further?" above for why the fork is not its fix.
3. **`listJournal` applies NO hidden-span strip in the SOURCE room.** The fork's `content` strip is a
   defense-in-depth belt the source itself does not have, so if a model ever puts a `<lie>` in a journal entry
   the member read serves it raw. Ruled territory on rpg's side (rpg-design §1.6 recommendation A keeps tracker
   prose surface-only at the source), but it is the D129 class — hidden means hidden in every derived plane —
   and belongs to the identity work, not to rpg's fork. Boarded by the orchestrator.

## Verification

Floors run in-lane (scoped, per §L), re-run whole after the beat-window fix leg: `biome check` on the three
touched files (clean) · `eslint` on `fork-game.ts` + `tracker-view.ts` (clean; the test file is outside eslint's
config scope) · all three typecheck programs — graph `tsconfig.json`, per-package `pnpm typecheck`,
`tsconfig.tests-dom.json` (all exit 0) · `pnpm check:structure` (`single-pass: clean`) · `pnpm check:docs`
(clean) · whole-tree `npx knip --cache` exit 0, which is the arm that matters for the newly EXPORTED
`keepLastBeats` (a real consumer, not a false orphan). Suites:
`rpg/chat-ops/fork-game.int.test.ts` **20/20** · plus the whole `rpg/chat-ops/**` tree,
`rpg/authority.suite.int.test.ts`, the whole `rpg/verbs/**` tree, and `chat/verbs/fork.int.test.ts` —
**259/259 across 34 files**.

## Ready-to-paste ledger entry (DRAFT — not minted)

Number per the orchestrator: **D133 is spoken for by the sibling's draft**, so this is its successor (verify
against `Core-Path-Registry.md` before pasting). Amends D110 §3.6 and extends the sibling's entry.

```markdown
## D134 (2026-08-07 — THE MEMBER→HOST ALLOW-LIST REACHES INSIDE A JSON COLUMN; extends D133)

- **A `Required<…$inferInsert>` copy allow-list is BLIND inside a JSON column, so a JSON column whose fields are
  independently gated owes its OWN exhaustive-literal ratchet.** D133 made a new COLUMN fail `tsc` at the
  member→host fork; on `rpg/chat-ops/fork-game.ts` the entire trust boundary lives INSIDE one column
  (`rpg_games.config`), whose fields split across three gates — the member-gated `getGame.publicConfig`, the
  member-gated `getTrackerView.trackerDefs`, and the host-gated `getConfigView`. The column-level ratchet proves
  `config` is named and proves nothing about its contents, and that blindness had already let THREE host-plane
  fields ride: `config.userMacros` (the member-gated picks pane projects name+description+inputs and withholds
  the BODY as prompt content — an input-less macro is not projected at all) and
  `config.features.relationshipHints`/`journalTypeHints` (host-authored steering prose with NO member-gated
  reader). All three now drop for a non-host forker, whole-value, the `lite.steeringNote` precedent.
  **THE ENFORCEMENT IS THE SHAPE:** `stripConfigForForker`/`stripFeaturesForForker` build
  `RpgGameConfig`/`RpgGameFeatures` from explicit literals with NO spread, so a new config field is a missing
  property and fails the build until classified; the five per-plane `fork*Values` builders carry D133's
  column-level ratchet for the four row planes. Both have behavioral twins in
  `rpg/chat-ops/fork-game.int.test.ts` cross-checked against the LIVE `getTableColumns` and the LIVE
  `rpgGameConfigSchema.shape`, so neither side can rot alone. **The rpg wrinkle the matrix settled:** rpg has no
  `ownerId` (authority is chat-FK-derived, D18/D20) and its host-only READ surface is exactly `getConfigView` +
  `revealHidden` — every column `getGame`/`getTrackerView`/`listJournal`/`listCheckpoints`/`listTurnToolCalls`
  serves is member-readable and copies verbatim, which cleared checkpoint labels, sheets, and the whole snapshot
  state plane. **A WRITE gate is not a read-secrecy boundary** (`selectVariant`'s author-or-host gate and
  `restoreCheckpoint`'s host gate make data host-reachable-only, but they gate an action that changes what the
  room sees — the content behind them stays COPIED). **A COPIED verdict must name the member-gated reader OF
  THAT FIELD, never of its genre:** `rpg_snapshots.recentEvents` was first classified COPIED because the same
  distillation CLASS is served unbounded by the member-gated `listJournal` — a true statement about different
  bytes. The log is append-only across the whole game and its only member-gated reader slices it by the
  HOST-writable `recentBeatsKeepLast` (`keepLast: 0` ⇒ the member reads NONE), so a non-host forker now carries
  `keepLastBeats(log, SOURCE keepLast)` and nothing more, via the SAME exported helper the panel uses (one home
  — a re-spelled slice could drift and silently widen the boundary). **The knob copies; the data it gated does
  not** — a host-only SCALAR is still a gate over member-visible bytes, and the scalar carve-out never licenses
  carrying what the scalar hid. The D16 floor needs no further clamp HERE (`readsHidden === false` already
  covers every clamped forker, and the window is what the source's own unclamped `getTrackerView` served them);
  that `getTrackerView` is unclamped at all is a source-side member-visibility question, recorded separately.
  Findings record: `docs/reviews/security/2026-08-07-rpg-fork-host-plane-strip.md`.
```
