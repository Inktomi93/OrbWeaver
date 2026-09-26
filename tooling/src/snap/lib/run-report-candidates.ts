// Filesystem candidate discovery for Snap report readers. Validation remains in the strict public reader.
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { reportsPath } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runGit } from "../../_shared/git.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

const RUN_INDEX = "run.json";
const WORKTREE_OUTPUT_MAX_BYTES = 4_194_304;

/** ENOTDIR IS "ABSENT", NOT "BROKEN". `reports/runs/<instrument>/` holds one directory per run slot AND
 *  the retention ring's `.pruned.jsonl` ledger (`_shared/run-retention.ts`), so statting `<entry>/run.json`
 *  over that ledger raises ENOTDIR — the parent is a file. Treating it as an error made a bare
 *  `pnpm snap --reports` throw TOOL ERROR on every checkout whose ring had ever fired, which is a reader
 *  crashing on a file its own writer put there. A non-directory entry simply has no run index. */
function isMissingPath(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = Reflect.get(error, "code");
  return code === "ENOENT" || code === "ENOTDIR";
}

export function snapWorktreeRoots(root: string): readonly string[] {
  const result = runGit(root, ["worktree", "list", "--porcelain"], { maxBuffer: WORKTREE_OUTPUT_MAX_BYTES });
  if (result.status !== 0) {
    return [root];
  }
  const roots = result.stdout
    .split(/\r?\n/u)
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
