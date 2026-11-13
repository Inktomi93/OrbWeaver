// `pnpm doc index`: write every generated file (the four indexes and each plan's `tasks.md`) from the
// governed docs, and DELETE a `tasks.md` whose plan has no items left — an orphan generated file would
// otherwise stay forever, stale by definition. Every write verb calls this after its own write, so an
// agent never regenerates by hand except after a manual move. Returns the paths whose bytes changed or
// that were removed.
// A failed write rolls back through `rollBack`, which regenerates after the put-back. Generated files are therefore
// never a verb's `created` paths: another process may have written in the plan meanwhile, so the indexes are rebuilt
// from the tree that remains, and that rebuild also removes a task list the restored tree no longer implies.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { WrittenPaths } from "../contract/types.ts";
import { expectedGeneratedFiles } from "../lib/generated.ts";
import { isGeneratedPath } from "../lib/indexes.ts";
import type { PriorFiles } from "./tree.ts";
import { governedPaths, putBack, readDoc, root, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc index");

export function regenerateIndexes(repoRoot = root): readonly string[] {
  const paths = governedPaths(repoRoot);
  const docs = paths.map((path) => readDoc(path, repoRoot));
  const expected = expectedGeneratedFiles(docs);
  const changed: string[] = [];
  for (const [path, source] of expected) {
    const abs = join(repoRoot, path);
    if (existsSync(abs) && readFileSync(abs, "utf8") === source) {
      continue;
    }
    writeDoc(path, source, repoRoot);
    changed.push(path);
  }
  for (const path of paths) {
    if (isGeneratedPath(path) && !expected.has(path)) {
      rmSync(join(repoRoot, path));
      changed.push(path);
    }
  }
  return changed;
}

/** What a refusal says once {@link rollBack} ran. */
export const ROLLED_BACK = "Nothing this write made remains: the item files are as they were and the indexes match them";

/** Undo a write whose commit failed: put back what it touched, then rebuild the indexes from the restored tree, so
 *  no index links a file the put-back removed. */
export function rollBack(touched: WrittenPaths, prior: PriorFiles, repoRoot = root): void {
  putBack(touched, prior, repoRoot);
  regenerateIndexes(repoRoot);
}
