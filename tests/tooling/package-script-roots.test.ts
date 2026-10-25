import { execFileSync } from "node:child_process";
import { matchesGlob } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { z } from "zod";
import manifest from "../../package.json" with { type: "json" };

// Tools whose leading positional arguments are path roots. A root that matches no tracked file is not an error to the
// shell: it reaches the tool as a literal pattern, and dependency-cruiser walks that from the repository root, which
// on the main checkout descends into every lane worktree under `.claude/worktrees` and exhausts the heap.
const ROOT_TOOLS = new Set(["depcruise", "eslint", "stylelint", "knip"]);

const scriptsSchema = z.record(z.string(), z.string());

function trackedFiles(): readonly string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean);
}

function isTracked(root: string, tracked: readonly string[]): boolean {
  return /[*?[{]/u.test(root) ? tracked.some((path) => matchesGlob(path, root)) : tracked.some((path) => path === root || path.startsWith(`${root}/`));
}

/** The path roots of one command segment: the positional arguments between a root tool and its first flag. */
function rootsOf(segment: string): readonly string[] {
  const [tool, ...rest] = (segment.match(/"[^"]*"|'[^']*'|\S+/gu) ?? []).map((token) => token.replace(/^(["'])(.*)\1$/u, "$2"));
  if (tool === undefined || !ROOT_TOOLS.has(tool)) {
    return [];
  }
  const flag = rest.findIndex((token) => token.startsWith("-"));
  return flag < 0 ? rest : rest.slice(0, flag);
}

/** Every path root of every root-taking tool call in `scripts` that no tracked file satisfies. */
function unmatchedRoots(scripts: Readonly<Record<string, string>>, tracked: readonly string[]): string[] {
  return Object.entries(scripts).flatMap(([name, command]) =>
    command
      .split("&&")
      .flatMap(rootsOf)
      .filter((root) => !isTracked(root, tracked))
      .map((root) => `${name}: ${root}`),
  );
}

test("every path root a lint script passes names a tracked file", () => {
  expect(unmatchedRoots(scriptsSchema.parse(manifest.scripts), trackedFiles())).toEqual([]);
});

test("a root glob or path that matches no tracked file is caught", () => {
  const tracked = ["a.config.ts", "packages/x/src/a.ts", "styles/a.css"];
  const control = {
    fake: "depcruise packages *.config.ts *.config.js --config c.ts",
    chained: "mkdir -p reports && depcruise missing-dir --output-type json",
    quoted: 'stylelint "packages/**/*.css"',
    nested: "eslint --max-warnings 0",
  };
  expect(unmatchedRoots(control, tracked)).toEqual(["fake: *.config.js", "chained: missing-dir", "quoted: packages/**/*.css"]);
});
