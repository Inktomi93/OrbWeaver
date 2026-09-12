// @orb/contracts/rpg/views — the READ-view projections the CP client consumes. Data
// contract only (the CP spec owns the components). Minted NOW as the mode-discriminated homes full's GM
// arms extend: `RpgGameView` is the member arm today; full's `RpgGmView` grafts as a SIBLING arm (never
// widening the member type). The panel is swipe-consistent BY CONSTRUCTION — every tab reads the SAME
// resolved-current snapshot, so a swipe re-resolves everything at once (the owner's ratification demand).

import type { ChatId, MessageId, MessageVariantId, RpgGameId } from "@orb/kit/ids";
import type { RpgActorIdentity, RpgActorRef, RpgActorVolatile } from "./actor.ts";
import type { RpgClockTime, RpgWeather } from "./ambient.ts";
import type { RpgDeliveryPath, RpgFoldFallbackReason, RpgGameConfig } from "./config.ts";
import type { RpgGameMode, RpgGameStatus } from "./enums.ts";
import type { RpgToolCallVerdict } from "./extraction.ts";
import type { RpgPlot } from "./snapshot.ts";
import type { RpgTrackerDef, RpgTrackerValue } from "./tracker.ts";

/** EFF-3 — the EFFECTIVE state delivery for this room, as opposed to the `extractionMode` KNOB that asked for
 *  it (D112 (4)'s KNOWN GAP: a `folded` game whose wire cannot fold was still showing "Live" while it rounded a
 *  beat behind). It is NOT a prediction of model behavior: `path` is the same capability verdict the gather uses
 *  PRE-COMMIT to decide whether to mount the terminal tools, read off the SAME one connection resolve — so it
 *  states what this room's connection does, and it changes only when the connection does.
 *
 *  The one thing it CANNOT see is a fold that was eligible and failed at runtime (an unbuildable mount, a hook
 *  miss — `no-terminal-channel`): that verdict exists only after a turn completes and is not persisted, so it
 *  stays a LOG-only fact (`rpg.extraction.path` WARN). The `fallbackReason` vocabulary carries the member anyway
 *  (one total vocabulary, one home) — the panel just never sources it here. */
export interface RpgEffectiveDelivery {
  readonly path: RpgDeliveryPath;
  /** Set only when the KNOB and the PATH disagree — a `folded` game that will not fold. `null` when the host
   *  got what they asked for (`folded` folding, an explicit `cheap` rounding) or when nothing runs at all. */
  readonly fallbackReason: RpgFoldFallbackReason | null;
}

/** `getGame` (member) — the takeover's mode read. The pointer fires the takeover; THIS carries the
 *  lite/full trim decision (§2.1). `publicConfig` is the member-safe config slice (never the host-only
 *  `steeringNote`). */
export interface RpgGameView {
  readonly id: RpgGameId;
  readonly chatId: ChatId;
  readonly mode: RpgGameMode;
  readonly status: RpgGameStatus;
  /** Derived per-turn from connection capability (§4.6) — never stored. `true` ⇒ the read-only pill. */
  readonly trackersReadOnly: boolean;
  /** Can the room's connection run the HOST born-state round (`populateFromCharacter`)? Capability-derived off
   *  the SAME one resolve `trackersReadOnly` rides (`hasStructuredWriter` — the structured-output writer the
   *  round needs), and DISTINCT from it: the delivery knob's tools-capability verdict does not answer this
   *  question, so reusing it would either hide the button on a working connection or leave it enabled on one
   *  that silently no-ops. `false` ⇒ the takeover's populate button disables with the honest reason. */
  readonly canPopulate: boolean;
  /** The delivery-model knob (not host-secret — it governs the WHOLE game's freshness posture, so the
   *  panel needs it to render the state-freshness indicator honestly). `cheap` ⇒ the tracker lags one beat by
   *  construction (a dedicated round runs AFTER the character turn commits — §4.9 amendment); `folded` ⇒ the
   *  tracker is current-beat fresh at commit. Member-safe (a `steeringNote`-class secret it is not). */
  readonly extractionMode: RpgGameConfig["extractionMode"];
  /** EFF-3 — what the knob above actually RESOLVES to on this room's connection. The freshness surface renders
   *  THIS (never the bare mode): a `folded` game on a wire that cannot fold reads "as of last beat, because …",
   *  not "Live". Member-safe for the same reason `extractionMode` is — it governs the whole room's freshness. */
  readonly effectiveDelivery: RpgEffectiveDelivery;
  /** The member-safe config slice — the `statProfile` (for attribute labels) minus the host-only note.
   *  `immersiveHtml` lets the reading surface gate the lenient naked-HTML wrap +
   *  the card-archive section per game (member-safe — a play-style option, never a secret). */
  /** `cyoa`/`cyoaChoiceBehavior`/`plotProgression` (§5.4/§6.4) gate the composer wand's game
   *  affordances (the Plot submenu + the choices mode) and shape the choice-CLICK behavior — member-safe
   *  play-style options, never secrets. `cyoaChoiceBehavior` drives the reading-surface click handler
   *  (`compose` = draft the composer; `send` = fire the turn), so it rides the MEMBER slice. */
  readonly publicConfig: {
    readonly statProfile: RpgGameConfig["statProfile"];
    /** The RULESET setting (#862) — member-safe, and member-NEEDED: the dice-ask row above the composer
     *  publishes `RPG_RULESET_DICE[ruleset]`, so without it on the member slice the setting would have no
     *  visible consequence for anyone but the host (the dead-toggle finding, side-eye 2026-08-30). */
    readonly ruleset: RpgGameConfig["ruleset"];
    /** The #9 ambient-date mode — `narrated` (freeform date string, no day counter) | `structured`.
     *  Member-safe display knob: the band + Scene ambient render the date arm by it. */
    readonly dateMode: RpgGameConfig["dateMode"];
    readonly immersiveHtml: boolean;
    readonly cyoa: boolean;
    readonly cyoaChoiceBehavior: RpgGameConfig["features"]["cyoaChoiceBehavior"];
    readonly plotProgression: boolean;
  };
}

