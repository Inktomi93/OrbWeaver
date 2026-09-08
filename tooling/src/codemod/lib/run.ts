import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import type { Project, SourceFile } from "ts-morph";
import type { CompilerProgram } from "#verify";
import { print } from "../../_shared/artifacts.ts";
import { warn } from "../../_shared/log.ts";
import type { CodemodContext, CodemodResult, FileSnapshot, Plan, RunCodemodOptions } from "../contract/types.ts";
import { applyProject } from "./apply-project.ts";
import { renderPreview } from "./diagnostics.ts";
import { CodemodError } from "./errors.ts";
import { assertHeapFloor } from "./heap-floor.ts";
import { absolutePath, assertUniquePhysicalMutationPaths, physicalPathIdentity, repoRelative } from "./plans.ts";
import { createProgramDiagnosticBaseline } from "./program-consumers.ts";
import { countProgramDiagnostics } from "./program-diagnostics.ts";
import { createCodemodProject } from "./project.ts";

type DiagnosticBaseline = ReturnType<typeof createProgramDiagnosticBaseline>;
type CompilerProgramReader = (repoRoot: string) => readonly CompilerProgram[];

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
  /** SourceFile identity is stable across move(); destination path → original path. */
  readonly relocations: Map<string, string>;
  readonly originalPathBySourceFile: ReadonlyMap<SourceFile, string>;
  /** Paths whose transformed diagnostics matter: declarations plus their pre-transform consumers. */
  readonly diagnosticPaths: Set<string>;
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
    relocations: new Map<string, string>(),
    originalPathBySourceFile: new Map(project.getSourceFiles().map((sourceFile) => [sourceFile, sourceFile.getFilePath()])),
    diagnosticPaths: new Set<string>(),
  };
}

function recordDiagnosticImpact(path: string, ledger: MutationLedger, preTransformConsumers: ReadonlyMap<string, ReadonlySet<string>>, repoRoot: string): void {
  const pending = [path];
  while (pending.length > 0) {
    const current = pending.shift();
    if (current === undefined || ledger.diagnosticPaths.has(current)) {
      continue;
    }
    ledger.diagnosticPaths.add(current);
    pending.push(...(preTransformConsumers.get(physicalPathIdentity(current, repoRoot)) ?? []));
  }
}

