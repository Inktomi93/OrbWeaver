# LITE + GUIDED SUBSTRATE — the fresh-build carve spec

> **Deliverable of the max-effort design pass commissioned 2026-07-26** (owner rulings that night, all
> final: no porting from legacy-main · scope = LITE + GUIDED only · the shared spine built so FULL MODE
> grafts later with ZERO re-spelling). **Owner amendment folded mid-pass (2026-07-26): lite DOES include
> quests and journal — as DATA PLANES, not engines** ("it's just structured output that gets generated
> and can help steer the plot"). Produced against the commissioned reading set (constitution ·
> Tier-1-DB · Spine-TS · `Context-Panel-Program.md` · the D86 cohesion game plan · the guided-parity
> stickler §5/§10 · the CURRENT tree's seams read in code · legacy-main as READ-ONLY semantics
> reference, cited per read). Every load-bearing tree claim below was verified against the working
> tree this session by direct reads/greps; legacy claims cite `git show legacy-main:<path>`.
> Status: **DESIGN — revised per the owner's ratification response, 2026-07-26.** House doc style:
> every non-obvious call carries its WHY + the rejected alternative.

## Change log — the ratification pass (owner response, 2026-07-26)

1. **VETOED: the narrative-ledger plane's rewind exemption.** Owner: "swipes would need to rewind
   properly — it would need to update the trackers and bars and context panel depending on what
   swipe we are on." EVERYTHING the context panel renders is swipe-consistent — quests and journal
   included. Redesign (§2.5): **quest state folds INTO the swipe-volatile snapshot plane** (a
   `quests` array on `rpg_snapshots` — small mutable state, clone-forward like inventory/cast);
   **journal becomes a VARIANT-AWARE table** (each model-written entry stamps its producing
   `variantId`, CASCADE; hand entries stamp NULL = every-lineage; reads project the selected-variant
   chain — the D46 derive-don't-stamp precedent). `rpg_quests` is DELETED from the build (7 tables
   → 6); §4.2/§4.4/§4.5/§6.2 and the graft map (§7) moved accordingly. The guides-vs-stats
   convergence line is intact: prose guides on ChatInjection keep their room semantics — the ruling
   governs the PANEL-RENDERED tracker planes (§3.3 note).
