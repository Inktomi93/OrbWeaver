// domain/rpg/contract/params — the internal param shapes the persistence + substrate slots + VERBS take
// (rpg-design/05 §2.4-2.5, §4.4). These are DOMAIN-INTERNAL types (a verb-to-persistence contract), homed in
// the domain's own `contract/` (never `@orb/contracts/rpg`, which is the cross-boundary wire surface). The
// verb params (below the persistence params) carry the caller's `Principal` — the authority the verb resolves
// through the injected `getMembership` op (§4.4); wire types the verb RETURNS live in `@orb/contracts/rpg`.

import type { ChatInjection } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { UserMacroSpec } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import type {
  RpgActorOp,
  RpgActorRef,
  RpgCastRef,
  RpgDateMode,
  RpgExtractionContext,
  RpgGameFeatures,
  RpgJournalType,
  RpgQuestStatus,
  RpgSnapshotState,
  RpgStatProfile,
  RpgTrackerDef,
  RpgTrackerView,
} from "@orb/contracts/rpg";
import type { CelValue } from "@orb/kit/cel";
import type { ChatId, MessageId, MessageVariantId, PresetId, RpgCheckpointId, RpgGameId, RpgJournalId, RpgQuestId, RpgSnapshotId } from "@orb/kit/ids";

// ── persistence-layer params (W1a) ──────────────────────────────────────────────────────────────────────

/** The minimal game reference the snapshot resolver walks the ladder against. */
export interface SnapshotGameRef {
  readonly id: RpgGameId;
  readonly chatId: ChatId;
}

/** What EVERY snapshot write carries regardless of arm: the minted id, the owning game, the injected clock
 *  (no ambient clock in persistence). */
interface SnapshotWriteBase {
  readonly id: RpgSnapshotId;
  readonly gameId: RpgGameId;
  readonly now: number;
}

/** The TURN-arm write target (D124): the committed assistant slot + variant a turn FLUSH is keyed to
 *  (rpg-design/05 §2.4). A snapshot is variant-keyed IFF it was produced by that variant's own turn flush —
 *  this target is the only shape that can express it. */
export interface TurnSnapshotTarget extends SnapshotWriteBase {
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
}

/** The HAND-arm write target (D124): a MESSAGE-LESS snapshot — the 7 hand doors' clone-forward, resync,
 *  populate, checkpoint restore. It names the CHAT, never a message: the row's `asOfMessageId` order stamp is
 *  the chat's TAIL slot resolved INSIDE the write, so a caller can never hand in a stale tail (and no caller
 *  can post a blank message to carry the row — the leak class is unspellable). */
export interface HandSnapshotTarget extends SnapshotWriteBase {
  readonly chatId: ChatId;
}

/** What the accumulator flushes for a completed turn: the effective composed state (base overlaid by every
 *  staged tool write, locks already honored) plus the staged journal entries to stamp with the committed
 *  variant — AND the raw patches that produced the state, in stage order.
 *
 *  WHY THE PATCHES RIDE ALONG (HAND-EDIT-VS-FLUSH fix leg): `state` is `preSlotBase + writes`, and the base half
 *  of it is STALE the moment a hand edit lands mid-flight. Replaying `state` onto the hand head therefore
 *  re-asserts the stale base over the human's gesture — a mid-flight `dismissActor`/`deleteQuest` was UNDONE
 *  that way (the removal verbs clear their locks by design, so nothing stopped the base's copy of the actor
 *  from being re-inserted). The PATCHES are what the round actually wrote and nothing else, so replaying THEM
 *  can never resurrect a datum the round never mentioned. The flush writes its row from `state` (a variant's
 *  snapshot stays absolute, VER-1a); only the fold uses `patches`. */
export interface StagedTurnFlush {
  readonly state: RpgSnapshotState;
  readonly journal: readonly StagedJournalEntry[];
  /** Every write staged for this turn, in the order it was staged — the tools' mid-turn writes and/or the
   *  round's delta — each carrying the state it was composed against. Replayed in the same order by the fold,
   *  so the composition is identical to `state`'s. */
  readonly patches: readonly StagedPatch[];
}

