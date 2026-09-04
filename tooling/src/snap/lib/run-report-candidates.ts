// Filesystem candidate discovery for Snap report readers. Validation remains in the strict public reader.
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { reportsPath } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runNicedSync } from "../../_shared/proc.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

const RUN_INDEX = "run.json";
const WORKTREE_OUTPUT_MAX_BYTES = 4_194_304;

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT";
}

export function snapWorktreeRoots(root: string): readonly string[] {
  const result = runNicedSync("git", ["worktree", "list", "--porcelain"], { cwd: root, maxBuffer: WORKTREE_OUTPUT_MAX_BYTES });
  if (result.status !== 0) {
    return [root];
  }
  const roots = result.stdout
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
  return roots.length === 0 ? [root] : roots;
}

async function existingIndex(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (isMissingPath(error)) {
      return false;
    }
    throw error;
  }
}

export async function localSnapRunIndexPaths(root: string): Promise<readonly string[]> {
  const runs = reportsPath(root, "runs", "snap");
  let names: readonly string[];
  try {
    names = await readdir(runs);
  } catch (error) {
    if (isMissingPath(error)) {
      return [];
    }
    throw error;
  }
  const candidates = await Promise.all(
    names.map(async (name) => {
      const path = join(runs, name, RUN_INDEX);
      return (await existingIndex(path)) ? path : null;
    }),
  );
  return candidates.filter((path): path is string => path !== null);
}

export async function directSnapRunIndexCandidates(root: string, runId: string): Promise<readonly string[]> {
  const candidates: string[] = [];
  for (const worktree of snapWorktreeRoots(root)) {
    const path = reportsPath(worktree, "runs", "snap", runId, RUN_INDEX);
    if (await existingIndex(path)) {
      candidates.push(path);
    }
  }
  return candidates;
}
