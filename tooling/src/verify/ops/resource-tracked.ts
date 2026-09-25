// Git index membership is independent of authored disk/overlay liveness and loaded once by the host.

import { resolve } from "node:path";
import { runGit } from "@orb/tooling/_shared/git";
import { budget } from "@orb/tooling/_shared/load-budget";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad, ResourceSubprocessReceipt, TrackedResourceIndex } from "../contract/resource.ts";
import { normalizePathSet } from "../lib/policy-validation.ts";
import { candidateIndexGitEnvironment } from "./resource-index.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

const GIT_INDEX_TIMEOUT_BASE_MS = 30_000;
const GIT_INDEX_TIMEOUT_MS = budget(GIT_INDEX_TIMEOUT_BASE_MS);
const GIT_INDEX_MAX_BYTES = 16_777_216;

export function loadTrackedFiles(root: string): ResourceLoad<TrackedResourceIndex> {
  const result = runGit(resolve(root), ["ls-files", "-z", "--full-name"], {
    // Membership and staged bytes must describe the same candidate transaction. The shared environment
    // selector preserves a hook's GIT_INDEX_FILE only at the real invocation root.
    extra: candidateIndexGitEnvironment(root),
    timeout: GIT_INDEX_TIMEOUT_MS,
    maxBuffer: GIT_INDEX_MAX_BYTES,
  });
  const subprocess: ResourceSubprocessReceipt = { command: "git-index", exitStatus: result.status, timeoutMs: GIT_INDEX_TIMEOUT_MS };
  if (result.status !== 0) {
    return {
      status: "unresolved",
      paths: [],
      members: 0,
      subprocess,
      reason: `git index could not resolve (${String(result.status)}): ${result.stderr.trim()}`,
    };
  }
  if (result.stdout.length === 0) {
    return { status: "empty", paths: [], members: 0, subprocess, reason: "git index contains no tracked files" };
  }
  if (!result.stdout.endsWith("\0")) {
    return { status: "unresolved", paths: [], members: 0, subprocess, reason: "git index output is not NUL-terminated" };
  }
  try {
    const repoPaths = normalizePathSet(result.stdout.slice(0, -1).split("\0"), "tracked resource path");
    return { status: "ready", paths: repoPaths, members: repoPaths.length, value: { repoPaths }, subprocess };
  } catch (error) {
    return { status: "unresolved", paths: [], members: 0, subprocess, reason: error instanceof Error ? error.message : String(error) };
  }
}