/** ONE staged write, PAIRED WITH THE STATE IT WAS COMPOSED AGAINST — the unit the flush's fold rebases.
 *
 *  WHY THE PAIR IS THE UNIT, and not a patch list plus one seed base: a turn stages once per tool call, and
 *  patch N is composed by its applier against `seed + patches[0..N-1]`, NOT against the seed. Rebasing every
 *  patch against the seed re-scores an element an earlier patch already added as a fresh ADD and appends it
 *  again — two `update_scene` calls in one turn wrote the first beat twice and put a character on stage twice
 *  (`recentEvents`/`presentCharacters`, the flat planes; keyed planes are immune because correlate-by-key
 *  replacement is idempotent). Nothing downstream dedupes: `applyPresencePatch`'s `includes` guard runs at
 *  WRITE time, and this state goes straight to `writeHandSnapshot`.
 *
 *  The base is CAPTURED at stage time rather than reconstructed at fold time. Replaying the accumulator's own
 *  merge would be exact today, but it would be a SECOND place that has to compose patches the same way — and
 *  the divergence would be invisible (a silently duplicated beat, not a crash). The accumulator already holds
 *  the state each applier saw; recording it makes each entry self-describing and the invariant local. */
export interface StagedPatch {
  readonly patch: Record<string, unknown>;
  readonly base: RpgSnapshotState;
}

/** A journal entry a tool staged mid-turn — flushed at commit stamped with the COMMITTED variant's id
 *  (rpg-design/05 §2.5). The `variantId`/`sourceMessageId` are supplied by the flush, not the tool. */
export interface StagedJournalEntry {
  readonly type: string;
  /** R4c — the free gloss for a `custom`-typed beat (""/absent on the seven built-ins). */
  readonly label: string;
  readonly title: string;
  readonly content: string;
}

// ── verb-layer params (W1b) ─────────────────────────────────────────────────────────────────────────────
// Every verb carries the caller's `Principal` (the authority the verb resolves through `getMembership`) plus
// the target `chatId` (game-ness + authority both resolve through the chat FK chain — no `ownerId`, D23).
// The optional fields the W2 `rpg.*` router SPREADS from a zod-`.optional()` wire schema are typed
// `?: T | undefined` (the `ListMessagesParams` chat precedent) — under `exactOptionalPropertyTypes` a bare
// `?: T` rejects the explicit `undefined` a zod-optional infers, and the transport pass-through spreads it.

/** `createGame` — the host-gated create. `mode ∈ RPG_GAME_MODES`; `"full"` throws `RpgModeUnbuiltError`.
 *  `profile` is the caller-picked packaged/imported statProfile (omit ⇒ `freeform`, lite's default). */
export interface CreateGameParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly mode: string;
  readonly profile?: RpgStatProfile | undefined;
}

/** `updateConfig` — the ONE config write door (host). `patch` carries the profile mutability matrix + the
 *  `lite.steeringNote`; `gmPresetId` is the preset-override KNOB (§4.11 #1 — a `PresetId` sets it, explicit
 *  `null` clears back to augment, omit keeps). `extractionMode` is the delivery-model knob (the amendment). */
