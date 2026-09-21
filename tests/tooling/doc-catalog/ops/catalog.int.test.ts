// The PERMANENT PIN for #968: the doc-catalog artifacts must be canonical under the repo's OWN
// formatter, and `check:doc-catalog` must SAY SO. It used to be blind — the tool validated receipt
// CONTENT and never FORM, so a lane could attest a receipt in raw `JSON.stringify` shape (arrays
// expanded across lines where biome inlines them) and `lint:biome` went red hours later in an unrelated
// stage, attributed to whoever next regenerated the catalog. Measured red-first on 2026-09-01: with a
// receipt re-emitted by raw JSON.stringify, `check:doc-catalog` exited 0 while
// `biome check docs/catalog` exited 1 on the same tree.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit, FIXTURE_GIT_CONFIG_ARGS, fixtureGitEnvironment } from "../../../../tooling/src/_shared/git-fixture.ts";
import { withProcessEnv } from "../../../../tooling/src/_shared/process-env.ts";
import type { ArtifactForm, LaneConfig } from "../../../../tooling/src/doc-catalog/index.ts";
import {
  authoredArtifacts,
  candidateTouchesCatalog,
  catalogIndexIsStale,
  catalogSourcesMatchIndex,
  offCanonicalPaths,
  unformattedArtifacts,
} from "../../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const LANES_PATH = "docs/catalog/lanes.json";
const STATE_PATH = "docs/catalog/state.json";
/** receipts + state.json — the artifacts a lane writes BY HAND (catalog.json is generated, and its own
 *  two-sided arm is `catalogIsStale`). */
const STATE_ARTIFACTS = 1;

function lanes(repoRoot: string): LaneConfig {
  return JSON.parse(readFileSync(join(repoRoot, LANES_PATH), "utf8")) as LaneConfig;
}

function form(current: string, canonical: string): ArtifactForm {
  return { path: "docs/catalog/receipts/example.json", current, canonical };
}

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, ["-c", "user.name=Catalog Test", "-c", "user.email=catalog@example.invalid", ...args]).trim();
}

function gitAtIndex(root: string, index: string, ...args: readonly string[]): string {
  return execFileSync("git", [...FIXTURE_GIT_CONFIG_ARGS, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...fixtureGitEnvironment(), ["GIT_INDEX_FILE"]: index },
  }).trim();
}

function writeConflictStages(inputFacts: {
  readonly root: string;
  readonly index: string;
  readonly path: string;
  readonly base: string;
  readonly ours: string;
  readonly theirs: string;
}): void {
  const { base, index, ours, path, root, theirs } = inputFacts;
  const zero = "0".repeat(40);
  const input = `0 ${zero}\t${path}\n100644 ${base} 1\t${path}\n100644 ${ours} 2\t${path}\n100644 ${theirs} 3\t${path}\n`;
  execFileSync("git", [...FIXTURE_GIT_CONFIG_ARGS, "update-index", "--index-info"], {
    cwd: root,
    input,
    env: { ...fixtureGitEnvironment(), ["GIT_INDEX_FILE"]: index },
  });
}

test("PLANTED CONTROL — the mis-shaped array the generator's formatter inlines is reported off-canonical", () => {
  // The exact 2026-08-31 shape: a receipt emitted by `JSON.stringify(value, null, 2)`, where a short
  // array is expanded across lines. biome's JSON formatter inlines it, so the two tools disagree.
  const raw = '{\n  "evidence": [\n    "docs/Mission.md:1"\n  ]\n}\n';
  const canonical = '{\n  "evidence": ["docs/Mission.md:1"]\n}\n';
  expect(offCanonicalPaths([form(raw, canonical)])).toEqual(["docs/catalog/receipts/example.json"]);
});

test("the other direction — a byte-identical artifact is silent", () => {
  const canonical = '{\n  "evidence": ["docs/Mission.md:1"]\n}\n';
  expect(offCanonicalPaths([form(canonical, canonical)])).toEqual([]);
});

test("the reconciliation names EVERY off-canonical artifact, not just the first", () => {
  const forms: readonly ArtifactForm[] = [
    { path: "a.json", current: "x", canonical: "y" },
    { path: "b.json", current: "same", canonical: "same" },
    { path: "c.json", current: "p", canonical: "q" },
  ];
  expect(offCanonicalPaths(forms)).toEqual(["a.json", "c.json"]);
});

test("the REAL tree: every hand-authored catalog artifact is already canonical", ({ repoRoot }) => {
  const config = lanes(repoRoot);
  // THE DENOMINATOR IS THE RECEIPT: a formatter arm that examined zero artifacts is "I could not
  // measure", never "clean" — so assert what it looked at before believing the empty verdict.
  expect(authoredArtifacts(config)).toHaveLength(config.lanes.length + STATE_ARTIFACTS);
  expect(unformattedArtifacts(config)).toEqual([]);
});

test("a fresh working catalog cannot mask stale candidate-index bytes", ({ scratch }) => {
  const path = join(scratch, "docs", "catalog", "catalog.json");
  mkdirSync(join(scratch, "docs", "catalog"), { recursive: true });
  git(scratch, "init", "-q");
  writeFileSync(path, '{"version":"base"}\n');
  git(scratch, "add", "docs/catalog/catalog.json");
  git(scratch, "commit", "-qm", "base");

  writeFileSync(path, '{"version":"stale-candidate"}\n');
  git(scratch, "add", "docs/catalog/catalog.json");
  const expected = `{"payload":"${"x".repeat(1_100_000)}"}\n`;
  writeFileSync(path, expected);
  expect(catalogIndexIsStale(expected, scratch, true)).toBe(true);

  git(scratch, "add", "docs/catalog/catalog.json");
  expect(catalogIndexIsStale(expected, scratch, true)).toBe(false);
});

