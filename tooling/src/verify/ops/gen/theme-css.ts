// The baseline door writes the same bytes as @orb/ui tokens:build. No second token emitter or census.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { generateArtifacts } from "@orb/ui/tokens-build";
import { THEME, UI_PACKAGE_ROOT } from "../../contract/css-family.ts";

export const THEME_BASELINE = "theme-css";
export const THEME_REGEN = `pnpm exec node tooling/src/verify/cli.ts baseline ${THEME_BASELINE}`;

refuseDirectInvocation(import.meta.url, THEME_REGEN);

export async function deriveThemeCss(root: string): Promise<string> {
  return (await generateArtifacts(join(root, UI_PACKAGE_ROOT))).themeCss;
}

export async function generateThemeCss(root: string): Promise<number> {
  writeFileSync(join(root, THEME), await deriveThemeCss(root));
  return 0;
}
