import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import type { Project } from "ts-morph";
import { print } from "../../_shared/artifacts.ts";
import { warn } from "../../_shared/log.ts";
import type { CodemodContext, CodemodResult, FileSnapshot, Plan, RunCodemodOptions } from "../contract/types.ts";
import { renderPreview } from "./diagnostics.ts";
import { CodemodError } from "./errors.ts";
import { assertHeapFloor } from "./heap-floor.ts";
import { absolutePath, repoRelative } from "./plans.ts";
import { createCodemodProject } from "./project.ts";

/** Reconcile the `--apply` / `--dry-run` CLI flags (and the `forceApply` escape hatch) into a
 *  single dry-run flag. Throws if both flags were passed — they're mutually exclusive. */

function resolveIsDryRun(options: RunCodemodOptions, argv: readonly string[]): boolean {
  const hasApply = options.forceApply === true || argv.includes("--apply");
  const hasDryRun = argv.includes("--dry-run");
  if (hasApply && hasDryRun) {
    throw new CodemodError("Both --apply and --dry-run were passed.", "Pick one. --apply writes changes; --dry-run is the default preview mode.");
  }
  return !hasApply;
}

/**
 * The harness's mutation ledger — what makes "this plan changed a file it never declared"
 * DETECTABLE instead of silent.
 *
 * `baseline` is the full in-memory project text captured before the codemod's first line runs
 * (4.2k files / 25M chars ≈ 3ms and no real memory: the strings already exist, the Map holds
 * references). It is the only honest "original": a snapshot taken AFTER a helper mutated the file
 * captures the mutated text as the original, which renders as "unchanged" and hides the edit.
 */
interface MutationLedger {
  /** Full text of every project file as the codemod found it. */
  readonly baseline: ReadonlyMap<string, string>;
  /** Text of every known file as of the last plan boundary — the attribution window. */
  readonly atLastBoundary: Map<string, string>;
  /** Paths present in the project as of the last boundary. A path that vanishes was deleted or
   *  moved away, which is a mutation like any other. */
  readonly knownPaths: Set<string>;
  /** Every path declared so far: `Plan.touchedFiles` + explicit `ctx.snapshot()` calls. */
  readonly declared: Set<string>;
}

function createMutationLedger(project: Project): MutationLedger {
  const baseline = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    baseline.set(sf.getFilePath(), sf.getFullText());
  }
  return {
    baseline,
    atLastBoundary: new Map(baseline),
    knownPaths: new Set(baseline.keys()),
    declared: new Set<string>(),
  };
}

/** The label used when the codemod body mutated the project outside any `ctx.plan(...)` call. */
const DIRECT_MUTATION_LABEL = "(direct project mutation — no ctx.plan() call)";

/** Diff the project against the last boundary and return every changed path no plan declared.
 *  Advances the ledger's boundary as it goes, so each mutation is reported exactly once. */
function collectUndeclaredMutations(project: Project, ledger: MutationLedger): string[] {
  const undeclared: string[] = [];
  const currentPaths = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    currentPaths.add(path);
    const text = sf.getFullText();
    const prior = ledger.atLastBoundary.get(path);
    if (prior === text) {
      continue;
    }
    // Unknown to the ledger but in sync with disk: a file the codemod ADDED to the project
    // (addSourceFileAtPath) rather than modified. Adopt it into the window, it's not a mutation.
    if (prior === undefined && sf.isSaved()) {
      ledger.atLastBoundary.set(path, text);
      ledger.knownPaths.add(path);
      continue;
    }
    ledger.atLastBoundary.set(path, text);
    ledger.knownPaths.add(path);
    if (!ledger.declared.has(path)) {
      undeclared.push(path);
    }
  }
  for (const path of [...ledger.knownPaths]) {
    if (currentPaths.has(path)) {
      continue;
    }
    ledger.knownPaths.delete(path);
    ledger.atLastBoundary.delete(path);
    if (!ledger.declared.has(path)) {
      undeclared.push(path);
    }
  }
  return undeclared;
}