/** An actor row in the tracker view — the ONE actor shape, for EVERY actor (R2): participants ∪ sheets ∪ every
 *  tracked `npc` actor, on stage or off. A participant without a sheet row renders the DEFAULT sheet;
 *  `volatile` is null until a snapshot carries this actor's state.
 *
 *  It replaced THREE bolted-on npc projections (`castVolatile` · `castTrackers` · the `cast` identity array).
 *  Those existed because the NPC was not an actor in the view model, and the split was load-bearing for two
 *  measured defect classes: an npc's model-written hp/status/conditions/inventory/wallet rendered in NO
 *  client surface (`castVolatile` had zero consumers), and carrier CLASSES partitioned ROWS rather than PEOPLE,
 *  so a participant character standing in the scene was taught an `npcs`-classed tracker the write surface never
 *  offered her. Both are unrepresentable now: one row per person, and `carrierKind` derives from
 *  `actorRef.kind`. */
export interface RpgActorView {
  readonly actorRef: RpgActorRef;
  readonly name: string;
  readonly avatar?: string;
  /** Does this actor stand in the scene RIGHT NOW (the presence plane)? An offstage actor keeps every other
   *  field on this row — that IS the R2 retention guarantee, and the panel's "Known characters" disclosure. */
  readonly presence: boolean;
  /** The npc's own identity half (name/emoji/mood/relationship/guides); `null` for a participant actor,
   *  whose identity is chat's and whose standing prose is the sheet's. */
  readonly identity: RpgActorIdentity | null;
  readonly sheet: {
    readonly className: string;
    readonly attributes: Readonly<Record<string, number>>;
    /** The sheet's free FLAVOR prose (RV-11) — written through `patchSheet` and, until the takeover grew a
     *  gloss line for it, projected to no reader at all. `""` = nothing written (the line is omitted). */
    readonly flavor: string;
    /** The hand-only progression level (§2.6) — null renders nothing (nullable-honesty, no phantom "Level 0"). */
    readonly level: number | null;
    /** The per-actor tracker exceptions (the applicability model) — surfaced so the editor can show WHY this
     *  actor carries (or doesn't carry) a tracker its class would otherwise decide. */
    readonly trackerGrants: readonly string[];
    readonly trackerRevokes: readonly string[];
  };
  readonly volatile: RpgActorVolatile | null;
  /** The trackers THIS actor effectively carries (`resolve(appliesTo) + grants − revokes`, resolved
   *  server-side in ONE place) — the panel renders exactly these rows against `volatile.trackerValues`, and
   *  never re-derives carriage itself. */
  readonly trackers: readonly RpgTrackerDef[];
}

/** ONE tracked value in a view — the def paired with its swipe-volatile reading (null = the carrier has the
 *  tracker but the story hasn't moved it). The shape every tracker surface renders, actor or game. */
export interface RpgTrackerEntry {
  readonly def: RpgTrackerDef;
  readonly value: RpgTrackerValue | null;
}

