// The GM-console SCALAR form model — the "Game" tab's host-admin console. The
// autosave form owns the flat scalar knobs (steering note · delivery model · the deception toggles · the
// reveal-eye offer · the prompt-budget + extraction-depth NUMBERS — every one of them stored and wired
// server-side with no editor until this wave, the D107 dead-switch class); the
// array/record sub-editors (cast-field schemas, relationship hints, orb-pinning) call `updateConfig` with
// path-scoped patches directly (Tier-3: one path per commit), NOT through this form. Keeping the
// two apart is deliberate: a flat form can't express a growable schema array, and a whole-object autosave
// of the array knobs would fight the per-row edits.
//
// The form↔wire mapping lives here (the room-overrides precedent): the surface deals in `RpgConfigView` +
// the `updateConfig` patch shape, never the form's own value bag.

import type { RpgConfigView, RpgDateMode, RpgExtractionContext, RpgExtractionMode } from "@orb/contracts/rpg";
import {
  RPG_CARD_KEEP_LAST_DEFAULT,
  RPG_EXTRACTION_WINDOW_TOKENS_DEFAULT,
  RPG_RECENT_BEATS_KEEP_DEFAULT,
  RPG_RECONCILE_EVERY_BEATS_DEFAULT,
} from "@orb/contracts/rpg";

type CyoaChoiceBehavior = RpgConfigView["cyoaChoiceBehavior"];

/** The NumberField's controlled shape is `number | null` (Base UI: null = the box is empty). A host who clears a
 *  numeric knob is saying "use the default", which is exactly what the field's placeholder promises them — so the
 *  wire mapping resolves null to the CONTRACT's default rather than inventing a sentinel or skipping the write. */
function orDefault(value: number | null, fallback: number): number {
  return value ?? fallback;
}

/** The console's flat scalar values (the autosave form's bag). P5 adds the play-style knobs (`cyoa`
 *  standing mode + `cyoaChoiceBehavior` — the compose|send choice-click knob — + the wand Plot submenu
 *  gate) — same autosave pattern as the deception toggles. */
export interface HostConsoleFormValues {
  readonly steeringNote: string;
  readonly extractionMode: RpgExtractionMode;
  readonly deception: boolean;
  readonly omniscience: boolean;
  readonly cyoa: boolean;
  readonly cyoaChoiceBehavior: CyoaChoiceBehavior;
  readonly plotProgression: boolean;
  /** The #9 ambient-date mode — narrated (freeform date string) | structured (day counter). */
  readonly dateMode: RpgDateMode;
  /** The immersive-card knobs — both were stored, wired through the reminder
   *  and a lenient wrap, and had NO editor: a host who did not want HTML cards had no switch to
   *  reach (the D107 dead-switch class, owner dogfood 2026-07-31). `immersiveHtml` gates the TEACHING ask;
   *  `immersiveHtmlInteractive` picks the interactive-vs-static variant of that ask (meaningless with the
   *  teaching off — the surface disables it rather than hiding it). Neither touches the RENDER: an
   *  already-emitted card always renders, so a toggle-off never breaks stored content. */
  readonly immersiveHtml: boolean;
  readonly immersiveHtmlInteractive: boolean;
  /** Is the host offered the reveal eye at all? Off = the host runs PURE hidden (no peek even for
   *  themselves). Never touches the member strip or the wire: a member reads no hidden bytes either way, and
   *  the model always remembers what it hid. Stored + read by `revealHidden` since launch, editor-less until now. */
  readonly hiddenContentReveal: boolean;
  /** The numeric knobs — `null` = the box is empty (Base UI's controlled shape), which the wire mapping resolves
   *  to the contract default the field's placeholder advertises. */
  readonly recentBeatsKeepLast: number | null;
  readonly cardKeepLastX: number | null;
  /** The extraction-DEPTH trio — how much of the turn's own story the state round reads as evidence, the
   *  `window` arm's token budget, and how often a beat forces a full plane re-emission. */
  readonly extractionContext: RpgExtractionContext;
  readonly extractionWindowTokens: number | null;
  readonly reconcileEveryBeats: number | null;
}