test("a staged document deletion cannot leave its receipt removal and catalog unstaged", ({ scratch }) => {
  const config: LaneConfig = { schemaVersion: 1, lanes: [{ id: "core", issue: 1, patterns: ["docs/*.md"] }] };
  mkdirSync(join(scratch, "docs", "catalog", "receipts"), { recursive: true });
  writeFileSync(join(scratch, "docs", "catalog", "lanes.json"), `${JSON.stringify(config)}\n`);
  writeFileSync(join(scratch, "docs", "catalog", "receipts", "core.json"), '{"entries":["docs/remove.md"]}\n');
  writeFileSync(join(scratch, "docs", "catalog", "catalog.json"), '{"documents":["docs/remove.md"]}\n');
  writeFileSync(join(scratch, STATE_PATH), '{"allowed":{}}\n');
  writeFileSync(join(scratch, "docs", "remove.md"), "# Remove\n");
  git(scratch, "init", "-q");
  git(scratch, "add", "docs");
  git(scratch, "commit", "-qm", "base");

  rmSync(join(scratch, "docs", "remove.md"));
  writeFileSync(join(scratch, "docs", "catalog", "receipts", "core.json"), '{"entries":[]}\n');
  const expected = '{"documents":[]}\n';
  writeFileSync(join(scratch, "docs", "catalog", "catalog.json"), expected);
  git(scratch, "add", "-u", "docs/remove.md");
  const changed = new Set(["docs/remove.md"]);
  expect(candidateTouchesCatalog(changed)).toBe(true);
  expect(catalogSourcesMatchIndex(config, scratch, true)).toBe(false);
  expect(catalogIndexIsStale(expected, scratch, true)).toBe(true);

  git(scratch, "add", "docs/catalog/receipts/core.json", "docs/catalog/catalog.json");
  expect(catalogSourcesMatchIndex(config, scratch, true)).toBe(true);
  expect(catalogIndexIsStale(expected, scratch, true)).toBe(false);
});

test("a staged state cannot be validated from different worktree bytes", ({ scratch }) => {
  const config: LaneConfig = { schemaVersion: 1, lanes: [{ id: "core", issue: 1, patterns: [] }] };
  const statePath = join(scratch, STATE_PATH);
  mkdirSync(join(scratch, "docs", "catalog", "receipts"), { recursive: true });
  writeFileSync(join(scratch, LANES_PATH), `${JSON.stringify(config)}\n`);
  writeFileSync(join(scratch, "docs", "catalog", "receipts", "core.json"), '{"entries":[]}\n');
  writeFileSync(statePath, '{"allowed":{"pending":[]}}\n');
  git(scratch, "init", "-q");
  git(scratch, "add", "docs/catalog");
  git(scratch, "commit", "-qm", "base");

  writeFileSync(statePath, '{"allowed":{"pending":["docs/staged-only.md"]}}\n');
  git(scratch, "add", STATE_PATH);
  writeFileSync(statePath, '{"allowed":{"pending":[]}}\n');

  expect(candidateTouchesCatalog(new Set([STATE_PATH]))).toBe(true);
  expect(catalogSourcesMatchIndex(config, scratch, true)).toBe(false);
  git(scratch, "add", STATE_PATH);
  expect(catalogSourcesMatchIndex(config, scratch, true)).toBe(true);
});

test("the state closure honors an alternate candidate index and refuses an unmerged entry", async ({ scratch }) => {
  const config: LaneConfig = { schemaVersion: 1, lanes: [{ id: "core", issue: 1, patterns: [] }] };
  const statePath = join(scratch, STATE_PATH);
  const index = join(scratch, "candidate.index");
  mkdirSync(join(scratch, "docs", "catalog", "receipts"), { recursive: true });
  writeFileSync(join(scratch, LANES_PATH), `${JSON.stringify(config)}\n`);
  writeFileSync(join(scratch, "docs", "catalog", "receipts", "core.json"), '{"entries":[]}\n');
  writeFileSync(statePath, '{"allowed":{"pending":[]}}\n');
  git(scratch, "init", "-q");
  git(scratch, "add", "docs/catalog");
  git(scratch, "commit", "-qm", "base");
  gitAtIndex(scratch, index, "read-tree", "HEAD");

  const base = git(scratch, "rev-parse", `HEAD:${STATE_PATH}`);
  writeFileSync(statePath, '{"allowed":{"pending":["docs/ours.md"]}}\n');
  const ours = git(scratch, "hash-object", "-w", STATE_PATH);
  writeFileSync(statePath, '{"allowed":{"pending":["docs/theirs.md"]}}\n');
  const theirs = git(scratch, "hash-object", "-w", STATE_PATH);
  writeFileSync(statePath, '{"allowed":{"pending":[]}}\n');
  writeConflictStages({ root: scratch, index, path: STATE_PATH, base, ours, theirs });

  await withProcessEnv("GIT_INDEX_FILE", index, () => {
    expect(catalogSourcesMatchIndex(config, scratch)).toBe(false);
    gitAtIndex(scratch, index, "add", STATE_PATH);
    expect(catalogSourcesMatchIndex(config, scratch)).toBe(true);
    return Promise.resolve();
  });
});
