// @orb/contracts/rpg/views — the READ-view projections the CP client consumes (rpg-design/05 §4.8). Data
// contract only (the CP spec owns the components). Minted NOW as the mode-discriminated homes full's GM
// arms extend: `RpgGameView` is the member arm today; full's `RpgGmView` grafts as a SIBLING arm (never
// widening the member type). The panel is swipe-consistent BY CONSTRUCTION — every tab reads the SAME
// resolved-current snapshot, so a swipe re-resolves everything at once (the owner's ratification demand).

import type { ChatId, RpgGameId } from "@orb/kit/ids";
import type { RpgActorRef, RpgActorVolatile } from "./actor";
import type { RpgClockTime, RpgWeather } from "./ambient";
import type { RpgCastField, RpgGameConfig } from "./config";
import type { RpgGameMode, RpgGameStatus } from "./enums";
import type { RpgPresentCharacter, RpgWidgetDef } from "./snapshot";

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
  /** The member-safe config slice — the `statProfile` (for attribute labels) minus the host-only note. */
  readonly publicConfig: { readonly statProfile: RpgGameConfig["statProfile"] };
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
    readonly poolDefs: readonly { readonly name: string; readonly max: number }[];
    readonly maxHp: number | null;
    /** The hand-only progression level (§2.6) — null renders nothing (nullable-honesty, no phantom "Level 0"). */
    readonly level: number | null;
  };
  readonly volatile: RpgActorVolatile | null;
}

/** A widget in the tracker view — the def paired with its swipe-volatile value. */
export interface RpgWidgetView {
  readonly def: RpgWidgetDef;
  readonly value: { readonly value?: number; readonly max?: number; readonly items?: readonly string[] } | null;
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

/** A pool orb — the first-3-pools derivation, server-side (the banner/orbs). */
export interface RpgPoolOrb {
  readonly label: string;
  readonly value: number;
  readonly max: number;
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
  /** The host-defined tracked cast-field SCHEMAS (§2.8 — `config.features.castFields`) the Scene tab joins
   *  against each cast member's `customFields` record to render meters/text + the relationship badge. Empty when
   *  the feature is off (a defined field or nothing — no opaque-record fallback). */
  readonly castFields: readonly RpgCastField[];
  readonly widgets: readonly RpgWidgetView[];
  readonly quests: readonly RpgQuestView[];
  readonly recentBeats: readonly string[];
  readonly trackersReadOnly: boolean;
  readonly poolOrbs: readonly RpgPoolOrb[];
}

/** A single journal entry in the paged `listJournal` view — lineage-filtered server-side (§2.5). */
export interface RpgJournalEntryView {
  readonly id: string;
  readonly type: string;
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
  /** The parity-plus feature knobs (§2.8/§2.1 M1) — the host defines the tracked cast-field schemas + the
   *  per-custom-relationship-kind steering hints on this editor surface. */
  readonly castFields: RpgGameConfig["features"]["castFields"];
  readonly relationshipHints: RpgGameConfig["features"]["relationshipHints"];
}
