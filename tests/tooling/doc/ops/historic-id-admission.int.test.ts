import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { configureFixtureGitIdentity, execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { newAdr, newItem } from "../../../../tooling/src/doc/index.ts";

function commit(root: string): void {
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["commit", "--quiet", "--allow-empty", "-m", "fixture"]);
}

test("actual work and ADR minting reserve deleted IDs from every ref, not just HEAD", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "--quiet"]);
  configureFixtureGitIdentity(scratch);
  commit(scratch);
  const original = execFixtureGit(scratch, ["branch", "--show-current"]).trim();
  execFixtureGit(scratch, ["checkout", "-b", "side"]);
  for (const tree of ["work", "adr"] as const) {
    mkdirSync(join(scratch, "docs", tree), { recursive: true });
    writeFileSync(join(scratch, "docs", tree, "0042-reserved.md"), "fixture\n");
  }
  commit(scratch);
  execFixtureGit(scratch, ["rm", "docs/work/0042-reserved.md", "docs/adr/0042-reserved.md"]);
  commit(scratch);
  execFixtureGit(scratch, ["checkout", original]);
  expect(newItem({ title: "Next", kind: "work", priority: null, area: null, plan: null, lane: null }, scratch).written[0]).toBe("docs/work/0043-next.md");
  expect(newAdr({ slug: "next", title: "Next" }, scratch).written[0]).toBe("docs/adr/0043-next.md");
});

test("actual mint refuses failed Git acquisition instead of allocating a reusable zero-history ID", async ({ scratch, fakeBin }) => {
  execFixtureGit(scratch, ["init", "--quiet"]);
  await fakeBin("git", "process.stderr.write('Git command unavailable');process.exitCode=77;");
  expect(() => newItem({ title: "Next", kind: "work", priority: null, area: null, plan: null, lane: null }, scratch)).toThrow("Git filename history");
  expect(() => newAdr({ slug: "next", title: "Next" }, scratch)).toThrow("Git filename history");
});

test("non-Git drafts and genuinely empty Git history keep zero-history minting", async ({ plantedTree }) => {
  for (const git of [false, true]) {
    const root = await plantedTree({ "README.md": "fixture\n" });
    if (git) {
      execFixtureGit(root, ["init", "--quiet"]);
    }
    expect(newItem({ title: "First", kind: "work", priority: null, area: null, plan: null, lane: null }, root).written[0]).toBe("docs/work/0001-first.md");
    expect(newAdr({ slug: "first", title: "First" }, root).written[0]).toBe("docs/adr/0001-first.md");
  }
});
