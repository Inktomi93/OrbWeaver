// The two THEME-shaped appearance option tables — `chatStyle` and `density`. They are the one pair of
// appearance knobs a THEME can also carry (`themeSettingsSchema`/the character theme override), so three
// different features must render the same labels: chat's Message-style settings section, app-shell's
// Sizing & motion section, and the settings feature's theme editor.
//
// Homed at the `#lib` util floor (tier 4) rather than in any one of them: SET-SEAMS stage 1 split the
// appearance pane into sections owned by their READERS, and a table three features render can have no
// feature owner — `client-features-no-cross` forbids the sideways import, and `#lib` is the sanctioned
// shared-vocabulary home (the `message-role-labels` / `BACKGROUND_KIND_LABELS` precedent). Each `value` is
// pinned to its AppearanceSettings field union via a total `Record`, so a typo'd value is a tsc error, not
// a silently-unselectable option.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { THEME_CHAT_STYLES, THEME_DENSITIES } from "@orb/contracts/theme";
import type { SelectItems } from "@orb/ui/select";

const CHAT_STYLE_LABELS: Record<AppearanceSettings["chatStyle"], string> = {
  bubble: "Bubble",
  flat: "Flat",
  document: "Document",
  echo: "Echo (bled portrait)",
  whisper: "Whisper (avatar banner)",
  hush: "Hush (flat + speaker stripe)",
  ripple: "Ripple (VN sticky portrait)",
  tide: "Tide (paragraph bubbles)",
};
export const CHAT_STYLE_ITEMS: SelectItems<string> = THEME_CHAT_STYLES.map((value) => ({
  value,
  label: CHAT_STYLE_LABELS[value],
}));

const DENSITY_LABELS: Record<AppearanceSettings["density"], string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};
export const DENSITY_ITEMS: SelectItems<string> = THEME_DENSITIES.map((value) => ({
  value,
  label: DENSITY_LABELS[value],
}));
