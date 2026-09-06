// The FOUR reads the #1742 Regex section makes, fed with the room's quietest true state (#1788).
//
// WHY A SHARED HELPER RATHER THAN A FOURTH COPY: the section is grafted into the "This chat" tab, and its
// HEADING CHIP reads `chat.listEffectiveRegex` through a plain `useQuery` that sits OUTSIDE every
// disclosure — so the read fires on any mount that reaches the tab, whether or not a test ever opens the
// section. A spec that mounts the rail for an unrelated reason (plugin anchors #1786, the rpg context rail
// #1788) therefore takes the section's error arm and loses the whole host band, which is a failure with no
// visible connection to regex at all. Three specs paid for that in three days; this is the one place the
// fifth read gets added when the section grows one.
//
// OFF-AND-EMPTY ON PURPOSE. A populated projection (the kind `settings-context-tab.ct.tsx` builds for its
// own subject) would put script rows and rank numerals inside a band that other specs COUNT HEADINGS and
// measure geometry in. `enabled: false` with no tiers is the contract's own documented quiet state
// (`EffectiveRegexView.enabled` — "with it off, `effective` is empty and every row's `runsAt` is null"), so
// a consumer that reads it renders the section's real `off` arm rather than a half-shaped view.
//
// TYPED AGAINST THE CONTRACT, not hand-shaped: a wire change to `EffectiveRegexView` reds HERE instead of
// silently serving a stale object shape to every borrower (the `userSettingsView` lesson, #1014/#1017).

import type { EffectiveRegexView } from "@orb/contracts/chat";

const OFF_AND_EMPTY: EffectiveRegexView = { enabled: false, tiers: [], effective: [] };

/** Spread into a `routeTrpc` map by any CT that mounts the "This chat" tab for a reason of its own.
 *  `regex.listScripts` and `listRoomDisplayScripts` are the `On screen` roster's pair — empty, so the
 *  roster draws its own empty state instead of an error. */
export const REGEX_READS_EMPTY = {
  "chat.listEffectiveRegex": (): EffectiveRegexView => OFF_AND_EMPTY,
  "regex.listForChat": (): readonly never[] => [],
  "regex.listScripts": (): readonly never[] => [],
  "regex.listRoomDisplayScripts": (): readonly never[] => [],
} as const;
