---
kind: review
status: executed
updated: 2026-08-07
---

# Fork host-plane strip — the member→host copy is now an allow-list (lane FORKSTRIP)

> **EXECUTED RECORD, 2026-08-07.** The fix landed in the same lane (`domain/chat/verbs/fork.ts` +
> `tests/server/domain/chat/verbs/fork.int.test.ts`). This file is the durable home of the finding, the
> exploit path, the per-column classification, and the ready-to-paste D-entry — the ledger mint is the
> orchestrator's, batched separately.

## The finding

`forkChat` copied a `message_variants` row by spreading `...variant` and then subtracting a
**hand-maintained deny-list** of host-plane fields. That shape defaults a NEW column to COPIED, which is
backwards at a member→host trust boundary: a non-host forker becomes HOST of the copy (D110 §3.6), so any
column the source room withheld from them as a member becomes readable through the fork's own host reads.

Three columns had already slipped past it:

| column | how it slipped | live? |
| - | - | - |
| `promptSnapshot` | retro-fitted 2026-08-02 (RAWVIEW) after the same class was found | was live, fixed then |
| `rawContent` | added by the identity spine; declared HOST-PLANE by its own contract, copied verbatim | **no** — write-never in production (only the `CanonVariantInput` pass-through at `canon-write.ts:179`, which nothing passes) |
| `macroFreezes` | same change, same contract, same omission | **no** — same write-never census |
| `params` | never classified — rides the host-gated variant wire | **YES** |
| `macroDraws` | never classified — rides the host-gated variant wire | **YES** |

`params` and `macroDraws` are the two columns this sweep found that are **written in production today**.
`loadVariantWire` selects exactly `promptSnapshot` + `params` + `macroDraws`, and `chat.getVariantWire` is
`requireHost` (matrix `getVariantWire: "host"`). The fork dropped one of the three and carried the other two.

## The exploit path (LOW severity, reachable today)

1. Host `H` and member `M` are in a chat. `H` runs turns; every generated variant records `params` (the
   initiator's per-send `UserIntent`) and `macroDraws` (that turn's user-macro random-pick record).
