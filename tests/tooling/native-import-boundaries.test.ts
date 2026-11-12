import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { resolvedConfig } from "./_eslint-config.ts";

type ImportCase = readonly [path: string, source: string, refusals: number];

/** Each case as linted at its path, with that path's resolved `no-restricted-imports` entry and nothing else: the refusal
 *  count in the case's own shape, so a mismatch names its row. A parse failure throws, so a refusal count never reads a broken probe. */
async function linted(repoRoot: string, cases: readonly ImportCase[]): Promise<readonly ImportCase[]> {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  const linter = new Linter({ cwd: repoRoot });
  const results: ImportCase[] = [];
  for (const [path, source] of cases) {
    const config = await resolvedConfig(eslint, path);
    const messages = linter.verify(
      source,
      {
        files: ["**/*.{ts,tsx}"],
        languageOptions: { parser: tseslint.parser },
        rules: { "no-restricted-imports": config.rules["no-restricted-imports"] ?? "off" },
      },
      { filename: path },
    );
    const fatal = messages.find((message) => message.fatal === true);
    if (fatal !== undefined) {
      throw new Error(`${path}: ${fatal.message}`);
    }
    results.push([path, source, messages.filter(({ ruleId }) => ruleId === "no-restricted-imports").length]);
  }
  return results;
}

test("the configured PNG import restriction preserves aliases, nested doors and sanctioned homes", async ({ repoRoot }) => {
  const cases: readonly ImportCase[] = [
    ["packages/server/src/domain/character/probe.ts", 'import { readCardChunk } from "@orb/kit/png-card-chunk";', 1],
    ["packages/server/src/domain/character/alias.ts", 'import { readCardChunk as read } from "@orb/kit/png-card-chunk";', 1],
    ["packages/server/src/domain/character/nested.ts", 'import { isPng } from "@orb/kit/png-card-chunk/nested";', 1],
    ["packages/server/src/domain/character/namespace.ts", 'import * as chunk from "@orb/kit/png-card-chunk";', 1],
    ["packages/server/src/domain/character/barrel.ts", 'export { writeCardChunk } from "@orb/kit/png-card-chunk";', 1],
    ["packages/server/src/domain/character/other-symbol.ts", 'import { encodeCard } from "@orb/kit/png-card-chunk";', 0],
    ["packages/server/src/domain/character/other-door.ts", 'import { readCardChunk } from "@orb/kit/other-engine";', 0],
    ["packages/server/src/domain/import/substrate/probe.ts", 'import { readCardChunk } from "@orb/kit/png-card-chunk";', 0],
    ["packages/server/src/domain/export/verbs/probe.ts", 'import { writeCardChunk } from "@orb/kit/png-card-chunk";', 0],
    ["packages/client/src/features/character/probe.ts", 'import { readCardChunk } from "@orb/kit/png-card-chunk";', 0],
  ];
  expect(await linted(repoRoot, cases)).toEqual(cases);
});

const MINT_IMPORT = 'import { mintViewerVisibility } from "../../chat/substrate/viewer-visibility-registry.ts";';
const SETTINGS_IMPORT = 'import { settings } from "@orb/db";';
const PNG_IMPORT = 'import { readCardChunk } from "@orb/kit/png-card-chunk";';
const MINT_HOME = "packages/server/src/domain/chat/verbs/resolve-viewer-visibility.ts";

// A home block lifts only the restriction on the door its home owns; every other server restriction still applies there.
test("every server block refuses the visibility minter, and each home lifts only its own door", async ({ repoRoot }) => {
  const cases: readonly ImportCase[] = [
    ["packages/server/src/domain/rpg/verbs/probe.ts", MINT_IMPORT, 1],
    ["packages/server/src/domain/import/substrate/probe.ts", MINT_IMPORT, 1],
    ["packages/server/src/domain/export/verbs/probe.ts", MINT_IMPORT, 1],
    ["packages/server/src/domain/settings/verbs/probe.ts", MINT_IMPORT, 1],
    [MINT_HOME, 'import { mintViewerVisibility } from "../substrate/viewer-visibility-registry.ts";', 0],
    ["packages/server/src/domain/import/substrate/probe.ts", SETTINGS_IMPORT, 1],
    ["packages/server/src/domain/export/verbs/probe.ts", SETTINGS_IMPORT, 1],
    ["packages/server/src/domain/settings/verbs/probe.ts", SETTINGS_IMPORT, 0],
    ["packages/server/src/domain/settings/verbs/probe.ts", PNG_IMPORT, 1],
    [MINT_HOME, SETTINGS_IMPORT, 1],
    [MINT_HOME, PNG_IMPORT, 1],
  ];
  expect(await linted(repoRoot, cases)).toEqual(cases);
});