export interface UpdateConfigParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly patch?:
    | {
        readonly statProfile?: RpgStatProfile | undefined;
        readonly steeringNote?: string | undefined;
        // THE TRACKERS (the tracked-field unification) — the host's whole tracker set in ONE write
        // (whole-list replace, the retired castFields/pinnedOrbs semantics).
        readonly trackers?: readonly RpgTrackerDef[] | undefined;
        readonly relationshipHints?: Readonly<Record<string, string>> | undefined;
        // R4c — the custom-journal-type gloss map (the relationshipHints sibling); whole-record replace.
        readonly journalTypeHints?: Readonly<Record<string, string>> | undefined;
        // P3 hidden-channel knobs (§3.3/§3.6) + the recent-beats cap (P3 fold). Omit keeps the current value
        // (MA-4 patch semantics) — the verb reads the game's existing value on omit, so a toggle survives an
        // unrelated config edit (never reset to default). `deception`/`omniscience` = the teach + reasoning-strip
        // gates; `hiddenContentReveal` = M4 host-eye offer; `recentBeatsKeepLast` = the reminder slice.
        readonly deception?: boolean | undefined;
        readonly omniscience?: boolean | undefined;
        readonly hiddenContentReveal?: boolean | undefined;
        readonly recentBeatsKeepLast?: number | undefined;
        // P4 card knobs (§9 #7 + M2/M3) — omit keeps the current value (MA-4 patch semantics).
        readonly immersiveHtml?: boolean | undefined;
        readonly immersiveHtmlInteractive?: boolean | undefined;
        readonly cardKeepLastX?: number | undefined;
        // P5 play-style knobs (§5.4/§6.4) — CYOA standing mode + the choice-click behavior + the wand
        // Plot submenu gate.
        readonly cyoa?: boolean | undefined;
        readonly cyoaChoiceBehavior?: RpgGameFeatures["cyoaChoiceBehavior"] | undefined;
        readonly plotProgression?: boolean | undefined;
        // The FRONT-DOOR toggle (#40) — omit keeps; `false` disengages (state preserved, reversible);
        // the verb mirrors the value onto the chat pointer (`ChatRpgPointer.engaged`).
        readonly engaged?: boolean | undefined;
        // The #9 ambient-date mode (`narrated` | `structured`) — omit keeps.
        readonly dateMode?: RpgDateMode | undefined;
        // The §1.3 extraction-depth knobs (how much story the state round reads + its token budget + the
        // reconcile cadence) — omit keeps (MA-4 patch semantics).
        readonly extractionContext?: RpgExtractionContext | undefined;
        readonly extractionWindowTokens?: number | undefined;
        readonly reconcileEveryBeats?: number | undefined;
        // WAVE MU (owner ruling #20's game half): the GAME's authored user macros — the whole set in ONE
        // write (whole-list replace, the `trackers` semantics); omit keeps the current set.
        readonly userMacros?: readonly UserMacroSpec[] | undefined;
        // PROSE-1 (§4.2/§4.6) — the per-GAME model-facing prose overrides (`slotId → {text, baseVersion}`);
        // whole-record replace, omit keeps (the `userMacros` semantics). Threaded to the reminder as
        // `LiteReminderInput.prose`.
        readonly prose?: ProseOverrides | undefined;
      }
    | undefined;
  readonly gmPresetId?: PresetId | null | undefined;
  readonly extractionMode?: string | undefined;
}

/** `patchSheet` — write an actor's identity sheet (host any; a member their own `user` ref). MA-4 patch: every
 *  field optional, no defaults — an omitted field keeps its current value. Attribute keys are validated ∈ the
 *  profile vocabulary + range. */
export interface PatchSheetParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly actorRef: RpgActorRef;
  readonly patch: {
    readonly className?: string | undefined;
    readonly attributes?: Readonly<Record<string, number>> | undefined;
    // The per-actor TRACKER EXCEPTIONS (the applicability model) — tracker KEYS granted to / revoked from
    // THIS actor against its carrier class. Whole-list replace; defs themselves live in `config.trackers`.
    readonly trackerGrants?: readonly string[] | undefined;
    readonly trackerRevokes?: readonly string[] | undefined;
    readonly flavor?: string | undefined;
    readonly level?: number | null | undefined;
  };
}

/** `editSnapshot` — the hand-edit door (host any field; a member their own actor's volatile). Writes the
 *  volatile state on the CURRENT resolved snapshot (clone-forward if the head is committed) and AUTO-LOCKS
 *  every field the patch touched. `patch` is a partial snapshot-state overlay under the [merge-clear] contract. */
export interface EditSnapshotParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly patch: Record<string, unknown>;
  /** Dotted lock paths to CLEAR from `fieldLocks` (§12.3 lock-release) — the host's Release affordance. */
  readonly releaseLocks?: readonly string[] | undefined;
  /** The FINE lock paths this hand edit stamps (#10 per-field manual-edit-wins) — the caller names exactly
   *  which values it touched (`actorState.user:<id>.pools.<name>`, `…status`), so the pin lands on the
   *  SPECIFIC datum, not the whole plane. Omit ⇒ the coarse default (every top-level patch key). */
  readonly lockPaths?: readonly string[] | undefined;
}

