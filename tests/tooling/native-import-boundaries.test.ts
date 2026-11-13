import { readdirSync } from "node:fs";
import { join, posix, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { SERVER_IMPORT_HOMES, SERVER_SOURCE_ROOT } from "../../tooling/src/eslint/security-policy.ts";
import { resolvedConfig } from "./_eslint-config.ts";

type ImportCase = readonly [path: string, source: string, refusals: number];

/** Each case as linted at its path, with that path's resolved `no-restricted-imports` entry and nothing else: the refusal
 *  count in the case's own shape, so a mismatch names its row. A parse failure throws, so a refusal count never reads a broken probe. */
async function linted(repoRoot: string, cases: readonly ImportCase[]): Promise<readonly ImportCase[]> {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  const linter = new Linter({ cwd: repoRoot });
  const results: ImportCase[] = [];
  const entries = new Map<string, Linter.RuleEntry>();
  for (const [path, source] of cases) {
    const entry = entries.get(path) ?? (await resolvedConfig(eslint, path)).rules["no-restricted-imports"] ?? "off";
    entries.set(path, entry);
    const messages = linter.verify(
      source,
      {
        files: ["**/*.{ts,tsx}"],
        languageOptions: { parser: tseslint.parser },
        rules: { "no-restricted-imports": entry },
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

// One import each row refuses. Keyed by the table's ids, so a new row without a probe fails the typecheck.
const ROW_PROBES: Readonly<Record<(typeof SERVER_IMPORT_HOMES)[number]["id"], string>> = {
  "settings-table": 'import { settings } from "@orb/db";',
  "png-card-chunk": 'import { readCardChunk } from "@orb/kit/png-card-chunk";',
  "visibility-mint": 'import { mintViewerVisibility } from "../substrate/viewer-visibility-registry.ts";',
};

const isHome = (homes: readonly string[], path: string): boolean => homes.some((home) => (home.endsWith("/") ? path.startsWith(home) : path === home));

// The swept paths: a probe file in every server source directory on disk, and every file a row names as a home.
function sweptPaths(repoRoot: string): readonly string[] {
  const directories = readdirSync(join(repoRoot, SERVER_SOURCE_ROOT), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => posix.join(relative(repoRoot, entry.parentPath).replaceAll("\\", "/"), entry.name, "probe.ts"));
  const files = SERVER_IMPORT_HOMES.flatMap(({ homes }) => homes.filter((home) => !home.endsWith("/")));
  return [`${SERVER_SOURCE_ROOT}probe.ts`, ...directories, ...files];
}

// Every server path refuses every restricted import except where the table names that path as the row's home, so a
// block that drops a restriction, or lifts one outside its home, fails here whatever directory it covers.
test("every server directory refuses each restricted import unless the table names it as that import's home", async ({ repoRoot }) => {
  const paths = sweptPaths(repoRoot);
  const cases = paths.flatMap((path) => SERVER_IMPORT_HOMES.map((row): ImportCase => [path, ROW_PROBES[row.id], isHome(row.homes, path) ? 0 : 1]));
  for (const row of SERVER_IMPORT_HOMES) {
    expect(cases.filter(([path, , refusals]) => refusals === 0 && isHome(row.homes, path)).length, row.id).toBeGreaterThan(0);
  }
  expect(await linted(repoRoot, cases)).toEqual(cases);
});
