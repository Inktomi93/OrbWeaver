// `pnpm doc index`: write every generated file (the four indexes and each plan's `tasks.md`) from the
// governed docs, and DELETE a `tasks.md` whose plan has no items left — an orphan generated file would
// otherwise stay forever, stale by definition. Every write verb calls this after its own write, so an
// agent never regenerates by hand except after a manual move. Returns the paths whose bytes changed or
// that were removed, and among them the ones this run brought into existence.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { WrittenPaths } from "../contract/types.ts";
import { expectedGeneratedFiles } from "../lib/generated.ts";
import { isGeneratedPath } from "../lib/indexes.ts";
import { governedPaths, readDoc, root, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc index");

export function regenerateIndexes(repoRoot = root): WrittenPaths {
  const paths = governedPaths(repoRoot);
  const docs = paths.map((path) => readDoc(path, repoRoot));
  const expected = expectedGeneratedFiles(docs);
  const written: string[] = [];
  const created: string[] = [];
  for (const [path, source] of expected) {
    const abs = join(repoRoot, path);
    const existed = existsSync(abs);
    if (existed && readFileSync(abs, "utf8") === source) {
      continue;
    }
    writeDoc(path, source, repoRoot);
    written.push(path);
    if (!existed) {
      created.push(path);
    }
  }
  for (const path of paths) {
    if (isGeneratedPath(path) && !expected.has(path)) {
      rmSync(join(repoRoot, path));
      written.push(path);
    }
  }
  return { written, created };
}
