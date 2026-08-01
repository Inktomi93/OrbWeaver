# Stickler review — W1 rpg-lite domain vertical (uncommitted working tree vs HEAD)

Date: 2026-07-26
Scope: the whole uncommitted working tree (34 `git status` entries; most of `domain/rpg/**` is new/untracked)
before its single atomic W1 commit. Reviewed against the constitution (`AGENTS.md`), the D-ledger
(`Core-Path-Registry.md`), the ratified spec (`docs/design/lite-plus-guided-substrate-spec.md`), and the D108
draft (`scratchpad/d108-draft.md`).

Mandates: (A) code correctness + law-vs-code coherence; (B) HARD focus on the cross-tenant write-boundary /
IDOR / authority class.

Static battery: `pnpm check` (== `pnpm verify --static`, whole scope) ran GREEN this session — `reports/verify.json`
`ok:true exitCode:0 failed:0`, all 12 stages pass (biome, eslint, types×5, execution-membership, structure:full,
depcruise, knip, docs:format). So everything below is a LOGIC/behavior class the gates structurally cannot catch.

---

## FINDINGS (ranked most-severe first)

### F1 — HIGH — a negative pool delta on a not-yet-existing pool POISONS the snapshot and bricks the game

**Files:** `packages/server/src/domain/rpg/tools/apply.ts:65-84` (`applyNamedDeltas`) + `:99-107`
(`applyUpdateParty` pool-mint), consumed by the cheap `update_party` handler
(`tools/index.ts:94-107`) AND the reliable extraction fold (`apply.ts:345-350` → same applier). The
schema that rejects the result: `packages/contracts/src/rpg/actor.ts:66` (`pools[].max: z.number().int().min(1)`).
The commit-before-validate seam: `persistence/snapshots.ts:149-156` (`insertSnapshot` inserts, THEN
`parseSnapshotRow` throws).

**Defect:** minting a fresh pool uses `(name, delta) => ({ name, value: delta, max: delta })` — so a pool
first seen with `delta <= 0` is minted with `max <= 0`, which violates the contract schema's `max >= 1`.

**Concrete failure scenario (reproduced this session):**
- The model narrates "the wizard spends 1 mana" and calls `update_party {targetRef:"Wizard", poolDeltas:[{name:"mana", delta:-3}]}` — an ordinary, high-probability action (a pool decremented before it was ever established).
- The tool returns `{ok:true}` (the model believes it succeeded).
- `onTurnCompleted` → flush → `writeStagedSnapshot` → `insertSnapshot` **commits** the row `actorState:[{...pools:[{name:"mana",value:-3,max:-3}]}]`, then `parseSnapshotRow` throws `RpgStateCorruptError`. The engine calls the hook `void ctx.rpg.onTurnCompleted(...).catch(()=>undefined)` (`domain/chat/engine/engine.ts:561`), so the throw is swallowed — but the invalid row is already in the DB.
- Every subsequent read that resolves that snapshot (`getTrackerView`, the next turn's `gatherTurnContext` reminder, the next turn's base resolution) calls `parseSnapshotRow` and throws `RpgStateCorruptError`. The tracker panel is dead; the next chat turn's gather throws (and `getTrackerView` is a member read that now 500s).

**Evidence (this session):**
- `reports/stickler/scratch/repro3.ts` → `TOOL RESULT: {"ok":true,...}` then `FLUSH THREW: RpgStateCorruptError rpg_snapshots ...: actorState: [... "path":["actorState",0,"pools",0,"max"], "message":"Too small: expected number to be >=1"]`.
- `reports/stickler/scratch/repro4.ts` → after the swallowed flush throw: `SNAPSHOT ROWS IN DB AFTER THROW: 1` and `getTrackerView THREW: RpgStateCorruptError` — the poisoned row persists and breaks the read side.
- Reliable mode shares the vector: `apply.ts:346 extractionToStateDelta → applyUpdateParty` (grep confirmed), and `updatePartyArgsSchema.poolDeltas[].delta` is `z.number().int()` with no positivity floor, so a negative delta passes arg-validation and folds into the same poisoned `statePatch`.

