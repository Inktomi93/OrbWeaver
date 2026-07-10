// Shared scaffolding for the gate self-tests (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Gate Checks read `CheckContext = { root, project }`; a self-test drives the Check directly over a
// synthetic tree instead of the real repo. Two flavors, both hoisted here from ~15 gate tests that had
// byte-identical copies:
//   • `ctxFor`/`ctxAt` — an in-memory ts-morph project (for gates that walk `ctx.project`'s AST).
//   • `withTree` — a REAL temp-dir fixture (for gates that line-count / stat the fs directly, ignoring
//     `ctx.project`); auto-cleaned in `finally`.
// A gate test that layers extra scaffold files into its tree (client-structure's domain-mirror seed) keeps
// its own wrapper — this home carries only the byte-identical shape.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project } from "ts-morph";
import type { CheckContext } from "../../scripts/check/harness.ts";

/** A `CheckContext` whose in-memory project holds `files` (path → source), rooted at `root`. */
export function ctxFor(files: Record<string, string>, root = "/repo"): CheckContext {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, text);
  }
  return { root, project };
}

/** A `CheckContext` at `root` with an empty throwaway project — for gates that read the fs directly and
 *  ignore `ctx.project` (pair with `withTree`). */
export function ctxAt(root: string): CheckContext {
  return { root, project: new Project({ useInMemoryFileSystem: true }) };
}

/** Materialize `files` (relative path → source) into a fresh temp dir, run `fn(root)`, then remove it. */
export function withTree(files: Record<string, string>, fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "orb-gate-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, text);
    }
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
