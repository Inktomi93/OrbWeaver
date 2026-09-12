import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import process from "node:process";
import type { CompilerProgram } from "@orb/tooling/verify";
import { ESLint } from "eslint";
import { eslintConfiguredPaths } from "../../../../tooling/src/verify/ops/config-snapshot.ts";
import { DISCOVERY_MAX_BUFFER_BYTES, parsedDiscovery, partitionEslintFiles, readDiscoveredPopulation } from "../../../../tooling/src/verify/ops/eslint.ts";
import { discoverEslintFiles } from "../../../../tooling/src/verify/ops/eslint-discovery.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// LOAD-HONEST BUDGETS: both #2212 arms shell the REAL discovery child, so vitest's 5s default is a
// statement about the box rather than about the code (measured: the ceiling arm ran 2.7s solo and 8.8s
// under a live barrier). The ceiling arm drives four child runs; the measurement arm enumerates the
// whole repository in-process.
const CEILING_BUDGET = scaledBudget(90_000, 4);
const MEASURE_BUDGET = scaledBudget(120_000, 4);

function program(id: string, files: readonly string[]): CompilerProgram {
  return { id, config: id, files, references: [], configPaths: [id], commandLine: {} as CompilerProgram["commandLine"] };
}

test("discovery filenames equal native dot semantics across ignored, untracked, dotfile, and symlink arms", async () => {
  const root = mkdtempSync(join(tmpdir(), "orb-eslint-discovery-"));
  try {
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(root, ".gitignore"), "gitignored.js\n");
    writeFileSync(join(root, "eslint.config.js"), 'export default [{ ignores: ["ignored/**"] }, { files: ["**/*.{js,ts}"] }];\n');
    writeFileSync(join(root, ".hidden.js"), "export const hidden = true;\n");
    writeFileSync(join(root, "gitignored.js"), "export const ignoredByGitOnly = true;\n");
    writeFileSync(join(root, "untracked.ts"), "export const untracked = true;\n");
    writeFileSync(join(root, "target.js"), "export const target = true;\n");
    mkdirSync(join(root, "ignored"));
    writeFileSync(join(root, "ignored", "excluded.js"), "throw new Error();\n");
    symlinkSync("target.js", join(root, "linked.js"));

    const native = await new ESLint({ cwd: root }).lintFiles(["."]);
    const nativePaths = native.map(({ filePath }) => relative(root, filePath).split(sep).join("/")).toSorted();
    const discovered = await discoverEslintFiles(root);
    expect(discovered).toEqual(nativePaths);
    expect(await eslintConfiguredPaths(root, "eslint.config.js", [...discovered, "ignored/excluded.js"])).toEqual(discovered);
    expect(discovered).toEqual(expect.arrayContaining([".hidden.js", "gitignored.js", "untracked.ts", "target.js"]));
    expect(discovered).not.toContain("ignored/excluded.js");
    expect(discovered.includes("linked.js")).toBe(nativePaths.includes("linked.js"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovery refuses a malformed native config instead of emitting an empty population", async () => {
  const root = mkdtempSync(join(tmpdir(), "orb-eslint-discovery-broken-"));
  try {
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(root, "eslint.config.js"), "export default [{ files: [ ;\n");
    await expect(discoverEslintFiles(root)).rejects.toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("partition uses one native compiler owner, keeps untyped residuals, and refuses unowned typed files", () => {
  const programs = [program("tsconfig.json", ["root.ts"]), program("packages/ui/tsconfig.json", ["packages/ui/src/x.ts"])] as const;
  expect(Object.fromEntries(partitionEslintFiles(["root.ts", "packages/ui/src/x.ts", "tool.js"], programs))).toEqual({
    "<untyped>": ["tool.js"],
    "packages/ui/tsconfig.json": ["packages/ui/src/x.ts"],
    "tsconfig.json": ["root.ts"],
  });
  expect(() => partitionEslintFiles(["missing.ts"], programs)).toThrow("no native compiler owner");
  expect(() => partitionEslintFiles([], programs)).toThrow("empty population");
  expect(() => partitionEslintFiles(["root.ts", "root.ts"], programs)).toThrow("duplicate file identities");
});
/** A minimal root the discovery child can actually enumerate: its own config, a package manifest, and three
 *  admitted files. Small on purpose — the ceiling arm below must blow a TINY ceiling, not a real one. */
function discoveryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "orb-eslint-ceiling-"));
  writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(root, "eslint.config.js"), 'export default [{ files: ["**/*.{js,ts}"] }];\n');
  for (const name of ["a.js", "b.js", "c.ts"]) {
    writeFileSync(join(root, name), "export const x = true;\n");
  }
  return root;
}