**Why it matters / law:** this directly falsifies the D108-draft + spec invariant "non-conforming → EMPTY
delta, errors-as-data, **canon NEVER corrupted**" (`d108-draft.md` §3; spec change-log §"delivery-model
amendment"). The `hpDelta`-on-null-hp path is correctly guarded as errors-as-data (`apply.ts:95-97`); the
pool-mint path is not. The parse-on-read belt fires AFTER the insert commits, so it converts a producer bug
into a permanent read-side brick instead of preventing the write. Remediation direction (do not implement —
routing note): clamp the minted `max` to `>= 1` (or `Math.max(1, delta)` / treat `delta <= 0` on a fresh pool
as an errors-as-data denial like `hpDelta`), and/or validate the staged state against
`rpgActorVolatileSchema` at stage/flush time BEFORE the durable insert.

**Test reality:** untested. `tests/server/domain/rpg/tools/index.int.test.ts:40-49` exercises
`update_party` with `poolDeltas:[{name:"rage", delta:5}]` (a POSITIVE delta → `max:5`, valid) and asserts
only `staging.peek()` — it never flushes+reads-back, so the negative-delta poison and the parse-on-read
throw are never hit.

---

### F2 — HIGH — `update_party` / `update_inventory` writes never reach a roster actor's rendered volatile (silent dead write)

**Files:** `packages/server/src/domain/rpg/tools/apply.ts:43-52` (`resolveActor`) +
`packages/server/src/domain/rpg/chat-ops/tracker-view.ts:88-96` (the `volatileByKey` join) +
`substrate/reminder.ts:65-96` (`actorLine` reads `view.actors[].volatile`).

**Defect:** `resolveActor` matches/mints ONLY `cast`-kind actor entries
(`actors.findIndex((a) => a.actorRef.kind === "cast" && a.actorRef.castKey === targetRef)`; else
`newCastActor(targetRef)` → `{actorRef:{kind:"cast",castKey}}`). It has no access to the roster and cannot
map a model-supplied name to a `character`/`user` ref. The tracker view builds `actors` from the roster
(refs `character:<id>` / `user:<id>`) and looks up volatile by `actorRefKey(rosterRef)`. A tool-written
`cast:<name>` entry can never match a roster actor's key, so the write is invisible in both the tracker
panel and the steering reminder. Cast entries are also not shown anywhere (`view.cast` is
`presentCharacters`, a separate plane written by `update_scene`, not `actorState`).

**Concrete failure scenario (reproduced this session):** the gather reminder lists roster party members
under "Party:" by NAME (e.g. "Kael"). The model calls `update_party {targetRef:"Kael", poolDeltas:[{name:"focus", delta:7}]}`.
The write stages + flushes successfully to `actorState` as a `cast:Kael` entry, but `getTrackerView`
returns Kael (the roster character) with `volatile: null`. Every per-actor combat/economy value the model
sets on a party member (HP via `update_party`, pools, conditions, status, inventory + wallet via
`update_inventory`) is written to canon but never rendered and never re-injected — the core model-driven
party-state loop is a no-op for the party.

**Evidence (this session):**
- `reports/stickler/scratch/repro.ts` → `TOOL RESULT: {"ok":true,...}`; `KAEL VOLATILE IS NULL: true`; the actors array shows `"volatile":null` for the roster character.
- `reports/stickler/scratch/repro2.ts` → `PERSISTED actorState: [[{"actorRef":{"kind":"cast","castKey":"Kael"},...,"pools":[{"name":"focus","value":7,"max":7}]...}]]` — proving the write landed as an orphan `cast:Kael` entry, disconnected from the roster's `character:character_kael` key.
- Grep: the only read of `state.actorState` in the view/reminder surfaces is `tracker-view.ts:90` (`volatileByKey`, joined by roster ref).

