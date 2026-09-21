// #2339: drive the real CLI against copied, unmodified production modules in an isolated Git tree.
// The scoped writer must not classify selected debt as unrelated merely because its message starts
// with a debt category. Every refusal is checked against catalog AND receipt bytes.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execFixtureGit } from "../../../../tooling/src/_shared/git-fixture.ts";
import { spawnNiced } from "../../../../tooling/src/_shared/proc.ts";
import type { CatalogDocumentRow, Receipt } from "../../../../tooling/src/doc-catalog/index.ts";
import type { CliResult } from "../../../support/tool-fixtures.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const GOOD = "docs/design/good.md";
const BAD = "docs/design/bad.md";
const CATALOG = "docs/catalog/catalog.json";
const RECEIPT = "docs/catalog/receipts/design.json";
const STATE = "docs/catalog/state.json";
const VALID = "---\nkind: review\nstatus: active\nupdated: 2026-09-13\n---\n\n# Subject\n";

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, ["-c", "commit.gpgsign=false", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args]).trim();
}

// Package links mirror pnpm's installed dependency resolution; the fixture owns real node_modules
// directories and copied production source, so REPO_ROOT and every write stay inside the fixture.
function linkPackages(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(source)) {
    if (name.startsWith(".")) {
      continue;
    }
    const from = join(source, name);
    const to = join(target, name);
    if (name.startsWith("@")) {
      linkPackages(from, to);
    } else {
      symlinkSync(realpathSync(from), to, "dir");
    }
  }
}

function setup(root: string, repoRoot: string, bad = VALID.replace("active", "confirmed")): void {
  for (const path of ["tooling/src/doc-catalog", "tooling/src/_shared"]) {
    cpSync(join(repoRoot, path), join(root, path), { recursive: true });
  }
  linkPackages(join(repoRoot, "node_modules"), join(root, "node_modules"));
  linkPackages(join(repoRoot, "tooling/node_modules"), join(root, "tooling/node_modules"));
  mkdirSync(join(root, "node_modules/.bin"));
  symlinkSync(join(repoRoot, "node_modules/.bin/biome"), join(root, "node_modules/.bin/biome"));
  for (const path of ["docs/design", "docs/catalog/receipts", "docs/architecture/core"]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(root, "biome.json"), '{"formatter":{"enabled":true}}\n');
  writeFileSync(join(root, "docs/architecture/core/Core-Path-Registry.md"), "# Fixture registry\n");
  writeFileSync(
    join(root, "docs/catalog/lanes.json"),
    JSON.stringify({ schemaVersion: 1, lanes: [{ id: "design", issue: 5, patterns: ["docs/design/**/*.md"] }] }),
  );
  writeFileSync(
    join(root, STATE),
    JSON.stringify({ schemaVersion: 1, allowed: { pending: [], missingFrontmatter: [], invalidFrontmatter: [], malformedFrontmatter: [] } }),
  );
  writeFileSync(join(root, CATALOG), '{"schemaVersion":1,"documents":[]}\n');
  writeFileSync(join(root, GOOD), VALID);
  writeFileSync(join(root, BAD), bad);
  git(root, "init", "-q");
  git(root, "add", "docs/design", "docs/catalog");
  git(root, "commit", "-qm", "fixture documents");
  const commit = git(root, "rev-parse", "HEAD");
  const entries = [GOOD, BAD].map((path) => {
    const hash = createHash("sha256")
      .update(readFileSync(join(root, path)))
      .digest("hex");
    return {
      path,
      assignedSha256: hash,
      disposition: "current",
      authority: "review",
      fullRead: true,
      verifiedSha256: hash,
      verifiedCommit: commit,
      verifiedAt: "2026-09-13",
      evidence: ["fixture"],
      claims: [{ claim: "fixture provenance", evidence: [{ kind: "provenance", target: `git:${commit}` }] }],
      summary: "fixture",
    };
  });
  writeFileSync(join(root, RECEIPT), JSON.stringify({ schemaVersion: 1, lane: "design", issue: 5, entries }));
  git(root, "add", "docs/catalog");
  git(root, "commit", "-qm", "fixture receipts");
}

function artifacts(root: string): readonly Buffer[] {
  return [CATALOG, RECEIPT, STATE].map((path) => readFileSync(join(root, path)));
}

function run(root: string, paths: readonly string[]): Promise<CliResult> {
  return spawnNiced(
    "env",
    [
      "-u",
      "GIT_DIR",
      "-u",
      "GIT_WORK_TREE",
      "-u",
      "GIT_INDEX_FILE",
      process.execPath,
      join(root, "tooling/src/doc-catalog/cli.ts"),
      "catalog",
      "--write",
      "--paths",
      ...paths,
    ],
    { cwd: root },
  );
}

