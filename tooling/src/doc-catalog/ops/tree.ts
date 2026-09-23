// Everything that TOUCHES the tree: the tracked-document read, the lane→path resolution, and the
// biome-normalised JSON writer. The pure rules (lib/) take their input from here,
// never the reverse.
import { globSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, runId } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { execNicedSync } from "../../_shared/proc.ts";
import type { Doc, Lane, LaneConfig, Receipt } from "../contract/types.ts";
import { frontmatterErrors, parseFrontmatter } from "../lib/frontmatter.ts";
import { CATALOG_DIR, DOC_TOOL_TREE_PREFIXES, OUTPUT_PATH, RECEIPTS_DIR } from "../lib/vocab.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:docs (node tooling/src/doc-catalog/cli.ts <verb>)");

export const root = REPO_ROOT;

export function json<T>(path: string, repoRoot = root): T {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as T;
}

/** Serialize through the repo's OWN formatter so the generated catalog is byte-stable against
 *  `pnpm format`. Formats a TEMP FILE inside docs/catalog (so biome.json's maxSize override matches)
 *  with the biome BINARY invoked directly — never `pnpm exec` + stdin: the double-hop with a
 *  synchronous `input` buffer throws ENOBUFS past ~1 MiB, and the stdin route was also the
 *  silent-empty-output path when the payload crossed `files.maxSize`.
 *
 *  THE TEMP NAME IS PER-INVOCATION (#1029): two concurrent runs on one checkout must never share a
 *  scratch file. */
export function stableJson(value: unknown, repoRoot = root): string {
  const source = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = join(repoRoot, `${CATALOG_DIR}/catalog.tmp.${runId(repoRoot)}.json`);
  try {
    writeFileSync(tmp, source);
    execNicedSync(join(root, "node_modules/.bin/biome"), ["format", "--write", tmp], { cwd: repoRoot });
    const formatted = readFileSync(tmp, "utf8");
    // FAIL LOUD, never write garbage: an empty or non-JSON round-trip is a tool failure, not a result.
    if (formatted.trim() === "") {
      throw new Error(`stableJson: biome produced empty output for ${OUTPUT_PATH} — refusing to write 0 bytes`);
    }
    JSON.parse(formatted);
    return formatted;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** The catalog's corpus = TRACKED markdown under docs/ (git, not a glob — an untracked draft is not a
 *  document, and a deleted-but-unstaged one is) MINUS the trees the `doc` tool governs: those carry no
 *  lane row by design (`lib/vocab.ts#DOC_TOOL_TREES`), and `pnpm check:agents` is their checker. */
function trackedDocs(repoRoot = root, isolateGitEnvironment = false): readonly string[] {
  return execNicedSync(
    isolateGitEnvironment ? "env" : "git",
    isolateGitEnvironment
      ? ["-u", "GIT_DIR", "-u", "GIT_WORK_TREE", "-u", "GIT_INDEX_FILE", "git", "ls-files", "-z", "--", "docs"]
      : ["ls-files", "-z", "--", "docs"],
    { cwd: repoRoot },
  )
    .split("\0")
    .filter((path) => path.endsWith(".md") && !DOC_TOOL_TREE_PREFIXES.some((prefix) => path.startsWith(prefix)))
    .sort();
}

export function documents(repoRoot = root, isolateGitEnvironment = false): readonly Doc[] {
  return trackedDocs(repoRoot, isolateGitEnvironment).map((path) => {
    const frontmatter = parseFrontmatter(readFileSync(join(repoRoot, path), "utf8"), path);
    return {
      path,
      frontmatter: {
        ...frontmatter,
        errors: frontmatterErrors(path, frontmatter),
      },
    };
  });
}

function pathsForLane(lane: Lane, repoRoot: string): ReadonlySet<string> {
  const included = new Set(lane.patterns.flatMap((pattern) => globSync(pattern, { cwd: repoRoot })));
  for (const pattern of lane.excludePatterns ?? []) {
    for (const path of globSync(pattern, { cwd: repoRoot })) {
      included.delete(path);
    }
  }
  return included;
}

/** EXACTLY one lane owns each document. Zero or two owners is a config error, not a warning. */
export function laneAssignments(config: LaneConfig, docs: readonly Doc[], repoRoot = root): ReadonlyMap<string, Lane> {
  const matches = new Map<string, Lane[]>();
  for (const lane of config.lanes) {
    for (const path of pathsForLane(lane, repoRoot)) {
      matches.set(path, [...(matches.get(path) ?? []), lane]);
    }
  }
  const result = new Map<string, Lane>();
  const errors: string[] = [];
  for (const doc of docs) {
    const owners = matches.get(doc.path) ?? [];
    if (owners.length !== 1) {
      errors.push(`${doc.path}: expected one lane, got ${owners.map((lane) => lane.id).join(", ") || "none"}`);
      continue;
    }
    result.set(doc.path, owners[0] as Lane);
  }
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return result;
}

export function receiptPath(lane: Lane): string {
  return `${RECEIPTS_DIR}/${lane.id}.json`;
}

export function loadReceipts(config: LaneConfig, repoRoot = root): readonly Receipt[] {
  return config.lanes.map((lane) => json<Receipt>(receiptPath(lane), repoRoot));
}
