import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runGit } from "@orb/tooling/floor/git/git";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { ignoredBuildOutputClassifier, referenceProblems } from "../../../../tooling/src/floor/prose/prose-references.ts";

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
  expect(queries).toBe(1);
  writeFileSync(ignore, "out/\n");
  expect(referenceProblems(scratch, "docs/law/example.md", source)).toHaveLength(2);
  writeFileSync(ignore, "dist/\n");
  mkdirSync(join(scratch, "packages/showcase-plugins/dist"));
  writeFileSync(join(scratch, "packages/showcase-plugins/dist/a.js"), "export const a = 1;\n");
  const problems = referenceProblems(scratch, "docs/law/example.md", source);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("dist/b.js");
});

test("a fatal Git answer is a tool error, not an ordinary missing citation", ({ scratch }) => {
  mkdirSync(join(scratch, "packages"));
  const fatalGit: typeof runGit = () => ({ status: 128, stdout: "", stderr: "private external target" });
  expect(() => referenceProblems(scratch, "docs/example.md", "See `packages/missing.ts`.", fatalGit)).toThrow(/Git ignore classification failed/u);
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

test("native batched answers agree with per-path Git for ignore precedence and unusual path bytes", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "-q"]);
  writeFileSync(join(scratch, ".gitignore"), "dist/\n*.log\n!keep.log\n");
  mkdirSync(join(scratch, "packages/a"), { recursive: true });
  mkdirSync(join(scratch, "packages/untracked"));
  writeFileSync(join(scratch, "packages/untracked/.gitignore"), "gen/\n");
  writeFileSync(join(scratch, ".git/info/exclude"), "local-only/\n");
  const paths = [
    "packages/a/dist",
    "packages/a/debug.log",
    "packages/a/keep.log",
    "packages/untracked/gen",
    "local-only",
    "packages/a/we:ird\tname.log",
    "packages/a/space name.log",
    "packages/a/missing.ts",
  ];
  const ordinary = paths.map((path) => {
    const result = runGit(scratch, ["check-ignore", "--", path, `${path}/`]);
    expect([0, 1]).toContain(result.status);
    return [path, result.status === 0];
  });
  let queries = 0;
  const countedGit: typeof runGit = (root, args, options) => {
    queries += 1;
    expect(args).toEqual(["--no-optional-locks", "check-ignore", "--stdin", "-z", "-v", "-n"]);
    return runGit(root, args, options);
  };
  expect([...ignoredBuildOutputClassifier(scratch, [...paths, paths[0] ?? ""], countedGit)]).toEqual(ordinary);
  expect(queries).toBe(1);
  expect(ordinary.map(([, ignored]) => ignored)).toEqual([true, true, false, true, true, true, true, false]);
});

test.for([
  { name: "fatal", status: 128 },
  { name: "signalled", status: null },
  { name: "failed spawn", status: null, errorCode: "ENOENT" },
  { name: "capture failure despite numeric status", status: 0, errorCode: "ENOBUFS" },
])("$name cannot supply an ignore answer", (outcome, { scratch }) => {
  const git: typeof runGit = () => ({ ...outcome, stdout: "", stderr: "private external target" });
  expect(() => ignoredBuildOutputClassifier(scratch, ["packages/missing.ts"], git)).toThrow(/Git ignore classification failed/u);
});

test.for(["truncated", "reordered", "extra", "malformed"])("%s native records cannot masquerade as a complete answer", (defect, { scratch }) => {
  execFixtureGit(scratch, ["init", "-q"]);
  const git: typeof runGit = (root, args, options) => {
    const result = runGit(root, args, options);
    const fields = result.stdout.split("\0");
    if (defect === "truncated") {
      fields.pop();
    } else if (defect === "reordered") {
      fields[3] = "different/repo/path";
    } else if (defect === "extra") {
      fields.push("", "", "", "extra", "");
    } else {
      fields[0] = "source-without-pattern";
    }
    return { ...result, stdout: fields.join("\0") };
  };
  expect(() => ignoredBuildOutputClassifier(scratch, ["packages/missing.ts"], git)).toThrow(/Git ignore classification failed/u);
});

test("NUL cannot insert an extra native query, and lexical escape never reaches Git", ({ scratch }) => {
  let queries = 0;
  const git: typeof runGit = () => {
    queries += 1;
    throw new Error("Git must not run");
  };
  expect(() => ignoredBuildOutputClassifier(scratch, ["packages/a\0packages/b"], git)).toThrow(/contains NUL/u);
  expect([...ignoredBuildOutputClassifier(scratch, ["../outside/missing.ts"], git)]).toEqual([["../outside/missing.ts", false]]);
  expect(queries).toBe(0);
});