export const EMPTY_HOST_CONSOLE_FORM: HostConsoleFormValues = {
  steeringNote: "",
  extractionMode: "folded",
  deception: false,
  omniscience: false,
  cyoa: false,
  cyoaChoiceBehavior: "compose",
  plotProgression: true,
  dateMode: "narrated",
  immersiveHtml: true,
  immersiveHtmlInteractive: true,
  hiddenContentReveal: true,
  recentBeatsKeepLast: RPG_RECENT_BEATS_KEEP_DEFAULT,
  cardKeepLastX: RPG_CARD_KEEP_LAST_DEFAULT,
  extractionContext: "window",
  extractionWindowTokens: RPG_EXTRACTION_WINDOW_TOKENS_DEFAULT,
  reconcileEveryBeats: RPG_RECONCILE_EVERY_BEATS_DEFAULT,
};

/** Project the host config read into the form's scalar bag. */
export function toHostConsoleForm(config: RpgConfigView): HostConsoleFormValues {
  return {
    steeringNote: config.steeringNote,
    extractionMode: config.extractionMode,
    deception: config.deception,
    omniscience: config.omniscience,
    cyoa: config.cyoa,
    cyoaChoiceBehavior: config.cyoaChoiceBehavior,
    plotProgression: config.plotProgression,
    dateMode: config.dateMode,
    immersiveHtml: config.immersiveHtml,
    immersiveHtmlInteractive: config.immersiveHtmlInteractive,
    hiddenContentReveal: config.hiddenContentReveal,
    recentBeatsKeepLast: config.recentBeatsKeepLast,
    cardKeepLastX: config.cardKeepLastX,
    extractionContext: config.extractionContext,
    extractionWindowTokens: config.extractionWindowTokens,
    reconcileEveryBeats: config.reconcileEveryBeats,
  };
}

/** The `updateConfig` patch for the scalar bag — the steering note rides `patch.steeringNote`; the
 *  extraction mode + deception knobs are top-level/`patch`-level per the wire schema. */
export interface HostConsoleScalarPatch {
  readonly patch: {
    readonly steeringNote: string;
    readonly deception: boolean;
    readonly omniscience: boolean;
    readonly cyoa: boolean;
    readonly cyoaChoiceBehavior: CyoaChoiceBehavior;
    readonly plotProgression: boolean;
    readonly dateMode: RpgDateMode;
    readonly immersiveHtml: boolean;
    readonly immersiveHtmlInteractive: boolean;
    readonly hiddenContentReveal: boolean;
    readonly recentBeatsKeepLast: number;
    readonly cardKeepLastX: number;
    readonly extractionContext: RpgExtractionContext;
    readonly extractionWindowTokens: number;
    readonly reconcileEveryBeats: number;
  };
  readonly extractionMode: RpgExtractionMode;
}

export function fromHostConsoleForm(values: HostConsoleFormValues): HostConsoleScalarPatch {
  return {
    patch: {
      steeringNote: values.steeringNote,
      deception: values.deception,
      omniscience: values.omniscience,
      cyoa: values.cyoa,
      cyoaChoiceBehavior: values.cyoaChoiceBehavior,
      plotProgression: values.plotProgression,
      dateMode: values.dateMode,
      immersiveHtml: values.immersiveHtml,
      immersiveHtmlInteractive: values.immersiveHtmlInteractive,
      hiddenContentReveal: values.hiddenContentReveal,
      recentBeatsKeepLast: orDefault(values.recentBeatsKeepLast, RPG_RECENT_BEATS_KEEP_DEFAULT),
      cardKeepLastX: orDefault(values.cardKeepLastX, RPG_CARD_KEEP_LAST_DEFAULT),
      extractionContext: values.extractionContext,
      extractionWindowTokens: orDefault(values.extractionWindowTokens, RPG_EXTRACTION_WINDOW_TOKENS_DEFAULT),
      reconcileEveryBeats: orDefault(values.reconcileEveryBeats, RPG_RECONCILE_EVERY_BEATS_DEFAULT),
    },
    extractionMode: values.extractionMode,
  };
}