2. **Preset override is a KNOB with a default, never a hardcoded posture** (the knob-wire program's
   lesson applied at design time — "we just dealt with this same symptom"). `resolvePresetOverride`
   goes MODE-BLIND and DATA-DRIVEN: it returns `rpg_games.gmPresetId` (nullable) unconditionally;
   lite BORN-DEFAULTS it NULL (= augment the user's own preset — the D86 posture survives as the
   default, not as law), and the host may set/clear any owned preset through the one config write
   door, surfaced on the `rpg.game` editor. `MODE_POLICY.prompt` shrinks to the prompt-STRATEGY
   axis only. The full hardcoded-posture sweep landed as **§4.11** (knob-or-argue, each named);
   the `knob-wire-coverage` gate holds the new knob honest (§4.11 #1).
3. **CONFIRMED: wallet + inventory first-class as specced** ("inventory and wallet are first-class,
   assets and etc are first-class"). §2.6 unchanged; the wallet question is CLOSED.

## Change log — the delivery-model amendment (owner sign-off, 2026-07-26)

**COMMITTED (not yet built) — how the model writes state, resolved.** State extraction is a turn
SEPARATE from the character-narration turn (owner: "I always intended the tool turn to be separate
from the characters turn"), gated by a KNOB so a cost-sensitive host may trade reliability for one
call. This SUPERSEDES the tool-first framing of §3.2/§4.5 (state tools gather-contributed onto the
character turn) as the SOLE model — it becomes ONE of two modes.

1. **Two delivery modes, knob-gated — `config.extractionMode: "reliable" | "cheap"`** (additive
   JSON field, self-healing parse-seam lift, no version stamp; WIRED both ends from birth —
   `knob-wire-coverage`/D107, the §4.11 #1 discipline). **Default `"reliable"`.**
   - **reliable** — after the character(s) narrate, a DEDICATED extraction turn (structured output,
     `output_config.format`) reads the beat + resolved base state and emits the whole state delta in
     ONE object. No user-facing prose in that turn, so structured output is the natural fit — NOT the
     §4.6 prose-parser fork it would be if it shared the narration turn. State is PROVEN to land.
   - **cheap** — the §4.5 state tools ride the CHARACTER turn (the original tool-first model),
     best-effort, honestly labeled. One call; may miss updates on a non-parallel backend (the
     pain-points §5 sequential-tool reality — parallel tool-use is lost on the agent-sdk wire).
2. **Honest-arms axis is the RESOLVED mode's capability (amends §4.6).** cheap needs
   `capability.tools`; reliable needs `capability.output.structured` (separate axes —
   `contracts/connection`). When the resolved mode's writer capability is ABSENT: warn +
   **manual-steering** — the model gets NO write path, the host hand-edits every plane
   (editable-in-place, always on), and those hand values STILL steer via the gather injection (not
   inert). **NO silent mode-downgrade** — reliable never secretly becomes cheap; the knob is the
   host's deliberate lever. `trackersReadOnly` is `trackersManualOnly` in spirit; the CP §4.4 pill
   copy reframes to "manual steering — this model can't auto-update; edit the trackers by hand to
   steer."
3. **The extraction turn rides the EXISTING `onTurnCompleted` hook** — no new chat-side wiring beyond
   `setRpgPointer`. Character message commits → rpg's `onTurnCompleted` runs the reliable-mode
   extraction call (or, cheap-mode, flushes the staged tool writes) → stages the delta → flushes the
   clone-forward snapshot keyed to the committed variant → the next turn's gather injects the new
   state.
4. **Wave impact.** W1a (persistence/staging/locks) is INVARIANT — the accumulator stages→flushes
   once at commit regardless of mode/tools/parallel. W1b's gather branches on `extractionMode`,
   implements the reliable extraction op AND the cheap tool-attach path, and keys readonly on the
   resolved axis. W1c authors the 7 plane shapes ONCE, exposed two ways — as D48 tool args (cheap)
   AND as the extraction structured-output schema (reliable); the `z.toJSONSchema` / top-level
   `z.object` projection discipline (§4.5) covers both.

## Change log — the no-born-seed amendment (build-time, 2026-07-26 — ledger **D108**)

**SUPERSEDES the "seeds the BORN snapshot" language in §2.4 / §4.4 (`createGame` row) / §4.11 and the
"rung 4 is unreachable in practice" aside (§3.x resolution ladder).** As built, `createGame` stores NO
snapshot row — it mints only the game row + pointer. A read SYNTHESIZES the born-default (empty state,
`quests: []`, null clock) from config when the 4-rung ladder returns undefined, so **rung 4 is the
live born-default path, not a dead branch.** WHY: a born snapshot needs a `message`/`variant` FK, but a
turn-0 game has neither — a nullable FK to accommodate one snapshot would loosen the schema for every
row. No-born-seed keeps `rpg_snapshots.message/variant` NON-nullable with zero schema delta and zero
baseline regen; the synthesized default is byte-pinned by a no-drift identity test. Authority: **D108**
(the code + ledger win over this report on any conflict).

---

## 0. The carve on one screen

1. **The domain is `domain/rpg`, lite-first.** One game row per chat (`rpg_games`, real table), a
   `mode: "lite" | "full"` axis dispatched through ONE exhaustive `MODE_POLICY` record whose **full row
   exists as data from day one** — `createGame` mints only lite; the full arm is a typed PHASE refusal.
2. **The chat-side spine already exists — build NOTHING chat-side but one small op.** The purge kept
   every doorway wired: `ChatContext.rpg` (null-op `ChatRpgOps`: preset-override hop · gather · dice
   mark · user-commit · turn-completed/aborted flush hooks · seat-kind read — `domain/chat/contract/
   context.ts:399-431`), the gather merge + tool attach (`verbs/turn.ts:285-330`,
   `attachedToolNames: rpg?.tools ?? []`), the capability drop + `tools_unsupported` warning
   (`engine/pipeline.ts:423-442`), and compose's `rpgChatOps` (`getMembership` / `postNarratorMessage`
   / `getPendingUserText` — `entry/compose/chat.ts:890-894`). Lite IMPLEMENTS the domain side of these
   ops. The one chat-side add: a `setRpgPointer` op (§3.1).
3. **The line between lite and full is ENGINES vs DATA** (the amendment, sharpened): lite includes
   every steering DATA plane — sheets/attributes over a statProfile, pools-as-meters, wallet +
   inventory first-class on EVERY actor, scene cast + per-NPC fields, ambient
   (location/date/time/weather as data), custom widgets, **quests (objectives as data)**, **journal
   (the beats archive)** — all model-writable through the built D48 `domain/tool-use` registry and
   hand-editable in place. Lite excludes the MACHINERY: d20 checks, encounters, clocks mechanics,
   session wraps, maps, NPC entities, morale/perception/loot, the time/weather engine, the GM seat.
4. **No party system** (CP §3.1 owner ruling, global): the roster is the ONE membership. Legacy's
   `rpg_party` membership shadow is NOT rebuilt — sheets live in `rpg_sheets`, a pure per-actor DATA
   plane derived against the roster at read time (§4.3).
5. **The graft rule** (ruling 3, made structural): full-mode arrival ADDS siblings — 7 tables, a set
   of nullable columns, tool defs, policy flips, union arms, bus members — and renames, re-types,
   or migrates NOTHING lite shipped. Appendix C is the enumerated proof.

---

## 1. Verified tree facts this design stands on

Read with own eyes this session (paths current tree unless `legacy-main:` cited):

- **`ChatRpgOps` survived the purge whole** — `domain/chat/contract/context.ts:399-431`: seven ops
  (`resolvePresetOverride` · `gatherTurnContext(chatId, pendingUserText, respondsToLatestUserTurn)` ·
  `markDicePreRollEligible` · `onUserCommit` · `onTurnCompleted(chatId, messageId, variantId, turnId)` ·
  `onTurnAborted(chatId, turnId, reason)` · `resolveGmSeatHolderKind`), null-op when unwired
  (`entry/compose/chat.ts:186-188,787`). The engine already calls the flush hooks fire-and-forget
  (`engine/engine.ts:561,570`).
- **The turn pipeline consumes the gather result generically** — `verbs/turn.ts:285-330`: preset
  override as an early FOREIGN-inputs hop; `rpg.macros`/`rpg.injections` staged into assembly;
  `attachedToolNames: rpg?.tools ?? []`. `assembly/context.ts:301-303` carries the `rpgMacros` slot.
- **Tool attach + capability honesty are built** — `engine/pipeline.ts:420-442`: tools ride only when
  gather-contributed AND `capability.tools` declares support; unsupported drops tool-less + flags
  `tools_unsupported` (`engine.ts:1297`).
- **`domain/tool-use` is the D48 registry, live** — `contract/{params,results,service}.ts` +
  `verbs/register.ts`: `ToolDefinition{name, description, zod argsSchema, capability, handler}`,
  boot-fatal collision, JSON-Schema projection cached at registration, `ToolExecutionContext` threads
  `principal/triggeredBy/chatId/turnId/roster/signal` — `turnId` is EXPLICITLY documented as the rpg
  staging correlation key (`contract/params.ts:35-38`). Registration precedent: imagery at
  `entry/compose/imagery.ts:163-170` ("rpg registers its own tools later"); ONE registry instance
  minted in `entry/compose/admin.ts:116`.
- **`chats.metadata` has NO rpg pointer today** (`contracts/chat/metadata.ts` swept — zero hits);
  legacy's pointer contract is `legacy-main:packages/contracts/src/rpg/index.ts:2109-2116`
  (`chatRpgPointerSchema = { gameId }`, opaque, chat never dereferences, parser heals corrupt→absent,
  `setMode` never touches it).
- **`chat_injections` is prose-only persisted steering** (`db/schema/chat.ts:598-623`);
  `ChatInjection` wire = `{position, depth, role, content, order?}`
  (`contracts/chat/assemble.ts:84-97`). The rpg reminder is an EPHEMERAL gather candidate on this
  channel, never a row (stickler §5.1 invariant).
- **`message_variants` is the swipe key** (D26; `db/schema/chat.ts:269-343`) and `ChatTurnId` is a
  live EPHEMERAL kit brand (`kit/src/ids/index.ts:43-46`). No rpg ID prefixes exist in the current
  `ID_PREFIX` map — all rpg brands are fresh adds.
- **`resolveHostPrincipal` is already shared for "rpg's lite capability resolve"**
  (`entry/compose/services.ts:418-420` — the comment survived the purge).
- **The ledger's reserved range**: D79–D105 are reserved re-mints with ORIGINAL main-era meanings
  (`Core-Path-Registry.md:11`); D58/D59 survive in retro's ledger. New rulings mint at **D108+**.
- **Legacy semantics read as reference** (copied nothing): the 14-table schema
  (`legacy-main:packages/db/src/schema/rpg.ts`), the Option-A staging accumulator
  (`legacy-main:.../rpg/staging.ts` + `contract/staging.ts`), the 4-rung snapshot resolution ladder
  (`legacy-main:.../persistence/snapshots.ts:89-124`), `MODE_POLICY` as built
  (`legacy-main:.../contract/mode.ts`), the tool arg shapes (`legacy-main:.../contract/tools.ts`),
  the lite gather arm + `trackersReadOnly` derivation
  (`legacy-main:.../verbs/gather-turn-context.ts:186-216`), the #40 unified-actor model + derived
  wallet (`legacy-main:packages/contracts/src/rpg/index.ts:575-660`), the feature-root rpg bus +
  its coverage belts (`legacy-main:packages/contracts/src/rpg/index.ts:1118-1163`).

---

## 2. SECTION A — the shared spine, full-shaped from day one

### 2.1 The game row: a REAL table + the opaque sync pointer (the D86-vs-CP tension, resolved)

The CP spec's takeover trigger names `chats.metadata.rpg`; D86/D58 rule "campaign canon = real
tables, never a metadata blob." **These are not in tension — they name two different jobs, and the
legacy division of labor is correct; adopt it:**

- **`rpg_games` is the TRUTH** — one row per chat (`chatId` UNIQUE, CASCADE), holding mode/config/
  state. Game-ness resolves server-side by this row, always.
- **`chats.metadata.rpg = { gameId }` is an OPAQUE SYNC SIGNAL** — written ONCE by `createGame`
  through an injected chat op; chat stores it blind (the `databankVisibility`/theme-`background`
  foreign-schema precedent), the metadata parser heals a corrupt blob to absent, and `ChatDetail`
  projects it so the client's takeover gate is a SYNC read off data it already holds. The pointer
  carries **no `mode`** — mode's one home is the game row (`setMode`, when full grafts it, must never
  chase a second copy); the client reads mode from `rpg.getGame` after the pointer fires.
  *CP-doc amendment to record at ratification (§7): the §3.1 trigger table's "mode: lite/full"
  column resolves from the game view, not the pointer.*

*Rejected:* pointer-only (no table) — violates D86 §3.1's argued rejection (loses the FK plane
snapshots/widgets/quests hang off). Table-only (no pointer) — makes "is this chat a game" an async
per-chat query on every chat switch for every client; the pointer is one healed sub-blob read on a
fetch the client already makes. Mode on the pointer — two homes for one axis; drift is guaranteed
the day `setMode` lands.

### 2.2 `mode` + `MODE_POLICY` — the axis and its exhaustive record

- `rpg_games.mode` — `text` CHECK in `RPG_GAME_MODES = ["lite", "full"]`, notNull, **NO DB default**
  (verb-supplied always). *WHY no default:* legacy defaulted `'full'` (every pre-lite game was full);
  a fresh lite-first build defaulting either way plants a value some later wave must flip — a
  default flip IS a re-spell. Explicit-only is the zero-re-spell shape.
- `MODE_POLICY: Record<RpgGameMode, RpgModePolicy>` in `domain/rpg/contract/mode.ts` — mapped type,
  both rows data from day one, a new mode member fails tsc, a new axis fails tsc at every arm
  (§5.5 discipline; legacy shape adopted, axes amended):

```ts
export interface RpgModePolicy {
  readonly tools: readonly RpgToolName[];      // lite: the 7-tuple (§4.6); full: its superset (grafts as data)
  /** The prompt STRATEGY only — injection (steering block) vs gm-preset (8 macros + GM reminder).
   *  The PRESET override is deliberately NOT policy: it is the `gmPresetId` KNOB (§4.11 #1),
   *  mode-blind data with per-mode DEFAULTS (lite born-null = augment; full's create seeds a clone). */
  readonly prompt: "injection" | "gm-preset";
  // ── the ENGINE axes (the amendment's sharpened line — these gate MACHINERY, never data planes) ──
  readonly seat: boolean;        readonly sessions: boolean;   readonly scenes: boolean;
  readonly clocks: boolean;      readonly encounters: boolean; readonly maps: boolean;
  readonly morale: boolean;      readonly perception: boolean; readonly checks: boolean;
  readonly npcs: boolean;        readonly loot: boolean;       readonly timeWeather: boolean; // the ENGINE; ambient DATA is mode-blind
  // ── the DATA-plane axes (lite TRUE per the 2026-07-26 amendment) ──
  readonly quests: boolean;      readonly journal: boolean;
  readonly requireToolCapable: "hard" | "soft";                // full refuses non-tool models; lite degrades visibly
}
```

  lite = `{ tools: RPG_LITE_TOOL_NAMES, prompt: "injection", quests: true, journal: true,
  requireToolCapable: "soft", every engine axis false }`. full = all-true, `"gm-preset"`, `"hard"` —
  **present as data even though unmintable**: `createGame(mode: "full")` throws the typed
  `RpgModeUnbuiltError` (PHASE disable-with-reason — the honest-arms doctrine at the verb tier; the
  refusal names the graft, never pretends full doesn't exist). Verb guards read the record via ONE
  `requireModeCapability(game, axis)` — never `if (mode === …)` in verb bodies.

*WHY `quests`/`journal` stay POLICY AXES at all when both modes are true:* the axis is where full's
ENGINE halves key their guards later (GM notes, quest clocks, session-wrap journal types) — deleting
the axes now and re-adding them at graft is the exact re-spell the record exists to prevent; a
both-true axis today costs one `true` literal per row.

### 2.3 `statProfile` as data — the shape IS the compatibility promise

Adopt D86 §2.1's ratified schema essentially verbatim into `@orb/contracts/rpg`
(`rpgStatAttributeDefSchema` + `rpgStatProfileSchema`: attribute defs `{key, label, hint}` (≤12) ·
`range {min,max}` · `modifier {center, step}` · `skillGoverning` record · `defaultAttribute` ·
`perceptionAttribute` · the RESERVED single-arm `resolution: {kind:"house-d20"}` discriminant).
`RpgSheet.attributes` is `z.record(z.string(), z.number().int())` over the profile vocabulary.

**Lite never computes a modifier** — no lite code path reads `modifier`/`skillGoverning`/
`perceptionAttribute`/`resolution`. They ship anyway, populated and validated, because the SHAPE is
the graft contract: full's check engine consumes the profile as-is on arrival, zero re-shape.
Home: `config.statProfile` inside the games config blob (D86 §2.3's argued call — no separate
profile table until a cross-game library exists; the stickler §10 re-confirmed this precedent).
Mutability (D86 §2.3, one rule, no mode branch): adds always legal (sheet reads treat a missing key
as absent — lite renders nothing; full backfills at `center` when ITS seeding lands); removes/renames
require zero references; `range`/`modifier` host-editable. Enforced in `updateConfig` + a matrix test.

**Packaged profiles: ship all three** (`freeform` — lite's create default · `d20` · `special`) as
contract data constants. *WHY ship the two mechanical profiles lite can't exercise:* they are pure
vocabulary data (labels + hints + dials) that lite users genuinely want as attribute TEMPLATES
("give me the D&D six to color my chat"), they cost bytes, and shipping them makes the graft map's
profile row literally "full adds nothing." Authored FRESH from D86 §2.1's published table (the six /
S·P·E·C·I·A·L / bounds / `{center,step}` values — spec-stated, common-knowledge content), not copied
from legacy source. NO differential golden vs legacy constants is owed (that was L0's migration
proof; this is a fresh build with no old engine to stay byte-equal to).

### 2.4 The swipe-keyed volatile plane (snapshots · staging · locks)

The state model D86 §6 called the hardest-won machinery, specced fresh with legacy as the semantics
oracle:

- **`rpg_snapshots`** — one row per assistant `message_variants` row that carried game-state writes
  (UNIQUE `variantId`, CASCADE): the swipe-volatile state columns (§4.2 table). A swipe rewinds by
  construction: each variant's snapshot is its own truth; `selectVariant` needs zero rpg code.
- **The 4-rung resolution ladder** (semantics adopted from
  `legacy-main:.../persistence/snapshots.ts:89-124`): a turn's base = (1) regen/swipe → the target
  message's currently-selected sibling (≠ the new variant); (2) the last visible assistant slot's
  selected variant's snapshot; (3) latest committed by `createdAt`; (4) latest any; undefined only
  for a game with no snapshots (createGame seeds one — §4.4, so rung 4 is unreachable in practice).
- **The Option-A staging accumulator** — a compose-created in-memory singleton keyed by `ChatTurnId`
  (the engine mints the assistant variant only at COMMIT, so mid-turn tool writes have nothing to
  key a snapshot on; `tool-use/contract/params.ts:35-38` threads `turnId` for exactly this).
  Read-through (a later tool sees the earlier tool's staged state over the base), `take` at
  `onTurnCompleted` → write the clone-forward snapshot keyed to the committed variant (born
  `committed=0`; the NEXT user send's `onUserCommit` locks it in), `clear` at `onTurnAborted` so a
  dead turn never flushes into the next. Lite's staged surface: the snapshot state — which INCLUDES
  the quest array (§2.5, post-ratification) — plus **staged journal entries** (flushed with the
  committed variant's stamp). ASSUMES(single-replica), same as legacy — the turn's tools and its
  flush run in one process under the chat lock.
- **`applyLockedPatch` + edit-auto-lock** — manual-edit-wins: `fieldLocks` is a presence-key record
  (`Record<string, true>`); ONLY `editSnapshot` (the hand-edit verb) writes locks (auto-locking every
  field it touches); tools HONOR locks (the merge drops locked paths); locks carry forward on
  clone-forward. Merge semantics carry the [merge-clear] contract: `{}` = no-op, explicit `null` =
  leaf clear — with a transition test.

*Rejected (all re-argued, not inherited):* keying staging by bare `chatId` — a lock-free `generate`
runs concurrent with a locked `send` on one chat; two turns must not share a bucket (legacy's
hardening-a, still true in the current engine). Writing snapshots mid-turn against a provisional id —
the engine has no provisional variant id to give. Skipping the staging layer and flushing per-tool
straight to durable rows — an aborted turn's writes would be canon (the exact corruption class the
accumulator exists to kill).

### 2.5 The write-policy — THREE planes, one rule, no mode branch (REVISED at ratification)

> **Ratification veto applied here.** The draft's third plane ("room ledger — a swipe does NOT
> rewind it") is DEAD: the owner ruled that everything the context panel renders must be
> swipe-consistent, quests and journal included. The revised planes:

| Plane | Contents | Writers | Rewind |
|---|---|---|---|
| **IDENTITY** | `statProfile`, sheet attributes/`poolDefs`/`maxHp`/flavor, widget DEFINITIONS, game config (incl. the `gmPresetId` knob) | humans only (host everywhere; a member their own row) — **no tool ever** | n/a (config plane) |
| **SWIPE-VOLATILE** | snapshot state: ambient, cast + customFields, pools/hp values, conditions, inventory, **wallet**, widget VALUES, `recentEvents`, **quests + objectives** | model (tools, staged) + humans (`editSnapshot`-family, auto-lock) | per-swipe by construction (variant-keyed snapshot) |
| **VARIANT-AWARE ARCHIVE** | journal entries | model (`add_journal_entry`, staged → flushed stamped with the producing `variantId`) + humans (hand verbs, stamped NULL) | **lineage-projected**: an entry renders iff its producing variant is the SELECTED variant of its slot (NULL = every lineage); a swipe hides/reveals entries with zero writes |

**Quests fold into the snapshot** (a `quests: RpgQuest[]` array on `rpg_snapshots`, clone-forward
like inventory/cast). *WHY fold rather than a variant-aware quest table:* quest state is MUTABLE
(status flips, objective edits) — swipe-consistency for mutable state is exactly what the snapshot
plane already solves (resolution ladder, staging read-through, locks, clone-forward); a quest table
would need event-sourcing along the variant chain to reconstruct per-swipe state — a second,
heavier mechanism for a plane that is a handful of small objects per game. The copy cost is the
same order as `presentCharacters`/`inventory`, both already accepted. Quest identity across
variants: each quest object carries a minted stable `id`, so a hand edit or tool flip on any swipe
addresses the same quest; per-quest lock paths (`quests.<id>`) ride the existing `fieldLocks`
grammar.

**Journal is a variant-AWARE table** (append-only archive — unbounded, so snapshot-copying it every
turn is wrong at O(archive)). Mechanism: `rpg_journal.variantId` — model-written entries are staged
in the accumulator and flushed at `onTurnCompleted` stamped with the COMMITTED variant's id
(CASCADE: a deleted swipe deletes its entries); hand entries stamp NULL (the host's note is room
truth on every lineage). The READ projects the active lineage: an entry is visible iff
`variantId IS NULL` OR its variant is the selected variant of its message (one indexed join against
`messages.selectedVariantId` — the same derive-don't-stamp discipline D46 uses to fold
`variableDelta` along the selected-variant chain; no materialized visibility bit to drift). "Staged
to turn boundary" under this constraint means: commit births the entries already variant-keyed;
abort discards them unwritten — abort-atomicity AND swipe-consistency from one stamp.

*WHY this satisfies the ruling without infecting the guides line:* the panel now renders ONLY
swipe-consistent planes (snapshot state per selected variant; journal per lineage projection).
Prose guides (`chat_injections` rows) are NOT panel tracker planes — they keep their deliberate
room semantics per the guided-parity stickler §5.2; the convergence boundary (§3.3) is unchanged.
*Rejected:* keeping any panel plane room-keyed (the vetoed draft); snapshot-copying the journal
(O(archive) per turn); event-sourcing quests (second mechanism, no payoff at this cardinality);
a materialized `visible` flag maintained on swipe-select (a write-fanout on every swipe plus a
drift surface — the projection is derivable, so derive it).

**No `update_stats`/`update_sheet` tool exists in either mode, ever** (D86 §4.5 verbatim — closes
"the model set my STR to 3").

### 2.6 Wallet + inventory — first-class on EVERY actor, stored (the Q6 answer, made schema)

The surviving owner ruling (2026-07-20): characters AND NPCs get wallet + inventory as first-class
entity properties, present in lite. The actor volatile schema (fresh):

```ts
export const rpgActorRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("character"), characterId: characterIdSchema }),
  z.object({ kind: z.literal("user"), userId: userIdSchema }),
  z.object({ kind: z.literal("cast"), castKey: z.string().min(1) }),   // full ADDS {kind:"npc"} (§C)
]);
export function actorRefKey(ref: RpgActorRef): string; // the ONE string projection — Map/lock/find key

export const rpgActorVolatileSchema = z.object({
  actorRef: rpgActorRefSchema,
  hp: z.object({ value: z.number().int(), max: z.number().int().min(1) }).nullable(), // born nullable — D86 §8
  pools: z.array(z.object({ name: z.string(), value: z.number().int(), max: z.number().int().min(1) })).default([]),
  conditions: z.array(z.object({
    name: z.string(),
    stat: z.enum(["attack", "defense", "speed", "hp"]).nullable(),  // full-engine slot, born
    modifier: z.number().int(), turnsLeft: z.number().int().min(1).nullable(),
  })).default([]),
  inventory: z.array(rpgInventoryItemSchema).default([]),           // {id, name, description, quantity, location, type}
  wallet: z.array(z.object({ name: z.string().min(1), amount: z.number().int() })).default([]), // STORED, named, multi-currency
  status: z.string().default(""),
});
```

**`wallet` is a STORED named-amount array, not legacy's derived currency-item total.** *WHY the
divergence from the #40 reference:* legacy derived the wallet from `type:"currency"` inventory
stacks because full's LOOT ENGINE was the currency producer. Lite has no loot engine — nothing
would ever mint a currency-typed item, so the derived wallet is a permanently-empty dead doorway;
a stored slot the model (`update_inventory.walletDeltas`) and the hand editor write is the honest
lite-first shape, matches CP §6 Q6's recorded lean (a) verbatim ("named + amount,
`update_inventory` writes it"), and full's loot engine later CREDITS the same slots at grant time —
an engine graft onto an existing column, zero re-spell. The `type` taxonomy on inventory items
ships anyway (display + full's equip/filter future), minus any wallet coupling. Swipe-rewind holds:
wallet rides the volatile plane like everything else (the bake-once posture — a granted amount is a
stamped fact on the variant's snapshot).

**Actor-ref arms:** `character`/`user` address roster identities directly (no membership shadow —
§4.3); `cast` addresses scene-only NPCs by their stable `key` (normalized name, minted at first
upsert; a rename is a new actor — hand-edit merges; accepted simplification, recorded). Full ADDS
the `npc` arm when `rpg_npcs` lands — an additive union member every `assertNever` consumer is
compile-forced to handle (the D86 `resolution`-discriminant growth pattern). *Rejected:* shipping
the `npc` arm now — it would mint a dead `RpgNpcId` brand FK-ing a nonexistent table; an additive
arm later is cheaper than a dormant arm's suppression surface now.

### 2.7 Ambient is DATA with the engine's storage shape (born nullable)

CP §3.2: location · date · time-of-day · weather are MODE-AGNOSTIC DATA in lite v1; the full
time/weather ENGINE later WRITES the same fields. To make that literally true:

- `rpg_snapshots.clock` — JSON `{day ≥ 1, hour 0-23, minute 0-59}` (the engine's shape, adopted),
  **NULLABLE, born null**. Lite writes it through a LABEL vocabulary: `update_scene.timeOfDay`
  (`["dawn","morning","afternoon","evening","night","midnight"]`) maps to a representative hour via
  ONE contracts-homed mapping (`TIME_OF_DAY_HOURS`), `day` passes through; the banner derives the
  label back from the hour via the same one home. *WHY nullable when legacy was notNull-with-seed:*
  a born "day 1 · morning" on a vampire chat that never set time is a phantom fact one banner-render
  from steering the story wrong — the exact D86 §8 nullable-honesty argument for `hp`; null = "no
  ambient time set", and the CP banner already specs the shrink-to-orbs behavior for it. Full's
  `startGame` seeds it (the full-mode seeding invariant, same pattern as `maxHp`).
- `rpg_snapshots.weather` — JSON, **`type` required, everything else optional**:
  `{type: string, temperatureC?, description?, wind?, visibility?}`. Lite writes `{type: "rain"}`;
  full's engine fills the optional fields on the SAME shape. *Rejected:* legacy's all-required
  struct (forces lite to fabricate temperatures) and a bare string (full would re-type the column —
  a re-spell).
- `location: text` + `calendarDate: text nullable` — adopted as-is.

---

## 3. SECTION A½ — the chat seam contract (what lite implements, what it adds)

### 3.1 The ONE chat-side addition: `setRpgPointer`

`rpgChatOps` (already surfaced by compose) gains a fourth op: `setRpgPointer(chatId, { gameId })` —
a chat-domain verb that merges the healed `metadata.rpg` sub-blob (schema owned by
`@orb/contracts/rpg`, the foreign-schema precedent). Called exactly once, by `createGame`, inside
the same logical commit as the game row. Chat never reads it beyond projecting it onto `ChatDetail`.
Coupled sites: `chatMetadataSchema` gains the healed sub-blob arm · the domain metadata parser ·
the `ChatDetail` projection · the op on `ChatComposeResult.rpgChatOps` (§6.3 lists all).

### 3.2 The `ChatRpgOps` implementation matrix (lite arms, graft arms named)

| Op (contract, already wired) | Lite implementation | Full graft |
|---|---|---|
| `resolvePresetOverride` | **KNOB-DRIVEN, MODE-BLIND** (ratification #2): returns `game.gmPresetId` unconditionally — lite's born default is NULL (the user's own preset runs untouched, the D86 posture as DEFAULT), a host-set preset overrides from the next turn | the same code path, untouched — full's `createGame` merely SEEDS the knob (the GM-preset clone) |
| `gatherTurnContext` | the lite gather (§4.7): state block → ONE depth-0 injection + the 7-tool subset + `macros: {}` | ADDS the gm-preset arm (8 macros, GM reminder) behind the same dispatch |
| `markDicePreRollEligible` | no-op (lite has no checks to feed a die into) | the staging store's eligibility set |
| `onUserCommit` | commit the pending snapshot (`committed=0 → 1`) | + dice-queue consume |
| `onTurnCompleted` | staging `take` → flush: clone-forward snapshot on the committed variant (quests ride INSIDE it, §2.5) + journal entries stamped `{variantId: the committed variant, sourceMessageId: the committed message}` + bus emits | + encounter/clock flush arms |
| `onTurnAborted` | staging `clear` (nothing durable happened) | same |
| `resolveGmSeatHolderKind` | `null` always (no seat in lite; `gmUserId` is always NULL) | the seat resolve |

*WHY the op bodies are already final rather than lite short-circuits:* `resolvePresetOverride`
reads the knob column (data-driven — full changes only what SEEDS the knob), and the gather's
prompt-strategy dispatch reads `MODE_POLICY` — in both, writing a lite-only short-circuit today
(`return null`) and rewriting it at graft would be a re-spell of the op body; reading the
data/policy costs the same lines and makes the graft a seed/flip, never an edit.

### 3.3 The guided/steering boundary (the convergence law, applied — nothing to build)

Per the stickler's ratified convergence law (§5): ALL prose steering rides the ONE ChatInjection
channel; STRUCTURED state does not falsely unify with it. Consequences for this build:

- The lite steering injection is an **ephemeral gather candidate** on `RpgGatherResult.injections`
  (already merged at `turn.ts:318`) — never a `chat_injections` row, never a new channel.
- **The Trackers tab needs NO injection-classification machinery from this build.** Its non-game
  data source is the parked D59 crew-guides wave (prose arm); its game-chat form is the takeover
  (which OMITS the tab, CP §3.1). Lite ships zero tracker-class `chat_injections` rows to classify.
- Write paths stay unshared by law: structured state → D48 tools in-turn (this spec); prose guides →
  side generation (D59, parked). The steering-prose kit lift (license line as a shared home) stays
  gated on its recorded trigger — a SECOND consumer (crew guides rebuild) — per the stickler §10;
  until then the license prose lives in `domain/rpg/substrate/reminder.ts` as versioned constants.
- Persona machinery: untouched (owner-sacred; nothing in this spec reads or writes persona state).

---

## 4. SECTION B — lite v1's exact build list

### 4.1 Contracts (`@orb/contracts/rpg` — new package dir) + kit ids

- Tuples (each `as const`, union derived, CHECK-derived in db): `RPG_GAME_MODES = ["lite","full"]` ·
  `RPG_GAME_STATUSES = ["setup","ready","active","concluded"]` (lite mints `"active"`; the others
  are full's wizard states, shipped as vocabulary) · `RPG_QUEST_STATUSES = ["active","completed",
  "failed"]` · `RPG_JOURNAL_TYPES = ["location","npc","combat","quest","item","event","note"]`
  (vocabulary whole; lite's model writes any of them — they are labels, not engines) ·
  `RPG_CHECKPOINT_TRIGGERS = ["manual"]` (full ADDS the session/combat arms — additive tuple
  members) · `RPG_WIDGET_TYPES` / `RPG_WIDGET_POSITIONS` (adopt legacy vocabulary whole — display
  metadata) · `TIME_OF_DAY` + `TIME_OF_DAY_HOURS` (§2.7).
- Schemas: `rpgStatProfileSchema` + packaged profiles (§2.3) · `rpgSheetSchema` (§4.3) ·
  `rpgActorRefSchema`/`actorRefKey`/`rpgActorVolatileSchema` (§2.6) · `rpgInventoryItemSchema` ·
  `rpgPresentCharacterSchema` (`{key, name, characterId?, emoji, mood, appearance?, outfit?,
  thoughts?, customFields: Record<string,string>}` — the `npcId` linkage grafts as an additive
  optional field) · `rpgClockTimeSchema`/`rpgWeatherSchema` (§2.7) · `rpgQuestSchema` — the
  SNAPSHOT-RESIDENT quest object (`{id, name, status ∈ RPG_QUEST_STATUSES, description,
  objectives: [{id, text, completed}]}`, §2.5) + `rpgQuestObjectiveSchema` ·
  `rpgWidgetBindingSchema` (`source:"custom"` arm with `subjectName`
  nullable — D86 §8 #6; the `pool`/`hp` binding arms ship too: they bind to lite-live planes) ·
  `rpgGameConfigSchema = { statProfile, lite: { steeringNote: z.string().max(500).default("") } }`
  (full's dials graft as additive defaulted fields; JSON-column additive lifts self-heal at the
  parse seam — no version stamp needed, unlike `user_settings`) · `chatRpgPointerSchema` ·
  `RpgBusEvent` + `RPG_BUS_EVENT_TYPES` (§4.9) · the view projections (§4.8).
- `@orb/kit/ids` `ID_PREFIX` adds: `rpgGame`, `rpgSnapshot`, `rpgSheet`, `rpgWidget`,
  `rpgJournal`, `rpgCheckpoint` (+ brands). Quest ids are PLAIN strings minted inside the snapshot
  blob (no table, no FK — a TypeID brand buys nothing there; the objective-id precedent). Full ADDS
  its own prefixes (npc/clock/map/session/encounter/scene/pendingCheck) at graft.

### 4.2 DB (`@orb/db/schema/rpg.ts` — producer: domain/rpg) — 6 tables, one baseline regen

All D23-CLEAN: **no `ownerId` anywhere** — authority derives `rpg_games.chatId →
chat_participants` (D18/D20); every enum column derives its contracts tuple with a tuple-built
CHECK; every JSON column `$type<>`d and parse-on-read.

| Table | Columns (lite v1) | Notes |
|---|---|---|
| `rpg_games` | id · chatId (UNIQ, CASCADE) · mode (CHECK, notNull, no default) · status (CHECK, notNull, no default) · sessionNumber (int, notNull, default 1) · **gmUserId (nullable, SET NULL)** · **gmPresetId (nullable, SET NULL)** · config JSON notNull · createdAt/updatedAt | `gmUserId` is a born-whole SPINE slot: lite's own invariants read it (`gmUserId IS NULL` = seatless — the legacy `requireGmSeat` transparency full's tool gates will reuse). `gmPresetId` is a LIVE lite KNOB (§4.11 #1 — the preset-override storage, born NULL = augment; full's create later SEEDS it). Engine-state columns (morale/activeState/lootTable/activeMapId/world+story text/illustration counters) graft as ADD COLUMNs with their engines (§C) |
| `rpg_snapshots` | id · gameId (CASCADE) · messageId (CASCADE) · variantId (CASCADE, **UNIQUE**) · clock JSON **nullable** · calendarDate nullable · location text notNull default "" · weather JSON nullable · presentCharacters JSON · recentEvents JSON · actorState JSON · widgetValues JSON · **quests JSON default []** (§2.5 — the swipe-consistent quest plane) · fieldLocks JSON nullable · committed int notNull default 0 · createdAt | the FULL volatile plane, born whole — full grafts ZERO columns here |
| `rpg_sheets` | id · gameId (CASCADE) · characterId (nullable, CASCADE) · userId (nullable, CASCADE) · sheet JSON notNull · createdAt/updatedAt · CHECK actor XOR · UNIQ (gameId, characterId) · UNIQ (gameId, userId) | **replaces legacy `rpg_party` — deliberately** (§4.3). Full grafts `arc` as ADD COLUMN with session wraps |
| `rpg_hud_widgets` | id · gameId (CASCADE) · type (CHECK) · label · icon nullable · position (CHECK) · accent nullable · sort int default 0 · binding JSON notNull · createdAt | legacy shape adopted whole |
| `rpg_journal` | id · gameId (CASCADE) · type (CHECK) · title · content · **variantId (nullable, CASCADE → message_variants)** — NULL = hand/room entry, every lineage; non-null = model entry, rendered only while its variant is the slot's selected variant (§2.5) · sourceMessageId (nullable, SET NULL) · createdAt · index (gameId, variantId) | the VARIANT-AWARE archive (ratification #1). CASCADE on variant delete is deliberate: an entry whose swipe died is unreachable forever — keeping it is a leak, not history |
| `rpg_checkpoints` | id · gameId (CASCADE) · snapshotId (**RESTRICT**) · label · trigger (CHECK) · createdAt | RESTRICT adopted: "restore broken because the snapshot vanished" must be a constraint error |

Coupled: `schema/index.ts` barrel re-export + the `db-structure` gate's producer mapping row + ONE
`0000_baseline` regen (the established pre-launch squash; never regenerate while lanes hold
uncommitted work) + fixture/`seed:demo` updates + the referential-integrity fixtures.

### 4.3 `rpg_sheets`, not `rpg_party` — the no-party-system ruling made schema

The CP §3.1 owner ruling ("there is NO party system — the roster is the ONE membership; no
game-side membership shadow") is GLOBAL, post-dating legacy's design. Consequences, taken all the
way down:

- The table stores per-actor IDENTITY DATA (the sheet), keyed by durable actor identity
  (characterId XOR userId), NOT membership: **no join/leave verbs, no provenance, no
  joined/left-session horizon columns** (those were membership semantics — the roster owns
  arrival/departure; chat's own horizon machinery covers visibility).
- **Read verbs project roster ∪ sheets**: every current roster participant appears in the Status/
  Sheet views; a participant without a row renders the DEFAULT sheet (derive-don't-stamp); the row
  is created on FIRST WRITE (a hand edit or `patchSheet`). Zero roster-sync machinery, zero
  drift — the roster change needs no rpg listener. A sheet row whose actor LEFT the roster is
  retained but not projected (their data survives a re-invite; the [stamped-id write-boundary]
  posture: presence gates the WRITE, the read derives).
- Full-mode encounters/checks later read the same projection (roster-as-cast + sheets) — the graft
  adds engines, not a membership plane. If full ever needs "active adventurers ⊂ roster", that is a
  FLAG on the projection (an ADD), never a membership table.

*Rejected:* rebuilding `rpg_party` as legacy shaped it — it IS the game-side membership shadow the
ruling scrapped, and its `joinedSession` horizon is meaningless without sessions anyway. Also
rejected: sheets as a JSON map on `rpg_games.config` — per-actor rows want per-row UNIQUE + FK
CASCADE on character/user delete (a config blob silently retains deleted-identity data).

### 4.4 Verbs (`domain/rpg`, 8-slot template) — the lite service surface

Authority: every verb resolves membership through the injected `chat.getMembership`
(`rpgChatOps` — never a chat table read); host-gated verbs check the roster host; the
editable-in-place law binds: **host everywhere; a member their own row** (their own user-sheet, and
their own actor's volatile fields via `editSnapshot`'s member arm); shared planes (cast, ambient,
widgets, quests, journal, checkpoints) are host-write. Reads are member-gated. All game reads serve
RESOLVED-CURRENT state (the ladder head + durable rows) — no snapshot-history walk exists in v1, so
no D106 floor surface opens (checkpoint labels are room-activity metadata).

| Verb | Gate | Notes |
|---|---|---|
| `createGame(chatId, mode)` | host | mode ∈ tuple; `"full"` → `RpgModeUnbuiltError` (PHASE). Mints the game row (status `"active"`, `gmPresetId` NULL — the knob's lite default, §4.11 #1; config prefault: `freeform` profile or a caller-picked packaged/imported profile), seeds the BORN snapshot (committed=1, empty state, `quests: []`, null clock — rung-3 base for turn 1), calls `setRpgPointer`. Soft capability arm: succeeds on a non-tool connection; the create RESULT carries `trackersReadOnly` so the client says so at birth (D86 §4.2) |
| `updateConfig(chatId, { patch?, gmPresetId? })` | host | the ONE config write door: profile mutability matrix (§2.3) + `lite.steeringNote` + **the `gmPresetId` KNOB** (§4.11 #1 — set = validated owned/alive preset; explicit null = clear back to augment); typed errors |
| `patchSheet(chatId, actorRef, patch)` | host any; member their OWN `user` ref | MA-4 patch semantics (every field optional, NO defaults — omit = keep); attribute keys validated ∈ profile vocabulary + range |
| `editSnapshot(chatId, patch, opts)` | host any field; member their own actor's volatile | the hand-edit door: writes volatile state on the CURRENT resolved snapshot (clone-forward if the head is committed), auto-locks touched fields; the [merge-clear] `{}`/null contract |
| `createWidget` / `updateWidget` / `deleteWidget` | host | defs are identity-plane |
| `upsertQuest(chatId, …)` / `deleteQuest` | host | the hand arm of the quest plane — SNAPSHOT-PLANE ops post-ratification (§2.5): they write the `quests` array on the current resolved snapshot via the same clone-forward + `fieldLocks` machinery as `editSnapshot` (per-quest lock path `quests.<id>`), so a hand edit is swipe-consistent and survives the model exactly like every other tracker edit |
| `addJournalEntry` / `editJournalEntry` / `deleteJournalEntry` | host | the hand arm of the journal — hand entries stamp `variantId: NULL` (every-lineage room notes, §2.5); edit/delete address model entries too (the recovery path the lineage projection makes safe) |
| `createCheckpoint(chatId, label)` / `restoreCheckpoint(id)` / `listCheckpoints` | host / host / member | restore = clone the checkpointed snapshot forward as a new committed head |
| `rollDice(chatId, notation)` | member | server CSPRNG, **bake-once**: rolled once, result returned + stamped into the composer text the client inserts (`[dice: …]`); seed-replay rejected (security ruling). Zero state |
| reads: `getGame` · `getTrackerView` · `listJournal(paged)` · `getConfigView` | member · member · member · **host** | §4.8 |

Reserved names, NOT shipped v1 (graft adds them; recorded so full siblings instead of renaming):
`setMode` (graduation, host, both directions with D86 §3.4 guards) · `startGame`/wizard verbs ·
seat/encounter/clock/map/session/npc verb families.

### 4.5 Tool defs — 7 tools, names full will keep

Registered at `entry/compose` into the ONE `toolUse` registry (the imagery precedent,
`compose/imagery.ts:163-170`); handlers close over the rpg service; `capability: null` (member
floor — the turn runs as the host principal; the owning verbs re-gate); args PROJECTION-CLEAN (no
`.transform()`/branded ids — [tool-schema-no-branded-transform]; every entity reference is a
NAME/label the server alias-resolves); top-level `z.object` always. `MODE_POLICY.lite.tools` is the
7-tuple; the gather withholds the whole set on a read-only turn.

| Tool | Args (schema sketch) | Writes |
|---|---|---|
| `update_party` | `{ targetRef, poolDeltas?: [{name, delta}], addCondition?, removeCondition?, hpDelta?, status? }` — `targetRef` resolves party-side actors AND cast keys (the wallet/inventory-on-every-actor ruling); `hpDelta` on a null-hp actor → `ok:false` legality result (the errors-as-data lane) | staged volatile |
| `update_inventory` | `{ targetRef, add?: [{name, description?, quantity?, location?}], remove?: [{name, quantity?}], walletDeltas?: [{name, delta}] }` | staged volatile (incl. wallet) |
| `update_scene` | `{ location?, calendarDate?, day?, timeOfDay?, weather?, presentUpsert?: [{name, emoji?, mood?, appearance?, outfit?, thoughts?, customFields?: [{name, value}]}], presentRemove?: [name], recentEvent? }` — ambient fields per §2.7; `customFields` array-of-pairs (D79 `additionalProperties:false` regime); presentUpsert is a PATCH (MA-4: omit = keep, null = clear) | staged volatile |
| `set_widget_value` | `{ widgetRef, value?, max?, items? }` | staged volatile (widgetValues) |
| `upsert_quest` | `{ name, action: "create"\|"update"\|"complete"\|"fail", description?, objectives?: [text] }` | **staged volatile** (post-ratification: quests live IN the snapshot state, §2.5 — creates, describes, and status flips all ride the one staged-state overlay with read-through; abort discards, commit clone-forwards, swipe rewinds). The legacy immediate-vs-staged split is DEAD — one mechanism now covers it |
| `add_journal_entry` | `{ type, title, content }` | **STAGED** → flushed at commit stamped `{variantId, sourceMessageId}` (§2.5) — abort-atomic, lineage-keyed, `sourceMessageId` for free |
| `roll_dice` | `{ notation, reason? }` | none (bake-once; the ToolCallRecord on the variant IS the canon stamp) |

*WHY keep the ratified names* (`update_party` even though it now reaches cast actors): the five
core names are D86/CP vocabulary the owner ratified; renaming re-litigates for zero capability. The
widened `targetRef` is documented in the def's model-facing description. Full SIBLINGS its tools
(`skill_check`, `request_check`, `advance_time`, `tick_clock`, `upsert_npc`, encounter/loot/map
tools…) — same registry, additive registrations, zero renames (§C).

### 4.6 The honest-arms derivation (non-tool models)

Derived PER-TURN in the gather, never stored (D86 §4.2 semantics, legacy derivation adopted from
`gather-turn-context.ts:192-207`): resolve the host's chat-role connection capability
(`resolveHostPrincipal` + the connection resolve — the seam `compose/services.ts:418` already names
for exactly this); `trackersReadOnly = capability?.tools === undefined`. Consequences: the tool
subset is `[]` (nothing attaches, so the pipeline's `tools_unsupported` warning never fires — the
degrade is DESIGNED, not an error), the steering injection omits every update-guidance line (the
model is never asked to write what it can't), and `RpgTrackerView.trackersReadOnly` badges the
client (CP §4.4's read-only pill). When the connection later resolves tool-capable, the same game
silently gains the write-back. Never a silent degrade, never a prose-parser fork; the Tier-3b
polyfill remains the sanctioned model-agnostic path (stickler §5.3).

### 4.7 The steering injection (the whole point, unchanged in spirit from D86 §4.4)

`buildLiteReminder(input) → string`, `domain/rpg/substrate/reminder.ts`, assembled from the same
rows the tracker view reads; delivered as ONE depth-0 `role:"system"` `ChatInjection` on
`RpgGatherResult.injections`:

1. **The state block**, per ENTITY (label-as-mini-prompt throughout —
   `Corruption (0–100, how morally compromised): 70`): each roster actor (name, className flavor,
   attributes with hints, pools value/max with hints, wallet, inventory summary, status), each cast
   row (name, mood, customFields), each custom widget (label — subjectName?: value/max, hint),
   ambient line (location · date · time · weather), **active quests (name + open objectives)** and
   **the last few journal beats** (the amendment's planes steer, not just render).
2. **The steering license** (versioned constant; the marinara-derived line: values visibly shape
   behavior/dialogue/scene; acknowledge changes; never recite the numbers).
3. **Update guidance** — tool-capable turns only: which tool maintains which plane.
4. **`config.lite.steeringNote`** — the always-wins user slot, last.

Preset behavior (ratification #2): **augment-by-default, override-by-knob.** A lite game is BORN
with `gmPresetId` NULL, so by default lite colors the user's OWN chat — their preset, their
character, their voice (D86 §4.4's argued rejection of a FORCED packaged preset and of macro slots
both stand, re-affirmed by the stickler §10 — but as the DEFAULT, not a hardcoded posture). A host
who wants a dedicated game voice sets any owned preset on the knob (§4.11 #1) and
`resolvePresetOverride` carries it from the next turn; the steering injection rides either way
(the injection is the STRATEGY, the preset is the VOICE — orthogonal axes, deliberately).

### 4.8 Read views (what the CP client consumes — data contract only; the CP spec owns components)

- `getGame` → `{ id, chatId, mode, status, trackersReadOnly, publicConfig }` — the takeover's mode
  read (pointer fires the takeover; THIS carries the lite/full trim decision, §2.1).
- `getTrackerView` (member) → the aggregate the takeover tabs + banner/orbs render in one query:
  `{ ambient: {location, calendarDate, clock, weather} | null,`
  `  actors: [{ actorRef, name, avatar?, sheet: {className, attributes, poolDefs, maxHp},`
  `             volatile: RpgActorVolatile | null }],   // roster ∪ sheets projection (§4.3)`
  `  cast: RpgPresentCharacter[], widgets: [{def, value}], quests: RpgQuestView[],`
  `  recentBeats: string[], trackersReadOnly, poolOrbs: [{label, value, max}] /* first-3 derivation, server-side */ }`
  (`quests` now serves from the RESOLVED SNAPSHOT's array, §2.5 — the panel is swipe-consistent by
  construction: every tab reads the same resolved-current snapshot, so a swipe re-resolves
  everything at once, exactly the owner's ratification demand.)
  Tab mapping: Status = actors (meters/conditions) · Sheet = the viewer's actor · Inventory =
  per-actor inventory + the PINNED wallet line (real from v1 — Q6 closed, owner-CONFIRMED) · Scene =
  ambient + cast + widgets + beats window · **Quests = the snapshot quest array (goal lines, `n/m`
  from objectives)** · **Journal = `listJournal`** (separate, paged, LINEAGE-FILTERED — §2.5's
  projection: `variantId IS NULL OR variant = its slot's selectedVariantId`; a swipe changes the
  page's contents with zero writes).
- `getConfigView` (HOST-gated) → the Stats & Trackers editor surface: full `statProfile`,
  `steeringNote` (never on a member view — the legacy host-read discipline).
- Type-level projection discipline: no hidden columns exist in lite (empty ring), but the view
  types are minted NOW as the mode-discriminated homes full's GM arms extend (`RpgGameView` member
  arm today; `RpgGmView` grafts as a sibling arm — never widening the member type).

### 4.9 Bus + invalidation

A **feature-root rpg bus** (the legacy pattern: contract event type + per-chat replay-ring runtime +
a `rpg.stream` tRPC subscription), NOT new chat-bus members. *WHY:* the chat bus vocabulary is
frozen-ish public surface with a 5-site coupling cost per member and D19/D50 allowlist constraints;
game events are feature-scoped, and the feature bus is the D70 event-spine tier for exactly this
(live-only, self-healing, invalidation-grade — queries re-fetch; nothing durable rides it). Lite v1
members, minimal: `gameChanged` · `snapshotPatched` · `sheetChanged` · `questChanged` ·
`journalChanged` (full ADDS its members additively). Coupled sites minted WITH the bus (the D72
machine-ships-with-its-seal rule): the `RPG_BUS_EVENT_TYPES` satisfies-belt · a producer-coverage
gate arm (every member has an emit site or a cited DEFERRED row) · the client `defineBusChannel`
definition with the exhaustive `EVENT_INVALIDATIONS` mapped Record (total over the union — a new
member fails client tsc until it names its reads). No `hostOnly` machinery in v1 (lite has no
hidden ring); the emit-options seam ships so full's GM-eyes filter is an additive option, not a
signature change.

**Swipe invalidation rides the CHAT bus, not a new rpg event** (ratification #1 consequence): a
swipe emits chat's existing `variantSelected`; the client's tracker/journal queries list it in
their invalidation keys alongside the rpg events — the server writes NOTHING on swipe-select (the
snapshot plane and the lineage projection are both derived from the selected-variant pointer), so
there is nothing for the rpg bus to announce. One pointer flip, one refetch, the whole panel
re-resolves consistently.

### 4.10 Compose wiring (`entry/compose/rpg.ts`, new block)

Builds `RpgContext` `{ db-scoped persistence, chat: chatCompose.rpgChatOps (+ setRpgPointer),
emitBus, staging, resolveCapability (via resolveHostPrincipal + connection), clock, id mints }` →
`createRpgService` → returns the service AND the `ChatContext.rpg` ops object handed to
`buildChatService({ rpg: … })` (the `input.rpg ?? null` seam, `compose/chat.ts:186-188`); registers
the 7 tool defs into `toolUse`. Ordering note: chat compose currently runs before any rpg block —
the ops object is a forward-ref delegate over the rpg service (the crew-delegate precedent named in
`compose/chat.ts:189-191`), so no compose reordering is needed.

### 4.11 The hardcoded-posture sweep — knob-or-argue (ratification #2's ordered sweep)

> Every fixed behavior in this spec, named; each either becomes a knob NOW or carries its argued
> no-knob reason. The knob-wire program's lesson (D107): a declared knob is WIRED or CITED-DORMANT;
> a posture users will want to tune must not ship hardcoded.

1. **Preset override — KNOB (shipped v1).** Storage: `rpg_games.gmPresetId` (nullable FK, SET NULL
   on preset delete — referential integrity is why it is a COLUMN, not a config-blob field; a blob
   presetId dangles silently). Default: NULL in lite (= augment). Write door: `updateConfig`
   (§4.4); read end: `resolvePresetOverride` (§3.2). Surfaced on the `rpg.game` tab's lite editor
   ("Game preset — none = your chat preset"). BOTH ends ship in one wave, so the
   `knob-wire-coverage` gate sees a wired knob from birth — no registry row, no dead switch.
   Default-identity test owed: `gmPresetId` NULL ⇒ the turn is byte-identical to the no-override
   assembly (§6.2).
2. **`lite.steeringNote`** — already a knob (the always-wins user slot). Wired both ends v1
   (editor + reminder tail). No change.
3. **Steering-injection placement (depth-0, `role:"system"`)** — ARGUED NO-KNOB: PD-63's class
   ruling ("exactly ONE placement" for steering injections) governs; a depth/role dial invites
   prompt-order footguns the persisted-injections editor already serves for users who want manual
   placement control (author a `chat_injections` row instead). Revisit only with evidence.
4. **The steering LICENSE + state-block prose** — ARGUED NO-KNOB v1: `steeringNote` IS the designed
   tuning slot (composes after the license, always-wins — D86 §4.4 built the dial for exactly
   "lean harder / keep it subtle"). A full editable-template card (the imagery-templates /
   guided-actions ghost-default idiom, D107 ⑫) is the recorded ADDITIVE upgrade path if users
   outgrow the note — a design doorway, not tracked debt: the note is a real, shipped tuning
   surface, not a missing half.
5. **`trackersReadOnly`** — NOT a posture: derived per-turn from connection capability (§4.6).
   A knob here would let users silently break the loop; the honest-arms doctrine forbids it.
6. **TIME_OF_DAY→hour mapping, beats-window size, state-block entity caps** — ARGUED NO-KNOB:
   internal vocabulary + prompt-shape stability constants (domain constants, named in code); no
   user-tuning demand exists, and prompt-budget shape is an engineering concern, not preference.
   Any future demand lands them in `config.lite` additively.
7. **The create-time profile pick** — already user-chosen at the dialog (freeform default,
   packaged/import picks); not hardcoded.
8. **`roll_dice` availability** — MODE_POLICY data, host-visible via the tool list; a per-game
   tool toggle is a FULL-mode house-rules concern (legacy's `overworldToolNames` swap precedent)
   and grafts with it. ARGUED defer.

---

## 5. SECTION D — what lite does NOT build (gating class + doorway, per the CP assignments)

| Not built | Class | Doorway kept |
|---|---|---|
| Full mode itself (`createGame mode:"full"`, `setMode`) | **PHASE** — typed `RpgModeUnbuiltError` with the reason; the CP `rpg.game` tab's "Graduate to full" control renders PHASE-disabled | `MODE_POLICY.full` as data · `mode` column · the reserved verb names (§4.4) |
| GM seat / GM console / hidden ring | APPLICABILITY (mode shape) | `gmUserId` born nullable · `resolveGmSeatHolderKind` implemented-null · the seatless (`IS NULL`) invariant lite already obeys. (`gmPresetId` is NOT a dormant doorway — it is a LIVE lite knob, §4.11 #1) |
| d20 checks / DC spine / dice feed | APPLICABILITY | profile `modifier`/`skillGoverning`/`perceptionAttribute`/`resolution` fields shipped + validated (§2.3) · `markDicePreRollEligible` no-op arm |
| Encounters, clocks mechanics, maps, sessions/wraps, NPC entities, morale, perception, loot engine, scenes fork/merge | APPLICABILITY | policy axes as data · the graft map (§C) — tables/tools/arms enumerated, nothing renamed |
| Time/weather ENGINE | APPLICABILITY | the ambient DATA columns are the engine's own storage shape (§2.7) — the engine grafts as a writer, not a schema change |
| Map tab | **PHASE** (full+MA-3, per CP §4.3 — disabled-with-reason in the client) | n/a server-side |
| Preview / Game tabs | **PERMISSION** omit (host) — client-side, CP owns | `getConfigView` is the host-gated data half |
| Tier-3b textual-tool-call polyfill | deferred (infra lane) | the read-only arm IS the interim (§4.6) |
| Trackers-tab injection classification | n/a in games (tab omitted); non-game tracker-class injections = the parked D59 crew wave | Injections tab remains the authoring home (CP §3.3) |
| Per-player-private trackers, profile library table, per-NPC structured meters | reserved (D86's named deferrals, unchanged) | recorded here; no schema cost |

**CP-doc deltas to record at ratification (this spec does NOT edit `Context-Panel-Program.md`):**
1. **§4.4 AMENDED (owner, 2026-07-26):** lite top strip = Status · Sheet · Inventory · Scene ·
   **Quests · Journal** (6 tabs); Quests/Journal render the same §3.2 blocks (goal lines with `n/m`
   from objectives; beat lines as the archive); Map alone stays full/MA-3 PHASE. The §4.4
   "Quests/Journal APPLICABILITY-omitted" sentence is superseded.
2. **§3.1 trigger table:** takeover triggers on POINTER PRESENCE; the lite/full trim keys on
   `getGame().mode` (the pointer is mode-free — §2.1).
3. **§6 Q6: ANSWERED** — first-class stored wallet, in lite, `update_inventory.walletDeltas`; the
   Inventory tab's pinned currency line is real from v1.
4. §3.2 goal-line note: the lite quest tracker is the QUEST PLANE (this spec), not custom widgets;
   widgets remain the free-meter fallback.

---

## 6. SECTION E — build waves, tests, coupled sites

### 6.1 Waves (sized for executor stints; L-numbers fresh — this is not D86's L0..L3)

| Wave | Contents | Size | Gate |
|---|---|---|---|
| **W0 — contracts + schema floor** | `@orb/contracts/rpg` whole (§4.1) · kit id brands · `db/schema/rpg.ts` (§4.2) + barrel + db-structure mapping · **the ONE baseline regen** + fixtures + `seed:demo` · `chatMetadataSchema.rpg` sub-blob + parser + `ChatDetail` projection | M | contract tests + schema mirror tests green; regen on a QUIESCED tree only ([baseline-regen-on-a-shared-tree]) |
| **W1 — the domain vertical** | persistence (games/snapshots incl. the ladder/sheets/widgets/quests/journal/checkpoints) · staging accumulator · locks merge · verbs (§4.4) · gather + `buildLiteReminder` · the `ChatRpgOps` implementation (§3.2) · `setRpgPointer` chat verb · tool defs + handlers · bus + belts · compose block + tool registration | L (split: W1a persistence+staging+locks · W1b verbs+gather+ops · W1c tools+bus+compose) | int tests per §6.2; the composed-real int test proves the compose wiring ([compose-stub-goes-stale]) |
| **W2 — transport + client data plumbing** | `rpg` tRPC router (verbs + `stream` subscription) + appRouter registration · **cross-tenant sweep classification: every proc PROBED** ([new-router-needs-sweep-classification]) · client `defineBusChannel` + `EVENT_INVALIDATIONS` · the tRPC hooks the CP build consumes | M | sweep green; router zod schemas (no `z.any()` — the F6 lesson is pre-paid here) |
| **W3 — the CP-4 lite takeover client** | owned by the Context-Panel program (CP §4 + the §5 deltas above) — consumes W2's surface; NOT specced here | — | side-eye AFTER the mockup-first loop, per [mockup-first-build-loop] |

Commit bar per the standing rule: lanes verify scoped; the orchestrator runs `pnpm check` + the
battery on the quiesced tree; artifacts read from `reports/`, never re-run.

### 6.2 Test obligations (the exhaustive posture; tests at `tests/server/domain/rpg/**` etc., the repo-root mirror)

- **Persistence**: every verb an int test (the presence gates demand it); the 4-rung ladder matrix
  (regen-sibling / visible-selected / committed / born-seed) · clone-forward + `committed` lifecycle
  (`onUserCommit` lock-in) · checkpoint restore · sheets roster-∪-rows projection (missing row =
  default sheet; departed actor retained-not-projected).
- **Staging**: read-through (tool 2 sees tool 1 — including a quest created then flipped in one
  turn) · commit flush (snapshot with quests inside + journal entries stamped
  `{variantId, sourceMessageId}`) · **abort clears everything** (the dead-turn-never-flushes pin) ·
  two concurrent turns on one chat don't share a bucket (the ChatTurnId keying pin).
- **Locks**: manual-edit-wins (edit → auto-lock → tool write drops the locked path) · the
  [merge-clear] `{}`-noop / null-clear transition test.
- **Mode**: the MODE_POLICY matrix (every guarded verb × mode; full arms → typed errors) ·
  `createGame("full")` → `RpgModeUnbuiltError`.
- **Profile**: mutability matrix (add / referenced-remove refused / range edits) · packaged
  profiles parse + validate · sheet attribute-key∈vocabulary enforcement.
- **Gather**: injection content (state block entities incl. quests+journal lines, license, guidance
  present/absent by capability, steeringNote last) · `trackersReadOnly` derivation (tools:[] +
  guidance omitted) · non-game chat → null (byte-identical — the existing contract test's pattern) ·
  **the preset knob's default-identity pin**: `gmPresetId` NULL ⇒ override null ⇒ the turn
  assembles byte-identical to a no-game preset resolve; knob SET ⇒ the override preset assembles
  (both ends of §4.11 #1, the knob-wire discipline's test shape).
- **Tools**: every arg schema projects (the `z.toJSONSchema` throw class) · alias resolution
  (targetRef → character/user/cast) · MA-4 patch semantics (omitted field preserves, null clears —
  the returning-NPC pin) · hpDelta-on-null-hp → errors-as-data · walletDeltas · **the mutation-fired
  assertion style** ([assert-the-mutation-fired]).
- **Authority**: the per-verb matrix (host / member-own-row / member-foreign / non-member) — the
  cross-tenant discipline; leak-free refusals.
- **Swipe-consistency, ALL panel planes** (the ratification pin): pool + wallet + quest write on
  variant A, swipe to B ⇒ values AND quest state rewind; swipe back ⇒ they return (the resolved
  snapshot is B's, then A's again). Journal lineage: a model entry from variant A renders while A
  is selected, disappears on swipe to B, reappears on swipe back; a HAND entry (variantId NULL)
  renders on both; deleting variant A CASCADE-deletes its entries. The tracker view re-serves the
  whole panel consistently on `variantSelected` (one query, one snapshot — no per-plane skew).
- **Pointer**: createGame writes it once; corrupt blob heals to absent; `ChatDetail` projects it.
- **Bus**: producer-coverage belt + the client total-map tsc belt + a stream int test.
- **Composed-real**: one `tests/server/entry/compose/rpg.int.test.ts` driving createGame → a tool
  turn → flush through the REAL compose graph (the [ct-stub-lie] class antidote).

### 6.3 Coupled-site inventories (one change = all sites, per the standing memories)

- **New schema file**: `schema/rpg.ts` + `schema/index.ts` barrel + db-structure producer row +
  baseline regen + integrity fixtures + `seed:demo`.
- **New ids**: `ID_PREFIX` entries + brand exports + (used-by) `typeIdSchema` mints.
- **New domain**: domain dir (8-slot) + compose block + `services.ts` wiring + contracts barrel +
  the AGENTS.md §6 additive-domains line + a workboard row + knip/ast liveness sweep.
- **New tools**: compose registration + the MODE_POLICY tuple + the projection tests + the
  05-§3-style count note in `contract/tools.ts`'s header (the count home convention).
- **New bus**: contract union + satisfies-belt + coverage-gate arm + client channel + invalidation
  Record + the subscription proc.
- **New router**: appRouter registration + cross-tenant sweep rows (PROBED each proc) + client hook
  homes.
- **`chats.metadata.rpg`**: contracts sub-blob schema + chat metadata parser + `ChatDetail`
  projection + `setRpgPointer` verb + `rpgChatOps` surface + the knob/doorway hygiene check
  (D107 — the pointer is WIRED both ends at birth, no registry row needed).
- **Ledger/doc deltas at land**: re-mint **D86** verbatim-original into its reserved slot (the
  domain it governs is back) · mint a NEW **D108+** entry for the carve + ratification rulings
  (lite-first build order; quests+journal as lite DATA PLANES; **every panel-rendered tracker
  plane is swipe-consistent — quests in the snapshot, journal variant-aware with the lineage
  projection**; the preset override as a wired KNOB defaulting to augment; stored first-class
  wallet (owner-confirmed); `rpg_sheets` replacing the party shadow under the no-party ruling; the
  two-arm→N-arm actor-ref growth pattern; ambient-nullable honesty) · the §5 CP-doc amendments ·
  the `proposed/INDEX.md` rpg row note (lite lands; R-chunks remain FUTURE reference).

---

## 7. SECTION C — THE GRAFT MAP (the proof of ruling 3)

**The invariant:** full-mode arrival ADDS every row below; it renames, re-types, migrates, or
re-spells NOTHING lite shipped. Anything that would have violated this was redesigned above
(no-default `mode`/`status` — no default flip; nullable `clock`/`hp`/`maxHp` — no fabricated-value
purge; engine-shaped ambient storage — no column re-type; stored wallet — no derived→stored
migration; `rpg_sheets` sans membership — no horizon-column repurposing; reserved verb/tool names —
no renames).

**Tables full ADDS (7):** `rpg_npcs` · `rpg_clocks` · `rpg_maps` · `rpg_sessions` ·
`rpg_pending_checks` · `rpg_encounters` · `rpg_scenes` (shapes per the legacy reference, re-argued
at graft time).

**Columns full ADDS (SQLite `ADD COLUMN`, all additive):** `rpg_games.{morale, activeState,
lootTable, activeMapId, worldOverview, storyArcSecret, plotTwists, artStylePrompt,
lastIllustrationTurn, lastIllustrationSession}` · `rpg_sheets.arc`.
Zero columns on `rpg_snapshots` / `rpg_hud_widgets` / `rpg_journal` / `rpg_checkpoints`.
**Quest-engine graft note** (post-ratification — quests live in the snapshot, §2.5): full's quest
ENGINE reads/writes the SAME snapshot array (its tools/verbs are new writers, not a new home);
GM-ring quest annotations (the legacy `gmNotes` concept) land as an ADDITIVE GM-plane home at graft
time (a `gm` sub-object on the quest JSON shape parsed-with-default, or a small GM-notes table
keyed `(gameId, questId-string)`) — either is additive; neither re-types lite's quest objects.
Session-wrap journal entries ride the existing `variantId: NULL` arm (room-truth entries — the
mechanism lite shipped already carries them).

**JSON-shape ADDS (parse-seam-healed, no DDL):** `config.{genres, tones, setting, difficulty,
rating, language, playerGoals, gm, houseRules, imagery, assist}` (defaulted fields — old blobs lift
at parse) · sheet `{skills, abilities, strengths, weaknesses, attack, defense, speed}` · weather's
optional engine fields get WRITTEN (shape already holds them).

**Union/tuple ADDS (compile-forced, additive):** `rpgActorRefSchema` + `{kind:"npc"}` (every
`assertNever` consumer errors until handled) · `rpgPresentCharacterSchema.npcId?` ·
`RPG_CHECKPOINT_TRIGGERS` session/combat arms · `RPG_GAME_STATUSES` arms go LIVE (already shipped as
vocabulary) · `statProfile.resolution` alt-arms (the D86 reserved discriminant) · bus members
(`clockChanged`/`checkResolved`/`encounterStarted`/… + the `hostOnly` emit option) · widget binding
arms if any.

**Policy/data flips:** `MODE_POLICY.full` becomes MINTABLE (`createGame` full arm + `setMode` land;
the record itself does not change shape) · `RPG_LITE_TOOL_NAMES` unchanged; full's tool tuple ADDS
its names · the `gmPresetId` KNOB gains a full-mode DEFAULT (createGame-full seeds the GM-preset
clone) — the knob's storage, write door, and read end are byte-stable (§4.11 #1).

**Tools full ADDS:** `skill_check`, `request_check`, `advance_time`, `tick_clock`, `upsert_npc`,
`update_reputation`, `create_clock`, `move_party`, `add_map_node`, `resolve_combat_round`,
`grant_loot`, `start_encounter`, `offer_choices`, `request_illustration`, … — additive
registrations into the same registry; the 7 lite defs are byte-stable (update_scene's ambient args
and update_inventory's walletDeltas are already full-compatible — the engines WRITE the same
planes).

**Verbs full ADDS:** `setMode` · wizard/`startGame` family · seat family · encounter/clock/map/
session/npc families · `RpgGmView` as a sibling view arm. The seven `ChatRpgOps` arms fill in
place (§3.2 table, right column) — the op SIGNATURES are already final (they are the current tree's
contract, unchanged).

**What full may NEVER do (the redline the graft map exists to enforce):** rename a lite table/
column/tool/verb/bus member · re-type `clock`/`weather`/`wallet`/`quests`/`objectives` · **break
swipe-consistency on any panel-rendered plane** (the ratification ruling: quests stay in the
snapshot, journal entries stay variant-keyed with the lineage projection — no engine may move
either back to room-keyed writes) · hardcode a posture the knob owns (`gmPresetId` stays the one
preset-override home) · add an `ownerId` to any rpg table (D23) · bind anything to `chats` beyond
the opaque pointer (D58's chat-binding ban) · route steering anywhere but the ChatInjection channel
(the convergence law).

---

## 8. SECTION F — open questions (genuinely new only; everything else is pre-answered above)

1. **Shared-plane hand-edit authority.** The editable-in-place law ("host everywhere, member their
   own row") makes the shared planes (cast, ambient, quests, journal, widgets) host-write. In a
   solo lite chat the user IS host, so the common case is unaffected; in a multi-human lite room,
   members can't fix a quest line. Spec's lean: keep the law as written (shared planes = host);
   widen later by evidence, not now.
2. **Packaged `d20`/`special` in v1** — the spec ships them as templates (§2.3, argued). Veto costs
   nothing (delete two constants); shipping later is equally additive. Lean: ship.
3. **Cast-actor rename semantics** — castKey = normalized name; a rename births a new actor and the
   old row is hand-merged (§2.6). Accepted simplification; a stable minted key + rename verb is an
   additive upgrade if play shows churn. Lean: ship the simple form.

Everything else the commission's Q-list covered is closed in-text: Q6 money (first-class stored
wallet, §2.6 — **owner-CONFIRMED at ratification**, CLOSED) · the metadata-pointer tension (§2.1) ·
lite trim contents (§5 CP deltas) · the steering channel (§3.3) · graduation (PHASE-reserved, §5) ·
swipe semantics for every panel plane (ratification #1, §2.5) · the preset posture (a knob,
ratification #2, §4.11 #1).