/** A quest in the tracker view — the goal line + its `n/m` objective completion (served from the RESOLVED
 *  snapshot's array, §2.5 — swipe-consistent by construction). */
export interface RpgQuestView {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly description: string;
  readonly objectives: readonly { readonly id: string; readonly text: string; readonly completed: boolean }[];
}

/** A band orb — a PINNED tracker with a numeric reading, derived server-side (the banner/orbs). The old
 *  "first 3 pools auto + extra pins" rule is gone with the unification: the band renders exactly what the host
 *  pinned (`def.pinned`), so the band is a decision, not a coincidence of def order. */
export interface RpgTrackerOrb {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly max: number | null;
  readonly color: string | null;
}

/** `getTrackerView` (member) — the aggregate the takeover tabs + banner/orbs render in one query. Every
 *  plane reads the same resolved-current snapshot, so a swipe re-resolves the WHOLE panel consistently. */
export interface RpgTrackerView {
  readonly ambient: {
    readonly location: string;
    readonly calendarDate: string | null;
    readonly clock: RpgClockTime | null;
    readonly weather: RpgWeather | null;
  } | null;
  /** EVERY actor — participants ∪ tracked npcs, present and offstage — in ONE shape (R2). */
  readonly actors: readonly RpgActorView[];
  /** The presence echo: the `actorRefKey`s standing in the scene, in presence order. A THIN derivation of
   *  `actors[].presence`, carried so a consumer that only needs "who is on stage" (the scene card order, the
   *  CEL feed) does not re-filter — never a second identity home. */
  readonly cast: readonly string[];
  /** The whole game's tracker DEFS (`config.trackers`) — the ONE def home, surfaced once so every consumer
   *  (participant rows, scene npc rows, the band, the editor) reads the same list instead of four shapes. */
  readonly trackerDefs: readonly RpgTrackerDef[];
  /** The GAME-subject trackers (the retired custom widgets) paired with their snapshot readings. */
  readonly gameTrackers: readonly RpgTrackerEntry[];
  readonly quests: readonly RpgQuestView[];
  /** The P5 snapshot-resident plot plane (act rail data) — null until the story authors one (the rail
   *  renders nothing; no client-invented acts, ever). Swipe-consistent like every other plane here. */
  readonly plot: RpgPlot | null;
  readonly recentBeats: readonly string[];
  readonly trackersReadOnly: boolean;
  readonly trackerOrbs: readonly RpgTrackerOrb[];
  /** The manual-edit-wins LOCK paths (§12.3 the-lock-consequence-is-visible) — the dotted top-level/keyed
   *  paths a hand edit auto-stamped (`editSnapshot` writes them; tools honor them). The panel renders a pin
   *  glyph on a locked field ("the story won't change this") + a Release affordance. A `[]` = nothing pinned.
   *  Surfaced as an ARRAY of paths (not the record) — the client only needs presence, never the `true` value. */
  readonly lockedPaths: readonly string[];
}

/** A single journal entry in the paged `listJournal` view — lineage-filtered server-side (§2.5). */
export interface RpgJournalEntryView {
  readonly id: string;
  readonly type: string;
  /** R4c — the free gloss on a `custom`-typed entry (""/absent on the seven built-ins). */
  readonly label: string;
  readonly title: string;
  readonly content: string;
  readonly createdAt: number;
}

/** `listTurnToolCalls` — ONE folded turn's recorded tool calls, keyed to the variant that produced them
 *  (TOOLCALLS-INVISIBLE, arm A). The read is per-CHAT and returns a window of these rather than one query per
 *  message: a transcript renders many rows, and a per-row query would be a query storm against a surface most
 *  people never open.
 *
 *  SWIPE-CORRECT BY CONSTRUCTION: the client indexes by `variantId`, so a row shows the calls of the swipe it
 *  is CURRENTLY showing — the same keying `rpg_snapshots`/`rpg_journal` use for the same reason. `messageId`
 *  is the slot, for a client that wants to group without walking its own variant map. */
/** WHY a call's args are not the model's verbatim bytes for this viewer (#1690). Declared as a tuple and
 *  DERIVED (§5.5): a second reason is a member here and a `tsc` failure at every reader, never a free string.
 *  One member today — the args did not parse as JSON, so the hidden-span belt cannot be applied to them and
 *  the fail-closed answer is to serve none of them. */
export const RPG_TOOL_CALL_WITHHOLD_REASONS = ["unparseable"] as const;
export type RpgToolCallWithholdReason = (typeof RPG_TOOL_CALL_WITHHOLD_REASONS)[number];