/** `patchActor` — THE op-shaped hand door for one actor's volatile row (R1; host). The ops apply IN ORDER
 *  against the TRUE resolved head server-side, so there is no client image to go stale and the auto-lock is
 *  DERIVED per op (`substrate/actor-ops.ts`) rather than claimed by the caller. `autoLock:false` is the
 *  model-unreachable-field arm (an item's host-picked `icon` has no story write to stop). */
export interface PatchActorParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly targetRef: RpgActorRef;
  readonly ops: readonly RpgActorOp[];
  readonly autoLock?: boolean | undefined;
}

/** `dismissActor` — THE removal gesture for the actor plane (R1; host): drops the actor's state row + its
 *  scene-presence row and releases every lock at/below its path. The gesture `merge.ts`'s additive policy
 *  always named and never had. */
export interface DismissActorParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly targetRef: RpgActorRef;
}

/** `promoteActor` — THE promotion doorway (R4; host): a scene NPC earns a durable roster card + a chat seat,
 *  and her actor row is RE-KEYED `cast:<slug>` → `character:<id>` in the same gesture. `targetRef` is the CAST
 *  arm only — promoting a roster actor is meaningless, so the type cannot express it. */
export interface PromoteActorParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly targetRef: RpgCastRef;
}

/** `upsertQuest` — the hand arm of the quest plane (host). Writes the `quests` array on the current resolved
 *  snapshot (clone-forward + `fieldLocks` — swipe-consistent, §2.5). `questId` present ⇒ update; absent ⇒
 *  create (mints a fresh id). */
export interface UpsertQuestParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly questId?: RpgQuestId | undefined;
  readonly name: string;
  readonly status?: RpgQuestStatus | undefined;
  readonly description?: string | undefined;
  readonly objectives?: readonly { readonly id?: string | undefined; readonly text: string; readonly completed?: boolean | undefined }[] | undefined;
}

/** `deleteQuest` — remove a quest from the current resolved snapshot's array (host). */
export interface DeleteQuestParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly questId: RpgQuestId;
}

/** `addJournalEntry` — a hand journal entry (host); stamps `variantId: NULL` (every-lineage room note, §2.5). */
export interface AddJournalEntryParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly type: RpgJournalType;
  /** R4c — the free gloss carried when `type === "custom"`; omit ⇒ "". */
  readonly label?: string | undefined;
  readonly title: string;
  readonly content: string;
}

/** `editJournalEntry` — patch an entry's mutable text (host; reaches model entries — the recovery path). */
export interface EditJournalEntryParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly entryId: RpgJournalId;
  readonly patch: {
    readonly type?: RpgJournalType | undefined;
    readonly label?: string | undefined;
    readonly title?: string | undefined;
    readonly content?: string | undefined;
  };
}

/** `deleteJournalEntry` — remove a journal entry (host). */
export interface DeleteJournalEntryParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly entryId: RpgJournalId;
}

/** `createCheckpoint` — label the current resolved snapshot (host). */
export interface CreateCheckpointParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly label: string;
}

/** `restoreCheckpoint` — clone a checkpointed snapshot forward BORN COMMITTED onto a fresh narrator slot
 *  (host). `chatId` is carried for the authority resolve; the checkpoint FK carries the game. */
export interface RestoreCheckpointParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly checkpointId: RpgCheckpointId;
}

/** `listCheckpoints` — the game's labeled bookmarks (member). */
export interface ListCheckpointsParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
}

/** `rollDice` — server CSPRNG, bake-once (member). Zero state; the result is returned for the composer stamp. */
export interface RollDiceParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly notation: string;
}

/** A read scoped to a chat's game (member for `getGame`/`getTrackerView`; host for `getConfigView`). */
export interface ReadGameParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
}

/** `detachDanglingPointer` — the host heal for a pointer at a vanished game (§3.3). Chat-scoped; the verb gates
 *  on host membership DIRECTLY (the game row is gone, so the normal game gate can't run). */
export interface DetachDanglingPointerParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
}

