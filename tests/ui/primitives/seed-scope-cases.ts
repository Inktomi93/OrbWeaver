import { SEED_THEME_NAMES } from "@orb/ui/tokens";
import { MID_GREY } from "../content/theme-scope/contrast-cases.ts";

/** Every shipped seed and a custom mid-grey scope nested in the light seed: the scopes a primitive's CT reads its paint under. */
export const SEED_CASES = [
  { name: "hearth seed" },
  ...SEED_THEME_NAMES.map((theme) => ({ name: `${theme} seed`, theme })),
  { name: "custom mid-grey scope nested in the light seed", theme: "light" as const, background: MID_GREY },
] as const;
