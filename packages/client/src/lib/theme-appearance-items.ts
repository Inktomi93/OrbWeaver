// The `density` appearance option table — the one appearance knob a THEME can also carry (it is live on a
// theme the viewer SELECTED; it is viewer-sacred from a card, TD §3). THREE features render the same
// labels: app-shell's Sizing & motion section, the settings feature's theme editor, and — through the
// appearance blob — the shell grid that reads the resolved value.
//
// Homed at the `#lib` util floor (tier 4) rather than in any one of them: SET-SEAMS stage 1 split the
// appearance pane into sections owned by their READERS, and a table three features render can have no
// feature owner — `client-features-no-cross` forbids the sideways import, and `#lib` is the sanctioned
// shared-vocabulary home (the `message-role-labels` / `BACKGROUND_KIND_LABELS` precedent). Its `value` is
// pinned to the AppearanceSettings field union via a total `Record`, so a typo'd value is a tsc error, not
// a silently-unselectable option. (`CHAT_STYLE_ITEMS` lived here too until its third reader — the theme
// editor's Message-style select — was struck as a dead switch; it re-homed with chat, its one reader.)

import type { AppearanceSettings } from "@orb/contracts/settings";
import { THEME_DENSITIES } from "@orb/contracts/theme";
import type { SelectItems } from "@orb/ui/select";

const DENSITY_LABELS: Record<AppearanceSettings["density"], string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};
export const DENSITY_ITEMS: SelectItems<string> = THEME_DENSITIES.map((value) => ({
  value,
  label: DENSITY_LABELS[value],
}));
