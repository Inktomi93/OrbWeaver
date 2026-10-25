// The committed generated files match a fresh run of their generators, so a token or source edit cannot land without its regen.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { generateArtifacts } from "@orb/ui/tokens-build";
import { APPEARANCE_CHANNEL_PATHS, renderAppearanceChannelCss } from "../../packages/client/appearance-channel.build.ts";
import { OWNER_CSS_SURFACE_PATHS, readOwnerCssSources, renderOwnerCssSurface } from "../../packages/client/owner-css-surface.build.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const UI_ROOT = join(REPO_ROOT, "packages/ui");
const committed = (relative: string): string => readFileSync(join(REPO_ROOT, relative), "utf8");

test("theme.css, tokens/index.ts and themes.gen.ts are what tokens:build generates", async () => {
  const fresh = await generateArtifacts(UI_ROOT);
  expect(committed("packages/ui/src/styles/theme.css")).toBe(fresh.themeCss);
  expect(committed("packages/ui/src/tokens/index.ts")).toBe(fresh.tokensTs);
  expect(committed("packages/ui/src/tokens/themes.gen.ts")).toBe(fresh.themesTs);
});

test("owner-css-surface.ts is what surface:build generates", () => {
  expect(committed(OWNER_CSS_SURFACE_PATHS.manifest)).toBe(renderOwnerCssSurface(readOwnerCssSources(REPO_ROOT)));
});

test("appearance-channel.gen.css is what appearance:build generates", () => {
  expect(committed(APPEARANCE_CHANNEL_PATHS.css)).toBe(renderAppearanceChannelCss());
});
