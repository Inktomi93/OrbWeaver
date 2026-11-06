// The committed token outputs match a fresh run of tokens:build, so a token or theme edit cannot land without its regen.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node";
import { generateArtifacts } from "@orb/ui/tokens-build";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const UI_ROOT = join(REPO_ROOT, "packages/ui");
const committed = (relative: string): string => readFileSync(join(REPO_ROOT, relative), "utf8");

test("theme.css, tokens/index.ts and themes.gen.ts are what tokens:build generates", async () => {
  const fresh = await generateArtifacts(UI_ROOT);
  expect(committed("packages/ui/src/styles/theme.css")).toBe(fresh.themeCss);
  expect(committed("packages/ui/src/tokens/index.ts")).toBe(fresh.tokensTs);
  expect(committed("packages/ui/src/tokens/themes.gen.ts")).toBe(fresh.themesTs);
});
