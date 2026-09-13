// The final policy runtime's one scope boundary: Git defines authored/current/change identity, TypeScript
// defines program membership, and every request resolves to the same validated manifest shape.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type { PolicyScopeRequest } from "../../../../tooling/src/verify/contract/policy-scope.ts";
import { POLICY_SCOPE_KINDS } from "../../../../tooling/src/verify/contract/policy-scope.ts";
import { resolvePolicyScope } from "../../../../tooling/src/verify/lib/policy-scope.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const GIT_ARGS = ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"] as const;

function git(root: string, ...args: readonly string[]): string {
  const result = runNicedSync("git", [...GIT_ARGS, ...args], { cwd: root });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function writeJson(path: string, value: object): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function plantRepo(root: string): void {
  for (const path of ["packages/a/src/nested", "packages/b/src", "tooling/src", "empty", "node_modules/ambient", "reports", "packages/a/dist"]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  writeFileSync(join(root, ".gitignore"), "node_modules/\nreports/\n**/dist/\n");
  writeJson(join(root, "package.json"), { name: "fixture-root", private: true, packageManager: "pnpm@11.15.1" });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n  - tooling\n");
  writeJson(join(root, "tsconfig.base.json"), { files: [], compilerOptions: { module: "nodenext", target: "esnext" } });
  writeJson(join(root, "packages/a/package.json"), { name: "@fixture/a", private: true, version: "0.0.0" });
  writeJson(join(root, "packages/b/package.json"), { name: "@fixture/b", private: true, version: "0.0.0" });
  writeJson(join(root, "tooling/package.json"), { name: "@orb/tooling", private: true, version: "0.0.0" });
  writeJson(join(root, "packages/a/tsconfig.json"), {
    extends: "../../tsconfig.base.json",
    compilerOptions: { composite: true },
    include: ["src/**/*.ts"],
    exclude: ["src/excluded.ts"],
    references: [{ path: "../b" }],
  });
  writeJson(join(root, "packages/b/tsconfig.json"), {
    extends: "../../tsconfig.base.json",
    compilerOptions: { composite: true },
    include: ["src/**/*.ts", "../a/src/shared.ts"],
  });
  writeJson(join(root, "tooling/tsconfig.json"), { extends: "../tsconfig.base.json", include: ["src/**/*.ts"] });
  writeFileSync(join(root, "packages/a/src/main.ts"), "export const main = true;\n");
  writeFileSync(join(root, "packages/a/src/shared.ts"), "export const shared = true;\n");
  writeFileSync(join(root, "packages/a/src/nested/deep.ts"), "export const deep = true;\n");
  writeFileSync(join(root, "packages/a/src/excluded.ts"), "export const excluded = true;\n");
  writeFileSync(join(root, "packages/b/src/b.ts"), "export const b = true;\n");
  writeFileSync(join(root, "tooling/src/tool.ts"), "export const tool = true;\n");
  writeFileSync(join(root, "node_modules/ambient/index.ts"), "export {};\n");
  writeFileSync(join(root, "reports/ambient.ts"), "export {};\n");
  writeFileSync(join(root, "packages/a/dist/ambient.ts"), "export {};\n");
  git(root, "init", "--quiet");
  git(root, "config", "user.email", "test@orb.local");
  git(root, "config", "user.name", "orb test");
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "base");
}

test("the scope vocabulary is closed to the six final kinds", () => {
  expect(POLICY_SCOPE_KINDS).toEqual(["whole", "changed", "file", "folder", "package", "project"]);
});

test("file, nested folder, package, tooling package, project, and whole share one exact manifest model", ({ scratch }) => {
  plantRepo(scratch);
  writeFileSync(join(scratch, "packages/a/src/authored.ts"), "export const authored = true;\n");

  const file = resolvePolicyScope(scratch, {
    kind: "file",
    paths: ["packages/a/src/shared.ts", "packages/a/src/main.ts"],
  });
  expect(file.requestedPaths).toEqual([
    { path: "packages/a/src/main.ts", status: "present", previousPath: null },
    { path: "packages/a/src/shared.ts", status: "present", previousPath: null },
  ]);
  expect(file.currentPaths).toEqual(["packages/a/src/main.ts", "packages/a/src/shared.ts"]);
  expect(file.ownership.find((row) => row.path === "packages/a/src/shared.ts")).toMatchObject({
    programIds: ["packages/a/tsconfig.json", "packages/b/tsconfig.json"],
    reason: "compiler-membership",
  });

  const folder = resolvePolicyScope(scratch, { kind: "folder", path: "packages/a/src/nested" });
  expect(folder.currentPaths).toEqual(["packages/a/src/nested/deep.ts"]);
  const rootFolder = resolvePolicyScope(scratch, { kind: "folder", path: "." });

  const pkg = resolvePolicyScope(scratch, { kind: "package", name: "@fixture/a" });
  expect(pkg.workspacePackage).toEqual({ name: "@fixture/a", path: "packages/a" });
  expect(pkg.currentPaths).toContain("packages/a/package.json");
  expect(pkg.currentPaths).toContain("packages/a/src/authored.ts");
  expect(pkg.currentPaths).not.toContain("packages/b/package.json");

  const tooling = resolvePolicyScope(scratch, { kind: "package", name: "@orb/tooling" });
  expect(tooling.workspacePackage).toEqual({ name: "@orb/tooling", path: "tooling" });
  expect(tooling.currentPaths).toContain("tooling/src/tool.ts");

  const project = resolvePolicyScope(scratch, { kind: "project", config: "packages/a/tsconfig.json" });
  expect(project.projectConfig).toBe("packages/a/tsconfig.json");
  expect(project.requestedProgramIds).toEqual(["packages/a/tsconfig.json", "packages/b/tsconfig.json"]);
  expect(project.currentPaths).toEqual(
    expect.arrayContaining(["packages/a/src/main.ts", "packages/a/src/shared.ts", "packages/a/src/nested/deep.ts", "packages/b/src/b.ts"]),
  );
  expect(project.currentPaths).not.toContain("packages/a/src/excluded.ts");

  const whole = resolvePolicyScope(scratch, { kind: "whole" });
  expect(whole.requestedPaths).toBeNull();
  expect(whole.semanticPaths).toEqual([]);
  expect(whole.currentPaths).toEqual(rootFolder.currentPaths);
  expect(whole.currentPaths).toContain("packages/a/src/authored.ts");
  for (const ignored of ["node_modules/ambient/index.ts", "reports/ambient.ts", "packages/a/dist/ambient.ts"]) {
    expect(whole.currentPaths).not.toContain(ignored);
  }
  expect(whole.inventory).toMatchObject({ source: "git", untrackedCount: 1, authoredCount: whole.currentPaths.length });
  expect(whole.inventory.trackedCommand).toContain("ls-files");
  expect(whole.inventory.untrackedCommand).toContain("--exclude-standard");
});

test("asserted scopes refuse empty, duplicate, missing, ignored, malformed, traversal, and wrong-kind paths", ({ scratch }) => {
  plantRepo(scratch);
  const cases: readonly PolicyScopeRequest[] = [
    { kind: "file", paths: [] },
    { kind: "file", paths: ["packages/a/src/main.ts", "packages/a/src/main.ts"] },
    { kind: "file", paths: ["missing.ts"] },
    { kind: "file", paths: ["packages/a/src"] },
    { kind: "file", paths: ["reports/ambient.ts"] },
    { kind: "file", paths: ["../outside.ts"] },
    { kind: "file", paths: [join(scratch, "packages/a/src/main.ts")] },
    { kind: "file", paths: ["packages\\a\\src\\main.ts"] },
    { kind: "folder", path: "packages/a/src/main.ts" },
    { kind: "folder", path: "empty" },
    { kind: "folder", path: "missing" },
    { kind: "folder", path: "packages/a/../b" },
    { kind: "package", name: "@fixture/missing" },
    { kind: "package", name: "  " },
    { kind: "project", config: "packages/a/tsconfig.missing.json" },
    { kind: "project", config: "../tsconfig.json" },
  ];
  for (const request of cases) {
    expect(() => resolvePolicyScope(scratch, request), JSON.stringify(request)).toThrow();
  }
  expect(() => resolvePolicyScope(scratch, { kind: "whole", extra: true } as never)).toThrow(/scope request/i);
});

test("Git-authored internal symlink aliases stay distinct and selectable while an external escape refuses", ({ scratch }) => {
  plantRepo(scratch);
  symlinkSync("main.ts", join(scratch, "packages/a/src/alias-a.ts"), "file");
  symlinkSync("main.ts", join(scratch, "packages/a/src/alias-b.ts"), "file");
  symlinkSync("packages/a/src", join(scratch, "src-dir-link"), "dir");
  git(scratch, "add", "packages/a/src/alias-a.ts", "packages/a/src/alias-b.ts", "src-dir-link");
  git(scratch, "commit", "--quiet", "-m", "internal links");

  const whole = resolvePolicyScope(scratch, { kind: "whole" });
  expect(whole.currentPaths).toEqual(expect.arrayContaining(["packages/a/src/alias-a.ts", "packages/a/src/alias-b.ts", "src-dir-link"]));
  const aliases = resolvePolicyScope(scratch, {
    kind: "file",
    paths: ["packages/a/src/alias-a.ts", "packages/a/src/alias-b.ts", "src-dir-link"],
  });
  expect(aliases.currentPaths).toEqual(["packages/a/src/alias-a.ts", "packages/a/src/alias-b.ts", "src-dir-link"]);
  const project = resolvePolicyScope(scratch, { kind: "project", config: "packages/a/tsconfig.json" });
  expect(project.programs.find((program) => program.id === "packages/a/tsconfig.json")?.files).toEqual(
    expect.arrayContaining(["packages/a/src/alias-a.ts", "packages/a/src/alias-b.ts"]),
  );

  const outside = mkdtempSync(join(tmpdir(), "orb-policy-scope-outside-"));
  try {
    writeFileSync(join(outside, "outside.ts"), "export {};\n");
    symlinkSync(join(outside, "outside.ts"), join(scratch, "escaped.ts"), "file");
    expect(() => resolvePolicyScope(scratch, { kind: "whole" })).toThrow(/outside repository/i);
    expect(() => resolvePolicyScope(scratch, { kind: "file", paths: ["escaped.ts"] })).toThrow(/outside repository/i);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("changed preserves add, modify, delete, rename, and untracked semantics while current paths exclude deletions", ({ scratch }) => {
  plantRepo(scratch);
  git(scratch, "checkout", "--quiet", "-b", "feature");
  writeFileSync(join(scratch, "packages/a/src/shared.ts"), "export const shared = false;\n");
  writeFileSync(join(scratch, "packages/a/src/staged.ts"), "export const staged = true;\n");
  git(scratch, "add", "packages/a/src/staged.ts");
  writeFileSync(join(scratch, "packages/a/src/untracked.ts"), "export const untracked = true;\n");
  git(scratch, "mv", "packages/a/src/main.ts", "packages/a/src/renamed.ts");
  writeFileSync(join(scratch, "packages/a/src/main.ts"), "export const replacement = true;\n");
  git(scratch, "rm", "--quiet", "packages/b/src/b.ts");
  mkdirSync(join(scratch, "packages/b/src"), { recursive: true });
  writeFileSync(join(scratch, "packages/b/src/b.ts"), "export const replacement = true;\n");

  const changed = resolvePolicyScope(scratch, { kind: "changed" });
  expect(changed.semanticPaths).toEqual(
    expect.arrayContaining([
      { path: "packages/a/src/main.ts", status: "deleted", previousPath: null },
      { path: "packages/a/src/main.ts", status: "added", previousPath: null },
      { path: "packages/a/src/renamed.ts", status: "renamed-existing", previousPath: "packages/a/src/main.ts" },
      { path: "packages/a/src/shared.ts", status: "modified", previousPath: null },
      { path: "packages/a/src/staged.ts", status: "added", previousPath: null },
      { path: "packages/a/src/untracked.ts", status: "added", previousPath: null },
      { path: "packages/b/src/b.ts", status: "deleted", previousPath: null },
      { path: "packages/b/src/b.ts", status: "added", previousPath: null },
    ]),
  );
  expect(changed.requestedPaths).toEqual(changed.semanticPaths);
  expect(changed.semanticPaths.map((path) => path.path)).toEqual([
    "packages/a/src/main.ts",
    "packages/a/src/main.ts",
    "packages/a/src/renamed.ts",
    "packages/a/src/shared.ts",
    "packages/a/src/staged.ts",
    "packages/a/src/untracked.ts",
    "packages/b/src/b.ts",
    "packages/b/src/b.ts",
  ]);
  expect(changed.currentPaths).toEqual([
    "packages/a/src/main.ts",
    "packages/a/src/renamed.ts",
    "packages/a/src/shared.ts",
    "packages/a/src/staged.ts",
    "packages/a/src/untracked.ts",
    "packages/b/src/b.ts",
  ]);
  expect(changed.inventory.mergeBase?.ref).toBe("main");
  expect(changed.ownership.find((row) => row.path === "packages/a/src/main.ts" && row.status === "deleted")).toMatchObject({
    reason: "deleted-conservative-all-programs",
    programIds: changed.programs.map((program) => program.id),
  });
  expect(changed.ownership.find((row) => row.path === "packages/a/src/renamed.ts")).toMatchObject({
    reason: "compiler-membership",
    programIds: ["packages/a/tsconfig.json"],
  });
});

test("changed is explicitly empty on a clean tree", ({ scratch }) => {
  plantRepo(scratch);
  const changed = resolvePolicyScope(scratch, { kind: "changed" });
  expect(changed).toMatchObject({ kind: "changed", requestedPaths: [], currentPaths: [], semanticPaths: [], ownership: [] });
});

test("changed falls back from missing local main to origin/main", ({ scratch }) => {
  plantRepo(scratch);
  const base = git(scratch, "rev-parse", "main");
  git(scratch, "checkout", "--quiet", "-b", "feature");
  git(scratch, "update-ref", "refs/remotes/origin/main", base);
  git(scratch, "branch", "-D", "main");
  writeFileSync(join(scratch, "packages/a/src/main.ts"), "export const main = false;\n");
  git(scratch, "add", "packages/a/src/main.ts");
  git(scratch, "commit", "--quiet", "-m", "feature change");

  const changed = resolvePolicyScope(scratch, { kind: "changed" });
  expect(changed.semanticPaths).toContainEqual({ path: "packages/a/src/main.ts", status: "modified", previousPath: null });
  expect(changed.inventory.mergeBase).toEqual({ ref: "origin/main", commit: base });
});

test("changed uses origin/main for an ahead main checkout and local main for an offline linked worktree", ({ scratch }) => {
  const mainAhead = join(scratch, "main-ahead");
  mkdirSync(mainAhead);
  plantRepo(mainAhead);
  const published = git(mainAhead, "rev-parse", "HEAD");
  git(mainAhead, "update-ref", "refs/remotes/origin/main", published);
  writeFileSync(join(mainAhead, "committed.ts"), "export const committed = true;\n");
  git(mainAhead, "add", "committed.ts");
  git(mainAhead, "commit", "--quiet", "-m", "local main ahead");

  const changedMain = resolvePolicyScope(mainAhead, { kind: "changed" });
  expect(changedMain.inventory.mergeBase).toEqual({ ref: "origin/main", commit: published });
  expect(changedMain.semanticPaths).toContainEqual({ path: "committed.ts", status: "added", previousPath: null });

  const source = join(scratch, "worktree-source");
  const linked = join(scratch, "offline-worktree");
  mkdirSync(source);
  plantRepo(source);
  git(source, "worktree", "add", "--quiet", "-b", "feature", linked, "main");
  writeFileSync(join(linked, "worktree-commit.ts"), "export const worktree = true;\n");
  git(linked, "add", "worktree-commit.ts");
  git(linked, "commit", "--quiet", "-m", "worktree commit");

  const changedWorktree = resolvePolicyScope(linked, { kind: "changed" });
  expect(changedWorktree.inventory.mergeBase?.ref).toBe("main");
  expect(changedWorktree.semanticPaths).toContainEqual({ path: "worktree-commit.ts", status: "added", previousPath: null });
});

test("project membership follows compiler include, exclude, multiple ownership, and recursive references", ({ scratch }) => {
  plantRepo(scratch);
  const project = resolvePolicyScope(scratch, { kind: "project", config: "packages/a/tsconfig.json" });
  const app = project.programs.find((program) => program.id === "packages/a/tsconfig.json");
  const dependency = project.programs.find((program) => program.id === "packages/b/tsconfig.json");
  expect(app).toMatchObject({ references: ["packages/b/tsconfig.json"] });
  expect(app?.files).toContain("packages/a/src/main.ts");
  expect(app?.files).not.toContain("packages/a/src/excluded.ts");
  expect(dependency?.files).toContain("packages/a/src/shared.ts");
  expect(project.ownership.find((row) => row.path === "packages/a/src/shared.ts")?.programIds).toEqual([
    "packages/a/tsconfig.json",
    "packages/b/tsconfig.json",
  ]);
});

test("direct, inherited, and references-only config changes select every dependent program", ({ scratch }) => {
  plantRepo(scratch);
  mkdirSync(join(scratch, "configs"));
  writeJson(join(scratch, "configs/tsconfig.base-a.json"), { files: [], compilerOptions: { strict: true } });
  writeJson(join(scratch, "configs/tsconfig.base-b.json"), {
    extends: "./tsconfig.base-a.json",
    files: [],
    compilerOptions: { noUncheckedIndexedAccess: true },
  });
  writeJson(join(scratch, "packages/a/tsconfig.json"), {
    extends: ["../../configs/tsconfig.base-a.json", "../../configs/tsconfig.base-b.json"],
    compilerOptions: { composite: true },
    include: ["src/**/*.ts"],
  });
  writeJson(join(scratch, "packages/b/tsconfig.json"), {
    extends: "../../configs/tsconfig.base-a.json",
    compilerOptions: { composite: true },
    include: ["src/**/*.ts"],
  });
  writeJson(join(scratch, "tsconfig.solution.json"), {
    files: [],
    references: [{ path: "./packages/a" }, { path: "./packages/b" }],
  });

  const expected = ["packages/a/tsconfig.json", "packages/b/tsconfig.json", "tsconfig.solution.json"];
  expect(resolvePolicyScope(scratch, { kind: "file", paths: ["configs/tsconfig.base-a.json"] }).requestedProgramIds).toEqual(expected);
  expect(resolvePolicyScope(scratch, { kind: "file", paths: ["configs/tsconfig.base-b.json"] }).requestedProgramIds).toEqual([
    "packages/a/tsconfig.json",
    "tsconfig.solution.json",
  ]);
  expect(resolvePolicyScope(scratch, { kind: "file", paths: ["packages/a/tsconfig.json"] }).requestedProgramIds).toEqual([
    "packages/a/tsconfig.json",
    "tsconfig.solution.json",
  ]);
  expect(resolvePolicyScope(scratch, { kind: "file", paths: ["tsconfig.solution.json"] }).requestedProgramIds).toEqual(expected);
});

test("unknown request-key diagnostics are sorted and independent of insertion order", ({ scratch }) => {
  plantRepo(scratch);
  const message = (request: object): string => {
    try {
      resolvePolicyScope(scratch, request as never);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error("malformed request unexpectedly resolved");
  };
  const first = message({ kind: "whole", zebra: true, alpha: true });
  const second = message({ alpha: true, zebra: true, kind: "whole" });
  expect(first).toBe(second);
  expect(first).toContain('"alpha", "zebra"');
});

test("malformed, unresolved-reference, and zero-member compiler configs refuse", ({ scratch }) => {
  const malformed = join(scratch, "malformed");
  mkdirSync(malformed);
  plantRepo(malformed);
  writeFileSync(join(malformed, "packages/a/tsconfig.json"), "{\n");
  expect(() => resolvePolicyScope(malformed, { kind: "project", config: "packages/a/tsconfig.json" })).toThrow(/tsconfig|json/i);

  const unresolved = join(scratch, "unresolved");
  mkdirSync(unresolved);
  plantRepo(unresolved);
  writeJson(join(unresolved, "packages/a/tsconfig.json"), {
    extends: "../../tsconfig.base.json",
    include: ["src/**/*.ts"],
    references: [{ path: "../missing" }],
  });
  expect(() => resolvePolicyScope(unresolved, { kind: "project", config: "packages/a/tsconfig.json" })).toThrow(/reference|config/i);

  const zero = join(scratch, "zero-root");
  mkdirSync(zero);
  plantRepo(zero);
  mkdirSync(join(zero, "zero"));
  writeJson(join(zero, "zero/tsconfig.json"), { include: ["missing/**/*.ts"] });
  expect(() => resolvePolicyScope(zero, { kind: "project", config: "zero/tsconfig.json" })).toThrow(/zero|no authored/i);
});

test("Git failures are loud rather than empty selections", ({ scratch }) => {
  writeJson(join(scratch, "package.json"), { name: "not-a-repository" });
  expect(() => resolvePolicyScope(scratch, { kind: "whole" })).toThrow(/git .*failed/i);
});
