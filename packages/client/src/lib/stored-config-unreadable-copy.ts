// THE WORDS FOR "THIS ROW'S STORED CONFIG COULD NOT BE READ" (#1716) — one home, two surfaces, two causes.
//
// The server projects the read-time twin of its own write refusal onto every versioned-config read
// (`PresetDetail.configUnreadable` / `UserSettingsView.configUnreadable`, both a `VersionedParseFailure |
// null`). Before that, the user got a defaults-looking editor and, only after typing, a generic "couldn't
// save" with a Retry that could never succeed — the bytes are what they are.
//
// TWO CAUSES, NOT FOUR, AND NOT ONE. The four `VERSIONED_PARSE_FAILURES` members collapse to the two the
// reader can act on differently, and the collapse is the load-bearing part:
//
//   from-a-newer-version — `version-from-future`. The data is INTACT; this build is too old to represent
//     it (a rollback, a branch switch, an older client against a newer row). Reset-to-default here DESTROYS
//     a newer build's real data, so it is never the first door — the copy names the version, and on the
//     preset surface reset survives only as an explicitly-labelled destructive second arm.
//   corrupt — everything else. The stored blob genuinely cannot be parsed as this shape, so replacing it is
//     the repair and reset is the primary door.
//
// Naming the wrong cause is the recurring defect on this codebase's failure bands (`resolve-failure.ts`
// carries the two rulings that minted that lesson), which is why the discrimination is DERIVED from the
// server's own verdict rather than guessed from the symptom.
//
// SETTINGS AND PRESETS DIFFER IN THEIR DOORS, so the copy is per-surface rather than one shared paragraph:
// a preset is one row of a library you can also delete, re-import or fork; your settings are the singleton
// the whole app reads. Settings gained its ONE door in #1771 (`settings.resetUserConfig`) — before that it
// had none at all, because every other settings write read-merges and is correctly refused by the #471
// guard, the per-leaf "Reset to its default" writes through that same refused verb, and the backup restore
// read-merges too.

import type { VersionedParseFailure } from "@orb/contracts/versioned-config";

/** The two causes a reader can act on differently. Homed as a tuple so the union DERIVES (§5.5,
 *  `no-inline-union-redecl`). */
const UNREADABLE_CAUSES = ["from-a-newer-version", "corrupt"] as const;

export type UnreadableConfigCause = (typeof UNREADABLE_CAUSES)[number];

/** The collapse, as a TOTAL mapped Record over the contract's failure union: a fifth
 *  `VersionedParseFailure` member is a `tsc` error here, never a silently-missing arm that falls through to
 *  the wrong door (§5.5 dispatch discipline). */
const CAUSE_BY_FAILURE: Record<VersionedParseFailure, UnreadableConfigCause> = {
  "version-from-future": "from-a-newer-version",
  "not-an-object": "corrupt",
  "lift-broke-shape": "corrupt",
  "schema-rejected": "corrupt",
};

/** Which of the two stories this failure kind is. */
export function unreadableConfigCause(failure: VersionedParseFailure): UnreadableConfigCause {
  return CAUSE_BY_FAILURE[failure];
}

export interface UnreadableConfigCopy {
  /** What is true and what it costs — the band's first line. */
  readonly headline: string;
  /** What to do about it. Never offers a retry: a retry cannot succeed. */
  readonly guidance: string;
  /** Is replacing the stored blob the FIRST door, or the destructive last resort? `false` on a
   *  from-a-newer-version blob, whose data is intact and would be destroyed by the repair. */
  readonly resetIsPrimary: boolean;
}

/** The preset editor's words. Its doors are the header's Reset to default and the library's Import. */
export const PRESET_UNREADABLE_COPY: Record<UnreadableConfigCause, UnreadableConfigCopy> = {
  "from-a-newer-version": {
    headline: "This preset was saved by a newer version of Orbweaver, so this one can't read all of it.",
    guidance:
      "Nothing you change here can be saved until you're back on that version. Resetting it to the default would discard what the newer version stored.",
    resetIsPrimary: false,
  },
  corrupt: {
    headline: "This preset couldn't be read, so what you see below is the default rather than what is stored.",
    guidance: "Saving is off so your real preset isn't overwritten. Reset it to the default, or import a preset file over it.",
    resetIsPrimary: true,
  },
};

/** The settings pane's words. Its ONE door is `settings.resetUserConfig` (#1771). */
export const SETTINGS_UNREADABLE_COPY: Record<UnreadableConfigCause, UnreadableConfigCopy> = {
  "from-a-newer-version": {
    headline: "Your settings were saved by a newer version of Orbweaver, so this one can't read all of them.",
    guidance:
      "Nothing on this screen can be saved until you're back on that version. Resetting them would discard everything the newer version stored, so it is the last resort rather than the fix.",
    resetIsPrimary: false,
  },
  corrupt: {
    headline: "Your settings couldn't be read, so this screen is showing defaults rather than what is stored.",
    guidance: "Saving is off so your real settings aren't overwritten. Resetting them to the defaults is the way out — it discards what is stored.",
    resetIsPrimary: true,
  },
};