function recordRelocation(sourceFile: SourceFile, path: string, ledger: MutationLedger): void {
  const originalPath = ledger.originalPathBySourceFile.get(sourceFile);
  if (originalPath !== undefined && originalPath !== path) {
    ledger.relocations.set(path, originalPath);
  }
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
    recordRelocation(sf, path, ledger);
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

/** Final changed lexical identities, independent of what plans declared. Repeated edits to one path
 *  collapse naturally; a move contributes its deleted source and created destination. */
function actualChangedPaths(project: Project, ledger: MutationLedger): readonly string[] {
  const current = new Map(project.getSourceFiles().map((sourceFile) => [sourceFile.getFilePath(), sourceFile.getFullText()]));
  const changed = new Set<string>();
  for (const [path, text] of current) {
    if (ledger.baseline.get(path) !== text) {
      changed.add(path);
    }
  }
  for (const path of ledger.baseline.keys()) {
    if (!current.has(path)) {
      changed.add(path);
    }
  }
  return [...changed];
}

function buildCodemodContext(opts: {
  project: Project;
  repoRoot: string;
  isDryRun: boolean;
  snapshots: Map<string, FileSnapshot>;
  ledger: MutationLedger;
  plans: Plan[];
  logs: string[];
  prepareDiagnosticBaseline: () => DiagnosticBaseline | undefined;
}): CodemodContext {
  const { project, repoRoot, isDryRun, snapshots, ledger, plans, logs, prepareDiagnosticBaseline } = opts;
  const ctx: CodemodContext = {
    project,
    repoRoot,
    isDryRun,
    plan(plan): void {
      plans.push(plan);
      const diagnosticBaseline = prepareDiagnosticBaseline();
      // Declare (and snapshot) every file the plan says it will touch BEFORE it mutates anything.
      for (const filePath of plan.touchedFiles) {
        declareFile({
          ctx,
          snapshots,
          ledger,
          filePath,
          ...(diagnosticBaseline !== undefined ? { preTransformConsumers: diagnosticBaseline.consumersByPath } : {}),
        });
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
      const diagnosticBaseline = prepareDiagnosticBaseline();
      declareFile({
        ctx,
        snapshots,
        ledger,
        filePath: sourceFile.getFilePath(),
        ...(diagnosticBaseline !== undefined ? { preTransformConsumers: diagnosticBaseline.consumersByPath } : {}),
      });
    },
  };
  return ctx;
}

/** Post-transform diagnostics. Routes transformed files and their real consumers through the
 *  authored compiler programs that own them, using in-memory bytes so disk stays untouched until
 *  the verdict. Throws if applying (not dry-run) and any diagnostics were found. */
function checkDiagnostics(opts: {
  project: Project;
  snapshots: ReadonlyMap<string, FileSnapshot>;
  ledger: MutationLedger;
  repoRoot: string;
  isDryRun: boolean;
  options: RunCodemodOptions;
  argv: readonly string[];
  baseline?: DiagnosticBaseline;
}): number {
  const { project, snapshots, ledger, repoRoot, isDryRun, options, argv, baseline } = opts;
  // Skip via the per-script option OR the `--no-diagnostics-check` CLI flag. The flag is the
  // run-time opt-out for codemods that INTENTIONALLY leave a residual cascade frontier (e.g. a
  // per-entity TypeID pass that clears the mechanical bulk and leaves the edges for a follow-up
  // hand-fix), so they don't have to hardcode `skipDiagnosticsCheck` and lose the guard forever.
  const skipDiagnostics = diagnosticsSkipped(options, argv);
  let diagnosticErrors = 0;
  if (!skipDiagnostics && snapshots.size > 0) {
    if (baseline === undefined) {
      throw new CodemodError("Diagnostics baseline was not captured before the codemod ran.", "The harness cannot establish pre-transform consumers safely.");
    }
    diagnosticErrors = countProgramDiagnostics({
      project,
      snapshots,
      relocations: ledger.relocations,
      affectedPaths: ledger.diagnosticPaths,
      repoRoot,
      baseline,
    });
  }
  if (diagnosticErrors > 0) {
    warn(
      `\n⚠ ${diagnosticErrors} TypeScript diagnostic${diagnosticErrors === 1 ? "" : "s"} found in affected files or consumers.\n` +
        "  This usually means the codemod produced broken code. Run with --no-diagnostics-check (per-script flag) to override.\n",
    );
    if (!isDryRun) {
      throw new CodemodError(
        `Refused to apply: ${diagnosticErrors} TypeScript diagnostic(s) in the affected compiler scope.`,
        "Fix the underlying transform, OR pass skipDiagnosticsCheck: true if intentional.",
      );
    }
  }
  return diagnosticErrors;
}

function diagnosticsSkipped(options: RunCodemodOptions, argv: readonly string[]): boolean {
  return options.skipDiagnosticsCheck === true || argv.includes("--no-diagnostics-check");
}

export async function runCodemod(name: string, codemod: (ctx: CodemodContext) => void | Promise<void>, options: RunCodemodOptions): Promise<CodemodResult> {
  const startedAt = Date.now();
  // Before anything expensive: a run started without the workspace heap floor cannot finish a
  // whole-project pass, and its failure mode is a six-minute silent OOM (#1775).
  assertHeapFloor();
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const { argv } = options;
  const isDryRun = resolveIsDryRun(options, argv);
  const readCompilerPrograms: CompilerProgramReader | undefined = diagnosticsSkipped(options, argv)
    ? undefined
    : (await import("#verify")).readCompilerPrograms;

  const project = createCodemodProject(options.setup);
  let diagnosticBaseline: DiagnosticBaseline | undefined;
  const prepareDiagnosticBaseline = (): DiagnosticBaseline | undefined => {
    if (diagnosticsSkipped(options, argv)) {
      return;
    }
    if (readCompilerPrograms === undefined) {
      return;
    }
    diagnosticBaseline ??= createProgramDiagnosticBaseline(repoRoot, readCompilerPrograms(repoRoot));
    return diagnosticBaseline;
  };
  const snapshots = new Map<string, FileSnapshot>();
  const ledger = createMutationLedger(project);
  const plans: Plan[] = [];
  const logs: string[] = [];
  const ctx = buildCodemodContext({ project, repoRoot, isDryRun, snapshots, ledger, plans, logs, prepareDiagnosticBaseline });

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
  assertUniquePhysicalMutationPaths(actualChangedPaths(project, ledger), repoRoot);
  const diagnosticErrors = checkDiagnostics({
    project,
    snapshots,
    ledger,
    repoRoot,
    isDryRun,
    options,
    argv,
    ...(diagnosticBaseline !== undefined ? { baseline: diagnosticBaseline } : {}),
  });

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
    applyProject(project, snapshots, repoRoot);
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
function declareFile(opts: {
  ctx: CodemodContext;
  snapshots: Map<string, FileSnapshot>;
  ledger: MutationLedger;
  filePath: string;
  preTransformConsumers?: ReadonlyMap<string, ReadonlySet<string>>;
}): void {
  const { ctx, snapshots, ledger, filePath, preTransformConsumers = new Map() } = opts;
  const resolved = absolutePath(filePath, ctx.repoRoot);
  ledger.declared.add(resolved);
  recordDiagnosticImpact(resolved, ledger, preTransformConsumers, ctx.repoRoot);
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