/**
 * THE PREVIEW-INTEGRITY GUARD. Runs at every plan boundary (and once more after the codemod body).
 * The preview's file list is built from the DECLARED set, so a file mutated without a declaration
 * never appears in it — the operator reviews a preview that omits real changes and then applies.
 * Refuse, don't warn: the kit's own rules are guard rails + validate + no shortcuts.
 */
function assertPlanDeclaredItsMutations(opts: { project: Project; ledger: MutationLedger; repoRoot: string; label: string }): void {
  const { project, ledger, repoRoot, label } = opts;
  const undeclared = collectUndeclaredMutations(project, ledger);
  if (undeclared.length === 0) {
    return;
  }
  const list = undeclared
    .sort((a, b) => a.localeCompare(b))
    .map((p) => `    • ${repoRelative(p, repoRoot)}`)
    .join("\n");
  throw new CodemodError(
    `Undeclared file mutation — the plan "${label}" changed ${undeclared.length} file(s) it never declared:\n${list}`,
    "Add them to the Plan's `touchedFiles`, or call `ctx.snapshot(sf)` inside the transform BEFORE mutating them " +
      "(that's how the kit's own moveFiles/renameExportedSymbol declare a language-service blast radius they can't " +
      "know at plan-build time). Undeclared edits are invisible in the preview and the diff summary, so the run is " +
      "refused rather than previewed with the edits omitted.",
  );
}

function buildCodemodContext(opts: {
  project: Project;
  repoRoot: string;
  isDryRun: boolean;
  snapshots: Map<string, FileSnapshot>;
  ledger: MutationLedger;
  plans: Plan[];
  logs: string[];
}): CodemodContext {
  const { project, repoRoot, isDryRun, snapshots, ledger, plans, logs } = opts;
  const ctx: CodemodContext = {
    project,
    repoRoot,
    isDryRun,
    plan(plan): void {
      plans.push(plan);
      // Declare (and snapshot) every file the plan says it will touch BEFORE it mutates anything.
      for (const filePath of plan.touchedFiles) {
        declareFile(ctx, snapshots, ledger, filePath);
      }
      plan.transform(ctx);
      // …then hold the plan to it. A transform may declare more as it goes (ctx.snapshot), but
      // anything it changed silently stops the run here, before the preview renders.
      assertPlanDeclaredItsMutations({ project, ledger, repoRoot, label: plan.description });
    },
    log(line): void {
      logs.push(line);
    },
    snapshot(sourceFile): void {
      declareFile(ctx, snapshots, ledger, sourceFile.getFilePath());
    },
  };
  return ctx;
}

/** Post-transform pre-emit diagnostics. Surfaces "the codemod produced broken TS" BEFORE we save
 *  it. Filter to the files we touched so an unrelated upstream error in node_modules doesn't
 *  drown the signal. Throws if applying (not dry-run) and any diagnostics were found. */
function checkDiagnostics(opts: {
  project: Project;
  snapshots: ReadonlyMap<string, FileSnapshot>;
  isDryRun: boolean;
  options: RunCodemodOptions;
  argv: readonly string[];
}): number {
  const { project, snapshots, isDryRun, options, argv } = opts;
  // Skip via the per-script option OR the `--no-diagnostics-check` CLI flag. The flag is the
  // run-time opt-out for codemods that INTENTIONALLY leave a residual cascade frontier (e.g. a
  // per-entity TypeID pass that clears the mechanical bulk and leaves the edges for a follow-up
  // hand-fix), so they don't have to hardcode `skipDiagnosticsCheck` and lose the guard forever.
  const skipDiagnostics = options.skipDiagnosticsCheck === true || argv.includes("--no-diagnostics-check");
  let diagnosticErrors = 0;
  if (!skipDiagnostics) {
    const touched = new Set<string>([...snapshots.keys()]);
    for (const diag of project.getPreEmitDiagnostics()) {
      const sf = diag.getSourceFile();
      if (sf && touched.has(sf.getFilePath())) {
        diagnosticErrors += 1;
      }
    }
  }
  if (diagnosticErrors > 0) {
    warn(
      `\n⚠ ${diagnosticErrors} TypeScript pre-emit diagnostic${diagnosticErrors === 1 ? "" : "s"} found in modified files.\n` +
        "  This usually means the codemod produced broken code. Run with --no-diagnostics-check (per-script flag) to override.\n",
    );
    if (!isDryRun) {
      throw new CodemodError(
        `Refused to apply: ${diagnosticErrors} pre-emit diagnostic(s) in modified files.`,
        "Fix the underlying transform, OR pass skipDiagnosticsCheck: true if intentional.",
      );
    }
  }
  return diagnosticErrors;
}