for (const [name, source, category] of [
  ["invalid status", VALID.replace("active", "confirmed"), "invalidFrontmatter"],
  ["missing header", "# Subject\n", "missingFrontmatter"],
  ["malformed header", "---\nkind: review\n", "malformedFrontmatter"],
] as const) {
  test(`selected ${name} refuses the complete batch without changing catalog, receipts or state`, async ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot, source);
    const before = artifacts(scratch);
    const result = await run(scratch, [GOOD, BAD]);
    await expect(result).toExitWith(1);
    expect(result.stderr).toContain("NOTHING WRITTEN");
    expect(result.stderr).toContain(`${category}: new debt path ${BAD}`);
    expect(artifacts(scratch)).toEqual(before);
  });
}

test("a valid selected row writes while unrelated frontmatter debt remains outside the catalog", async ({ scratch, repoRoot }) => {
  setup(scratch, repoRoot);
  const before = artifacts(scratch);
  const result = await run(scratch, [GOOD]);
  await expect(result).toExitWith(0);
  expect(result.stdout).toContain("1 pre-existing violation(s) on documents you did not name");
  const written = JSON.parse(readFileSync(join(scratch, CATALOG), "utf8")) as { documents: CatalogDocumentRow[] };
  expect(written.documents.map((row) => row.path)).toEqual([GOOD]);
  expect(written.documents[0]?.frontmatter.errors).toEqual([]);
  expect(artifacts(scratch)[0]).not.toEqual(before[0]);
  expect(artifacts(scratch).slice(1)).toEqual(before.slice(1));
});

test("selected pending and stale allowance debt retain their document owner", async ({ scratch, repoRoot }) => {
  setup(scratch, repoRoot, VALID);
  const receipt = JSON.parse(readFileSync(join(scratch, RECEIPT), "utf8")) as Receipt;
  const pending = receipt.entries.map((entry) =>
    entry.path !== BAD
      ? entry
      : {
          ...entry,
          disposition: "pending",
          authority: "unclassified",
          fullRead: false,
          verifiedSha256: null,
          verifiedCommit: null,
          verifiedAt: null,
          evidence: [],
          claims: [],
          summary: "",
        },
  );
  writeFileSync(join(scratch, RECEIPT), JSON.stringify({ ...receipt, entries: pending }));
  writeFileSync(
    join(scratch, STATE),
    JSON.stringify({ schemaVersion: 1, allowed: { pending: [], missingFrontmatter: [GOOD], invalidFrontmatter: [], malformedFrontmatter: [] } }),
  );
  git(scratch, "add", "docs/catalog");
  const before = artifacts(scratch);
  const result = await run(scratch, [GOOD, BAD]);
  await expect(result).toExitWith(1);
  expect(result.stderr).toContain(`pending: new debt path ${BAD}`);
  expect(result.stderr).toContain(`missingFrontmatter: stale debt path ${GOOD}`);
  expect(artifacts(scratch)).toEqual(before);
});

test("scoped writes retain the staged document and receipt pairing guard", async ({ scratch, repoRoot }) => {
  setup(scratch, repoRoot, VALID);
  const receipt = JSON.parse(readFileSync(join(scratch, RECEIPT), "utf8")) as Receipt;
  const changed = `${VALID}\nNew candidate bytes.\n`;
  writeFileSync(join(scratch, GOOD), changed);
  const hash = createHash("sha256").update(changed).digest("hex");
  writeFileSync(
    join(scratch, RECEIPT),
    JSON.stringify({
      ...receipt,
      entries: receipt.entries.map((entry) => (entry.path === GOOD ? { ...entry, assignedSha256: hash, verifiedSha256: hash } : entry)),
    }),
  );
  git(scratch, "add", GOOD);
  const before = artifacts(scratch);
  const refused = await run(scratch, [GOOD]);
  await expect(refused).toExitWith(1);
  expect(refused.stderr).toContain("current document and receipt do not coexist");
  expect(artifacts(scratch)).toEqual(before);

  git(scratch, "add", RECEIPT);
  await expect(await run(scratch, [GOOD])).toExitWith(0);
  const written = JSON.parse(readFileSync(join(scratch, CATALOG), "utf8")) as { documents: CatalogDocumentRow[] };
  expect(written.documents[0]?.sha256).toBe(hash);
  expect(artifacts(scratch).slice(1)).toEqual(before.slice(1));
});

test("scoped writes preserve allowed debt but refuse an unclassified legacy allowance", async ({ scratch, repoRoot }) => {
  setup(scratch, repoRoot);
  writeFileSync(
    join(scratch, STATE),
    JSON.stringify({ schemaVersion: 1, allowed: { pending: [], missingFrontmatter: [], invalidFrontmatter: [BAD], malformedFrontmatter: [] } }),
  );
  await expect(await run(scratch, [BAD])).toExitWith(0);
  writeFileSync(join(scratch, STATE), JSON.stringify({ schemaVersion: 1 }));
  const before = artifacts(scratch);
  const refused = await run(scratch, [GOOD]);
  await expect(refused).toExitWith(1);
  expect(refused.stderr).toContain("legacy count-only state must be upgraded");
  expect(artifacts(scratch)).toEqual(before);
});
