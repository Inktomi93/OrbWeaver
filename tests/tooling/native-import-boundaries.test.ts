import { readdirSync } from "node:fs";
import { join, posix, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import eslintConfig from "../../eslint.config.ts";
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
  // The rule reads the import and its options, never the file name, so one verdict serves every path with the same entry.
  const verdicts = new Map<string, number>();
  for (const [path, source] of cases) {
    const entry = entries.get(path) ?? (await resolvedConfig(eslint, path)).rules["no-restricted-imports"] ?? "off";
    entries.set(path, entry);
    const key = JSON.stringify([entry, source]);
    const refusals = verdicts.get(key) ?? refusalsOf(linter, path, source, entry);
    verdicts.set(key, refusals);
    results.push([path, source, refusals]);
  }
  return results;
}

function refusalsOf(linter: Linter, path: string, source: string, entry: Linter.RuleEntry): number {
  const messages = linter.verify(
    source,
    { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tseslint.parser }, rules: { "no-restricted-imports": entry } },
    { filename: path },
  );
  const fatal = messages.find((message) => message.fatal === true);
  if (fatal !== undefined) {
    throw new Error(`${path}: ${fatal.message}`);
  }
  return messages.filter(({ ruleId }) => ruleId === "no-restricted-imports").length;
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
  "secure-headers": 'import { secureHeaders } from "hono/secure-headers";',
};

const isHome = (homes: readonly string[], path: string): boolean => homes.some((home) => (home.endsWith("/") ? path.startsWith(home) : path === home));

// Every pattern by which a block that sets the rule, or an ignore-only block, can tell server paths apart. It is read
// from the composed config, so a new block is swept with no list to update.
const BLOCKS: readonly Pick<Linter.Config, "files" | "ignores" | "rules">[] = eslintConfig;
const PATTERNS = BLOCKS.filter(
  (block) => block.rules?.["no-restricted-imports"] !== undefined || (block.files === undefined && block.rules === undefined),
).flatMap((block) => [...(block.files ?? []).flat(), ...(block.ignores ?? [])]);

// The swept paths: a probe in every server source directory, and every server file some pattern matches otherwise than
// it matches its directory's probe. Only those patterns decide the rule's entry, so a file no pattern tells from its
// directory's probe resolves the probe's entry, and the probe judges it. Node's glob matcher is minimatch, as ESLint's
// is, and no server path carries a dot segment, where their options would differ.
function sweptPaths(repoRoot: string): readonly string[] {
  const entries = readdirSync(join(repoRoot, SERVER_SOURCE_ROOT), { recursive: true, withFileTypes: true });
  const pathOf = (entry: (typeof entries)[number], name: string): string => posix.join(relative(repoRoot, entry.parentPath).replaceAll("\\", "/"), name);
  const files = entries.filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name)).map((entry) => pathOf(entry, entry.name));
  const probes = entries.filter((entry) => entry.isDirectory()).map((entry) => posix.join(pathOf(entry, entry.name), "probe.ts"));
  const singledOut = files.filter((file) => {
    const probe = posix.join(posix.dirname(file), "probe.ts");
    return PATTERNS.some((pattern) => posix.matchesGlob(file, pattern) !== posix.matchesGlob(probe, pattern));
  });
  return [`${SERVER_SOURCE_ROOT}probe.ts`, ...probes, ...singledOut];
}

// Every server path refuses every restricted import except where the table names that path as the row's home, so a
// block that drops a restriction, or lifts one outside its home, fails here whatever file or directory it covers.
test("every server file and directory refuses each restricted import unless the table names it as that import's home", async ({ repoRoot }) => {
  const paths = sweptPaths(repoRoot);
  for (const home of SERVER_IMPORT_HOMES.flatMap(({ homes }) => homes.filter((path) => !path.endsWith("/")))) {
    expect(paths, home).toContain(home);
  }
  const cases = paths.flatMap((path) => SERVER_IMPORT_HOMES.map((row): ImportCase => [path, ROW_PROBES[row.id], isHome(row.homes, path) ? 0 : 1]));
  for (const row of SERVER_IMPORT_HOMES) {
    expect(cases.filter(([path, , refusals]) => refusals === 0 && isHome(row.homes, path)).length, row.id).toBeGreaterThan(0);
  }
  expect(await linted(repoRoot, cases)).toEqual(cases);
});
