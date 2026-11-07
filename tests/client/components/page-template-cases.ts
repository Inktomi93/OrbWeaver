import { THEME_DENSITIES } from "@orb/contracts/theme";
import type { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import { SEED_THEME_NAMES } from "@orb/ui/tokens";

export type TemplateSeed = keyof typeof SEED_THEME_VALUE_SETS;

/** Every seed palette plus the unthemed root, each at every density: the matrix a page template must hold across. */
export const TEMPLATE_CASES = [undefined, ...SEED_THEME_NAMES].flatMap((theme) =>
  THEME_DENSITIES.map((density) => ({ caseId: `${theme ?? "root"}-${density}`, theme, density })),
);
