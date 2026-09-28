// Git index membership is independent of authored disk/overlay liveness and loaded once by the host.

import { resolve } from "node:path";
import { runGit } from "@orb/tooling/_shared/git";
import { budget } from "@orb/tooling/_shared/load-budget";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad, ResourceSubprocessReceipt, TrackedFileModeOverlay, TrackedResourceIndex } from "../contract/resource.ts";
import { normalizePathSet } from "../lib/policy-validation.ts";
import { candidateIndexGitEnvironment } from "./resource-index.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

const GIT_INDEX_TIMEOUT_BASE_MS = 30_000;
const GIT_INDEX_TIMEOUT_MS = budget(GIT_INDEX_TIMEOUT_BASE_MS);
const GIT_INDEX_MAX_BYTES = 16_777_216;
const GIT_INDEX_METADATA_FIELDS = 3;

interface TrackedEntry {
  readonly mode: string;
  readonly path: string;
}

function parseTrackedEntries(stdout: string): readonly TrackedEntry[] {
  return stdout
    .slice(0, -1)
    .split("\0")
    .map((row) => {
      const separator = row.indexOf("\t");
      if (separator < 0) {
        throw new Error("tracked resource index row has no metadata separator");
      }
      const metadata = row.slice(0, separator).split(" ");
      if (
        metadata.length !== GIT_INDEX_METADATA_FIELDS ||
        !/^[0-7]{6}$/u.test(metadata[0] ?? "") ||
        !/^[0-9a-f]+$/u.test(metadata[1] ?? "") ||
        !/^[0-3]$/u.test(metadata[2] ?? "")
      ) {
        throw new Error(`tracked resource index row has malformed metadata: ${row.slice(0, separator)}`);
      }
      return { mode: metadata[0] as string, path: row.slice(separator + 1) };
    });
}

function executablePathsFor(
  entries: readonly TrackedEntry[],
  repoPaths: readonly string[],
  modeOverlays: readonly TrackedFileModeOverlay[],
): readonly string[] {
  const executable = new Set(entries.filter(({ mode }) => mode === "100755").map(({ path }) => path));
  const overlaid = new Set<string>();
  for (const [index, overlay] of modeOverlays.entries()) {
    const [path] = normalizePathSet([overlay.path], `tracked mode overlay[${String(index)}] path`);
    if (path === undefined || !repoPaths.includes(path)) {
      throw new Error(`tracked mode overlay path is not in the candidate index: ${String(path ?? overlay.path)}`);
    }
    if (overlaid.has(path)) {
      throw new Error(`tracked mode overlay path is declared more than once: ${path}`);
    }
    if (typeof overlay.executable !== "boolean") {
      throw new Error(`tracked mode overlay executable must be boolean: ${path}`);
    }
    overlaid.add(path);
    if (overlay.executable) {
      executable.add(path);
    } else {
      executable.delete(path);
    }
  }
  return normalizePathSet([...executable], "tracked executable resource path");
}

export function loadTrackedFiles(root: string, modeOverlays: readonly TrackedFileModeOverlay[] = []): ResourceLoad<TrackedResourceIndex> {
  const result = runGit(resolve(root), ["ls-files", "--stage", "-z", "--full-name"], {
    // Membership and staged bytes must describe the same candidate transaction. The shared environment
    // selector preserves a hook's GIT_INDEX_FILE only at the real invocation root.
    extra: candidateIndexGitEnvironment(root),
    timeout: GIT_INDEX_TIMEOUT_MS,
    maxBuffer: GIT_INDEX_MAX_BYTES,
  });
  const subprocess: ResourceSubprocessReceipt = {
    command: "git-index",
    exitStatus: result.status,
    timeoutMs: GIT_INDEX_TIMEOUT_MS,
  };
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
    if (modeOverlays.length > 0) {
      return {
        status: "unresolved",
        paths: [],
        members: 0,
        subprocess,
        reason: `tracked mode overlay path is not in the candidate index: ${modeOverlays[0]?.path ?? "(missing path)"}`,
      };
    }
    return { status: "empty", paths: [], members: 0, subprocess, reason: "git index contains no tracked files" };
  }
  if (!result.stdout.endsWith("\0")) {
    return { status: "unresolved", paths: [], members: 0, subprocess, reason: "git index output is not NUL-terminated" };
  }
  try {
    const entries = parseTrackedEntries(result.stdout);
    const repoPaths = normalizePathSet(
      entries.map(({ path }) => path),
      "tracked resource path",
    );
    const executablePaths = executablePathsFor(entries, repoPaths, modeOverlays);
    return {
      status: "ready",
      paths: repoPaths,
      members: repoPaths.length,
      value: { repoPaths, executablePaths },
      subprocess,
    };
  } catch (error) {
    return { status: "unresolved", paths: [], members: 0, subprocess, reason: error instanceof Error ? error.message : String(error) };
  }
}
