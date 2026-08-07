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
`recentEvents` is MEMBER-PROJECTED (the hidden-span belt, pre-existing). Every other state column is COPIED —
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

## Two judgement calls, stated so they can be checked

1. **A WRITE gate is not a read-secrecy boundary.** Two classes of rpg data are reachable in the source room only
   by a host: journal entries on a NON-SELECTED variant lineage (`selectVariant` is author-or-host, and an
   assistant slot's `authorUserId` is null, so only the host can flip it) and old snapshots behind a checkpoint
   (`restoreCheckpoint` is host-gated). Both gates exist because the action CHANGES what the whole room sees —
   they are authority over room state, not secrecy. The content behind them is model narrative of the same class
   the member reads in-lineage, and the fork's own canon already carries those variants. Classified COPIED.
2. **`recentEvents` beyond `recentBeatsKeepLast` is copied.** The durable beat log's only caller-facing reader is
   the keepLast slice, served IDENTICALLY to host and member (`buildTrackerView` is principal-free), so the tail
   is technically reachable only by flipping a host-gated knob. It still copies: the same distillation class is
   served to every member unbounded and unfloored by the member-gated `listJournal`, so slicing the fork's log
   would be strip-theater with real continuity loss. The hidden-span belt on it is retained.

## The fix, and both ratchets probed

| ratchet | probe | receipt |
| - | - | - |
| compile-time (snapshots plane) | planted `rpgforkProbeSnapshotColumn` on `rpg_snapshots` | `fork-game.ts(221,3): error TS2741: Property 'rpgforkProbeSnapshotColumn' is missing … in type 'Required<…>'` |
| compile-time (checkpoints plane) | planted `rpgforkProbeCheckpointColumn` on `rpg_checkpoints` | `fork-game.ts(324,3): error TS2741: Property 'rpgforkProbeCheckpointColumn' is missing` |
| **compile-time (the JSON blob)** | planted `rpgforkProbeConfigField` on `rpgGameConfigSchema` | `fork-game.ts(86,3): error TS2741: Property 'rpgforkProbeConfigField' is missing` — the arm a table-level allow-list cannot produce |
| behavioral (column census) | same planted column | `EVERY rpg column is classified` RED — the live `getTableColumns(rpgSnapshots)` set no longer matched |
| behavioral (config census) | same planted field | `EVERY rpg_games.config FIELD is classified` RED — read off the live `rpgGameConfigSchema.shape` |
| behavioral (the leak itself) | reverted the four config strips to verbatim copy | one assertion named all four: `expected [ 'lite.steeringNote', 'userMacros', 'features.relationshipHints', 'features.journalTypeHints' ] to deeply equal []` |
| behavioral (the DROP arm) | a fully-populated source game | `no COPIED column is silently dropped` — per-column comparison across all four row planes, the failure mode that lost `chats.userMacroValues` on the chat fork |

## Not fixed here — reported

1. **`rpg_turn_tool_calls` is the SIXTH rpg table and `forkGame` does not copy it.** The file header claimed a
   "whole 6-table vertical", which is what made the omission invisible to a sweep — the header is truth-repaired
   in this commit; the copy decision is a product call, boarded. Not a leak: the rows are MEMBER-readable by
   design (`listTurnToolCalls` is `resolveMember`), so copying them would be safe.
2. **`listJournal` applies NO hidden-span strip in the SOURCE room.** The fork's `content` strip is a
   defense-in-depth belt the source itself does not have, so if a model ever puts a `<lie>` in a journal entry
   the member read serves it raw. Ruled territory on rpg's side (rpg-design §1.6 recommendation A keeps tracker
   prose surface-only at the source), but it is the D129 class — hidden means hidden in every derived plane —
   and belongs to the identity work, not to rpg's fork. Boarded by the orchestrator.

## Verification

Floors run in-lane (scoped, per §L): `biome check` on both touched files (clean) · `eslint` on `fork-game.ts`
(clean; the test file is outside eslint's config scope) · all three typecheck programs — graph `tsconfig.json`,
per-package `pnpm typecheck`, `tsconfig.tests-dom.json` (all exit 0) · `pnpm check:structure`
(`single-pass: clean`). Suites: `rpg/chat-ops/fork-game.int.test.ts` 17/17 · plus the fork/authority-touching
neighbours `rpg/chat-ops/handoff-heal.int.test.ts`, `rpg/chat-ops/index.int.test.ts`,
`rpg/authority.suite.int.test.ts`, the whole `rpg/verbs/**` tree, and `chat/verbs/fork.int.test.ts` — 190/190
across 30 files.

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
  room sees — the content behind them stays COPIED). Findings record:
  `docs/reviews/security/2026-08-07-rpg-fork-host-plane-strip.md`.
```