/**
 * ONE recorded tool call AS A VIEWER MAY READ IT — the member-facing projection of the stored
 * `RpgRecordedToolCall` (#1690). A separate shape from the record on purpose: the RECORD is verbatim (it is
 * the durable row, the flight-recorder ring and the export bundle, all host/operator planes), while THIS is
 * per-viewer and may withhold.
 *
 * WHAT THE PROJECTION DOES for a viewer who does not read hidden (`viewerReadsHidden` — every present role
 * but the host): `args` is PARSED and every leaf string has its hidden spans stripped, and each `issues` line
 * keeps its `<path>: <message>` half while its model-SENT value is re-rendered through the same belt. The
 * host reads both verbatim. The record's own header calls the args "never prose", which was false — the state
 * tools write ambient `location`, actor mood, item and quest text, so an extractor that quoted a `<lie …/>`
 * into a scene field put a GM secret in this payload.
 */
export interface RpgToolCallDisclosure {
  readonly name: string;
  /** The args as this viewer may read them — verbatim for a hidden-reading viewer, span-stripped otherwise,
   *  and EMPTY when `withheld` names a reason. */
  readonly args: string;
  readonly verdict: RpgToolCallVerdict;
  readonly issues: readonly string[];
  /** `null` when `args` is this viewer's honest reading of what the model sent. Otherwise the reason it is
   *  not — the panel says so rather than rendering an empty payload as "the model sent nothing". */
  readonly withheld: RpgToolCallWithholdReason | null;
}

/** WHAT A READER IS TOLD when the turn's state round could not RUN (#1468 item 2) — one home, two renderings.
 *  The DURABLE row stores this sentence with the vehicle's own error appended (`<summary>: upstream 502 …`),
 *  which is what the host reads; every other viewer reads the summary BARE, because the tail is a provider
 *  diagnostic (endpoints, model ids, whatever the backend chose to put in an error body) and this read is
 *  MEMBER-gated. Composed at `entry/compose/rpg.ts` and projected in `domain/rpg/substrate/tool-call-visibility.ts`.
 *  NOT A MARKER (#2064): this is the per-turn disclosure's reason line, never a model prompt — and it sits in
 *  a file `no-hardcoded-model-prose` judges under neither arm (not a seam, not a catalog), so the retired
 *  private `PROSE-OK:` opener it used to wear addressed nothing. Kept as the prose it always was; a `@orb-waive`
 *  here would be a waiver for a finding that does not exist, which the central engine ALARMS on. */
export const RPG_STATE_ROUND_FAILED_SUMMARY = "the model call that records game state failed, so this turn changed nothing";

export interface RpgTurnToolCallsView {
  readonly variantId: MessageVariantId;
  readonly messageId: MessageId;
  readonly calls: readonly RpgToolCallDisclosure[];
  /** The round could not RUN, said out loud ({@link RPG_STATE_ROUND_FAILED_SUMMARY}) — `null` on every turn
   *  whose vehicle reached a verdict, including the quiet one. It rides beside `calls` rather than inside it
   *  because a failed round has NO call to report: the array is what the model called, args verbatim, and a
   *  synthesized entry would show the reader a tool call that never happened. A record can therefore carry an
   *  EMPTY `calls` list and still be worth rendering — which is exactly the turn the disclosure exists for. */
  readonly failure: string | null;
  readonly createdAt: number;
}

/** `getConfigView` (HOST-gated) — the Stats & Trackers editor surface: the full `statProfile` +
 *  `steeringNote` + the `gmPresetId`/`extractionMode` knobs (never on a member view — the host-read
 *  discipline). `extractionMode` is the delivery-model knob (the 2026-07-26 amendment). */
