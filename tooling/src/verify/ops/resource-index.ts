// Candidate-index acquisition for the tracked-files resource family. Git's index is a separate authored
// transaction from the working tree; reading the latter cannot prove what the next commit will contain.

import { resolve } from "node:path";
import process from "node:process";
import { budget } from "@orb/tooling/_shared/load-budget";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad, ResourceSubprocessReceipt } from "../contract/resource.ts";
import type { CandidateIndexDelta, CandidateIndexTextFile } from "../contract/resource-index.ts";
import { normalizePathSet } from "../lib/policy-validation.ts";
import { GIT_READ_PREFIX, repoGitEnvironment } from "../lib/repo-paths.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

const GIT_INDEX_TIMEOUT_BASE_MS = 30_000;
const GIT_INDEX_TIMEOUT_MS = budget(GIT_INDEX_TIMEOUT_BASE_MS);
const GIT_INDEX_MAX_BYTES = 16_777_216;

/** A real-root pass must honor the hook's temporary `GIT_INDEX_FILE`; an isolated proof root must not
 *  inherit that unrelated index. Every other Git routing variable stays stripped in both forms. */
export function candidateIndexGitEnvironment(
  root: string,
  ambient: NodeJS.ProcessEnv = inheritedProcessEnv(),
  processRoot: string = process.cwd(),
): NodeJS.ProcessEnv {
  const clean = repoGitEnvironment();
  const indexFile = ambient["GIT_INDEX_FILE"];
  return resolve(root) === resolve(processRoot) && indexFile !== undefined ? { ...clean, ["GIT_INDEX_FILE"]: indexFile } : clean;
}

function subprocess(status: number | null): ResourceSubprocessReceipt {
  return { command: "git-index", exitStatus: status, timeoutMs: GIT_INDEX_TIMEOUT_MS };
}

function failure(status: number | null, detail: string): ResourceLoad<CandidateIndexDelta> {
  return { status: "unresolved", paths: [], members: 0, subprocess: subprocess(status), reason: detail };
}

export function loadCandidateIndexDelta(root: string, demandedPaths: readonly string[]): ResourceLoad<CandidateIndexDelta> {
  const demandedPathsNormalized = normalizePathSet(demandedPaths, "candidate index path");
  if (demandedPathsNormalized.length === 0) {
    return { status: "empty", paths: [], members: 0, reason: "candidate index delta was demanded for zero paths" };
  }
  const demanded = new Set(demandedPathsNormalized);
  const env = candidateIndexGitEnvironment(root);
  const diff = runNicedSync("git", [...GIT_READ_PREFIX, "diff-files", "--name-only", "-z", "--"], {
    cwd: resolve(root),
    env,
    timeout: GIT_INDEX_TIMEOUT_MS,
    maxBuffer: GIT_INDEX_MAX_BYTES,
  });
  if (diff.status !== 0) {
    return failure(diff.status, `candidate index delta could not resolve (${String(diff.status)}): ${diff.stderr.trim()}`);
  }
  if (diff.stdout !== "" && !diff.stdout.endsWith("\0")) {
    return failure(diff.status, "candidate index delta output is not NUL-terminated");
  }

  let changed: readonly string[];
  // @orb-waive caught-failure-ownership(error): resource-index resolution: error surfaces as a structured tool-error in the resource-index report; the broken index is excluded
  try {
    changed = normalizePathSet(diff.stdout === "" ? [] : diff.stdout.slice(0, -1).split("\0"), "candidate index changed path").filter((path) =>
      demanded.has(path),
    );
  } catch (error) {
    return failure(diff.status, error instanceof Error ? error.message : String(error));
  }

  const files: CandidateIndexTextFile[] = [];
  for (const path of changed) {
    const shown = runNicedSync("git", [...GIT_READ_PREFIX, "show", `:${path}`], {
      cwd: resolve(root),
      env,
      timeout: GIT_INDEX_TIMEOUT_MS,
      maxBuffer: GIT_INDEX_MAX_BYTES,
    });
    if (shown.status !== 0) {
      return failure(shown.status, `candidate index blob ${path} could not resolve (${String(shown.status)}): ${shown.stderr.trim()}`);
    }
    files.push({ path, text: shown.stdout });
  }
  return {
    status: "ready",
    value: { files },
    paths: demandedPathsNormalized,
    members: demandedPathsNormalized.length,
    subprocess: subprocess(diff.status),
  };
}
