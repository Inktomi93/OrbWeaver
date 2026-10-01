import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { vi } from "vitest";
import { referenceProblems } from "../../../tooling/src/_shared/prose-references.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

test("absent ignored output passes; missing descendants of existing output fail", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "-q"]);
  writeFileSync(join(scratch, ".gitignore"), "dist/\n");
  mkdirSync(join(scratch, "packages/showcase-plugins"), { recursive: true });
  const cite = (path: string): readonly string[] => referenceProblems(scratch, "docs/law/example.md", `See \`${path}\`.`);
  expect(cite("packages/showcase-plugins/dist/bundles/")).toEqual([]);
  expect(cite("packages/showcase-pluginz/dist/bundles/")).toHaveLength(1);
  mkdirSync(join(scratch, "packages/showcase-plugins/dist/bundles"), { recursive: true });
  expect(cite("packages/showcase-plugins/dist/bundles/")).toEqual([]);
  expect(cite("packages/showcase-plugins/dist/bundlez/")).toHaveLength(1);
});

test("shared generated prefixes query Git once per document and a fresh invocation observes edits", async ({ scratch }) => {
  execFixtureGit(scratch, ["init", "-q"]);
  const ignore = join(scratch, ".gitignore");
  writeFileSync(ignore, "dist/\n");
  mkdirSync(join(scratch, "packages/showcase-plugins"), { recursive: true });
  const source = "See `packages/showcase-plugins/dist/a.js` and `packages/showcase-plugins/dist/b.js`.";
  const spy = vi.spyOn(await import("../../../tooling/src/_shared/git.ts"), "runGit");
  try {
    expect(referenceProblems(scratch, "docs/law/example.md", source)).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(2);
    writeFileSync(ignore, "out/\n");
    expect(referenceProblems(scratch, "docs/law/example.md", source)).toHaveLength(2);
    writeFileSync(ignore, "dist/\n");
    mkdirSync(join(scratch, "packages/showcase-plugins/dist"));
    writeFileSync(join(scratch, "packages/showcase-plugins/dist/a.js"), "export const a = 1;\n");
    const problems = referenceProblems(scratch, "docs/law/example.md", source);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("dist/b.js");
  } finally {
    spy.mockRestore();
  }
});