2. `H` leaves the room **without a host handoff**. `M` is now the sole present human.
3. `M` calls `chat.forkChat`. ALLOWED by the solo arm of `assertForkAllowed` — the fork gate deliberately
   sanctions this ("the sole remaining human forking their own room is always safe, even when the host left
   without a handoff"). `M` becomes HOST of the copy.
4. `M` calls `chat.getVariantWire(forkChatId, copiedVariantId)`. The host gate passes on the fork, and `M`
   reads `H`'s `params` + `macroDraws` — data no member-gated surface in the source room ever exposed.

**What leaks:** `H`'s per-turn generation knobs — `stop` sequences, `logitBias`, `seed`, and the free-text
`compaction.instructions` — plus the user-macro draw record over host-authored pools. The `UserIntent` type
also admits `advanced.claudeEnv` (a host-supplied env map); **representable, not observed** — no built client
surface puts `advanced` on a PER-SEND intent, and the persisted `params` is `prep.intent` (per-send), not the
folded preset params.

**Severity LOW:** requires an abandoned room, and no narrative/GM secret is exposed. It is nonetheless the
identical class as the `promptSnapshot` leak, and one rule closes both.

## The rule (the generalization this lane encodes)

> **A column readable ONLY through a HOST-GATED surface does not survive the member→host fork.**

A non-host forker becomes HOST of the copy, so anything the source room withheld from them as a member must
not be recoverable through the fork's own host reads. Everything a MEMBER could already read in the source
room copies verbatim — the fork grants them nothing new.

## The full `message_variants` classification (38 columns, total)

Four classes: **REMAPPED** (fresh id / id-map pointer) · **MEMBER-PROJECTED** (prose the §3.6 strips
transform) · **HOST-PLANE** (dropped for a non-host forker) · **COPIED** (already member-readable).

| column | class | reason |
| - | - | - |
| `id` | remapped | fresh mint |
| `messageId` | remapped | the copied slot |
| `contextBoundaryMessageId` | remapped | cross-slot fit-pass pointer through `slotIdMap`; outside the copied range ⇒ null |
| `content` | member-projected | hidden-span strip (§3.6, pre-existing) |
| `preContinueContent` | member-projected | continue-snapshot body twin — undo/revert would else rebuild the truth |
| `lastContinuationContent` | member-projected | same twin |
| `reasoning` | member-projected | P3: whole channel nulled on a deception-active source |
| `preContinueReasoning` | member-projected | same |
| `lastContinuationReasoning` | member-projected | same |
| `promptSnapshot` | **host-plane** | the sent `AssembledPrompt`: hidden spans verbatim + the whole assembled history incl. slots below a clamped member's D16 floor |
| `params` | **host-plane** (NEW) | host-gated wire trio; `stop`/`logitBias`/`compaction.instructions` prose + the `advanced.claudeEnv` escape hatch; NO member-gated reader |
| `macroDraws` | **host-plane** (NEW) | host-gated wire trio; draw values over host-authored macro pools |
| `rawContent` | **host-plane** (NEW) | PRE-transform text — receive transforms exist partly to STRIP, so the raw is by definition pre-strip bytes; contract-declared host-plane. Reader landed 2026-08-07 — see the addendum |
| `macroFreezes` | **host-plane** (NEW) | the volatile values baked out of that raw; contract-declared host-plane. Reader landed 2026-08-07 — see the addendum |
| `idx` | copied | swipe position, on `MessageView` |
| `model` `provider` | copied | on `MessageView` |
| `tokensIn` `tokensOut` `cacheReadTokens` `cacheWriteTokens` `costUsd` `contextWindow` | copied | economics readout, on `MessageView` |
| `ttftMs` `finishReason` `stopReason` `terminalReason` | copied | on `MessageView` |
| `genStartedAt` `genFinishedAt` | copied | on `MessageView` (the generation-timer chip) |
| `generationId` | copied | on `MessageView` (the PD-137 cost key) |
| `toolCalls` | copied | on `MessageView` — the client's only tool read surface, member-rendered chips |
| `createdAt` | copied | ordering |
| `reasoningEffort` `maxOutputTokens` `apiErrorStatus` | copied | off-view scalar knobs/diagnostics; no authored prose is representable |
| `variableDelta` | copied | a member reads the FOLD unclamped via the member-gated `getVariables` (D79 ruling #8 leans on exactly that), and the fork's own fold needs it |
| `metadata` | copied | server-internal economics sidecar; its ONLY reader is the stats delta's `reasoning_duration` (`substrate/stats-delta.ts`), it reaches no caller-facing payload, and dropping it would desync the fork's stats REBUILD from its live delta |

### The other tables this verb copies

| table | shape | verdict |
| - | - | - |
| `messages` | was `...slot` spread; now `forkSlotValues` (total) | every column COPIED — a pure SLOT (D26), zero content bytes, each field already on `MessageView` or a slot-local turn-origin counter. `chatId` re-homes; `selectedVariantId` born null (circular-FK dance) |
| `chat_injections` | `{...inj, id, chatId}` spread | SAFE — `listChatInjections` is MEMBER-gated (matrix), so injection prose is already member-readable |
| `chats` | explicit field list (already allow-list-shaped) | SAFE — `toChatDetail` serves `group`/`roomOverrides`/`background`/`opening` to EVERY viewer, so the copied `metadata` launders nothing. See the non-security observation below |
| `chat_participants` | constructed fresh | SAFE — no copy |

## The fix (what makes the class unmakeable)

`forkVariantValues` / `forkSlotValues` name **every** column and are typed `Required<typeof
X.$inferInsert>`. A column added to `message_variants` or `messages` is a MISSING PROPERTY and fails `tsc`
until its author classifies it. Copy is now an ALLOW-LIST: the default for a new column is NOT-copied-until-
decided, which is the correct default at a trust boundary.

Two-sided, both probed:

| ratchet | probe | receipt |
| - | - | - |
| compile-time (variants) | planted `forkstripProbeColumn` on `message_variants` | `fork.ts(123,3): error TS2741: Property 'forkstripProbeColumn' is missing … in type 'Required<…>'` |
| compile-time (slots) | planted `forkstripSlotProbe` on `messages` | `fork.ts(208,3): error TS2741: Property 'forkstripSlotProbe' is missing` |
| behavioral | same planted column, ran the census test | `EVERY message_variants column is classified` RED — the live `getTableColumns(messageVariants)` set no longer matched the table |
| behavioral (the leak itself) | reverted the four new strips to verbatim copy | one assertion named all four: `expected [ 'params', 'macroDraws', 'rawContent', 'macroFreezes' ] to deeply equal []` |

The behavioral twin lives in the test file (`FORK_COLUMN_CLASS` + `censusMismatches`) and cross-checks
itself against the LIVE drizzle table, so neither side can rot alone.

## Not fixed here — reported

1. **`rpg/chat-ops/fork-game.ts` has the identical shape**, across five planes: `rpgGames` (`...source`),
   `rpgSheets` (`...s`), `rpgSnapshots` (`...snap`), `rpgJournal` (`...j`), `rpgCheckpoints` (`...c`) — each
   a spread plus a hand-maintained strip (`stripConfigForForker`, `stripBeatsForForker`, the journal
   `content` strip, the `gmPresetId` carry gate). Same defect generator, five more tables. Recommended: the
   same `Required<…$inferInsert>` inversion, one function per plane. Not a known live leak — D111's strips
   cover the columns that existed when they were written.
2. **`domain/export/verbs/export-chat.ts` is already the right shape** — an explicit projection
   (`toParsedVariant` / `loadParsedMessages`) that names each emitted field, with `metadata: null`, behind a
   host gate. A new column cannot leak through it. No change needed.
3. **NON-SECURITY: `chats.userMacroValues` is not carried by the fork.** The `chats` insert names its
   fields, and this (newer) column is absent — so a fork silently loses the room's per-chat user-macro input
   picks. That is the data-loss failure mode of an allow-list; it wants a product decision, not a strip.

## Addendum (2026-08-07, lane FANOUT-2) — the first READER lands under this doc's declared gap

This lane's ratchet forces a re-decision when a new COLUMN appears, never when a new READER appears for an
existing one. That gap is now exercised for the first time, and the premise is recorded rather than assumed.

`rawContent` and `macroFreezes` were classified **host-plane** above while they had NO reader at all — the
classification rested on "their only reader WOULD be host-gated". Lane FANOUT-2 landed the freeze-site writes
(D129-F) and, with them, the first reader: both columns are now served on `VariantWireView`
(`@orb/contracts/chat/assemble.ts`) via `loadVariantWire`, i.e. `chat.getVariantWire` — the pre-existing
`requireHost` surface this doc already treats as the host-gated wire trio's home (`promptSnapshot`/`params`/
`macroDraws`). Checked and held:

- The reader is the SAME gate, not a new one: no verb, route, or matrix row was added or relaxed.
- No member-gated path was created. Neither column is on `MessageView`, and D129-F states the prohibition.
- `verbs/fork.ts`'s allow-list is UNTOUCHED — both columns are still stripped on the member→host copy, and
  the `Required<…$inferInsert>` ratchet plus the census test are unchanged.
- `macroFreezes` is parsed at the read seam (`macroFreezeRecordSchema.safeParse`, malformed ⇒ null), matching
  the `macroDraws`/`variableDelta` degrade discipline; `rawContent` is a plain column with nothing to parse.

So the classification's premise is now a fact instead of a hypothetical, and it strengthened rather than
strained. **The gap itself remains open:** the next reader for an already-classified host-plane column is
still unforced by any ratchet, and is still owed this kind of explicit re-check.

## Verification

Floors run in-lane (scoped, per §L): `biome check` on both touched files (clean) · `eslint` on
`fork.ts` (clean) · all three typecheck programs — graph `tsconfig.json`, per-package `pnpm typecheck`,
`tsconfig.tests-dom.json` (all exit 0) · `check:structure` (`single-pass: clean`). Suites:
`fork.int.test.ts` 33/33 · plus the fork-touching neighbours `rpg/chat-ops/fork-game.int.test.ts`,
`chat/verbs/start-chat.int.test.ts`, `chat/service.int.test.ts`, `chat/bus-golden.suite.int.test.ts`,
`chat/substrate/auth/matrix.test.ts`, `transport/trpc/routers/chat.test.ts`,
`transport/cross-tenant-sweep.suite.int.test.ts` — 125/125.

## Ready-to-paste ledger entry (DRAFT — not minted)

Number per the orchestrator: **D133** (D129–D132 were minted 2026-08-07; verify against
`Core-Path-Registry.md` before pasting). Amends D110 §3.6.

```markdown
## D133 (2026-08-07 — THE MEMBER→HOST COPY IS AN ALLOW-LIST; amends D110 §3.6)

- **A column readable ONLY through a HOST-GATED surface does not survive the member→host fork, and the copy
  is an ALLOW-LIST that `tsc` keeps TOTAL.** A non-host forker becomes HOST of the copy (D110 §3.6), so
  every plane the source room withheld from them as a member must be dropped at the transition; everything a
  MEMBER could already read there copies verbatim (the fork grants nothing new). The rule REPLACES per-column
  judgement: the host-gated variant wire (`loadVariantWire` → `chat.getVariantWire`, `requireHost`) serves
  `promptSnapshot` + `params` + `macroDraws`, and all three now drop for a non-host forker, as do the
  contract-declared HOST-PLANE provenance columns `rawContent` + `macroFreezes`. **THE ENFORCEMENT IS THE
  SHAPE, not the list:** `fork.ts::forkVariantValues`/`forkSlotValues` name every `message_variants` /
  `messages` column and return `Required<typeof X.$inferInsert>`, so a NEW column is a missing property and
  fails the build until classified — a deny-list-over-spread defaults a new column to COPIED, which is
  backwards at a trust boundary and had already let three columns through. The behavioral twin
  (`fork.int.test.ts`'s per-column census, cross-checked against the live `getTableColumns`) reds on an
  unclassified column and on a class the verb stops honoring. The same inversion is OWED to
  `rpg/chat-ops/fork-game.ts` (five planes, same spread-minus-strips shape) — COMMITTED (not yet built).
  Findings record: `docs/reviews/security/2026-08-07-fork-host-plane-strip.md`.
```
