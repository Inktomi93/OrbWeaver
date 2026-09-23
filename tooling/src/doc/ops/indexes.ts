// `pnpm doc index`: write every generated file (the three indexes and each plan's `tasks.md`) from the
// governed docs. Every write verb calls this after its own write, so an agent never regenerates by hand
// except after a manual move. Returns the paths whose bytes changed.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { expectedGeneratedFiles } from "../lib/generated.ts";
import { governedPaths, readDoc, root, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc index");

export function regenerateIndexes(repoRoot = root): readonly string[] {
  const docs = governedPaths(repoRoot).map((path) => readDoc(path, repoRoot));
  const changed: string[] = [];
  for (const [path, source] of expectedGeneratedFiles(docs)) {
    const abs = join(repoRoot, path);
    if (existsSync(abs) && readFileSync(abs, "utf8") === source) {
      continue;
    }
    writeDoc(path, source, repoRoot);
    changed.push(path);
  }
  return changed;
}
