// orb/no-history-comments flags history in source comments; existing hits sit in a per-file baseline that only shrinks.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import BASELINE from "../../tooling/src/eslint/history-comment-baseline.json" with { type: "json" };

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-history-comments";
// No baseline entry: every hit reports.
const UNLISTED = "packages/server/src/domain/hub/history-probe.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });
const baseline: Readonly<Record<string, number>> = BASELINE;

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, UNLISTED));
}, 120_000);

async function findings(source: string, path = UNLISTED): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

test.for([
  ["an issue number", "// The row wraps at the edge (#1789).", "#1789"],
  ["a review date", "/* Hidden at rest (side-eye 2026-08-19 P2). */", "side-eye 2026-08-19"],
  ["a bare ISO date", "// Measured 2026-09-19 on the sizing pane.", "2026-09-19"],
  ["a ticket id", "// The HUD claims the context column (HUD-1).", "HUD-1"],
  ["used to", "// The id used to land on the popup.", "used to"],
  ["formerly", "// The fields formerly carried in residual data.", "formerly"],
  ["the old", "// The old wording claimed a section.", "The old"],
  ["previously", "// The handle was previously discarded.", "previously"],
  ["load-bearing", "/** This guard is load-bearing. */", "load-bearing"],
] as const)("flags %s at its span", async ([, comment, span]) => {
  const source = `${comment}\nexport const value = 1;\n`;
  const found = await findings(source);
  expect(found).toHaveLength(1);
  const [first] = found;
  const line = source.split("\n")[(first?.line ?? 1) - 1] ?? "";
  expect(line.slice((first?.column ?? 1) - 1, (first?.endColumn ?? 1) - 1)).toBe(span);
});

test.for([
  ["a D-number and a law section", "// The order is the assembly's own (D257, Spine-Testing §4.2)."],
  ["standard names shaped like tickets", "// UTF-8 bytes hashed with SHA-256; TEST-NET-1 is documentation space."],
  ["a passive used to", "// The key is used to sign the cookie, and is never used to build the target."],
  ["a compound previously", "// Insert after the last previously-seen key."],
  ["an ordinal, a hex colour and a url anchor", "// Step #2 paints #000 and links docs#12."],
  ["history-shaped text outside a comment", 'export const label = "#1789 used to be load-bearing";'],
] as const)("passes %s", async ([, source]) => {
  expect(await findings(`${source}\nexport const value = 1;\n`)).toEqual([]);
});

test("a baselined file passes at its count and reports every hit above it", async () => {
  const [path, count] = Object.entries(baseline).find(([file]) => file.endsWith(".ts")) ?? ["", 0];
  const lines = (n: number): string =>
    `${Array.from({ length: n }, (_, index) => `// Fixed by #${String(1000 + index)}.`).join("\n")}\nexport const value = 1;\n`;
  expect(await findings(lines(count), path)).toEqual([]);
  expect(await findings(lines(count + 1), path)).toHaveLength(count + 1);
});

// The ratchet: every population file's count equals its baseline entry, so a grown count, a new file and an
// unrecorded shrink all fail here. A file at zero has no entry.
test("the baseline is the tree's exact per-file count", async () => {
  const population = execFileSync("git", ["ls-files", "packages/**/*.ts", "packages/**/*.tsx", "tooling/**/*.ts", "tooling/**/*.tsx"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  const actual: Record<string, number> = {};
  for (const path of population) {
    if (await eslint.isPathIgnored(join(ROOT, path))) {
      continue;
    }
    const counted = await findings(
      readFileSync(join(ROOT, path), "utf8"),
      path.endsWith(".tsx") ? "packages/server/src/domain/hub/history-probe.tsx" : UNLISTED,
    );
    if (counted.length > 0) {
      actual[path] = counted.length;
    }
  }
  // Only the drifted entries, as `{ path: [baseline, actual] }`, so a failure names its files.
  const drift = Object.fromEntries(
    [...new Set([...Object.keys(baseline), ...Object.keys(actual)])]
      .filter((path) => baseline[path] !== actual[path])
      .map((path) => [path, [baseline[path] ?? 0, actual[path] ?? 0]]),
  );
  expect(drift, "Rewrite the new history, or set the file's entry in tooling/src/eslint/history-comment-baseline.json to its lower count").toEqual({});
}, 600_000);