/** `resyncFromStory` — the HOST re-derive-from-the-story escape hatch (crunchy-cluster §1.3). Chat-scoped; the
 *  verb resolves the HOST floor (`resolveHost`) so a member can never trigger the host-principal model call. The
 *  `principal` is the CALLER's — the host authorization the model read runs under (the consent seam); the verb
 *  resolves the room connection under the room HOST (by role, D19), never a caller-injected foreign principal. No
 *  window arg: the budget is a `RPG_RESYNC_MAX_TOKENS` const (the deepest honest read), not a client knob. */
export interface ResyncFromStoryParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
}

/** `populateFromCharacter` — the HOST born-state round over ONE character (owner ruling 2026-08-01). Chat- +
 *  actor-scoped; the verb resolves the HOST floor (`resolveHost`) so a member can never trigger the
 *  host-principal model call, then resolves the card corpus under the room host. `actorRef` names WHICH roster
 *  character the round fills — a `user`/`cast` ref carries no card and is refused (the honest applicability
 *  arm the client's disabled button mirrors). No corpus arg: the card + opening are server-resolved, so a
 *  caller can never feed the round its own prose. */
export interface PopulateFromCharacterParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly actorRef: RpgActorRef;
}

/** `listJournal` — the paged lineage-projected archive (member). */
export interface ListJournalParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

/** `listTurnToolCalls` — the window of recorded folded turns for a game (TOOLCALLS-INVISIBLE, arm A). No
 *  `offset`: the client indexes the whole window by `variantId` to render per-row disclosures, so paging
 *  BACKWARD through it would only ever produce a half-populated index. A deeper history raises `limit`. */
export interface ListTurnToolCallsParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly limit?: number | undefined;
}

// ── chat-ops-layer shapes (W1b-integration) ─────────────────────────────────────────────────────────────
// The gather's contribution + the reminder assembler's input — DOMAIN-INTERNAL feature types (§7.4 homes
// feature types in contract/, never inline at the module). The gather result is structurally the chat-side
// `ChatRpgGatherResult`; the reminder input is the pure assembler's argument.

/** The generic gather contribution (structurally the chat-side `ChatRpgGatherResult`): the macro map, the
 *  reminder injection(s), and the tool NAMES to attach. Lite contributes no macros (the injection strategy —
 *  `MODE_POLICY.lite.prompt === "injection"`; the gm-preset macro arm is full's). */
export interface RpgGatherResult {
  readonly macros: Readonly<Record<string, string>>;
  readonly injections: readonly ChatInjection[];
  readonly tools: readonly string[];
  // The `{{expr::…}}` CEL activation (parity-plus §12) — a data-only `rpg` binding whose value is the tracker view
  // shaped as a CelValue tree (scalars/lists/maps, no functions). Chat threads it onto the AssembleContext's
  // `celBindings` structurally so `{{expr::rpg.scene.location}}` reads state. Absent on a lite gather that stages
  // no expr surface.
  readonly celBindings?: Readonly<Record<string, unknown>> | undefined;
  /** The M2 card wire knob (`config.features.cardKeepLastX`, parity-plus §3.5) — threaded to the chat
   *  engine's `runTurnPipeline` so the X newest cards ride the wire full; 0 = every card stubs. A plain
   *  number on the STRUCTURAL gather contract (chat names no rpg type). */
  readonly cardKeepLastX: number;
}

/** The macro + CEL feed a game turn's GATHER builds (parity-plus §12) — the string macro map (rpgSceneState/
 *  rpgCast/rpgQuests/rpgDelta) staged on `rpgMacros`, plus the data-only `rpg` CEL tree staged as the `rpg`
 *  binding on `celBindings`. Both project from the SAME tracker view the reminder + panel read (one projection,
 *  three consumers). Built by `chat-ops/macro-view.ts` (§7.4: the feature type homes in contract/, not the
 *  substrate that produces it). */
export interface RpgMacroFeed {
  readonly macros: Readonly<Record<string, string>>;
  readonly rpg: CelValue;
}

