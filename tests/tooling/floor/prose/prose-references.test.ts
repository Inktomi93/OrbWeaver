import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runGit } from "@orb/tooling/floor/git/git";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { referenceProblems } from "../../../../tooling/src/floor/prose/prose-references.ts";

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

test("shared generated prefixes query Git once per document and a fresh invocation observes edits", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "-q"]);
  const ignore = join(scratch, ".gitignore");
  writeFileSync(ignore, "dist/\n");
  mkdirSync(join(scratch, "packages/showcase-plugins"), { recursive: true });
  const source = "See `packages/showcase-plugins/dist/a.js` and `packages/showcase-plugins/dist/b.js`.";
  let queries = 0;
  const countedGit: typeof runGit = (root, args, options) => {
    queries += 1;
    return runGit(root, args, options);
  };
  expect(referenceProblems(scratch, "docs/law/example.md", source, countedGit)).toEqual([]);
  expect(queries).toBe(2);
  writeFileSync(ignore, "out/\n");
  expect(referenceProblems(scratch, "docs/law/example.md", source)).toHaveLength(2);
  writeFileSync(ignore, "dist/\n");
  mkdirSync(join(scratch, "packages/showcase-plugins/dist"));
  writeFileSync(join(scratch, "packages/showcase-plugins/dist/a.js"), "export const a = 1;\n");
  const problems = referenceProblems(scratch, "docs/law/example.md", source);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("dist/b.js");
});

test("references in a not-yet-created tree report missing paths without writing the root", ({ scratch }) => {
  const root = join(scratch, "not-created");
  expect(existsSync(root)).toBe(false);
  expect(referenceProblems(root, "docs/work/pending.md", "Edit `tooling/src/gone.ts` and `packages/showcase-plugins/dist/bundles/`.")).toEqual([
    "docs/work/pending.md:1: path does not exist: tooling/src/gone.ts",
    "docs/work/pending.md:1: path does not exist: packages/showcase-plugins/dist/bundles",
  ]);
  expect(existsSync(root)).toBe(false);
});
