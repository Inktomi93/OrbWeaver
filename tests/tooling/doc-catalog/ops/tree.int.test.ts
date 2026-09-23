// The tree half of the legacy inventory in isolated repositories: the corpus is the tracked legacy
// markdown (the doc tool's trees excluded), and every document has exactly one lane.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "../../../../tooling/src/_shared/git-fixture.ts";
import { documents, laneAssignments } from "../../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, ["-c", "user.name=Catalog Test", "-c", "user.email=catalog@example.invalid", ...args]).trim();
}

function plant(root: string): void {
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  mkdirSync(join(root, "docs", "architecture", "core"), { recursive: true });
  mkdirSync(join(root, "docs", "design"), { recursive: true });
  git(root, "init", "-q");
  writeFileSync(join(root, "docs", "adr", "0164-x.md"), "---\nkind: adr\nstatus: active\nupdated: 2026-09-23\n---\n\n# X\n");
  writeFileSync(join(root, "docs", "architecture", "core", "Law.md"), "---\nkind: law\nstatus: active\nupdated: 2026-09-23\n---\n\n# Law\n");
  writeFileSync(join(root, "docs", "design", "d.md"), "# no block\n");
  writeFileSync(join(root, "docs", "design", "untracked.md"), "---\nkind: design\nstatus: active\nupdated: 2026-09-23\n---\n");
  git(root, "add", "docs/adr", "docs/architecture", "docs/design/d.md");
}

test("the corpus is the TRACKED legacy markdown: the doc tool's trees and an untracked draft are out", ({ scratch }) => {
  plant(scratch);
  const docs = documents(scratch, true);
  expect(docs.map((doc) => doc.path)).toEqual(["docs/architecture/core/Law.md", "docs/design/d.md"]);
  expect(docs[0]?.frontmatter.fields).toEqual({ kind: "law", status: "active", updated: "2026-09-23" });
  expect(docs[1]?.frontmatter.present).toBe(false);
});

test("exactly one lane owns each document; zero or two owners is a config error", ({ scratch }) => {
  plant(scratch);
  const docs = documents(scratch, true);
  const config = {
    schemaVersion: 2,
    lanes: [
      { id: "core", patterns: ["docs/architecture/core/**/*.md"] },
      { id: "design", patterns: ["docs/design/**/*.md"] },
    ],
  };
  expect([...laneAssignments(config, docs, scratch)].map(([path, lane]) => [path, lane.id])).toEqual([
    ["docs/architecture/core/Law.md", "core"],
    ["docs/design/d.md", "design"],
  ]);
  expect(() => laneAssignments({ schemaVersion: 2, lanes: [config.lanes[0] as (typeof config.lanes)[0]] }, docs, scratch)).toThrow(
    "docs/design/d.md: expected one lane, got none",
  );
  expect(() => laneAssignments({ schemaVersion: 2, lanes: [...config.lanes, { id: "twin", patterns: ["docs/**/*.md"] }] }, docs, scratch)).toThrow(
    "expected one lane, got core, twin",
  );
});