/** The `buildLiteReminder` inputs the gather resolves and hands in (§4.7). `steeringNote` is
 *  `config.lite.steeringNote` (the always-wins tail). No tool-capability input: the char turn is always
 *  tool-less prose (owner ruling 2026-07-27), so the reminder never carries tool-update guidance.
 *
 *  `curSnapshot` + `prevSnapshot` feed the DELTA BLOCK (§2.7 — the always-on prev→current diff rendered before
 *  the license). Both are the RESOLVED committed snapshot states on the selected lineage (the gather's second
 *  ladder read supplies `prevSnapshot`), so the delta is swipe-consistent by construction. `curSnapshot` is the
 *  same resolved-current state `view` projects from (one resolve, two consumers); `prevSnapshot` is `null` when
 *  this is the first snapshot on the lineage (the delta renders the first-state form, or omits — §2.7). */
export interface LiteReminderInput {
  readonly view: RpgTrackerView;
  readonly steeringNote: string;
  /** The identity-macro binding for the host-authored `steeringNote` — `user` = the triggering human's ACTIVE
   *  persona name (chat's `{{user}}`, threaded through the gather op), `char` = the game's protagonist name.
   *  `buildLiteReminder` renders the note's `{{user}}`/`{{char}}` through the GUIDED-SAFE resolver (identity
   *  substitution only — never full macro/variable/injection power, per the steer-neutralization ruling) so a
   *  host who types `{{user}}/{{char}}` gets the names, not literal braces. Absent ⇒ the note ships verbatim
   *  (no substitution — the byte-identical pre-fix path for a caller that supplies no binding, e.g. a test). */
  readonly steerMacros?: { readonly user: string; readonly char: string } | undefined;
  readonly curSnapshot: RpgSnapshotState;
  readonly prevSnapshot: RpgSnapshotState | null;
  /** The game's `statProfile` — the ATTRIBUTE VOCABULARY (label + hint per key). The reminder teaches it once
   *  and renders each actor's values under those labels; without it the state block printed raw `str 14` key
   *  pairs and the label-as-mini-prompt (the profile's own steering prose) reached the model nowhere. */
  readonly statProfile: RpgStatProfile;
  /** The game's WHOLE feature-knob slice (`config.features`) — ONE home for every knob the reminder reads:
   *  `relationshipHints` (M1 — a custom relationship renders `label (gloss)`), `immersiveHtml` +
   *  `immersiveHtmlInteractive` (the §3.3/§7.5 card teaching + its M3 ask variant), and the future P3/P5
   *  teaching gates. Passing the slice whole keeps the knob vocabulary one-homed (never re-picked per field). */
  readonly features: RpgGameFeatures;
  /** The delta's roster-name map (P0 fold-in #5 — actorRefKey → display name) so volatile-plane delta lines name
   *  roster actors ("Kael HP 12→16", not "character HP 12→16"). Resolved by the gather from `ctx.resolveRoster`;
   *  the pure delta reads it as DATA (no I/O in the registry — delta.ts stays pure). */
  readonly rosterNames: Readonly<Record<string, string>>;
  /** P3 hidden-channel teaching gates (§3.3) — `config.features.deception`/`omniscience`. Each `true` composes its
   *  teaching block (`RPG_DECEPTION_TEACH`/`RPG_OFILTER_TEACH`) into the reminder, after the state/delta and before
   *  the license; both default false ⇒ no block (byte-identical to a pre-P3 reminder). The blocks teach the
   *  `<lie …/>`/`<ofilter …/>` tag grammar the tokenizer's `HIDDEN_TAGS` registry recognizes. */
  readonly deception: boolean;
  readonly omniscience: boolean;
  /** The #9 ambient-date mode — `narrated` drops the `day N` counter from the ambient line. */
  readonly dateMode: RpgDateMode;
  /** PROSE-1 (§4.3) — the game's model-facing prose OVERRIDES (`config.prose`), threaded whole so the reminder
   *  resolves each teach/heading against it (`resolveProse`). ABSENT/`{}` ⇒ every slot resolves to its shipped
   *  default, byte-identical to the pre-PROSE-1 constant — the default-identity discipline that makes this
   *  migration a no-op until a host edits prose. Optional for the same reason `steerMacros` is: a test caller
   *  supplies none and gets the shipped defaults. The gather always threads `game.config.prose`. */
  readonly prose?: ProseOverrides | undefined;
}