test("the discovery population is COMPLETE, not merely delivered — the child's own count is checked (#2212)", { timeout: CEILING_BUDGET }, async () => {
  const root = discoveryRoot();
  try {
    // THE COMPLETION CONTROL. #2211 replaced a KILLED child with a raised ceiling; the failure that fix must
    // not introduce is a SILENTLY TRUNCATED list, and "the call returned" cannot tell those two apart. So the
    // child states the count it enumerated and the reader checks the delivered list against it.
    const delivered = readDiscoveredPopulation(root);
    expect([...delivered].toSorted()).toEqual([...(await discoverEslintFiles(root))].toSorted());
    expect(delivered.length).toBeGreaterThan(0);

    // …and the check BITES: a well-formed envelope whose list is one row short is refused BY NAME, not
    // accepted as a shorter population. This is the arm that separates a completion control from a
    // did-not-throw control, so it is asserted on the message an operator would actually read.
    const short = JSON.stringify({ count: delivered.length, files: delivered.slice(0, -1) });
    expect(() => parsedDiscovery(short)).toThrow("TRUNCATED in transit");
    expect(() => parsedDiscovery(JSON.stringify({ files: delivered }))).toThrow("no usable population count");
    expect(() => parsedDiscovery(JSON.stringify(delivered))).toThrow("malformed population envelope");
    // The honest pair: the exact envelope the child emits must PASS, or the control above proves only that
    // the reader is strict, never that the producer satisfies it.
    expect(parsedDiscovery(JSON.stringify({ count: delivered.length, files: delivered }))).toEqual(delivered);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a blown stdout ceiling refuses LOUDLY and names the site, rather than returning a short list (#2212)", { timeout: CEILING_BUDGET }, () => {
  const root = discoveryRoot();
  try {
    // THE PLANTED CEILING ARM. A fuse nobody has watched blow is a fuse nobody knows is wired: the 64MiB
    // constant is driven down to a few bytes so the ENOBUFS path EXECUTES here, every run. node's own error
    // says "spawnSync nice ENOBUFS", which names the wrapper and not the population that outgrew it — #2211
    // cost a barrier tail plus a stack frame to attribute, so the door's translation is what is asserted.
    expect(() => readDiscoveredPopulation(root, 8)).toThrow("ESLint discovery outgrew its 8-byte stdout ceiling");
    expect(() => readDiscoveredPopulation(root, 8)).toThrow("tooling/src/verify/ops/eslint.ts");
    expect(() => readDiscoveredPopulation(root, 8)).toThrow("NO lint verdict exists for this run");
    // The counterfactual, so the arm above cannot pass by the door simply always throwing: the SAME call with
    // the real ceiling enumerates the same root cleanly.
    expect(readDiscoveredPopulation(root).length).toBeGreaterThan(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
/** The repository this checkout is, and WHICH KIND it is. A worktree's `.git` is a FILE; the main
 *  checkout's is a DIRECTORY. The distinction is load-bearing below and nowhere else in this suite. */
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
function isMainCheckout(): boolean {
  try {
    return statSync(join(REPO_ROOT, ".git")).isDirectory();
  } catch {
    return false;
  }
}

/** node's own default capture ceiling — the one #2211's payload outgrew. Not the door's ceiling (64MiB);
 *  this is the line the ORIGINAL failure crossed, and the only reason the door has to name one at all. */
const DEFAULT_CEILING_BYTES = 1024 * 1024;

/** THE RECORDED MEASUREMENTS, so a shrink is a CHANGED NUMBER rather than a quietly passing test:
 *   • WORKTREE, 2026-09-12: 441,978 bytes across 7,695 files — comfortably UNDER node's 1MiB default, which
 *     is why claude-b's verifier could not reproduce #2211's ENOBUFS in its own worktree at all;
 *   • MAIN, 2026-09-12: over 1,048,576 bytes, measured by the FAILURE ITSELF — `execFileSync` killed the child
 *     with ENOBUFS at a 1MiB buffer (`5ee1149a9`), and a buffer overflow IS a measurement that the payload
 *     exceeded it. A re-measurement of main's checkout from this lane was attempted and abandoned after ten
 *     minutes under a live barrier; the assertion below therefore first EXECUTES when this lands on main.
 *     If it reds there, that red is the finding this row asked for: the premise moved. */
const RECORDED_WORKTREE_BYTES = 441_978;

test("the discovery payload is MEASURED against the ceilings, and the number is recorded (#2212)", { timeout: MEASURE_BUDGET }, async () => {
  // WHY THIS ARM EXISTS AND WHAT IT DOES NOT PROMISE. #2211 was a KILLED discovery child: the payload had
  // outgrown node's ~1MiB default. A control that depends on THAT condition is CHECKOUT-DEPENDENT —
  // claude-b's verifier could not reproduce the overflow in its own worktree, where the admitted population
  // measured ~442 KB, well under the default. A worktree admits fewer files than main, so an arm asserting
  // "the payload exceeds 1MiB" would be green there for a reason that has nothing to do with the fix.
  //
  // So this arm MEASURES and RECORDS rather than assuming, and it states its own two claims separately:
  //   • CHECKOUT-INDEPENDENT: the payload must fit the ceiling the door actually passes (64MiB). That is
  //     the fuse the production run depends on, and it reds anywhere the population outgrows it.
  //   • CHECKOUT-DEPENDENT: on MAIN the payload is expected to exceed the 1MiB default — the #2211
  //     condition itself. Asserted only there, because a worktree is a different population, and the size
  //     is PRINTED either way so a shrink below the default shows up as a CHANGED NUMBER rather than as a
  //     test that quietly stopped exercising its subject.
  // The deterministic arm below (an 8-byte ceiling) is the one that needs no checkout at all.
  const files = await discoverEslintFiles(REPO_ROOT);
  const bytes = Buffer.byteLength(JSON.stringify({ count: files.length, files }), "utf8");
  process.stderr.write(
    `[#2212] discovery payload: ${String(bytes)} bytes across ${String(files.length)} files (${isMainCheckout() ? "MAIN" : "worktree"} checkout)\n`,
  );

  expect(files.length).toBeGreaterThan(0);
  // CHECKOUT-INDEPENDENT: the payload must fit the ceiling the production door actually passes. This is the
  // fuse every `lint:eslint` run depends on, and it reds in ANY checkout whose population outgrows 64MiB.
  expect(bytes).toBeLessThan(DISCOVERY_MAX_BUFFER_BYTES);
  // The recorded worktree figure is carried as a CONSTANT so a reader can see at a glance how far today's
  // number has moved; it is deliberately not asserted (a worktree's population is whatever its branch
  // holds), and `RECORDED_WORKTREE_BYTES` is printed beside the live one for exactly that comparison.
  process.stderr.write(`[#2212] recorded worktree baseline: ${String(RECORDED_WORKTREE_BYTES)} bytes (2026-09-12)\n`);
  // CHECKOUT-DEPENDENT, expressed as a THRESHOLD rather than a conditional assertion: on main the payload
  // must still exceed node's 1MiB default (#2211's premise — the reason the door names its own ceiling at
  // all); in a worktree the population is a different, smaller set, so the only honest floor is that a
  // payload exists. One assertion either way, so the arm cannot silently stop asserting.
  const premiseFloorBytes = isMainCheckout() ? DEFAULT_CEILING_BYTES : 0;
  expect(
    bytes,
    `the discovery payload (${String(bytes)} bytes) fell below the floor for this checkout — on main that means #2211's PREMISE HAS MOVED: the population no longer overflows node's 1MiB default, so re-derive whether the named ceiling is still load-bearing`,
  ).toBeGreaterThan(premiseFloorBytes);
});

// ─── #2213: a NESTED tool cache is a derived artifact too ────────────────────────────────────────────
//
// THE INCIDENT. `lint:eslint`'s first whole-repo verdict after #2211 fixed its ENOBUFS discovery came back
// exit 1 with 117 errors — and 106 of them were in `playwright/.cache/assets/*.js`, the MINIFIED Playwright
// component-test bundles. That directory is gitignored and carries zero tracked files, so those errors were
// reported against source that does not exist in the repository. Five of them were read as
// `react-hooks/rules-of-hooks` violations (a rule about call ORDER, i.e. real runtime misbehaviour) and
// routed as a correctness fix; every one was actually `Definition for rule … was not found` — an
// unknown-rule REFERENCE inside a bundled `eslint-disable` comment that React ships in its own source.
//
// THE CAUSE IS ONE MISSING PREFIX. `eslint.config.js` ignores `".cache/**"` while its siblings in the same
// array are `"**/node_modules/**"` and `"**/dist/**"`. Without the `**/` the pattern is anchored at the
// config's directory, so it covers the ROOT cache and misses every nested one — and the row's own comment
// states the intent it failed to implement: "Local tool caches are derived scratch artifacts, never
// authored inputs."
//
// WHY THIS IS PINNED AGAINST THE REAL CONFIG rather than a synthetic one: the defect was IN the real
// config's pattern, and a fixture would have reproduced whatever pattern the fixture author wrote. The
// negative controls are what stop this from passing vacuously — an over-broad ignore that swallowed the
// authored trees would satisfy the subject assertion while blinding the whole stage, which is a far worse
// failure than the one being fixed.
test("a nested tool cache is IGNORED while authored sources stay linted (#2213)", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const ignored = async (rel: string): Promise<boolean> => eslint.isPathIgnored(join(repoRoot, rel));

  // THE SUBJECT: the nested cache that supplied 106 of 117 errors, five of them read as hook-order bugs.
  expect(await ignored("playwright/.cache/assets/index-C2Y8FrOW.js"), "playwright/.cache is a build cache, not authored input").toBe(true);
  // The root cache — the pattern's literal reading, which already worked and must keep working.
  expect(await ignored(".cache/anything.js")).toBe(true);
  // A `**/`-prefixed sibling row, proving the prefix is the house spelling for depth-independence.
  expect(await ignored("packages/ui/node_modules/x.js")).toBe(true);

  // NEGATIVE CONTROLS — an ignore that reaches authored code would blind the stage far worse than the
  // defect it fixes, and `isPathIgnored` returning `true` for everything would satisfy the arms above.
  expect(await ignored("packages/client/src/main.tsx"), "authored client source must stay linted").toBe(false);
  expect(await ignored("packages/ui/src/index.ts"), "authored ui source must stay linted").toBe(false);
  expect(await ignored("tooling/src/verify/ops/eslint.ts"), "authored tooling source must stay linted").toBe(false);
});
