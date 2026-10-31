import { THEME_DENSITIES } from "@orb/contracts/theme";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";

export type TemplateSeed = keyof typeof SEED_THEME_VALUE_SETS;

/** Every seed palette plus the unthemed root, each at every density: the matrix a page template must hold across. */
export const TEMPLATE_CASES = [undefined, ...(Object.keys(SEED_THEME_VALUE_SETS) as TemplateSeed[])].flatMap((theme) =>
  THEME_DENSITIES.map((density) => ({ caseId: `${theme ?? "root"}-${density}`, theme, density })),
);