export async function runCodemod(name: string, codemod: (ctx: CodemodContext) => void | Promise<void>, options: RunCodemodOptions): Promise<CodemodResult> {
  const startedAt = Date.now();
  // Before anything expensive: a run started without the workspace heap floor cannot finish a
  // whole-project pass, and its failure mode is a six-minute silent OOM (#1775).
  assertHeapFloor();
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const { argv } = options;
  const isDryRun = resolveIsDryRun(options, argv);

  const project = createCodemodProject(options.setup);
  const snapshots = new Map<string, FileSnapshot>();
  const ledger = createMutationLedger(project);
  const plans: Plan[] = [];
  const logs: string[] = [];
  const ctx = buildCodemodContext({ project, repoRoot, isDryRun, snapshots, ledger, plans, logs });

  print(headerBox(name, isDryRun));

  // Run the codemod. A throw aborts everything — we never save.
  try {
    await codemod(ctx);
  } catch (err) {
    warn("\n✗ codemod aborted before commit. No changes were written.\n");
    throw err;
  }

  // The body itself can mutate the project outside any plan (a bare `sf.replaceText(...)`). Same
  // invisibility, same refusal — with `ctx.snapshot(sf)` as the documented way to do it legitimately.
  assertPlanDeclaredItsMutations({ project, ledger, repoRoot, label: DIRECT_MUTATION_LABEL });
  const diagnosticErrors = checkDiagnostics({ project, snapshots, isDryRun, options, argv });

  // Render the diff summary.
  const stats = renderPreview({
    name,
    plans,
    logs,
    snapshots,
    project,
    repoRoot,
    maxOutputLines: options.maxOutputLines,
  });

  // Apply or warn.
  if (!isDryRun) {
    project.saveSync();
    print(`\n✓ Applied ${plans.length} plan(s). Wrote ${stats.filesChanged} file(s).\n`);
  } else {
    print("\nℹ This was a DRY RUN. No bytes were written. Re-run with --apply to commit.\n");
  }

  return {
    name,
    applied: !isDryRun,
    plansExecuted: plans.length,
    filesChanged: stats.filesChanged,
    filesCreated: stats.filesCreated,
    filesDeleted: stats.filesDeleted,
    diagnosticErrors,
    elapsedMs: Date.now() - startedAt,
  };
}

/** Declare `filePath` as a file the current plan may mutate: record its ORIGINAL text for the
 *  preview diff and mark it declared for the boundary guard. Idempotent.
 *
 *  The original comes from the ledger's baseline, never from the live SourceFile — a declaration
 *  made after the mutation would otherwise capture the mutated text as the "original" and render
 *  the file as unchanged. */
function declareFile(ctx: CodemodContext, snapshots: Map<string, FileSnapshot>, ledger: MutationLedger, filePath: string): void {
  const resolved = absolutePath(filePath, ctx.repoRoot);
  ledger.declared.add(resolved);
  if (snapshots.has(resolved)) {
    return;
  }
  const baselineText = ledger.baseline.get(resolved);
  if (baselineText !== undefined) {
    snapshots.set(resolved, { filePath: resolved, originalText: baselineText, wasCreated: false });
    return;
  }
  // Outside the baseline: either a file this run creates, or one outside the project's globs.
  const exists = existsSync(resolved);
  snapshots.set(resolved, {
    filePath: resolved,
    originalText: exists ? readFileSync(resolved, "utf-8") : "",
    wasCreated: !exists,
  });
}

function headerBox(name: string, isDryRun: boolean): string {
  const mode = isDryRun ? "DRY RUN (preview)" : "APPLY (writing changes)";
  const lines = [
    "╭───────────────────────────────────────────────────────────────────────",
    `│  Codemod: ${name}`,
    `│  Mode:    ${mode}`,
    "╰───────────────────────────────────────────────────────────────────────",
  ];
  return lines.join("\n");
}
