// Repo-relative path primitives shared by the selection resolver and its two derived views (program
// routing, the CT view). Split out of lib/selection.ts at the @orb/tooling P6 move (size cap §4.3) so the
// three modules agree on ONE root and ONE existence test rather than re-deriving either.
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { execNicedSync } from "@orb/tooling/_shared/proc";

export const ROOT = process.cwd();

/** The git-changed set: `git diff --name-only HEAD` (staged + unstaged vs HEAD), repo-relative posix. */
export function gitChangedPaths(): readonly string[] {
  return execNicedSync("git", ["diff", "--name-only", "HEAD"], { cwd: ROOT })
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Normalize a caller-supplied path (abs or cwd-relative) to a repo-relative posix path. A path outside
 *  the repo is dropped. Deletions are KEPT (a path that no longer exists on disk stays in the set). */
export function toRepoRel(arg: string): string | undefined {
  const abs = isAbsolute(arg) ? arg : resolve(ROOT, arg);
  const rel = relative(ROOT, abs);
  return rel.startsWith("..") ? undefined : rel;
}

/** True iff a repo-relative path currently exists on disk. A git-changed set (`git diff --name-only HEAD`)
 *  KEEPS deletions; the per-tool file-list views (eslint/depcruise/docs — each hands CONCRETE file args to
 *  a child that errors on a nonexistent path) must drop them, while `paths` + `tsconfigs` keep them (the
 *  structure walk + the deleted file's OWNING per-package typecheck legitimately reason about a deletion). */
export function existsRel(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

export function packageDir(name: string): string {
  return name.startsWith("@orb/") ? name.slice("@orb/".length) : name;
}

/** A caller-facing existence check for `--file` paths (the check:file muscle memory refused bad paths). */
export function badPaths(paths: readonly string[]): readonly string[] {
  return paths.filter((p) => {
    const abs = isAbsolute(p) ? p : resolve(ROOT, p);
    const rel = relative(ROOT, abs);
    return rel.startsWith("..") || !existsSync(abs);
  });
}