export interface RpgConfigView {
  readonly statProfile: RpgGameConfig["statProfile"];
  /** The RULESET setting (#862) — the Game tab's segmented control reads and writes THIS; the vocabulary
   *  above is what an apply merged into. */
  readonly ruleset: RpgGameConfig["ruleset"];
  readonly steeringNote: string;
  readonly gmPresetId: string | null;
  readonly extractionMode: RpgGameConfig["extractionMode"];
  /** The §1.3 extraction-depth knobs (host editor) — how much story the state round reads, the `window` arm's
   *  token budget, and the reconcile cadence (0 = off). */
  readonly extractionContext: RpgGameConfig["extractionContext"];
  readonly extractionWindowTokens: RpgGameConfig["extractionWindowTokens"];
  readonly reconcileEveryBeats: RpgGameConfig["reconcileEveryBeats"];
  /** The #9 ambient-date mode knob (host editor). */
  readonly dateMode: RpgGameConfig["dateMode"];
  /** THE TRACKERS (the tracked-field unification) — the host's whole tracker set, the single surface that
   *  replaced the Sheet-tab pool defs, the Game-tab npc fields, and the band-pin section. */
  readonly trackers: RpgGameConfig["trackers"];
  /** The per-custom-kind steering hints — relationship kinds + R4c custom journal types. */
  readonly relationshipHints: RpgGameConfig["features"]["relationshipHints"];
  readonly journalTypeHints: RpgGameConfig["features"]["journalTypeHints"];
  /** WAVE MU (owner ruling #20's game half) — the GAME's authored user macros, the host editor's list. Written
   *  back whole (`updateConfig({patch:{userMacros}})` is a whole-list replace). */
  readonly userMacros: RpgGameConfig["userMacros"];
  /** The NAMES the chat's active preset declares (the injected preset-macro read). Names only — the editor
   *  needs collision detection, never the preset's bodies (the picks-view least-privilege posture). A game
   *  macro whose name is in this set SHADOWS the preset def at turn time (`shadowPresetUserMacros`), and the
   *  editor says so rather than letting the host discover it in a prompt. */
  readonly presetMacroNames: readonly string[];
  /** The hidden-channel knobs (§3.3/§3.6) surfaced to the host editor: `deception`/`omniscience` gate the
   *  teaching + the member reasoning-strip; `hiddenContentReveal` governs the host's reveal eye;
   *  `recentBeatsKeepLast` bounds the reminder's Recent-beats slice. */
  readonly deception: boolean;
  readonly omniscience: boolean;
  readonly hiddenContentReveal: boolean;
  readonly recentBeatsKeepLast: number;
  /** The card knobs — teaching gate, interactivity ASK, keep-last-X wire. */
  readonly immersiveHtml: boolean;
  readonly immersiveHtmlInteractive: boolean;
  readonly cardKeepLastX: number;
  /** The play-style knobs (§5.4/§6.4) — CYOA standing mode, the choice-CLICK behavior (`compose`/`send`),
   *  and the wand Plot submenu gate. */
  readonly cyoa: boolean;
  readonly cyoaChoiceBehavior: RpgGameConfig["features"]["cyoaChoiceBehavior"];
  readonly plotProgression: boolean;
}

/** ONE parsed hidden span from a stored assistant body (host-reveal). `tag` is the
 *  `HIDDEN_TAGS` registrant (`lie`/`ofilter`); `fields` is the tag's declared attrs projected in registry order
 *  (`character/type/truth/reason` for a lie; `event/reason` for an ofilter) so the reveal panel renders labelled
 *  fields without re-deriving the field set. A missing attr projects `""` (the model omitted it). */
export interface RpgRevealedSpan {
  readonly tag: string;
  readonly revealLabel: string;
  readonly fields: readonly { readonly key: string; readonly value: string }[];
}

/** The per-message reveal payload (§3.6 the "eye") — the hidden spans tokenized out of ONE assistant slot's
 *  stored (selected-variant) body, in emission order. Host-gated server-side; a member never receives this. */
export interface RpgRevealedMessage {
  readonly messageId: MessageId;
  readonly spans: readonly RpgRevealedSpan[];
}

/** ONE character's STANDING lie in the inventory (§3.6, BEYOND marinara) — the most-recent lie per
 *  (character, truth) across the visible selected-variant transcript. `messageId` anchors where it was told so
 *  the host can jump to it. */
export interface RpgStandingLie {
  readonly character: string;
  readonly type: string;
  readonly truth: string;
  readonly reason: string;
  readonly messageId: MessageId;
}

/** `revealHidden` (HOST-gated, §3.6) — the whole host-reveal read for a game: the per-message parsed hidden
 *  content (the eye's data) PLUS the standing-lie inventory grouped by character. A READ over the stored bodies
 *  (no new table); a member never reaches this verb (leak-free NOT_FOUND). Empty (`messages: []`,
 *  `standingLies: []`) when the game has no hidden content — a clean host-plane read. */
export interface RpgRevealView {
  readonly messages: readonly RpgRevealedMessage[];
  /** The standing lies grouped by character (each character's active lies, most-recent-wins per truth). */
  readonly standingLies: readonly { readonly character: string; readonly lies: readonly RpgStandingLie[] }[];
}
