import { print } from "../../_shared/artifacts.ts";

// Diagnostics + diff rendering (the preview surface).
// ── §15 ─ Diagnostics + diff rendering ───────────────────────────────────────
//
// Output overflow handling
// ────────────────────────
// Codemod preview output can balloon (hundreds of files × per-file diff
// summaries), as can `pnpm codemod list` for a kit this size. Claude and
// other agents head/tail/grep output and routinely miss either the start
// or the end. To survive that pattern, the toolkit writes the FULL output
// to `/tmp/codemod-<name>-<ts>.txt` whenever the line count exceeds the
// threshold, AND prints the file path at BOTH the head AND the tail of the
// stdout output. That way even a `tail -20` consumer sees the pointer.
//
// Defaults:
//   • Threshold: 200 lines
//   • Override:  --max-output-lines=N (parsed by cli.ts, passed in) OR NEO_CODEMOD_MAX_LINES=N
//   • File:      /tmp/codemod-<name>-<unix-ms>.txt
//
// The output buffer is plain `string[]` and gets flushed at the end of each
// printer. We never log directly to console.log inside the renderers.

import { writeFileSync } from "node:fs";
import { tmpdir as osTmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { Project, SourceFile } from "ts-morph";
import type { CodemodContext, FileSnapshot, Plan } from "../contract/types.ts";
import { repoRelative } from "./plans.ts";

const DEFAULT_MAX_OUTPUT_LINES = 200;
/** Half the budget goes to the head, half to the tail. The remaining lines
 *  appear as `... [N lines truncated] ...` in the middle. */
const TRUNCATION_HEAD_FRACTION = 0.6; // bias toward head; first impression is the codemod's intent
/** Lines consumed by the banner + tip + separator printed before the head/tail split. */
const RESERVED_BANNER_LINES = 4;

/** Resolve the spill threshold: an explicit override wins, then the env knob, then the default. The
 *  `--max-output-lines=N` FLAG is parsed by `codemod/cli.ts` and arrives here as `override` — this module
 *  is a library and reads no argv of its own (Core-Tooling-Law §4.9). Validates a positive integer. */
function resolveMaxOutputLines(override?: number): number {
  if (typeof override === "number" && override > 0) {
    return override;
  }
  // biome-ignore lint/style/noProcessEnv: NEO_CODEMOD_MAX_LINES is an operator spill-threshold knob — ambient tooling env, not app config; codemods run outside the foundation/env perimeter.
  const envVal = process.env["NEO_CODEMOD_MAX_LINES"];
  if (envVal !== undefined) {
    const n = Number.parseInt(envVal, 10);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return DEFAULT_MAX_OUTPUT_LINES;
}

/**
 * Flush a buffer to stdout, writing to /tmp + truncating if it exceeds the
 * line limit. `tag` is used in the tmp filename and the banner.
 *
 * Returns the path written to (or undefined if no overflow).
 */
export function flushBuffer(buffer: readonly string[], tag: string, maxLines?: number): string | undefined {
  const flat = buffer.flatMap((entry) => entry.split(/\r?\n/u));
  const limit = resolveMaxOutputLines(maxLines);
  if (flat.length <= limit) {
    for (const line of flat) {
      print(line);
    }
    return;
  }

  // Write the full output to /tmp BEFORE printing the head, so the path
  // shows up in the banner.
  const slug = tag.replace(/[^a-zA-Z0-9._-]/gu, "_");
  const tmpPath = join(osTmpdir(), `codemod-${slug}-${Date.now()}.txt`);
  // @orb-waive caught-failure-ownership(err): an unwritable /tmp falls back to printing the whole buffer plus an explicit warning banner naming the failure — the comment above states the intent directly ("better noisy than silent loss"). Ends if the fallback stops printing the warning.
  try {
    writeFileSync(tmpPath, flat.join("\n"));
  } catch (err) {
    // If /tmp isn't writable we can't preserve the full output. Fall back
    // to printing the whole thing — better noisy than silent loss.
    print(`(warning: couldn't write overflow file ${tmpPath}: ${(err as Error).message})`);
    for (const line of flat) {
      print(line);
    }
    return;
  }

  const banner = `Output truncated to ${limit} lines (full output: ${tmpPath} — ${flat.length} lines total)`;
  print(`╭─ ${banner}`);
  print("│  Tip: cat the path above for the full result, or pass --max-output-lines=N.");
  print("╰────────────────────────────────────────────────────────────────────────────");

  const headLines = Math.max(1, Math.floor((limit - RESERVED_BANNER_LINES) * TRUNCATION_HEAD_FRACTION));
  const tailLines = Math.max(1, limit - RESERVED_BANNER_LINES - headLines);

  for (let i = 0; i < headLines; i++) {
    print(flat[i] ?? "");
  }
  print("");
  print(`    ... [${flat.length - headLines - tailLines} lines truncated] ...`);
  print("");
  for (let i = flat.length - tailLines; i < flat.length; i++) {
    print(flat[i] ?? "");
  }

  print("");
  print(`╭─ ${banner}`);
  print("│  (banner repeated at the tail so tail/grep operators see the file path)");
  print("╰────────────────────────────────────────────────────────────────────────────");
  return tmpPath;
}

interface PreviewStats {
  readonly filesChanged: number;
  readonly filesCreated: number;
  readonly filesDeleted: number;
  readonly overflowFile?: string;
}

const FILE_ENTRY_STATUSES = ["deleted", "created", "changed", "unchanged"] as const;
type FileEntryStatus = (typeof FILE_ENTRY_STATUSES)[number];

/** Render one file's line for the "Files" preview section, and classify it for the tally.
 *
 *  `byPath` is built from `project.getSourceFiles()`, NOT `project.getSourceFile(path)`: that lookup
 *  reads a cache that still answers for a MOVED-AWAY path (verified on the real project — after
 *  `move()`, `getSourceFile(oldPath)` returns a live file still reporting the old path). The entry
 *  then compared equal to its own baseline and dropped out of the preview as "unchanged", so a moved
 *  file's disappearance was invisible. */
function renderFileEntry(snap: FileSnapshot, byPath: ReadonlyMap<string, SourceFile>, repoRoot: string): { line: string; status: FileEntryStatus } {
  const sf = byPath.get(snap.filePath);
  const repoRel = repoRelative(snap.filePath, repoRoot);
  if (sf === undefined) {
    return { line: `  − ${repoRel}    (deleted)`, status: "deleted" };
  }
  if (snap.wasCreated) {
    return {
      line: `  + ${repoRel}    (created, ${sf.getFullText().split(/\r?\n/u).length} lines)`,
      status: "created",
    };
  }
  const after = sf.getFullText();
  if (after === snap.originalText) {
    return { line: "", status: "unchanged" };
  }
  return {
    line: `  ~ ${repoRel}    ${summarizeDiff(snap.originalText, after)}`,
    status: "changed",
  };
}

function renderFilesSection(
  snapshots: ReadonlyMap<string, FileSnapshot>,
  project: Project,
  repoRoot: string,
): { lines: string[]; filesChanged: number; filesCreated: number; filesDeleted: number } {
  const sorted = [...snapshots.values()].sort((a, b) => a.filePath.localeCompare(b.filePath));
  if (sorted.length === 0) {
    return { lines: ["  (no files touched)"], filesChanged: 0, filesCreated: 0, filesDeleted: 0 };
  }
  let filesChanged = 0;
  let filesCreated = 0;
  let filesDeleted = 0;
  const lines: string[] = [];
  const byPath = new Map(project.getSourceFiles().map((sf) => [sf.getFilePath() as string, sf]));
  for (const snap of sorted) {
    const entry = renderFileEntry(snap, byPath, repoRoot);
    if (entry.status === "unchanged") {
      continue;
    }
    lines.push(entry.line);
    if (entry.status === "deleted") {
      filesDeleted += 1;
    } else if (entry.status === "created") {
      filesCreated += 1;
    } else {
      filesChanged += 1;
    }
  }
  return { lines, filesChanged, filesCreated, filesDeleted };
}

export function renderPreview(opts: {
  name: string;
  plans: readonly Plan[];
  logs: readonly string[];
  snapshots: ReadonlyMap<string, FileSnapshot>;
  project: Project;
  repoRoot: string;
  maxOutputLines?: number | undefined;
}): PreviewStats {
  const { name, plans, logs, snapshots, project, repoRoot, maxOutputLines } = opts;
  const buf: string[] = [];
  buf.push("\n── Plans ──");
  if (plans.length === 0) {
    // The measured author mistake: kit helpers RETURN plans, and a returned-but-never-queued plan
    // does nothing — even under --apply. A silent "(none)" reads like a clean empty answer; say the
    // likely cause instead. (Partial forgetting — some queued, some dropped — is not detectable here.)
    buf.push("  (none) — if you called kit helpers, remember they RETURN plans: queue each with ctx.plan(helperResult) or nothing runs, even with --apply");
  } else {
    plans.forEach((p, i) => {
      buf.push(`  ${i + 1}. ${p.description}`);
    });
  }
  if (logs.length > 0) {
    buf.push("\n── Notes ──");
    for (const line of logs) {
      buf.push(`  • ${line}`);
    }
  }

  buf.push("\n── Files ──");
  const { lines, filesChanged, filesCreated, filesDeleted } = renderFilesSection(snapshots, project, repoRoot);
  buf.push(...lines);
  const overflowFile = flushBuffer(buf, `preview-${name}`, maxOutputLines);
  return {
    filesChanged,
    filesCreated,
    filesDeleted,
    ...(overflowFile !== undefined ? { overflowFile } : {}),
  };
}

/** A cheap, line-aware "summary" diff: counts how many lines were added
 *  / removed and shows the first few changed line numbers. Skips a full
 *  unified diff to keep the preview readable for large codemods. Use
 *  `git diff` after `--apply` for the precise view. */
function summarizeDiff(before: string, after: string): string {
  const beforeLines = before.split(/\r?\n/u);
  const afterLines = after.split(/\r?\n/u);
  // Walk forward to find the first divergence.
  const len = Math.min(beforeLines.length, afterLines.length);
  let firstChange = -1;
  for (let i = 0; i < len; i++) {
    if (beforeLines[i] !== afterLines[i]) {
      firstChange = i;
      break;
    }
  }
  if (firstChange === -1 && beforeLines.length === afterLines.length) {
    return "(no textual change)";
  }
  const added = Math.max(0, afterLines.length - beforeLines.length);
  const removed = Math.max(0, beforeLines.length - afterLines.length);
  const balance =
    afterLines.length === beforeLines.length
      ? `≈ ${beforeLines.length} lines (rewritten in place)`
      : `${beforeLines.length} → ${afterLines.length} lines (+${added}/-${removed})`;
  const firstLineLabel = firstChange === -1 ? "(EOF)" : `line ${firstChange + 1}`;
  return `${balance}, first change at ${firstLineLabel}`;
}

/** Print native-program semantic diagnostics for the transaction's current in-memory state. Useful
 * when `skipDiagnosticsCheck` is intentional but the operator still wants the real world frontier. */
export function printDiagnostics(ctx: CodemodContext): void {
  const findings = ctx.semantic().programs.flatMap((program) => {
    const project = program.project();
    const diagnostics = project.getPreEmitDiagnostics();
    return diagnostics.length === 0 ? [] : [{ config: program.descriptor.config, project, diagnostics }];
  });
  if (findings.length === 0) {
    print("✓ No pre-emit diagnostics.");
    return;
  }
  for (const { config, project, diagnostics } of findings) {
    print(`── ${config} ──`);
    print(project.formatDiagnosticsWithColorAndContext(diagnostics));
  }
}
