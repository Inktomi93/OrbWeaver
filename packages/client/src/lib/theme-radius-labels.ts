// The ONE `ThemeRadius` display-label map: the theme editor and the character appearance tab both name the
// radius steps. Features can't import each other; `lib/` sits below every feature, so this is the shared home.

import type { ThemeRadius } from "@orb/contracts/theme";

export const THEME_RADIUS_LABELS: Record<ThemeRadius, string> = {
  base: "Base",
  control: "Tight",
  card: "Card",
  full: "Round",
};
