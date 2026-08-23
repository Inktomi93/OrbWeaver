// Everything that TOUCHES the tree: git queries, document reads, the lane→path resolution, and the
// biome-normalised JSON writer. The pure rules (lib/) take their input from here, never the reverse.
import { createHash } from "node:crypto";
import { existsSync, globSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { execNicedSync, execNicedSyncBuffer } from "../../_shared/proc.ts";
import type { Doc, EvidenceSources, Lane, LaneConfig, Receipt, ReceiptEntry, ReceiptFacts } from "../contract/types.ts";
import { countLines, frontmatterErrors, parseFrontmatter } from "../lib/frontmatter.ts";
import {
  CATALOG_DIR,
  COMMIT_RE,
  CORE_PATH_REGISTRY_PATH,
  LEDGER_ENTRY_BOLD_RE,
  LEDGER_ENTRY_HEADING_RE,
  NUMERIC_HEADING_RE,
  OUTPUT_PATH,
  RECEIPTS_DIR,
  TEXT_EVIDENCE_EXTENSIONS,
  VENDOR_PREFIX,
} from "../lib/vocab.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:docs (node tooling/src/doc-catalog/cli.ts <verb>)");

export const root = REPO_ROOT;

export function json<T>(path: string): T {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as T;
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Serialize through the repo's OWN formatter so the generated catalog is byte-stable against
 *  `pnpm format`. Formats a TEMP FILE inside docs/catalog (so biome.json's maxSize override matches)
 *  with the biome BINARY invoked directly — never `pnpm exec` + stdin: the double-hop with a
 *  synchronous `input` buffer throws ENOBUFS past ~1 MiB, and the stdin route was also the
 *  silent-empty-output path when the payload crossed `files.maxSize` (both measured 2026-08-15). */
export function stableJson(value: unknown): string {
  const source = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = join(root, `${CATALOG_DIR}/catalog.tmp.json`);
  try {
    writeFileSync(tmp, source);
    execNicedSync(join(root, "node_modules/.bin/biome"), ["format", "--write", tmp], { cwd: root });
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

function gitResult(args: readonly string[]): string | null {
  try {
    return execNicedSync("git", args, { cwd: root }).trim();
  } catch {
    return null;
  }
}

function gitBlob(args: readonly string[]): Buffer | null {
  try {
    return execNicedSyncBuffer("git", args, { cwd: root });
  } catch {
    return null;
  }
}

/** Line counts for every tracked TEXT file — the denominator every `path:line` evidence target is
 *  bounds-checked against, resolved once per run. */
export function localEvidenceLines(): ReadonlyMap<string, number> {
  const paths = execNicedSync("git", ["ls-files", "-z"], { cwd: root })
    .split("\0")
    .filter((path) => path !== "" && TEXT_EVIDENCE_EXTENSIONS.has(extname(path)) && existsSync(join(root, path)));
  return new Map(paths.map((path) => [path, countLines(readFileSync(join(root, path)))] as const));
}

export function headAncestors(): ReadonlySet<string> {
  return new Set(
    gitResult(["rev-list", "HEAD"])
      ?.split("\n")
      .filter((commit) => commit !== "") ?? [],
  );
}

export function receiptFacts(entry: ReceiptEntry, doc: Doc, sources: EvidenceSources): ReceiptFacts {
  const commit = entry.verifiedCommit;
  const verifiedCommitExists = commit !== null && COMMIT_RE.test(commit) && gitResult(["cat-file", "-e", `${commit}^{commit}`]) !== null;
  const verifiedCommitIsAncestor = verifiedCommitExists && gitResult(["merge-base", "--is-ancestor", commit as string, "HEAD"]) !== null;
  const blob = verifiedCommitExists ? gitBlob(["show", `${commit}:${entry.path}`]) : null;
  return {
    currentSha256: doc.sha256,
    verifiedBlobSha256: blob === null ? null : sha256(blob),
    verifiedCommitExists,
    verifiedCommitIsAncestor,
    localEvidence: sources.localEvidence,
    lawSections: sources.lawSections,
    provenanceCommits: sources.ancestors,
    rulingAnchors: sources.rulingAnchors,
  };
}

/** The catalog's corpus = TRACKED markdown under docs/ (git, not a glob — an untracked draft is not a
 *  document, and a deleted-but-unstaged one is). */
function trackedDocs(): readonly string[] {
  return execNicedSync("git", ["ls-files", "-z", "--", "docs"], { cwd: root })
    .split("\0")
    .filter((path) => path.endsWith(".md"))
    .sort();
}

export function documents(): readonly Doc[] {
  return trackedDocs().map((path) => {
    const content = readFileSync(join(root, path));
    const frontmatter = parseFrontmatter(content.toString("utf8"), path);
    const vendor = path.startsWith(VENDOR_PREFIX);
    return {
      path,
      lines: countLines(content),
      bytes: content.length,
      sha256: sha256(content),
      frontmatter: {
        ...frontmatter,
        malformed: vendor ? false : frontmatter.malformed,
        errors: frontmatterErrors(path, frontmatter),
      },
    };
  });
}

/** `<law doc> §<n>` targets resolve against ACTIVE core law only, and must be UNAMBIGUOUS — a doc with
 *  two `## 3.` headings makes every `§3` citation into it un-anchorable. */
export function stableLawSections(docs: readonly Doc[]): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const sections = new Map<string, ReadonlyMap<string, number>>();
  for (const doc of docs) {
    if (!doc.path.startsWith("docs/architecture/core/") || doc.frontmatter.fields["kind"] !== "law" || doc.frontmatter.fields["status"] !== "active") {
      continue;
    }
    const counts = new Map<string, number>();
    for (const line of readFileSync(join(root, doc.path), "utf8").split("\n")) {
      const section = NUMERIC_HEADING_RE.exec(line)?.[1];
      if (section !== undefined) {
        counts.set(section, (counts.get(section) ?? 0) + 1);
      }
    }
    sections.set(doc.path, counts);
  }
  return sections;
}

/** D-number anchors in the ledger. A `## D<n>` heading immediately followed by its own `- **D<n>` bold
 *  restatement is ONE anchor, not two — the ledger's house entry shape. */
export function stableRulingAnchors(): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  let headedRuling: string | undefined;
  let headedRulingPaired = false;
  for (const line of readFileSync(join(root, CORE_PATH_REGISTRY_PATH), "utf8").split("\n")) {
    const heading = LEDGER_ENTRY_HEADING_RE.exec(line)?.[1];
    if (heading !== undefined) {
      counts.set(heading, (counts.get(heading) ?? 0) + 1);
      headedRuling = heading;
      headedRulingPaired = false;
      continue;
    }
    if (line.startsWith("## ")) {
      headedRuling = undefined;
      continue;
    }
    const bold = LEDGER_ENTRY_BOLD_RE.exec(line)?.[1];
    if (bold === undefined) {
      continue;
    }
    if (headedRuling === bold && !headedRulingPaired) {
      headedRulingPaired = true;
      continue;
    }
    counts.set(bold, (counts.get(bold) ?? 0) + 1);
  }
  return counts;
}

function pathsForLane(lane: Lane): ReadonlySet<string> {
  const included = new Set(lane.patterns.flatMap((pattern) => globSync(pattern, { cwd: root })));
  for (const pattern of lane.excludePatterns ?? []) {
    for (const path of globSync(pattern, { cwd: root })) {
      included.delete(path);
    }
  }
  return included;
}

/** EXACTLY one lane owns each document (D139). Zero or two owners is a config error, not a warning. */
export function laneAssignments(config: LaneConfig, docs: readonly Doc[]): ReadonlyMap<string, Lane> {
  const matches = new Map<string, Lane[]>();
  for (const lane of config.lanes) {
    for (const path of pathsForLane(lane)) {
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

export function loadReceipts(config: LaneConfig): readonly Receipt[] {
  return config.lanes.map((lane) => json<Receipt>(receiptPath(lane)));
}
