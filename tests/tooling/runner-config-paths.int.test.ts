// A runner never reports a selector that matches nothing: vitest silently drops a dead include, so the suite it
// routed changes lane and nothing goes red. Every file-exact selector in the three runner configs must name a
// file or directory inside the checkout, and an exact vitest include must be a file (a directory include
// collects zero tests).
import { mkdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import e2eConfig from "../../playwright.config.ts";
import ctConfig from "../../playwright-ct.config.ts";
import type { ConfigSnapshotField } from "../../tooling/src/verify/contract/config-snapshot.ts";
import { readConfigSnapshot } from "../../tooling/src/verify/lib/config-snapshot.ts";
import { scaledBudget } from "./_load-budget.ts";

type SelectorField = ConfigSnapshotField | "testDir" | "globalSetup";

interface Selector {
  readonly source: string;
  readonly field: SelectorField;
  readonly value: string;
}

// tinyglobby and minimatch metacharacters; a selector without one names exactly one tree node.
const GLOB_META_RE = /[*?[\]{}]/u;
// A directory include collects zero tests; exclude, globalSetup and testDir are legitimately directory-valued.
const FILE_ONLY_FIELDS: readonly SelectorField[] = ["test.include", "typecheck.include"];

function escapes(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/** The reason a selector is broken, or undefined when it is live or a glob (a pattern is never resolved as a path). */
function brokenReason(root: string, selector: Selector): string | undefined {
  if (GLOB_META_RE.test(selector.value)) {
    return undefined;
  }
  const absolute = resolve(root, selector.value);
  // Containment is judged before existence, so a missing path outside the checkout is not an ordinary dead row.
  if (escapes(root, absolute)) {
    return "outside the repository";
  }
  let real: string;
  try {
    real = realpathSync(absolute);
  } catch {
    return "names nothing on the tree";
  }
  if (escapes(realpathSync(root), real)) {
    return "outside the repository";
  }
  const kind = statSync(real);
  if (!(kind.isFile() || kind.isDirectory())) {
    return "is neither a file nor a directory";
  }
  return kind.isDirectory() && FILE_ONLY_FIELDS.includes(selector.field) ? "is a directory, so it collects zero tests" : undefined;
}

function broken(root: string, selectors: readonly Selector[]): readonly string[] {
  return selectors.flatMap((selector) => {
    const reason = brokenReason(root, selector);
    return reason === undefined ? [] : [`${selector.source} ${selector.field} ${JSON.stringify(selector.value)} ${reason}`];
  });
}

function playwrightSelectors(source: string, config: typeof e2eConfig): readonly Selector[] {
  const owners = [config, ...(config.projects ?? [])];
  return owners.flatMap((owner) => {
    const rows: Selector[] = [];
    if (owner.testDir !== undefined) {
      rows.push({ source, field: "testDir", value: owner.testDir });
    }
    if ("globalSetup" in owner) {
      for (const value of [owner.globalSetup].flat()) {
        rows.push({ source, field: "globalSetup", value });
      }
    }
    return rows;
  });
}

function plant(root: string, rel: string, content = "export const live = 1;\n"): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

const include = (value: string, source = "vitest.config.ts"): Selector => ({ source, field: "test.include", value });

test("a dead, escaping or directory-valued exact selector is reported and every other spelling passes", ({ scratch }) => {
  plant(scratch, "tests/tooling/live.int.test.ts");
  plant(scratch, "tests/e2e/keep.spec.ts");
  symlinkSync("../../..", join(scratch, "tests/tooling/escaping-link.int.test.ts"));
  symlinkSync("live.int.test.ts", join(scratch, "tests/tooling/inner-link.int.test.ts"));

  expect(broken(scratch, [include("tests/tooling/gone.int.test.ts")])).toEqual([expect.stringContaining("names nothing on the tree")]);
  expect(broken(scratch, [include("../outside.test.ts")])).toEqual([expect.stringContaining("outside the repository")]);
  expect(broken(scratch, [include("tests/tooling/escaping-link.int.test.ts")])).toEqual([expect.stringContaining("outside the repository")]);
  expect(broken(scratch, [include("")])).toEqual([expect.stringContaining("collects zero tests")]);
  expect(broken(scratch, [include("tests")])).toEqual([expect.stringContaining("collects zero tests")]);
  // One const spread into two execution groups is two rows, so a rename must repoint both sites.
  const spread = ["tests/tooling/gone.int.test.ts"].map((value) => ({ source: "vitest.config.ts", field: "test.exclude" as const, value }));
  expect(broken(scratch, [...spread, include("tests/tooling/gone.int.test.ts")])).toHaveLength(2);

  expect(broken(scratch, [include("tests/tooling/live.int.test.ts")])).toEqual([]);
  expect(broken(scratch, [include("tests/tooling/../tooling/live.int.test.ts")])).toEqual([]);
  expect(broken(scratch, [include("tests/tooling/inner-link.int.test.ts")])).toEqual([]);
  expect(broken(scratch, [include("tests/**/*.{int,contract}.test.ts"), include("!tests/tooling/**"), include("tests/p?/[ab].test.ts")])).toEqual([]);
  // Only directory-valued fields may name a directory.
  expect(
    broken(scratch, [
      { source: "vitest.config.ts", field: "test.exclude", value: "tests" },
      { source: "playwright.config.ts", field: "testDir", value: "tests/e2e" },
    ]),
  ).toEqual([]);
});

test("every exact selector in the vitest and playwright configs names a live node", { timeout: scaledBudget(120_000) }, ({ repoRoot }) => {
  const read = readConfigSnapshot(repoRoot, "vitest", "vitest.config.ts");
  expect(read.kind, read.kind === "ok" ? "" : read.detail).toBe("ok");
  const vitest: readonly Selector[] =
    read.kind === "ok" ? read.snapshot.selectors.flatMap(({ field, values }) => values.map((value) => ({ source: "vitest.config.ts", field, value }))) : [];
  const playwright = [...playwrightSelectors("playwright.config.ts", e2eConfig), ...playwrightSelectors("playwright-ct.config.ts", ctConfig)];
  const all = [...vitest, ...playwright];

  // A reader that goes blind answers "no exact rows"; the real configs carry many selectors and several exact ones.
  expect(all.length).toBeGreaterThan(40);
  expect(all.filter(({ value }) => !GLOB_META_RE.test(value)).length).toBeGreaterThan(0);
  expect(playwright.map(({ source, field }) => `${source} ${field}`)).toEqual(
    expect.arrayContaining([
      "playwright.config.ts testDir",
      "playwright.config.ts globalSetup",
      "playwright-ct.config.ts testDir",
      "playwright-ct.config.ts globalSetup",
    ]),
  );
  expect(broken(repoRoot, all)).toEqual([]);
});