**Why it matters / law:** the spec makes wallet + inventory (and per-actor volatile) "first-class on EVERY
actor" including roster characters (§2.6, §4.3, §4.8 "Status = actors (meters/conditions)"), and the view
type carries `RpgActorView.volatile`. The code contradicts both the spec AND its own header comment
(`apply.ts:37-42` claims a `character`/`user` actor "is addressed by the SAME name the gather surfaced" and
that resolution matches "a present-character name / roster name" — the code does neither). This is a real
write↔read seam gap, not an accepted lite limitation (the reminder + view actively render the plane the
model can never populate).

**Test reality:** untested. `tests/server/domain/rpg/tools/index.int.test.ts` asserts only `staging.peek()`
(the fake), never a flush→`getTrackerView` round-trip; `tests/server/domain/rpg/chat-ops/tracker-view.int.test.ts`
only covers the turnless (`volatile: null`) case. No test drives a tool write for a roster actor and asserts
it surfaces — the exact asserts-the-fake gap that let the seam ship.

---

### F3 — MEDIUM — the rpg compose seam resolves "the host" as the first-joined human, not the role=host participant

**File:** `packages/server/src/entry/compose/rpg.ts:` `hostUserIdOf` (≈ the function reading
`deps.rpgChatOps.resolveRpgRoster(chatId)` and returning `actors.find((a) => a.actorRef.kind === "user")`).

**Defect:** `hostUserIdOf` picks the FIRST `user`-kind actor from the roster projection. `resolveRpgRoster`
returns actors in `joinSeq` order (`domain/chat/persistence/roster.ts:57` `orderBy(asc(joinSeq), asc(id))`,
order preserved through `resolve-rpg-roster.ts`), and `RpgRosterActor` carries NO role. So "first human by
join order" ≠ "the role=host participant". Everywhere else in the codebase the host is resolved by
`role === "host"` (`compose/chat.ts:447` `resolveChatHostUserId`, `post-narrator-message.ts:37`, and even
`resolve-rpg-roster.ts` itself for card-ownership). `hostUserIdOf` feeds both `buildRunExtraction` (the
reliable-mode model call, which resolves `resolveHostPrincipal(thatUser)` + `connection.resolveRole({role:"chat"})`)
and `buildResolveTrackersReadOnly` (the `trackersReadOnly` capability verdict).

