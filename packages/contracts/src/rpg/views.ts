// @orb/contracts/rpg/views — the READ-view projections the CP client consumes (rpg-design/05 §4.8). Data
// contract only (the CP spec owns the components). Minted NOW as the mode-discriminated homes full's GM
// arms extend: `RpgGameView` is the member arm today; full's `RpgGmView` grafts as a SIBLING arm (never
// widening the member type). The panel is swipe-consistent BY CONSTRUCTION — every tab reads the SAME
// resolved-current snapshot, so a swipe re-resolves everything at once (the owner's ratification demand).

import type { ChatId, RpgGameId } from "@orb/kit/ids";
import type { RpgActorRef, RpgActorVolatile } from "./actor";
import type { RpgClockTime, RpgWeather } from "./ambient";
import type { RpgGameConfig } from "./config";
import type { RpgGameMode, RpgGameStatus } from "./enums";
import type { RpgPlot, RpgPresentCharacter } from "./snapshot";
import type { RpgTrackerDef, RpgTrackerValue } from "./tracker";

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
  /** The delivery-model knob (not host-secret — it governs the WHOLE game's freshness posture, so the
   *  panel needs it to render the state-freshness indicator honestly). `reliable` ⇒ the tracker lags one
   *  beat by construction (extraction runs AFTER the character turn commits — §4.9 amendment); `cheap` ⇒
   *  the tracker is current-beat fresh at commit. Member-safe (a `steeringNote`-class secret it is not). */
  readonly extractionMode: RpgGameConfig["extractionMode"];
  /** The member-safe config slice — the `statProfile` (for attribute labels) minus the host-only note.
   *  `immersiveHtml` (parity-plus §4.8/§9 #7) lets the reading surface gate the lenient naked-HTML wrap +
   *  the card-archive section per game (member-safe — a play-style option, never a secret). */
  /** `cyoa`/`cyoaChoiceBehavior`/`plotProgression` (parity-plus P5 §5.4/§6.4) gate the composer wand's game
   *  affordances (the Plot submenu + the choices mode) and shape the choice-CLICK behavior — member-safe
   *  play-style options, never secrets. `cyoaChoiceBehavior` drives the reading-surface click handler
   *  (`compose` = draft the composer; `send` = fire the turn), so it rides the MEMBER slice. */
  readonly publicConfig: {
    readonly statProfile: RpgGameConfig["statProfile"];
    /** The #9 ambient-date mode — `narrated` (freeform date string, no day counter) | `structured`.
     *  Member-safe display knob: the band + Scene ambient render the date arm by it. */
    readonly dateMode: RpgGameConfig["dateMode"];
    readonly immersiveHtml: boolean;
    readonly cyoa: boolean;
    readonly cyoaChoiceBehavior: RpgGameConfig["features"]["cyoaChoiceBehavior"];
    readonly plotProgression: boolean;
  };
}

/** An actor row in the tracker view — roster ∪ sheets projection (§4.3). A participant without a sheet row
 *  renders the DEFAULT sheet; `volatile` is null until a snapshot carries this actor's state. */
export interface RpgActorView {
  readonly actorRef: RpgActorRef;
  readonly name: string;
  readonly avatar?: string;
  readonly sheet: {
    readonly className: string;
    readonly attributes: Readonly<Record<string, number>>;
    readonly maxHp: number | null;
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
  readonly actors: readonly RpgActorView[];
  readonly cast: readonly RpgPresentCharacter[];
  /** The whole game's tracker DEFS (`config.trackers`) — the ONE def home, surfaced once so every consumer
   *  (roster rows, scene cast rows, the band, the editor) reads the same list instead of four shapes. */
  readonly trackerDefs: readonly RpgTrackerDef[];
  /** Per scene-cast member (by cast `key`), the trackers that member carries paired with its readings —
   *  resolved server-side through the ONE carrier predicate, so the Scene tab never re-derives carriage. */
  readonly castTrackers: Readonly<Record<string, readonly RpgTrackerEntry[]>>;
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

/** `getConfigView` (HOST-gated) — the Stats & Trackers editor surface: the full `statProfile` +
 *  `steeringNote` + the `gmPresetId`/`extractionMode` knobs (never on a member view — the host-read
 *  discipline). `extractionMode` is the delivery-model knob (the 2026-07-26 amendment). */
export interface RpgConfigView {
  readonly statProfile: RpgGameConfig["statProfile"];
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
   *  replaced the Sheet-tab pool defs, the Game-tab cast fields, and the band-pin section. */
  readonly trackers: RpgGameConfig["trackers"];
  /** The per-custom-kind steering hints — relationship kinds (M1) + R4c custom journal types. */
  readonly relationshipHints: RpgGameConfig["features"]["relationshipHints"];
  readonly journalTypeHints: RpgGameConfig["features"]["journalTypeHints"];
  /** The P3 hidden-channel knobs (§3.3/§3.6) surfaced to the host editor: `deception`/`omniscience` gate the
   *  teaching + the member reasoning-strip; `hiddenContentReveal` (M4) governs the host's reveal eye;
   *  `recentBeatsKeepLast` bounds the reminder's Recent-beats slice (the P3 fold). */
  readonly deception: boolean;
  readonly omniscience: boolean;
  readonly hiddenContentReveal: boolean;
  readonly recentBeatsKeepLast: number;
  /** The P4 card knobs (parity-plus §9 #7 + M2/M3) — teaching gate, interactivity ASK, keep-last-X wire. */
  readonly immersiveHtml: boolean;
  readonly immersiveHtmlInteractive: boolean;
  readonly cardKeepLastX: number;
  /** The P5 play-style knobs (§5.4/§6.4) — CYOA standing mode, the choice-CLICK behavior (`compose`/`send`),
   *  and the wand Plot submenu gate. */
  readonly cyoa: boolean;
  readonly cyoaChoiceBehavior: RpgGameConfig["features"]["cyoaChoiceBehavior"];
  readonly plotProgression: boolean;
}

/** ONE parsed hidden span from a stored assistant body (parity-plus §3.6 host-reveal). `tag` is the
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
  readonly messageId: string;
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
  readonly messageId: string;
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