**Concrete failure scenario:** a multi-human lite game where host authority moved via `acceptHostHandoff`
(D64) — the swap flips roles in place without changing `joinSeq`, so the ORIGINAL host (now a plain member,
`joinSeq 0`) is still the first human. Consequences on any post-handoff (or any member-joined-before-host)
game:
- Reliable extraction resolves its connection/credentials under the WRONG human — a D19 funding/attribution
  violation (the game turn must run under the current host's `runAsUserId`); if that human has no chat
  connection, `resolveRole` may throw → `runExtraction` throws → swallowed by the engine `.catch` → state
  silently not extracted.
- `trackersReadOnly` (whether the model has a write path, which gates tool attachment AND the client
  read-only pill) is computed from the wrong human's `ModelCapability`, diverging from the connection the
  turn actually runs under.

**Evidence (this session):** code reading — `loadRoster` order (`roster.ts:52-57`), the order-preserving
projection (`resolve-rpg-roster.ts`), `RpgRosterActor` having no role field (`chat/contract/context.ts`
`RpgRosterActor`), `hostUserIdOf` using `find(kind==="user")`, and `acceptHostHandoff` swapping roles in
place (`domain/chat/verbs/roster.ts`). CONFIRMED by code inspection; trigger is the multi-human/handoff
path (the solo/host-joined-first case — the compose int test's shape — masks it).

**Why it matters / law:** D19 (`runAsUserId` = the host funds the turn) + Spine-Identity §2b (authority
derives from the role=host participant). Remediation direction: resolve the host via role (add a
host-resolution op or surface role on the projection), not join order.

---

## VERIFIED CLEAN (what my silence covers)

- **Mandate B — cross-tenant write-boundary / IDOR (exhaustive sweep): CLEAN.** Every by-id host verb
  re-scopes to the resolved game and throws leak-free `DomainNotFoundError`:
  - `updateWidget`/`deleteWidget` → `persistence/widgets.ts` `and(eq(id), eq(gameId, game.id))`, verb throws NotFound on no-match.
  - `editJournalEntry`/`deleteJournalEntry` → `persistence/journal.ts` same game-scoped predicate.
  - `restoreCheckpoint` → `checkpoint.gameId !== game.id` guard + `findSnapshotById(checkpoint.snapshotId)` (the snapshot id comes from the game-owned checkpoint).
  - `createCheckpoint` → `resolveSnapshotForTurn({id: game.id, chatId})` (game-scoped head).
  - `upsertQuest`/`deleteQuest`/`editSnapshot` → resolve the game from `chatId`+membership, operate on THAT game's resolved snapshot; no caller-supplied cross-game id.
  - `patchSheet` → `assertOwnUserRef` (member limited to own `user` ref) + game-scoped `findSheet`/`upsertSheet`.
  - `rollDice` → member-gated, zero state.
  The `authority.suite.int.test.ts` drives a real two-game exploit (host-of-A reaching game-B rows) and reads
  the victim row back to prove it is untouched/surviving — asserts-the-real, not asserts-the-fake. The
  host/member-own/member-foreign/non-member grid is covered per verb with leak-free NotFound vs Forbidden
  distinctions matching `guard.ts`. `rpg.stream` correctly EXEMPT in the cross-tenant sweep (per-yield
  `chatEventBounds` membership gate; matches `chat.streamMessages`).
- **Injected-op caller gate:** `resolveRoster`/`setRpgPointer`/`gather` are principal-free by design; the
  authority gate is at the verb boundary (`createGame` checks membership+host before `setPointer`; every
  gated verb resolves through `guard.ts`). No caller-Principal is dropped en route to an authority check.
  (F3 is a wrong-host-selection bug within the same tenant, not a cross-tenant id hole.)
- **Merge / lock engine (`substrate/merge.ts`): correct.** The `[merge-clear]` contract (`{}`=no-op,
  `null`=leaf-clear, `undefined`=skip) and the `KEYED_ARRAYS` element-lock re-assertion (quests→id,
  inventory→id, presentCharacters→key) hold; the prior array-replace-bypasses-element-lock defect is fixed
  (`mergeKeyedArray` re-asserts locked base elements over a wholesale replace, surviving both MODIFY and
  REMOVAL). `actorState` is honestly a documented un-registered forward-seam (computed key), not a silent
  hole.
- **Extraction errors-as-data (malformed/hostile model output):** `compose/rpg.ts buildRunExtraction`
  returns an empty delta on non-JSON (`safeJson`→null) or schema-non-conforming output (`safeParse` fail) —
  a garbage/hostile extraction cannot corrupt canon. (The residual canon-corruption vector is F1, which is a
  *valid-arg-but-state-invalid* delta, not malformed output — the empty-delta guard does not cover it.)
- **`projectJsonSchema(rpgExtractionSchema)` round-trip:** the extraction schema derives field-for-field
  from the 7 tool arg schemas (`contracts/rpg/extraction.ts`), all projection-clean (top-level `z.object`,
  no `.transform()`/branded ids); the contract test pins projection. No dropped-plane gap found.
- **No-born-seed:** `createGame` writes no snapshot; `resolveHead`/`currentSnapshotState`/the tools/flush all
  fall back to `defaultSnapshotState()` byte-identically; `rpg_snapshots.messageId/variantId` stay non-nullable.
  Matches the D108-draft ruling and the spec erratum.
- **`MODE_POLICY` exhaustiveness + `createGame("full")` PHASE refusal:** both mode rows shipped as data;
  `createGame` throws `RpgModeUnbuiltError` for `"full"`, `DomainOperationError` for an unknown mode, before
  any authority reveal.
- **Journal lineage projection (`persistence/journal.ts listActiveJournal`):** `variantId IS NULL OR
  EXISTS(selected-variant match)` derive-don't-stamp join; CASCADE on variant delete; game-scoped. No
  cross-game leak.
- **Package-cake direction / injected-op seam:** rpg declares its cross-feature op TYPES in `contract/service.ts`
  and closes over them; runtime wired at `compose/rpg.ts` via the forward-ref delegate; no sideways
  domain→domain value import (the `#domain/rpg` front door re-exports type-only). `domain/rpg/bus.ts` is a
  domain-minted `EventEmitter` singleton (the buddy/user-bus precedent), not a transport `defineBusChannel`.
- **DB schema:** 6 tables, no `ownerId` anywhere (D23), enum CHECKs derive from contracts tuples, JSON
  columns `$type<>`d + parse-on-read; `rpg_snapshots.variantId` UNIQUE+CASCADE, `rpg_checkpoints.snapshotId`
  RESTRICT, `rpg_journal.variantId` CASCADE, sheet actor-XOR CHECK. Baseline was correctly squashed (no
  incremental `0001`; the `db-structure` BASELINE_RIDER for rpg was removed now that the producer domain
  exists — a coupled-site cleanup done right).
- **Gate coupling:** `rpg-bus-coverage` added (count 150→151 in the enforcement doc), all 5 members emit →
  moved to `UNFIXTURABLE_GATES`, `__g_rpgbus` fixture deleted, `check-gates.int` + cross-tenant-sweep +
  `services.test` SERVICE_KEYS + `invalidation.test` all updated in lockstep. `RPG_BUS_FILTERS` is a total
  mapped type over `RpgBusEvent["type"]` (the W2 `nothing`-returning forward-seam is honestly documented and
  tested). Emit sites verified present: `gameChanged` (create/updateConfig), `snapshotPatched` (flush +
  editSnapshot/quest verbs/restoreCheckpoint), `sheetChanged` (patchSheet), `questChanged` (upsert/delete
  quest), `journalChanged` (addJournal-family + staged flush).
- **`rollDice`/`dice.ts`:** server CSPRNG via injected `randomInt`, bake-once, no seed input, bounded
  notation (MAX_DICE/MAX_FACES) — no seed-replay, no unbounded loop.
- **Static battery:** `pnpm check` GREEN (`reports/verify.json ok:true`), read in full.

## UNCONFIRMED / LOW PRIORITY (not findings)

- `buildResolveTrackersReadOnly` + `buildRunExtraction` each call `hostUserIdOf` → a full
  `resolveRpgRoster` (with per-seat card + avatar reads) on EVERY tracker/game read and every turn — a
  possible N+ card-read cost per panel refresh. Perf only; not a correctness defect. (Noted; not verified as
  a real hotspot.)
- The `resolveActor` header comment (`apply.ts:37-42`) describes name/roster matching the code does not
  implement — a documentation-vs-code drift that is subsumed by F2; if F2 is fixed the comment should be
  reconciled.

## Regions NOT exhaustively read

- The full `chat/engine/engine.ts` turn lifecycle beyond the `onTurnCompleted`/`onTurnAborted` invocation
  sites (`:551,561,570`) — I confirmed the hook is `void ...catch(()=>undefined)` (relevant to F1's blast
  radius) but did not re-review the surrounding engine flow.
- The client `data/invalidation.ts` beyond the RPG map diff and its test.
- The CP-4 client takeover (W3) — explicitly out of this vertical's scope.
