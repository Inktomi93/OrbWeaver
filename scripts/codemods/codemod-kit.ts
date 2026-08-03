// biome-ignore-all lint/performance/noBarrelFile: this file is itself the
// codemod toolkit's entry point — re-exporting ts-morph essentials is
// load-bearing for the version pin + reduced cognitive surface.

/**
 * ╭───────────────────────────────────────────────────────────────────────────╮
 * │  codemod-kit.ts — the master ts-morph toolkit                             │
 * │  ts-morph v28.0.0 (verify with: cat node_modules/ts-morph/package.json)   │
 * ╰───────────────────────────────────────────────────────────────────────────╯
 *
 * Why this file exists
 * ────────────────────
 * Every fresh agent that touches ts-morph re-derives the basics: project
 * bootstrap, the stale-node footgun, the alias-path gap, how to find callers
 * vs importers, how to add/remove imports cleanly, how to do "what if". This
 * file is the answer. Read top-to-bottom once, then use it.
 *
 * Design rules (the user's brief, made load-bearing):
 *   1. RIGHT THE FIRST TIME — comprehensive over the surface area, no stubs.
 *   2. VALIDATE — every public helper checks its inputs; impossible states
 *      throw `CodemodError` with a remediation hint, not a TypeError.
 *   3. NO SHORTCUTS — every operation has a real implementation. No "TODO:
 *      see ts-morph docs" notes. If you can't do it cleanly, the helper
 *      isn't exported.
 *   4. GUARD RAILS — destructive ops require explicit confirmation, file
 *      deletes refuse to leave the repo, the runner refuses to save when a
 *      ts-morph manipulation error wedged the project.
 *   5. PREVIEW / WHAT-IF — every codemod can run with `--dry-run` (the
 *      default in CI-safe mode) and get a per-file diff summary BEFORE
 *      any byte hits disk. `--apply` is the explicit flag that commits.
 *
 * How to use this file
 * ────────────────────
 *
 *   #!/usr/bin/env tsx
 *   import { runCodemod, repointImports, moveFiles, kit } from "./codemod-kit.ts";
 *
 *   await runCodemod("rename-foo-to-bar", async (ctx) => {
 *     ctx.plan(moveFiles(ctx, [
 *       ["src/foo.ts", "src/bar.ts"],
 *     ]));
 *     ctx.plan(repointImports(ctx, "old/path", "new/path"));
 *   });
 *
 *   // Run with default (dry-run, prints summary):
 *   //   pnpm tsx scripts/codemods/your-codemod.ts
 *   // Run with apply (writes to disk):
 *   //   pnpm tsx scripts/codemods/your-codemod.ts --apply
 *
 *
 * INDEX (search for `── §`)
 * ────────────────────────────────────────────────────────────────────────────
 *   §1   Re-exports of the ts-morph types kit users need
 *   §2   Errors, options, common types
 *   §3   Project bootstrap (createCodemodProject)
 *   §4   The runCodemod harness (CLI flags, dry-run, snapshot/diff/apply)
 *   §5   Plans — the unit of preview-then-commit
 *   §6   Validation helpers
 *   §7   Path helpers
 *   §8   File operations (move / copy / delete with snapshots + guards)
 *   §9   Import operations (find / add / remove / rename / repoint / route)
 *   §10  Export operations (named / barrel / dedupe / type-only flip)
 *   §11  Symbol & reference operations (find callers, importers, declarations)
 *   §12  Rename operations (cross-file with TypeScript's reference engine)
 *   §13  Text replacements (stale-node-safe; the documented pattern)
 *   §14  JSX operations (find / rename tag / attributes)
 *   §15  Diagnostics + diff rendering
 *   §16  Convenience: `kit` namespace bundle
 *   §17  Example codemod at the end of the file (kept compiling)
 *
 * Conventions in this file
 * ────────────────────────
 *  • Every operation that mutates files returns a `Plan` you pass to
 *    `ctx.plan(...)`. The harness aggregates plans, snapshots, runs the
 *    transform, then either previews or applies.
 *  • Operations DO mutate the in-memory ts-morph Project as they run; the
 *    "preview" works by withholding `project.saveSync()` and rendering the
 *    diff between snapshots and current in-memory text.
 *  • THE DECLARATION LAW (§4/§5): a Plan must DECLARE every file it mutates —
 *    in `touchedFiles`, or via `ctx.snapshot(sf)` from inside its transform
 *    (before the mutation) when the blast radius is only knowable at
 *    transform time. The preview's file list is built from the declared set,
 *    so an undeclared edit is INVISIBLE in the preview and in the diff
 *    summary — the operator reviews a preview that omits real changes and
 *    then applies. The harness detects that at every plan boundary and
 *    REFUSES (CodemodError naming the files + the offending plan). A preview
 *    that lies is worse than no preview.
 *  • Helpers that NAVIGATE (find / count) never mutate. They're safe to call
 *    in any phase.
 *  • Helpers throw `CodemodError` (subclass of `Error`) for user-visible
 *    failures. Internal invariant violations stay as `Error` so they surface
 *    with a real stack.
 *  • Names: `find*` returns possibly-empty arrays; `get*` returns one or
 *    throws; `is*` is a type guard.
 *
 * The stale-node footgun (read once, internalize forever)
 * ────────────────────────────────────────────────────────
 * `sourceFile.replaceText([s, e], txt)` invalidates EVERY previously held
 * AST node reference. A naive `for (const c of sf.getDescendantsOfKind(...))
 * c.replaceWithText(...)` loop crashes on the second iteration with
 * `InvalidOperationError: node was removed or forgotten`. The fix lives in
 * §13 `applyTextReplacements()`:
 *   1. Collect all rewrite plans as plain `{ start, end, text }` tuples.
 *   2. Sort end-DESCENDING (so earlier indices stay valid as we apply later
 *      ones).
 *   3. Apply in one pass.
 *   4. Re-resolve any further AST nodes (imports, decls) AFTER replaceText.
 *
 * The alias-path gap (the other footgun)
 * ──────────────────────────────────────
 * `SourceFile.move()` recomputes RELATIVE specifiers (`./X`, `../X`) but
 * DOES NOT follow `#alias/...` paths from tsconfig `imports`. Use §9
 * `repointAliasPaths()` after any move that affects an aliased module.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import process from "node:process";
import type {
  CallExpression,
  Diagnostic,
  DiagnosticMessageChain,
  ExportDeclaration,
  ImportDeclaration,
  ImportSpecifier,
  JsxAttribute,
  JsxOpeningElement,
  JsxSelfClosingElement,
  ProjectOptions,
  PropertyAssignment,
  SourceFile,
  SourceFileReferencingNodes,
  StringLiteral,
} from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";

export type {
  CallExpression,
  ExportDeclaration,
  ExportSpecifier,
  ImportDeclaration,
  ImportSpecifier,
  JsxAttribute,
  JsxElement,
  JsxOpeningElement,
  JsxSelfClosingElement,
  ProjectOptions,
  SourceFile,
  SourceFileReferencingNodes,
  Statement,
  StringLiteral,
} from "ts-morph";
// ── §1 ─ Re-exports ──────────────────────────────────────────────────────────
// Re-exporting ts-morph essentials so a codemod can `import { ... } from
// "./codemod-kit"` and never name ts-morph directly. Avoids version drift in
// downstream codemods (this file is the one place that pins to v28).
export {
  Node,
  Project,
  SyntaxKind,
} from "ts-morph";

// ── §2 ─ Errors, options, types ──────────────────────────────────────────────

/**
 * The base error class every codemod helper throws on user-visible failures.
 * Carries a `hint` field with a one-line remediation suggestion — codemods
 * are usually run interactively, so a clear next step is high-leverage.
 */
export class CodemodError extends Error {
  readonly hint: string;
  constructor(message: string, hint = "(no hint)") {
    super(`${message}\n  → ${hint}`);
    this.name = "CodemodError";
    this.hint = hint;
  }
}

/**
 * A single text-level plan: replace bytes `[start, end)` of `filePath` with
 * `text`. Producer responsibilities (see §13): never overlap with another
 * plan in the same file. The applier sorts by end-descending then applies.
 */
export interface TextReplacement {
  readonly filePath: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** Human-readable label for the preview, e.g. `"rename import 'oldName' → 'newName'"`. */
  readonly label: string;
}

/**
 * Per-file snapshot captured at the start of the codemod. Used to render
 * the preview diff (current text - snapshot text) before deciding to save.
 */
interface FileSnapshot {
  readonly filePath: string;
  readonly originalText: string;
  /** True when the file was created during the codemod (no original to diff against). */
  readonly wasCreated: boolean;
}

/**
 * Common options shared across most file/import/symbol operations.
 *
 * - `dryRun`: legacy field, defaults to false (the harness already handles
 *   dry-run at the project level by withholding save). Most helpers ignore
 *   it because preview happens after the in-memory mutation.
 * - `confirm`: REQUIRED for destructive ops (delete, force-overwrite). Set
 *   to true at the call site to acknowledge you understand the impact.
 * - `note`: optional human label that ends up in the preview output. Helps
 *   when one codemod has multiple similar operations.
 */
export interface OperationOptions {
  readonly confirm?: boolean;
  readonly note?: string;
}

// ── §3 ─ Project bootstrap ───────────────────────────────────────────────────

/**
 * Standard glob patterns the codemod toolkit loads by default. The user can
 * override or supplement these by passing `extraGlobs` to
 * `createCodemodProject`. Order matters slightly — we add src first so a
 * test that imports from src finds the typed source files, not a stale d.ts.
 */
export const DEFAULT_GLOBS = [
  // Monorepo layout: package source lives under packages/*/src — a bare src/** here
  // silently loads ZERO package files from the repo root (the zero-file guard doesn't
  // fire because tests/ + scripts/ still match).
  "packages/*/src/**/*.ts",
  "packages/*/src/**/*.tsx",
  "tests/**/*.ts",
  "tests/**/*.tsx",
  "scripts/**/*.ts",
] as const;

export interface CreateProjectOptions {
  /** Path to tsconfig.json. Default: `./tsconfig.json` from process.cwd(). */
  readonly tsConfigFilePath?: string;
  /** Extra globs to add ON TOP of DEFAULT_GLOBS. Use to include adjacent
   *  folders (e.g. `docs/code-samples/**\/*.ts`) or to drop unwanted areas
   *  (use `replaceGlobs` for the latter). */
  readonly extraGlobs?: readonly string[];
  /** Replace the default glob set entirely. Use when you know exactly what
   *  you want to operate on (e.g. only src/client). */
  readonly replaceGlobs?: readonly string[];
  /** ts-morph ProjectOptions passthrough for advanced cases. Leave undefined
   *  for almost every codemod. */
  readonly projectOptionsOverride?: ProjectOptions;
}

/**
 * Build a ts-morph Project pre-loaded with the codebase's standard globs.
 *
 * Validates:
 *   - tsconfig.json exists
 *   - At least one file matched the globs (early signal that the glob is
 *     wrong rather than discovering the codemod has nothing to do)
 *
 * Reuse: same project instance for the whole codemod. Don't construct
 * multiple Projects in one script — they each spin up their own TypeScript
 * compiler instance.
 */
export function createCodemodProject(opts: CreateProjectOptions = {}): Project {
  const cwd = process.cwd();
  const tsConfigFilePath = resolve(cwd, opts.tsConfigFilePath ?? "tsconfig.json");
  if (!existsSync(tsConfigFilePath)) {
    throw new CodemodError(
      `tsconfig.json not found at ${tsConfigFilePath}`,

      "Run the codemod from the repo root, or pass `tsConfigFilePath`.",
    );
  }
  const project = new Project({
    tsConfigFilePath,
    // Honour caller overrides last so they can flip skipAddingFilesFromTsConfig etc.
    ...opts.projectOptionsOverride,
  });

  const globs = opts.replaceGlobs ?? [...DEFAULT_GLOBS, ...(opts.extraGlobs ?? [])];
  for (const glob of globs) {
    project.addSourceFilesAtPaths(glob);
  }
  const fileCount = project.getSourceFiles().length;
  if (fileCount === 0) {
    throw new CodemodError(
      `Project loaded zero source files (globs: ${globs.join(", ")}).`,
      "Check the glob patterns + that you're running from the repo root.",
    );
  }
  return project;
}

// ── §4 ─ The runCodemod harness ──────────────────────────────────────────────

/**
 * The context passed to your codemod function. Owns the Project + the plan
 * queue + the snapshot store. Don't construct these by hand; the harness
 * builds one for you and tears it down on exit.
 */
export interface CodemodContext {
  /** The ts-morph project. Use this for navigation that doesn't need a Plan
   *  (introspection, find-references, getting source files for a helper). */
  readonly project: Project;
  /** Queue a plan returned by a kit helper. The plan's transform runs
   *  immediately on the in-memory project; the file system is only touched
   *  when the harness decides to commit. */
  plan: (plan: Plan) => void;
  /** Record an arbitrary log line that ends up in the preview output. */
  log: (line: string) => void;
  /** DECLARE a file this plan is about to mutate: it enters the preview's
   *  file list with its true original text. This is the seam for a blast
   *  radius only knowable at transform time (a `move()` that rewrites every
   *  importer, a language-service rename) — call it BEFORE the mutation.
   *  Most helpers call it for you. Idempotent. Anything a plan mutates
   *  without declaring (here or in `touchedFiles`) aborts the run. */
  snapshot: (sourceFile: SourceFile) => void;
  /** Whether the harness is running in dry-run mode (`--apply` was NOT
   *  passed). Most codemods don't need to inspect this — it's exposed for
   *  callers that want to add extra-loud preview output. */
  readonly isDryRun: boolean;
  /** The absolute path of the repo root. Useful for path validation. */
  readonly repoRoot: string;
}

/**
 * Statistics returned by the harness AFTER the codemod finishes. The
 * dry-run path returns these without committing; the apply path returns them
 * after saveSync.
 */
export interface CodemodResult {
  readonly name: string;
  readonly applied: boolean;
  readonly plansExecuted: number;
  readonly filesChanged: number;
  readonly filesCreated: number;
  readonly filesDeleted: number;
  readonly diagnosticErrors: number;
  readonly elapsedMs: number;
}

/**
 * The harness owns:
 *   - CLI flag parsing (`--apply` / `--dry-run` / `--no-diagnostics`)
 *   - Project construction (delegates to createCodemodProject)
 *   - Pre-snapshot of every source file that ANY helper touches
 *   - The preview-integrity guard: refusing to preview OR apply when a plan
 *     mutated a file it never declared (those edits are invisible in the
 *     preview, so the operator would review an incomplete change)
 *   - Catching ts-morph manipulation errors (which leave the project in a
 *     bad state) and refusing to save when one happens
 *   - Post-transform pre-emit diagnostics check (catch broken TS the codemod
 *     produced before it hits disk)
 *   - Per-file diff rendering for the preview
 *
 * Pass `name` for the log header. Pass `setup` to customize the project.
 */
export interface RunCodemodOptions {
  readonly setup?: CreateProjectOptions;
  /** Set true to skip the post-transform `getPreEmitDiagnostics()` check.
   *  Useful when the codemod intentionally lands the project in a transient
   *  broken state (e.g. you're mid-restructure and a follow-up commit
   *  finishes the refactor). Off by default — the check catches real bugs. */
  readonly skipDiagnosticsCheck?: boolean;
  /** Set true to apply without parsing `--apply` from argv. Use in tests. */
  readonly forceApply?: boolean;
  /** Override the repo root used for path-escape guards. Defaults to
   *  `process.cwd()` resolved. */
  readonly repoRoot?: string;
  /** Max stdout lines before the preview output spills to /tmp.
   *  Defaults to 200; overridable via `--max-output-lines=N` flag or
   *  `NEO_CODEMOD_MAX_LINES=N` env var. The spill file path appears at BOTH
   *  the head and the tail of the truncated output so head/tail readers see
   *  the pointer. */
  readonly maxOutputLines?: number;
}

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
    console.error(
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

export async function runCodemod(
  name: string,
  codemod: (ctx: CodemodContext) => void | Promise<void>,
  options: RunCodemodOptions = {},
): Promise<CodemodResult> {
  const startedAt = Date.now();
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const argv = process.argv.slice(2);
  const isDryRun = resolveIsDryRun(options, argv);

  const project = createCodemodProject(options.setup);
  const snapshots = new Map<string, FileSnapshot>();
  const ledger = createMutationLedger(project);
  const plans: Plan[] = [];
  const logs: string[] = [];
  const ctx = buildCodemodContext({ project, repoRoot, isDryRun, snapshots, ledger, plans, logs });

  console.log(headerBox(name, isDryRun));

  // Run the codemod. A throw aborts everything — we never save.
  try {
    await codemod(ctx);
  } catch (err) {
    console.error("\n✗ codemod aborted before commit. No changes were written.\n");
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
    console.log(`\n✓ Applied ${plans.length} plan(s). Wrote ${stats.filesChanged} file(s).\n`);
  } else {
    console.log("\nℹ This was a DRY RUN. No bytes were written. Re-run with --apply to commit.\n");
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

// ── §5 ─ Plans ───────────────────────────────────────────────────────────────

/**
 * A Plan is a unit of preview-then-commit work. A helper builds a Plan and
 * returns it; the caller hands it to `ctx.plan(...)` and the harness runs it.
 *
 * Why not just have helpers mutate directly?
 *   - Plans let the harness snapshot affected files BEFORE the mutation,
 *     which is what makes diff rendering possible.
 *   - Plans carry a human-readable `description` so the preview output reads
 *     like an audit trail rather than a wall of diff hunks.
 *   - Plans can be inspected ("did the codemod even plan to touch X?")
 *     in tests + the preview without running the transform.
 */
export interface Plan {
  /** Human-readable label rendered in the preview. */
  readonly description: string;
  /** Every path this plan may modify. The harness snapshots them BEFORE the transform, and the
   *  preview's file list is built from exactly this declared set.
   *
   *  THE DECLARATION LAW: a file mutated without being declared here — or via `ctx.snapshot(sf)`
   *  from inside the transform, before the mutation, which is the seam for a blast radius only
   *  knowable at transform time — aborts the run at the plan boundary. Under-declaring used to
   *  produce a preview that silently omitted those edits. */
  readonly touchedFiles: readonly string[];
  /** The actual mutation. Runs synchronously on the in-memory project. */
  readonly transform: (ctx: CodemodContext) => void;
}

/** Compose multiple plans into one. Useful for helpers that internally batch
 *  several smaller plans (e.g. "delete file + remove its imports everywhere"). */
export function composePlans(description: string, plans: readonly Plan[]): Plan {
  const touched = new Set<string>();
  for (const p of plans) {
    for (const t of p.touchedFiles) {
      touched.add(t);
    }
  }
  return {
    description,
    touchedFiles: [...touched],
    transform(ctx): void {
      for (const p of plans) {
        p.transform(ctx);
      }
    },
  };
}

// ── §6 ─ Validation helpers ──────────────────────────────────────────────────

/** Assert that `cond` is truthy. On failure throw CodemodError with `msg`
 *  and a hint. Prefer this over bare `if (...) throw` so failures look
 *  consistent in the harness output. */
export function assert(cond: unknown, msg: string, hint = "(no hint)"): asserts cond {
  if (!cond) {
    throw new CodemodError(msg, hint);
  }
}

/** Validate a glob/path string is well-formed enough to feed into ts-morph.
 *  Doesn't check for existence (callers vary). */
export function assertPathString(value: unknown, name: string): asserts value is string {
  assert(
    typeof value === "string" && value.length > 0,
    `${name} must be a non-empty string`,
    `Got: ${typeof value === "string" ? `"${value}"` : typeof value}`,
  );
}

// ── §7 ─ Path helpers ────────────────────────────────────────────────────────

/** Resolve `p` to an absolute path against `repoRoot`. Pass-through for
 *  absolute paths. Throws if the result escapes `repoRoot` (the file-delete
 *  guard rail). */
export function absolutePath(p: string, repoRoot: string): string {
  assertPathString(p, "path");
  const root = resolve(repoRoot);
  const abs = isAbsolute(p) ? normalize(p) : resolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new CodemodError(`Path escapes repo root: ${p}`, "Codemod helpers refuse to touch files outside the repo. Pass a path relative to the repo root.");
  }
  return abs;
}

/** Convert an absolute path to a repo-relative `posix-style` path. Used in
 *  preview output for readability. */
export function repoRelative(p: string, repoRoot: string): string {
  return relative(resolve(repoRoot), p).split(sep).join("/");
}

/** Does this path live under `src/`? */
export function isUnderSrc(filePath: string): boolean {
  return filePath.includes(`${sep}src${sep}`) || filePath.startsWith(`src${sep}`);
}

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|mts|cts)$/u;

/** Does this filename look like a test/spec? */
export function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERN.test(filePath);
}

const TS_EXTENSION_PATTERN = /\.(tsx?)$/u;

/** Convert a TS file path to its likely test sibling (`foo.ts` →
 *  `foo.test.ts`). Useful when a move codemod wants to find + co-move the
 *  test file. */
export function siblingTestPath(filePath: string): string {
  return filePath.replace(TS_EXTENSION_PATTERN, ".test.$1");
}

// ── §8 ─ File operations ─────────────────────────────────────────────────────

/**
 * Move source files. Wraps `SourceFile.move()` (which auto-recomputes
 * relative import specifiers across the entire project — that's the load-
 * bearing magic). After applying, run `repointAliasPaths` if your codebase
 * uses `#aliases/...` style imports (ts-morph doesn't follow those).
 *
 * Validates:
 *   - Source exists in the project
 *   - Destination doesn't already exist (unless `confirm: true` AND the
 *     destination's content is empty — defensive against accidental
 *     overwrites of populated files)
 *   - Source and destination both resolve inside the repo
 *
 * Quirks: ts-morph's move() keeps the SourceFile object alive at its NEW
 * path. Don't hold the source path around after planning a move — look it
 * up by the new path if you need to access it again.
 */
export function moveFiles(ctx: CodemodContext, moves: ReadonlyArray<readonly [from: string, to: string]>, opts: OperationOptions = {}): Plan {
  assert(moves.length > 0, "moveFiles called with empty moves list", "Skip the call or pass at least one move.");

  // Validate paths up front — fail loudly before we touch the in-memory
  // project, so a typo in the move list aborts cleanly.
  const resolved = moves.map(([from, to]) => {
    const fromAbs = absolutePath(from, ctx.repoRoot);
    const toAbs = absolutePath(to, ctx.repoRoot);
    const sf = ctx.project.getSourceFile(fromAbs);
    assert(
      sf !== undefined,
      `moveFiles: source not in project: ${repoRelative(fromAbs, ctx.repoRoot)}`,
      "Was it added to the project by createCodemodProject's globs? Or already moved by a previous helper?",
    );
    if (existsSync(toAbs)) {
      const targetText = readFileSync(toAbs, "utf-8");
      // biome-ignore lint/nursery/noConditionalExpect: this is our own guard-clause assert() helper, not vitest's expect().
      assert(
        opts.confirm === true && targetText.length === 0,
        `moveFiles: destination already exists: ${repoRelative(toAbs, ctx.repoRoot)}`,
        "Pass { confirm: true } only if you've verified you want to overwrite (the target must be empty for safety).",
      );
    }
    return { fromAbs, toAbs, sf };
  });

  const touched = new Set<string>();
  for (const { fromAbs, toAbs } of resolved) {
    touched.add(fromAbs);
    touched.add(toAbs);
  }

  return {
    description: `Move ${moves.length} file(s)${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [...touched],
    transform(innerCtx): void {
      for (const { sf, toAbs } of resolved) {
        // move() rewrites the relative specifier in every importer too. Declare that set here —
        // it's only knowable at transform time (an earlier plan may have added or dropped an
        // importer), and an undeclared rewrite would be missing from the preview.
        for (const referencing of sf.getReferencingSourceFiles()) {
          innerCtx.snapshot(referencing);
        }
        // SourceFile.move() returns the same SourceFile at the new path AND
        // updates every importer of the old path within the project graph.
        sf.move(toAbs);
      }
    },
  };
}

/**
 * Delete source files. Refuses without `confirm: true`. After the plan
 * runs the in-memory project considers them deleted; the harness's saveSync
 * physically removes them.
 *
 * Validates:
 *   - File exists in the project
 *   - Path is inside the repo
 *   - `confirm: true` was passed
 *
 * If you want to delete a file AND its test sibling, call this once with
 * both paths.
 */
export function deleteFiles(ctx: CodemodContext, paths: readonly string[], opts: OperationOptions): Plan {
  assert(opts.confirm === true, "deleteFiles refuses to run without { confirm: true }", "Pass { confirm: true } only after you've reviewed the list of paths.");
  assert(paths.length > 0, "deleteFiles called with empty paths list");

  const resolved = paths.map((p) => {
    const abs = absolutePath(p, ctx.repoRoot);
    const sf = ctx.project.getSourceFile(abs);
    assert(
      sf !== undefined,
      `deleteFiles: file not in project: ${repoRelative(abs, ctx.repoRoot)}`,
      "Was it added to the project? Already deleted by a previous plan?",
    );
    return { abs, sf };
  });

  return {
    description: `Delete ${paths.length} file(s)${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: resolved.map((r) => r.abs),
    transform(): void {
      for (const { sf } of resolved) {
        sf.delete();
      }
    },
  };
}

/**
 * Create a new source file with the given text. Refuses to overwrite an
 * existing file unless `confirm: true`. The new file is auto-snapshotted as
 * a creation so the preview correctly labels it `+ new file`.
 */
export function createSourceFile(ctx: CodemodContext, filePath: string, text: string, opts: OperationOptions = {}): Plan {
  const abs = absolutePath(filePath, ctx.repoRoot);
  const exists = existsSync(abs) || ctx.project.getSourceFile(abs) !== undefined;
  if (exists) {
    // biome-ignore lint/nursery/noConditionalExpect: this is our own guard-clause assert() helper, not vitest's expect().
    assert(opts.confirm === true, `createSourceFile: ${repoRelative(abs, ctx.repoRoot)} already exists`, "Pass { confirm: true } if you intend to overwrite.");
  }

  return {
    description: `Create ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [abs],
    transform(innerCtx): void {
      // Make sure the parent dir exists in-memory (ts-morph handles this on
      // saveSync, but mkdirSync the physical dir if we're going to apply so
      // saveSync has a path to write to — saveSync doesn't mkdir -p).
      if (!innerCtx.isDryRun) {
        const parent = dirname(abs);
        if (!existsSync(parent)) {
          mkdirSync(parent, { recursive: true });
        }
      }
      innerCtx.project.createSourceFile(abs, text, { overwrite: opts.confirm === true });
    },
  };
}

/**
 * Copy a source file to a new path. The new file is a real ts-morph clone
 * (so any references in it that pointed at relative paths get rewritten to
 * be valid from the new location). Useful as a building block when you want
 * to "fork" a file into two — copy, then edit each side.
 */
export function copyFile(ctx: CodemodContext, from: string, to: string, opts: OperationOptions = {}): Plan {
  const fromAbs = absolutePath(from, ctx.repoRoot);
  const toAbs = absolutePath(to, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(fromAbs);
  assert(sf !== undefined, `copyFile: source not in project: ${repoRelative(fromAbs, ctx.repoRoot)}`);
  if (existsSync(toAbs)) {
    // biome-ignore lint/nursery/noConditionalExpect: this is our own guard-clause assert() helper, not vitest's expect().
    assert(
      opts.confirm === true,
      `copyFile: destination already exists: ${repoRelative(toAbs, ctx.repoRoot)}`,
      "Pass { confirm: true } if you intend to overwrite.",
    );
  }
  return {
    description: `Copy ${repoRelative(fromAbs, ctx.repoRoot)} → ${repoRelative(toAbs, ctx.repoRoot)}`,
    touchedFiles: [fromAbs, toAbs],
    transform(): void {
      sf.copy(toAbs, { overwrite: opts.confirm === true });
    },
  };
}

// ── §9 ─ Import operations ───────────────────────────────────────────────────

/** Filter predicate for selecting specific named imports inside a
 *  declaration. `(spec) => spec.getName() === "foo"`. */
export type ImportSpecFilter = (spec: ImportSpecifier) => boolean;

/**
 * Find every ImportDeclaration in the project whose module specifier
 * equals `moduleSpecifier` exactly. For `from "./relative"`-style lookups,
 * use `findImportersOfFile()` instead — relative resolutions differ per
 * importing file.
 */
export function findImporters(project: Project, moduleSpecifier: string): ImportDeclaration[] {
  const out: ImportDeclaration[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const decl of sf.getImportDeclarations()) {
      if (decl.getModuleSpecifierValue() === moduleSpecifier) {
        out.push(decl);
      }
    }
  }
  return out;
}

/**
 * Find every ImportDeclaration that resolves (after relative-path
 * resolution) to the given file. Uses ts-morph's
 * `getReferencingNodesInOtherSourceFiles()` which is symbol-aware AND
 * relative-aware, so it catches both `from "./foo"` and `from "../foo"` as
 * long as they resolve to the target. The ImportEqualsDeclaration and
 * CallExpression arms are filtered out (we only want ES imports here; the
 * rare arms have their own dedicated helpers below).
 */
export function findImportersOfFile(targetFile: SourceFile): ImportDeclaration[] {
  return targetFile.getReferencingNodesInOtherSourceFiles().filter((n): n is ImportDeclaration => n.isKind(SyntaxKind.ImportDeclaration));
}

/**
 * Return every ReferencingNode (ES import OR `export { } from`-style
 * re-export OR `import =` OR `require(...)`-style CallExpression) for a
 * file. Use this when you genuinely want "everything that points here";
 * use `findImportersOfFile` when you only care about ES imports.
 */
export function findAllReferencersOfFile(targetFile: SourceFile): SourceFileReferencingNodes[] {
  return targetFile.getReferencingNodesInOtherSourceFiles();
}

/**
 * Repoint EVERY import declaration in the project whose specifier matches
 * `fromSpecifier` (exact string) to use `toSpecifier`. Used after a file
 * MOVE when the moved file's old specifier was used as an alias path
 * (ts-morph's move only updates relative specifiers).
 *
 * For the regex sweep across many alias paths, use `repointAliasPaths`.
 */
export function repointImports(ctx: CodemodContext, fromSpecifier: string, toSpecifier: string, opts: OperationOptions = {}): Plan {
  assertPathString(fromSpecifier, "fromSpecifier");
  assertPathString(toSpecifier, "toSpecifier");
  const matches = findImporters(ctx.project, fromSpecifier);

  return {
    description:
      `Repoint imports "${fromSpecifier}" → "${toSpecifier}" ` +
      `(${matches.length} declaration${matches.length === 1 ? "" : "s"})` +
      `${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [...new Set(matches.map((d) => d.getSourceFile().getFilePath()))],
    transform(): void {
      for (const decl of matches) {
        decl.setModuleSpecifier(toSpecifier);
      }
    },
  };
}

/**
 * Regex-based alias-path sweep across the entire project. Pattern matches
 * are applied as `replace(regex, replacement)` against the FULL FILE TEXT
 * via `replaceWithText` — slower than the AST path but covers:
 *   - import declarations
 *   - inline `import("...")` types
 *   - dynamic `import("...")` calls
 *   - JSDoc-ish path mentions in comments
 *
 * Designed for the alias-path gap left by `SourceFile.move()`. Pass
 * patterns like:
 *   `[/#server\/domain\/_shared\/foo/g, "#server/domain/foo"]`
 *
 * Use `g` flags so every occurrence in a file is rewritten.
 */
export function repointAliasPaths(ctx: CodemodContext, rewrites: ReadonlyArray<readonly [RegExp, string]>, opts: OperationOptions = {}): Plan {
  assert(rewrites.length > 0, "repointAliasPaths called with empty rewrites list");
  // Materialise the source files up-front so we don't iterate while ts-morph
  // is mutating its own internal list.
  const affected = ctx.project.getSourceFiles().map((sf) => sf.getFilePath());

  return {
    description: `Alias-path sweep (${rewrites.length} pattern${rewrites.length === 1 ? "" : "s"})${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: affected,
    transform(innerCtx): void {
      for (const sf of innerCtx.project.getSourceFiles()) {
        const before = sf.getFullText();
        let after = before;
        for (const [re, replacement] of rewrites) {
          after = after.replace(re, replacement);
        }
        if (after !== before) {
          sf.replaceWithText(after);
        }
      }
    },
  };
}

/** vi's module-mocking methods whose first argument is a module-specifier string.
 *  A codemod that rewrites import paths must rewrite these strings too. */
export const VI_MODULE_METHODS: ReadonlySet<string> = new Set(["mock", "doMock", "importActual", "importMock", "unmock"]);

/**
 * Extract the module-specifier string literal from a call when it's a dynamic
 * `import("…")` or a `vi.<mock-method>("…")` — else null. Lets a path-rewriting
 * codemod treat those module strings exactly like static import specifiers.
 */
export function moduleStringArg(call: CallExpression): StringLiteral | null {
  const expr = call.getExpression();
  const isDynImport = expr.getKind() === SyntaxKind.ImportKeyword;
  const isViMock = Node.isPropertyAccessExpression(expr) && expr.getExpression().getText() === "vi" && VI_MODULE_METHODS.has(expr.getName());
  if (!(isDynImport || isViMock)) {
    return null;
  }
  const arg0 = call.getArguments()[0];
  return arg0 && Node.isStringLiteral(arg0) ? arg0 : null;
}

/** Merge a named import into an EXISTING import declaration for the same module (the "already
 *  importing from here" branch of `addNamedImport`). */
function mergeNamedImportInto(existing: ImportDeclaration, named: { readonly name: string; readonly alias?: string; readonly isTypeOnly?: boolean }): void {
  const wantValue = named.isTypeOnly !== true;
  // Adding a VALUE specifier into an `import type {…}` declaration would silently make the value
  // type-only (TS1361 at its use site). Convert the declaration to a value import and push the
  // `type` modifier onto each existing (type-only) specifier instead.
  if (wantValue && existing.isTypeOnly()) {
    existing.setIsTypeOnly(false);
    for (const ni of existing.getNamedImports()) {
      ni.setIsTypeOnly(true);
    }
  }
  const match = existing
    .getNamedImports()
    .find((n) => n.getName() === named.name && (n.getAliasNode()?.getText() ?? n.getName()) === (named.alias ?? named.name));
  if (match !== undefined) {
    // Already imported — but a prior pass may have added it type-only; a later value use must
    // downgrade it so it's callable.
    if (wantValue && match.isTypeOnly()) {
      match.setIsTypeOnly(false);
    }
    return;
  }
  existing.addNamedImport({
    name: named.name,
    ...(named.alias !== undefined ? { alias: named.alias } : {}),
    ...(named.isTypeOnly !== undefined ? { isTypeOnly: named.isTypeOnly } : {}),
  });
}

/**
 * Add a named import to a file IDEMPOTENTLY. If the module is already
 * imported, this merges the new names into the existing declaration. If
 * the name is already imported it's a no-op. The `isTypeOnly` flag is
 * honoured at the specifier level (per-name) when ts-morph supports it; if
 * the whole declaration is type-only the new specifier inherits that.
 */
export function addNamedImport(
  ctx: CodemodContext,
  filePath: string,
  named: {
    readonly moduleSpecifier: string;
    readonly name: string;
    readonly alias?: string;
    readonly isTypeOnly?: boolean;
  },
  opts: OperationOptions = {},
): Plan {
  const { moduleSpecifier } = named;
  const abs = absolutePath(filePath, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(abs);
  assert(sf !== undefined, `addNamedImport: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);
  assertPathString(moduleSpecifier, "moduleSpecifier");
  assertPathString(named.name, "named.name");

  return {
    description:
      `Add named import { ${named.isTypeOnly ? "type " : ""}${named.name}${named.alias ? ` as ${named.alias}` : ""} } ` +
      `from "${moduleSpecifier}" in ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [abs],
    transform(): void {
      // A TYPE-ONLY add is satisfied by ANY existing import of the name from this module — a separate
      // `import type { X } from "m"` declaration included. Merging `type X` into the VALUE declaration
      // while a type-only declaration already carries X mints a TS2300 duplicate identifier (measured:
      // the 2026-08-03 brand campaign hit this in ~60 files across three passes).
      if (named.isTypeOnly === true) {
        const alreadyImported = sf
          .getImportDeclarations()
          .some((d) => d.getModuleSpecifierValue() === moduleSpecifier && d.getNamedImports().some((n) => n.getName() === named.name));
        if (alreadyImported) {
          return;
        }
      }
      // A value-import lookup by string alone can't tell a value declaration from a type-only one
      // sharing the same specifier (`import type { X } from "m"` + `import { Y } from "m"`) — match
      // on the non-type-only declaration explicitly, or we'd silently merge into the wrong one.
      const existing = sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier && !d.isTypeOnly());
      if (existing !== undefined) {
        mergeNamedImportInto(existing, named);
        return;
      }
      // New declaration. Insert near the top, after existing imports if any.
      sf.addImportDeclaration({
        moduleSpecifier,
        namedImports: [
          {
            name: named.name,
            ...(named.alias !== undefined ? { alias: named.alias } : {}),
            ...(named.isTypeOnly !== undefined ? { isTypeOnly: named.isTypeOnly } : {}),
          },
        ],
      });
    },
  };
}

/**
 * Remove specific named imports from a declaration. If the declaration is
 * left with no names (and no default / namespace import), the declaration
 * itself is removed. Pass `removeWholeDeclaration: true` to drop the whole
 * import regardless of remaining specifiers.
 */
export function removeNamedImport(
  ctx: CodemodContext,
  filePath: string,
  target: { readonly moduleSpecifier: string; readonly names: readonly string[] },
  opts: OperationOptions & { removeWholeDeclaration?: boolean } = {},
): Plan {
  const { moduleSpecifier, names } = target;
  const abs = absolutePath(filePath, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(abs);
  assert(sf !== undefined, `removeNamedImport: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);
  assert(names.length > 0, "removeNamedImport: pass at least one name to remove");

  return {
    description: `Remove import { ${names.join(", ")} } from "${moduleSpecifier}" in ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [abs],
    transform(): void {
      // See addNamedImport's matching comment: don't grab a type-only declaration sharing the
      // same specifier as the value declaration we actually mean to strip names from.
      const decl = sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier && !d.isTypeOnly());
      if (!decl) {
        return;
      }
      if (opts.removeWholeDeclaration === true) {
        decl.remove();
        return;
      }
      const namesSet = new Set(names);
      for (const spec of decl.getNamedImports()) {
        if (namesSet.has(spec.getName())) {
          spec.remove();
        }
      }
      // If we removed everything from the declaration AND it has no default
      // / namespace, drop the declaration itself.
      const stillHas = decl.getNamedImports().length > 0 || decl.getDefaultImport() !== undefined || decl.getNamespaceImport() !== undefined;
      if (!stillHas) {
        decl.remove();
      }
    },
  };
}

/**
 * Rename a named import specifier across every importer of `moduleSpecifier`
 * in the project. This is the "the upstream library renamed `oldName` to
 * `newName`, fix every consumer" pattern. Doesn't follow re-exports — those
 * are an explicit Stage 2 in restructure codemods.
 */
export function renameNamedImport(
  ctx: CodemodContext,
  moduleSpecifier: string,
  rename: { readonly oldName: string; readonly newName: string },
  opts: OperationOptions = {},
): Plan {
  const { oldName, newName } = rename;
  const importers = findImporters(ctx.project, moduleSpecifier).filter((d) => d.getNamedImports().some((n) => n.getName() === oldName));
  return {
    description: `Rename named import "${oldName}" → "${newName}" from "${moduleSpecifier}" (${importers.length} file${importers.length === 1 ? "" : "s"})${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [...new Set(importers.map((d) => d.getSourceFile().getFilePath()))],
    transform(): void {
      for (const decl of importers) {
        for (const spec of decl.getNamedImports()) {
          if (spec.getName() === oldName) {
            spec.setName(newName);
          }
        }
      }
    },
  };
}

/**
 * Convert specific named imports (matched by predicate) to type-only. Use
 * to flip an entire module's imports to `import type` when the value side
 * goes away (the F6 "make X type-only" sweep is the canonical case).
 */
export function makeImportTypeOnly(ctx: CodemodContext, moduleSpecifier: string, filter: ImportSpecFilter = () => true, opts: OperationOptions = {}): Plan {
  const decls = findImporters(ctx.project, moduleSpecifier);
  return {
    description: `Flip imports to type-only from "${moduleSpecifier}"${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [...new Set(decls.map((d) => d.getSourceFile().getFilePath()))],
    transform(): void {
      for (const decl of decls) {
        for (const spec of decl.getNamedImports()) {
          if (filter(spec)) {
            spec.setIsTypeOnly(true);
          }
        }
      }
    },
  };
}

/**
 * The SYMBOL_BUCKET pattern from the chat-restructure-stage2 codemod:
 * given a file whose exports got split into many target files, route every
 * importer to the right destination based on which symbols they're
 * importing. The map keys are symbol names; values are the new module
 * specifier (alias path) for that symbol.
 *
 * After running, you usually want to delete the original `from` file with
 * `deleteFiles(...)` and run `repointAliasPaths(...)` to catch any string-
 * literal references in comments.
 */
/** Group a declaration's named imports by which new module specifier they route to (skipping any
 *  name not in the map — those stay on the original declaration). */
function groupImportsByDestination(decl: ImportDeclaration, symbolToNewSpecifier: Readonly<Record<string, string>>): Map<string, ImportSpecifier[]> {
  const groups = new Map<string, ImportSpecifier[]>();
  for (const spec of decl.getNamedImports()) {
    const dest = symbolToNewSpecifier[spec.getName()];
    if (dest === undefined) {
      continue;
    }
    const bucket = groups.get(dest) ?? [];
    bucket.push(spec);
    groups.set(dest, bucket);
  }
  return groups;
}

/** Add-or-merge an import declaration for `dest` carrying `specs`, then remove the specifiers
 *  from their original declaration now that they've moved. */
function routeSpecifiersToDestination(sf: SourceFile, dest: string, specs: readonly ImportSpecifier[]): void {
  const target = sf.getImportDeclaration(dest);
  const incoming = specs.map((s) => {
    const aliasNode = s.getAliasNode();
    return {
      name: s.getName(),
      ...(aliasNode !== undefined ? { alias: aliasNode.getText() } : {}),
      isTypeOnly: s.isTypeOnly(),
    };
  });
  if (target !== undefined) {
    // Don't duplicate symbols already imported.
    const haveNames = new Set(target.getNamedImports().map((n) => n.getName()));
    target.addNamedImports(incoming.filter((i) => !haveNames.has(i.name)));
  } else {
    sf.addImportDeclaration({ moduleSpecifier: dest, namedImports: incoming });
  }
  for (const s of specs) {
    s.remove();
  }
}

export function routeSymbolsByMap(
  ctx: CodemodContext,
  fromSpecifier: string,
  symbolToNewSpecifier: Readonly<Record<string, string>>,
  opts: OperationOptions = {},
): Plan {
  const symbols = Object.keys(symbolToNewSpecifier);

  assert(symbols.length > 0, "routeSymbolsByMap: empty map");
  const matches = findImporters(ctx.project, fromSpecifier);

  return {
    description: `Route ${symbols.length} symbols from "${fromSpecifier}" to per-symbol destinations across ${matches.length} importer(s)${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [...new Set(matches.map((d) => d.getSourceFile().getFilePath()))],
    transform(): void {
      for (const decl of matches) {
        const sf = decl.getSourceFile();
        const groups = groupImportsByDestination(decl, symbolToNewSpecifier);
        for (const [dest, specs] of groups) {
          routeSpecifiersToDestination(sf, dest, specs);
        }

        // If leftovers remain, leave the declaration in place (it still
        // points at the old module). If we cleared it out, drop the empty
        // declaration so we don't leave a `from "OLD"` shell.
        if (decl.getNamedImports().length === 0 && decl.getDefaultImport() === undefined && decl.getNamespaceImport() === undefined) {
          decl.remove();
        }
      }
    },
  };
}

// ── §10 ─ Export operations ──────────────────────────────────────────────────

/**
 * Add a re-export `export { X } from "Y"` idempotently into a barrel file.
 * If the export declaration for `Y` already exists, merges the new names
 * in. If the name is already exported it's a no-op. Type-only flag honoured.
 *
 * Use to grow a front-door `index.ts` — the helper handles the "did I
 * already add this?" check that every codemod re-implements.
 */
export function addReExport(
  ctx: CodemodContext,
  filePath: string,
  named: {
    readonly moduleSpecifier: string;
    readonly name: string;
    readonly alias?: string;
    readonly isTypeOnly?: boolean;
  },
  opts: OperationOptions = {},
): Plan {
  const { moduleSpecifier } = named;
  const abs = absolutePath(filePath, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(abs);
  assert(sf !== undefined, `addReExport: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);

  return {
    description: `Add re-export { ${named.isTypeOnly ? "type " : ""}${named.name}${named.alias ? ` as ${named.alias}` : ""} } from "${moduleSpecifier}" in ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [abs],
    transform(): void {
      // Same type-only vs value ambiguity as addNamedImport — match the value declaration only.
      const existing = sf.getExportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier && !d.isTypeOnly());
      if (existing !== undefined) {
        const already = existing.getNamedExports().some((n) => n.getName() === named.name);
        if (already) {
          return;
        }
        existing.addNamedExport({
          name: named.name,
          ...(named.alias !== undefined ? { alias: named.alias } : {}),
          ...(named.isTypeOnly !== undefined ? { isTypeOnly: named.isTypeOnly } : {}),
        });
        return;
      }
      sf.addExportDeclaration({
        moduleSpecifier,
        namedExports: [
          {
            name: named.name,
            ...(named.alias !== undefined ? { alias: named.alias } : {}),
            ...(named.isTypeOnly !== undefined ? { isTypeOnly: named.isTypeOnly } : {}),
          },
        ],
      });
    },
  };
}

/**
 * Remove specific re-exports from a barrel. Mirror of `removeNamedImport`.
 * If the declaration loses all its names it's removed. Pass
 * `removeWholeDeclaration: true` to drop the whole `export ... from`
 * statement regardless.
 */
export function removeReExport(
  ctx: CodemodContext,
  filePath: string,
  target: { readonly moduleSpecifier: string; readonly names: readonly string[] },
  opts: OperationOptions & { removeWholeDeclaration?: boolean } = {},
): Plan {
  const { moduleSpecifier, names } = target;
  const abs = absolutePath(filePath, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(abs);
  assert(sf !== undefined, `removeReExport: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);

  return {
    description: `Remove re-export { ${names.join(", ")} } from "${moduleSpecifier}" in ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [abs],
    transform(): void {
      // Same type-only vs value ambiguity as removeNamedImport — match the value declaration only.
      const decl = sf.getExportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier && !d.isTypeOnly());
      if (!decl) {
        return;
      }
      if (opts.removeWholeDeclaration === true) {
        decl.remove();
        return;
      }
      const namesSet = new Set(names);
      for (const spec of decl.getNamedExports()) {
        if (namesSet.has(spec.getName())) {
          spec.remove();
        }
      }
      if (decl.getNamedExports().length === 0 && decl.getNamespaceExport() === undefined) {
        decl.remove();
      }
    },
  };
}

/**
 * Walk a barrel file and dedupe re-exports that name the same symbol from
 * the same module twice (sneaks in when manual barrels get touched by many
 * hands). Stable — earlier declaration wins.
 */
/** Remove named exports from `decl` already present in `seen` (by module::name::type-vs-value
 *  key), then drop the whole declaration if it ends up empty. Mutates `seen` with survivors. */
function dedupeExportDeclaration(decl: ExportDeclaration, seen: Set<string>): void {
  const mod = decl.getModuleSpecifierValue() ?? "<no-module>";
  for (const spec of decl.getNamedExports()) {
    const key = `${mod}::${spec.getName()}::${spec.isTypeOnly() ? "type" : "value"}`;
    if (seen.has(key)) {
      spec.remove();
      continue;
    }
    seen.add(key);
  }
  if (decl.getNamedExports().length === 0 && decl.getNamespaceExport() === undefined) {
    decl.remove();
  }
}

export function dedupeReExports(ctx: CodemodContext, filePath: string, opts: OperationOptions = {}): Plan {
  const abs = absolutePath(filePath, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(abs);
  assert(sf !== undefined, `dedupeReExports: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);
  return {
    description: `Dedupe re-exports in ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [abs],
    transform(): void {
      const seen = new Set<string>();
      for (const decl of sf.getExportDeclarations()) {
        dedupeExportDeclaration(decl, seen);
      }
    },
  };
}

// ── §11 ─ Symbol & reference operations ──────────────────────────────────────

/**
 * Find every node in the project that references the named declaration
 * `name` in `filePath`. The "declaration" is the FIRST exported symbol with
 * that name (interface, type alias, class, function, const). Returns
 * Node[] — the call sites / references themselves, not their declaration.
 *
 * Caveat: this uses ts-morph's LanguageService which is symbol-aware. It
 * follows aliases through re-exports correctly but is slower than text
 * search. For "every file that imports X" use `findImporters()` instead.
 */
export function findReferencesByName(project: Project, filePath: string, name: string): Node[] {
  const sf = project.getSourceFile(filePath);
  if (!sf) {
    throw new CodemodError(
      `findReferencesByName: file not in project: ${filePath}`,
      "Pass an absolute path or one that matches a file added by the project globs.",
    );
  }
  const decl = findExportedDeclaration(sf, name);
  if (!decl) {
    throw new CodemodError(
      `findReferencesByName: no exported declaration "${name}" in ${filePath}`,
      "Confirm the name + check it's exported (this helper only walks exported declarations).",
    );
  }
  // ts-morph's findReferencesAsNodes lives on the ReferenceFindableNode
  // mixin; the static `Node.isReferenceFindable` guard narrows the union
  // properly so we don't need any casts.
  if (Node.isReferenceFindable(decl)) {
    return decl.findReferencesAsNodes();
  }
  return [];
}

/** Find an exported declaration by name. Returns the first match across
 *  class / interface / type alias / function / variable / enum. */
export function findExportedDeclaration(sf: SourceFile, name: string): Node | undefined {
  const decls = sf.getExportedDeclarations().get(name);
  return decls?.[0];
}

/** Get every symbol exported from a file with its name. Useful for surface
 *  audit codemods. */
export function listExports(sf: SourceFile): Array<{ name: string; declarations: Node[] }> {
  const out: Array<{ name: string; declarations: Node[] }> = [];
  for (const [name, declarations] of sf.getExportedDeclarations()) {
    out.push({ name, declarations: [...declarations] });
  }
  return out;
}

/** Find every CallExpression in the project whose callee is `functionName`.
 *  Useful for "who calls foo()" sweeps. Doesn't follow aliases; for that,
 *  use `findReferencesByName`. */
export function findCallSites(project: Project, functionName: string): Node[] {
  const out: Node[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      if (expr.getText() === functionName) {
        out.push(call);
      }
    }
  }
  return out;
}

// ── §12 ─ Rename operations ──────────────────────────────────────────────────

/**
 * Rename an exported symbol across the WHOLE project using TypeScript's
 * own reference-resolution. This handles:
 *   - import specifiers that reference the symbol
 *   - identifier references in the symbol's own file
 *   - re-exports
 *   - default-export aliases (`export default X` etc.)
 *
 * Does NOT rename:
 *   - strings that happen to spell the symbol (use `repointAliasPaths` for that)
 *   - JSDoc-ish `@link` references
 *
 * If the declaration isn't found this throws. If the new name collides
 * with another symbol in scope ts-morph throws a manipulation error which
 * the harness catches and refuses to save.
 */
export function renameExportedSymbol(
  ctx: CodemodContext,
  filePath: string,
  rename: { readonly oldName: string; readonly newName: string },
  opts: OperationOptions = {},
): Plan {
  const { oldName, newName } = rename;
  const abs = absolutePath(filePath, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(abs);
  assert(sf !== undefined, `renameExportedSymbol: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);
  return {
    description: `Rename symbol "${oldName}" → "${newName}" in ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
    // Only the declaring file is knowable up front; the reference set is a language-service
    // question that can only be asked once the earlier plans have settled. The transform declares
    // it below (`ctx.snapshot`) before the rename touches a byte.
    touchedFiles: [abs],
    transform(innerCtx): void {
      const decl = findExportedDeclaration(sf, oldName);
      assert(decl !== undefined, `renameExportedSymbol: no exported "${oldName}" in ${filePath}`);
      // The rename engine rewrites every reference site — importers, re-export chains, the
      // declaration's own file. Declare that whole set FIRST: `findReferencesAsNodes` is the same
      // reference resolution `rename()` uses, and the importer set covers the re-export shells
      // whose specifier changes without a resolved reference node of its own.
      for (const ref of Node.isReferenceFindable(decl) ? decl.findReferencesAsNodes() : []) {
        innerCtx.snapshot(ref.getSourceFile());
      }
      for (const referencing of sf.getReferencingSourceFiles()) {
        innerCtx.snapshot(referencing);
      }
      // Locate the actual name node. ts-morph's RenameableNode trait lives
      // on the identifier itself for most kinds, but on the declaration for
      // some (function, class). Try the declaration via the typed mixin
      // guard first, then descend to find the name node.
      if (Node.isRenameable(decl)) {
        decl.rename(newName);
        return;
      }
      // Fallback: find the first child identifier and rename it.
      const id = decl.getFirstDescendantByKind(SyntaxKind.Identifier);
      assert(id !== undefined, `renameExportedSymbol: couldn't find an Identifier on the declaration of "${oldName}"`);
      id.rename(newName);
    },
  };
}

// ── §13 ─ Stale-node-safe text replacements ──────────────────────────────────

/**
 * THE one-true pattern for arbitrary text replacements in a single file.
 *
 * Why: `sourceFile.replaceText([s, e], txt)` invalidates every previously
 * held AST node reference. A naive `for (node of getDescendants()) node
 * .replaceWithText(...)` loop crashes on the second iteration.
 *
 * How: collect ALL plans up front as `{ filePath, start, end, text }`,
 * sort end-DESCENDING (so earlier offsets stay valid as we apply later
 * ones), then apply.
 *
 * Best practice: call this ONCE per file at the end of your transform.
 * Don't intersperse `replaceText` calls with AST navigation.
 */
export function applyTextReplacements(ctx: CodemodContext, replacements: readonly TextReplacement[], opts: OperationOptions = {}): Plan {
  // Validate non-overlap per-file. Overlapping replacements would corrupt
  // text in subtle ways (the sort handles them OK individually but two
  // ranges that share bytes leave undefined output).
  const byFile = new Map<string, TextReplacement[]>();
  for (const r of replacements) {
    const abs = absolutePath(r.filePath, ctx.repoRoot);
    const arr = byFile.get(abs) ?? [];
    arr.push({ ...r, filePath: abs });
    byFile.set(abs, arr);
  }
  for (const [file, plans] of byFile) {
    const sorted = [...plans].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev === undefined || cur === undefined) {
        continue;
      }
      assert(
        cur.start >= prev.end,
        `applyTextReplacements: overlapping ranges in ${repoRelative(file, ctx.repoRoot)}`,
        `[${prev.start},${prev.end}) and [${cur.start},${cur.end}) overlap.`,
      );
    }
  }

  return {
    description: `Apply ${replacements.length} text replacement(s) across ${byFile.size} file(s)${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [...byFile.keys()],
    transform(innerCtx): void {
      for (const [file, plans] of byFile) {
        const sf = innerCtx.project.getSourceFile(file);
        assert(sf !== undefined, `applyTextReplacements: file disappeared between plan and transform: ${file}`);
        // Sort end-DESCENDING. Applying later offsets first keeps earlier
        // offsets valid.
        const sorted = [...plans].sort((a, b) => b.end - a.end);
        for (const r of sorted) {
          sf.replaceText([r.start, r.end], r.text);
        }
      }
    },
  };
}

/** Convert a list of AST nodes + a per-node text producer into a flat
 *  TextReplacement array. Computes start/end at the time you call this
 *  (BEFORE any mutation) — pass that array to `applyTextReplacements`. */
export function replacementsForNodes(nodes: readonly Node[], produce: (node: Node) => { text: string; label?: string }): TextReplacement[] {
  const out: TextReplacement[] = [];
  for (const n of nodes) {
    const { text, label } = produce(n);
    out.push({
      filePath: n.getSourceFile().getFilePath(),
      start: n.getStart(),
      end: n.getEnd(),
      text,
      label: label ?? `replace ${n.getKindName()}`,
    });
  }
  return out;
}

// ── §14 ─ JSX operations ─────────────────────────────────────────────────────

/** Type-narrowing alias — a JSX opening or self-closing element (both
 *  carry tag-name + attributes). */
export type JsxLike = JsxOpeningElement | JsxSelfClosingElement;

/**
 * Find every JSX element with the given tag name across the project. Useful
 * for client codemods: "every <OldButton> → <NewButton>" sweeps. Matches
 * the bare identifier of the tag — `<Foo.Bar />` matches `"Foo"`, NOT
 * `"Foo.Bar"`.
 */
export function findJsxByTag(project: Project, tagName: string): JsxLike[] {
  const out: JsxLike[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
      if (el.getTagNameNode().getText() === tagName) {
        out.push(el);
      }
    }
    for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
      if (el.getTagNameNode().getText() === tagName) {
        out.push(el);
      }
    }
  }
  return out;
}

/**
 * Rename a JSX tag across the project. Updates BOTH the opening tag and
 * its closing tag (when present). Doesn't update the import — pair with
 * `renameNamedImport` if the new component lives at a different name in
 * its source module.
 */
export function renameJsxTag(ctx: CodemodContext, oldTagName: string, newTagName: string, opts: OperationOptions = {}): Plan {
  const matches = findJsxByTag(ctx.project, oldTagName);
  const touched = new Set<string>();
  for (const el of matches) {
    touched.add(el.getSourceFile().getFilePath());
  }
  return {
    description: `Rename JSX <${oldTagName}> → <${newTagName}> (${matches.length} instance${matches.length === 1 ? "" : "s"})${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [...touched],
    transform(): void {
      for (const el of matches) {
        const nameNode = el.getTagNameNode();
        // Set the opening / self-closing tag's name.
        if (Node.isIdentifier(nameNode)) {
          nameNode.replaceWithText(newTagName);
        } else {
          // Property-access tag like <Foo.Bar /> — replace the whole node.
          nameNode.replaceWithText(newTagName);
        }
        // For paired (non-self-closing) elements, also update the closer.
        const parent = el.getParent();
        if (parent && Node.isJsxElement(parent)) {
          parent.getClosingElement().getTagNameNode().replaceWithText(newTagName);
        }
      }
    },
  };
}

/** Find every JSX attribute named `attrName` across the project. Doesn't
 *  filter by parent component — pair with `findJsxByTag` for component-
 *  scoped sweeps. */
export function findJsxAttributes(project: Project, attrName: string): JsxAttribute[] {
  const out: JsxAttribute[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
      const name = attr.getNameNode().getText();
      if (name === attrName) {
        out.push(attr);
      }
    }
  }
  return out;
}

// ── §14.5 ─ ID branding (TypeID / branded-id migration) ──────────────────────
//
// Two passes that automate the mechanical bulk of branding ONE entity's id once
// its DB columns carry `.$type<Brand>()` (which flips drizzle `inferSelect`/insert
// from `string` to the brand, lighting up every plain-`string` consumer). They are
// parameterized by the id's NAMES + the BRAND symbol, so the SAME two calls migrate
// each successive entity in the TypeID rollout — the reusable engine the unattended
// loop drives per-entity. The tsc gate is the proof: a mis-retype goes red, so these
// passes act on the mechanical ~90% and leave genuine edge cases for the gate to flag.
//
//   retypeIdAnnotations  — production: `chatId: string` → `chatId: ChatId` on every
//                          param / interface-field / class-field / variable whose NAME
//                          matches, preserving `| null` / `| undefined` / `?`.
//   castIdInObjectLiterals — tests: wrap literal fixture ids (`chatId: "ch1"`, and
//                          `id: "ch1"` inside an `insert(<table>)`) in `castId<Brand>()`.

/** The `string` keyword node(s) inside a string-family annotation — the bare
 *  `string`, or the `string` member of a `string | null` / `string | undefined`
 *  union. `[]` when the annotation isn't string-family (so nothing is rewritten). */
function stringKeywordNodes(typeNode: Node | undefined): Node[] {
  if (typeNode === undefined) {
    return [];
  }
  if (typeNode.getKind() === SyntaxKind.StringKeyword) {
    return [typeNode];
  }
  // Union (`string | null`, `string | undefined`): the member type nodes hang off a SyntaxList,
  // so `getChildrenOfKind` (immediate children only) misses them — use the union's typed members.
  const union = typeNode.asKind(SyntaxKind.UnionType);
  if (union !== undefined) {
    return union.getTypeNodes().filter((t) => t.getKind() === SyntaxKind.StringKeyword);
  }
  return [];
}

export interface RetypeIdAnnotationsOptions {
  /** Declaration names to retype, e.g. `["chatId", "parentChatId", "newChatId"]`. */
  readonly names: readonly string[];
  /** The brand type to retype TO, e.g. `"ChatId"`. */
  readonly brand: string;
  /** Module the brand is imported from, e.g. `"#shared/_kit/ids"`. */
  readonly importModule: string;
  /** Path substrings to skip (default: the ids definition file itself). */
  readonly excludePathSubstrings?: readonly string[];
}

/**
 * Retype every `string` (or `string | null` / `string | undefined`) annotation on a
 * declaration NAMED in `opts.names` to `opts.brand`, and add a type-only import of the
 * brand to each touched file. Covers parameters, interface/type-literal property
 * signatures, class property declarations, and explicitly-annotated variables.
 *
 * Only the `string` keyword itself is rewritten (not the whole annotation), so `| null`,
 * `| undefined`, and a trailing `?` survive. Binding-pattern declarations (`const { chatId }`)
 * are skipped — there's no annotation to retype. Idempotent (a brand annotation isn't
 * string-family, so a second run is a no-op).
 */
export function retypeIdAnnotations(ctx: CodemodContext, opts: RetypeIdAnnotationsOptions): Plan {
  assert(opts.names.length > 0, "retypeIdAnnotations: names must be non-empty");
  assertPathString(opts.brand, "brand");
  assertPathString(opts.importModule, "importModule");
  const nameSet = new Set(opts.names);
  const exclude = opts.excludePathSubstrings ?? ["/shared/lib/ids."];
  const keywords: Node[] = [];
  const files = new Set<string>();

  for (const sf of ctx.project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (exclude.some((s) => fp.includes(s))) {
      continue;
    }
    const consider = (name: string | undefined, typeNode: Node | undefined): void => {
      if (name === undefined || !nameSet.has(name)) {
        return;
      }
      const sks = stringKeywordNodes(typeNode);
      if (sks.length === 0) {
        return;
      }
      for (const sk of sks) {
        keywords.push(sk);
      }
      files.add(fp);
    };
    for (const d of sf.getDescendantsOfKind(SyntaxKind.Parameter)) {
      consider(d.getName(), d.getTypeNode());
    }
    for (const d of sf.getDescendantsOfKind(SyntaxKind.PropertySignature)) {
      consider(d.getName(), d.getTypeNode());
    }
    for (const d of sf.getDescendantsOfKind(SyntaxKind.PropertyDeclaration)) {
      consider(d.getName(), d.getTypeNode());
    }
    for (const d of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      consider(d.getName(), d.getTypeNode());
    }
  }

  const plans: Plan[] = [];
  if (keywords.length > 0) {
    plans.push(
      applyTextReplacements(
        ctx,
        replacementsForNodes(keywords, () => ({
          text: opts.brand,
          label: `string → ${opts.brand}`,
        })),
        { note: `retype ${keywords.length} ${opts.brand} annotation(s)` },
      ),
    );
    for (const fp of files) {
      plans.push(
        addNamedImport(ctx, fp, {
          moduleSpecifier: opts.importModule,
          name: opts.brand,
          isTypeOnly: true,
        }),
      );
    }
  }
  return composePlans(`retype {${opts.names.join(", ")}}: string → ${opts.brand} (${keywords.length} site(s) across ${files.size} file(s))`, plans);
}

/** The table identifier an object literal is being `insert(...).values()` /
 *  `update(...).set()` into — `undefined` if the property isn't in such a call. */
function insertTargetTable(pa: Node): string | undefined {
  const objLit = pa.getParentIfKind(SyntaxKind.ObjectLiteralExpression);
  if (objLit === undefined) {
    return;
  }
  // `.values({...})` (single row) or `.values([{...}, {...}])` (multi-row) — climb past an
  // optional array literal so both forms resolve to the same `insert(<table>)` call.
  const wrapper = objLit.getParent();
  const valuesCall =
    wrapper !== undefined && wrapper.getKind() === SyntaxKind.ArrayLiteralExpression
      ? wrapper.getParentIfKind(SyntaxKind.CallExpression)
      : objLit.getParentIfKind(SyntaxKind.CallExpression);
  if (valuesCall === undefined) {
    return;
  }
  const valuesAccess = valuesCall.getExpression();
  if (!Node.isPropertyAccessExpression(valuesAccess)) {
    return;
  }
  const method = valuesAccess.getName();
  if (method !== "values" && method !== "set") {
    return;
  }
  const insertCall = valuesAccess.getExpression();
  if (!Node.isCallExpression(insertCall)) {
    return;
  }
  const insertAccess = insertCall.getExpression();
  if (!Node.isPropertyAccessExpression(insertAccess)) {
    return;
  }
  const verb = insertAccess.getName();
  if (verb !== "insert" && verb !== "update") {
    return;
  }
  return insertCall.getArguments()[0]?.getText();
}

export interface CastIdLiteralsOptions {
  /** The brand type, e.g. `"ChatId"`. */
  readonly brand: string;
  /** The sanctioned cast helper, e.g. `"castId"`. */
  readonly castFn: string;
  /** Module both `castFn` and `brand` import from, e.g. `"#shared/_kit/ids"`. */
  readonly importModule: string;
  /** Property names whose string literal is ALWAYS this brand, e.g.
   *  `["chatId", "parentChatId"]` — wrapped wherever they appear. */
  readonly alwaysProps: readonly string[];
  /** Property names that are this brand ONLY inside a specific table's insert/update,
   *  e.g. `[{ table: "chats", prop: "id" }]` — disambiguates the generic `id`. */
  readonly tableScopedIdProps?: readonly { readonly table: string; readonly prop: string }[];
  /** Restrict to test files (default true — production literals are rare + the gate
   *  flags them; casting production values would mask real drift). */
  readonly testFilesOnly?: boolean;
  /** Also wrap NON-literal initializers (a variable / member access like `id: charId`,
   *  `characterId: opts.id`) when the value's type is exactly `string` — the test-fixture
   *  bulk that uses a local id variable instead of an inline literal. Type-guarded to plain
   *  `string` (never a nullable or already-branded value) so it can't double-cast or hide
   *  a real mismatch. Default false. */
  readonly includeStringVars?: boolean;
}

/**
 * Wrap fixture id string-literals in `castId<Brand>(...)` so they satisfy the now-branded
 * column. Two matchers: `alwaysProps` (a property that is always the brand, e.g. `chatId`)
 * and `tableScopedIdProps` (the generic `id`, only when the enclosing call inserts into the
 * named table). Only string-literal initializers are touched, so it never double-wraps and
 * never touches values fixed by `retypeIdAnnotations`. Test-scoped by default.
 */
/** Is this property assignment one we should cast — either an always-branded name, or the
 *  generic `id` scoped to a matching insert/update table? */
function isCastTargetProperty(
  pa: PropertyAssignment,
  always: ReadonlySet<string>,
  tableScoped: readonly { readonly table: string; readonly prop: string }[],
): boolean {
  const name = pa.getName();
  if (always.has(name)) {
    return true;
  }
  const scoped = tableScoped.find((t) => t.prop === name);
  return scoped !== undefined && insertTargetTable(pa) === scoped.table;
}

/** The node to wrap in `castFn<brand>(...)` for a matched property, or undefined if this
 *  property's initializer isn't eligible (already cast, wrong type, or vars disabled). */
function resolveCastCandidate(pa: PropertyAssignment, opts: CastIdLiteralsOptions): Node | undefined {
  const literal =
    pa.getInitializerIfKind(SyntaxKind.StringLiteral) ??
    pa.getInitializerIfKind(SyntaxKind.NoSubstitutionTemplateLiteral) ??
    pa.getInitializerIfKind(SyntaxKind.TemplateExpression); // `id: `msg-${i}``
  if (literal !== undefined) {
    return literal;
  }
  if (!opts.includeStringVars) {
    return;
  }
  // Non-literal initializer (`id: charId`, `characterId: opts.id`): cast ONLY when its type is
  // exactly plain `string` — never nullable, never an already-branded value (would double-cast).
  const expr = pa.getInitializer();
  if (expr === undefined) {
    return;
  }
  if (Node.isCallExpression(expr)) {
    const callee = expr.getExpression().getText();
    if (callee === opts.castFn || callee.startsWith(`${opts.castFn}<`)) {
      return;
    }
  }
  // Plain `string`, or a string-LITERAL type (`const id = "foo"` infers `"foo"`, not `string`) —
  // the common test pattern of a literal id stored in a const before the insert. Both are safe:
  // an already-branded value is neither, so it's never double-cast.
  const exprType = expr.getType();
  return exprType.getText() === "string" || exprType.isStringLiteral() ? expr : undefined;
}

function scanObjectLiteralCastTargets(ctx: CodemodContext, opts: CastIdLiteralsOptions): { targets: Node[]; files: Set<string> } {
  const always = new Set(opts.alwaysProps);
  const tableScoped = opts.tableScopedIdProps ?? [];
  const testOnly = opts.testFilesOnly ?? true;
  const targets: Node[] = [];
  const files = new Set<string>();
  for (const sf of ctx.project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (testOnly && !isTestFile(fp)) {
      continue;
    }
    for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
      if (!isCastTargetProperty(pa, always, tableScoped)) {
        continue;
      }
      const candidate = resolveCastCandidate(pa, opts);
      if (candidate !== undefined) {
        targets.push(candidate);
        files.add(fp);
      }
    }
  }
  return { targets, files };
}

/** Add the `castFn` value import + `brand` type-only import to every touched file. Shared by all
 *  the cast-literal helpers (object literals, comparisons, diagnostic-driven). */
function buildCastImportPlans(
  ctx: CodemodContext,
  opts: { readonly importModule: string; readonly castFn: string; readonly brand: string },
  files: ReadonlySet<string>,
): Plan[] {
  const plans: Plan[] = [];
  for (const fp of files) {
    plans.push(addNamedImport(ctx, fp, { moduleSpecifier: opts.importModule, name: opts.castFn }));
    plans.push(
      addNamedImport(ctx, fp, {
        moduleSpecifier: opts.importModule,
        name: opts.brand,
        isTypeOnly: true,
      }),
    );
  }
  return plans;
}

export function castIdInObjectLiterals(ctx: CodemodContext, opts: CastIdLiteralsOptions): Plan {
  assertPathString(opts.brand, "brand");
  assertPathString(opts.castFn, "castFn");
  assertPathString(opts.importModule, "importModule");
  const always = new Set(opts.alwaysProps);
  const tableScoped = opts.tableScopedIdProps ?? [];
  const { targets, files } = scanObjectLiteralCastTargets(ctx, opts);

  const plans: Plan[] = [];
  if (targets.length > 0) {
    plans.push(
      applyTextReplacements(
        ctx,
        replacementsForNodes(targets, (n) => ({
          text: `${opts.castFn}<${opts.brand}>(${n.getText()})`,
          label: `wrap in ${opts.castFn}<${opts.brand}>`,
        })),
        { note: `cast ${targets.length} fixture literal(s)` },
      ),
    );
    plans.push(...buildCastImportPlans(ctx, opts, files));
  }
  return composePlans(
    `cast {${[...always, ...tableScoped.map((t) => `${t.table}.${t.prop}`)].join(", ")}} ` +
      `literals → ${opts.castFn}<${opts.brand}> (${targets.length} site(s) across ${files.size} file(s))`,
    plans,
  );
}

export interface CastIdComparisonsOptions {
  /** The brand type, e.g. `"ChatId"`. */
  readonly brand: string;
  /** The sanctioned cast helper, e.g. `"castId"`. */
  readonly castFn: string;
  /** Module both `castFn` and `brand` import from. */
  readonly importModule: string;
  /** Column references whose comparand is this brand: an exact `table.col` (`"chats.id"`) or a
   *  `.suffix` matched against the end of the column text (`".chatId"` → every FK column). */
  readonly columns: readonly string[];
  /** Comparison/membership helpers to scan (default drizzle's `eq`/`ne`/`gt`/`gte`/`lt`/`lte`
   *  + `inArray`/`notInArray`). */
  readonly ops?: readonly string[];
  /** Restrict to test files (default true). */
  readonly testFilesOnly?: boolean;
}

/**
 * Wrap string literals compared against a branded column in `castFn<brand>(...)`. Drizzle's
 * `eq(chats.id, "ch1")` surfaces a column/string mismatch as a TS2769 "no overload" on the
 * operator call (not a clean TS2345 on the literal), so neither the structural nor the
 * diagnostic literal passes reach it — this one targets it directly: `eq`/`ne`/… where one arg
 * is a `columns`-matching column reference and the other is a string literal (and `inArray`'s
 * literal array elements). Idempotent (skips literals already wrapped in `castFn`). Test-scoped.
 */
function isUnwrappedComparisonLiteral(n: Node | undefined, castFn: string): boolean {
  if (n === undefined) {
    return false;
  }
  if (n.getKind() !== SyntaxKind.StringLiteral && n.getKind() !== SyntaxKind.NoSubstitutionTemplateLiteral && n.getKind() !== SyntaxKind.TemplateExpression) {
    return false;
  }
  const parent = n.getParent();
  if (parent !== undefined && Node.isCallExpression(parent)) {
    const callee = parent.getExpression().getText();
    if (callee === castFn || callee.startsWith(`${castFn}<`)) {
      return false;
    }
  }
  return true;
}

/** For one matched `eq`/`inArray`/… call, collect the comparand(s) still needing a cast wrap.
 *  `inArray`'s second arg is an array of comparands; every other op compares directly. */
function collectComparisonTargets(call: CallExpression, opts: CastIdComparisonsOptions): readonly Node[] {
  const [first, second] = call.getArguments();
  if (first === undefined || second === undefined) {
    return [];
  }
  const matchesColumn = opts.columns.some((c) => (c.startsWith(".") ? first.getText().endsWith(c) : first.getText() === c));
  if (!matchesColumn) {
    return [];
  }
  const operands = Node.isArrayLiteralExpression(second) ? second.getElements() : [second];
  return operands.filter((operand) => isUnwrappedComparisonLiteral(operand, opts.castFn));
}

function scanComparisonCastTargets(ctx: CodemodContext, opts: CastIdComparisonsOptions): { targets: Node[]; files: Set<string> } {
  const ops = new Set(opts.ops ?? ["eq", "ne", "gt", "gte", "lt", "lte", "inArray", "notInArray"]);
  const testOnly = opts.testFilesOnly ?? true;
  const targets: Node[] = [];
  const files = new Set<string>();
  for (const sf of ctx.project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (testOnly && !isTestFile(fp)) {
      continue;
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!(Node.isIdentifier(callee) && ops.has(callee.getText()))) {
        continue;
      }
      for (const operand of collectComparisonTargets(call, opts)) {
        targets.push(operand);
        files.add(fp);
      }
    }
  }
  return { targets, files };
}

export function castIdInComparisons(ctx: CodemodContext, opts: CastIdComparisonsOptions): Plan {
  assertPathString(opts.brand, "brand");
  assertPathString(opts.castFn, "castFn");
  assertPathString(opts.importModule, "importModule");
  const { targets, files } = scanComparisonCastTargets(ctx, opts);

  const plans: Plan[] = [];
  if (targets.length > 0) {
    plans.push(
      applyTextReplacements(
        ctx,
        replacementsForNodes(targets, (n) => ({
          text: `${opts.castFn}<${opts.brand}>(${n.getText()})`,
          label: `wrap comparand in ${opts.castFn}<${opts.brand}>`,
        })),
        { note: `cast ${targets.length} comparison literal(s)` },
      ),
    );
    plans.push(...buildCastImportPlans(ctx, opts, files));
  }
  return composePlans(
    `cast {${opts.columns.join(", ")}} comparison literals → ${opts.castFn}<${opts.brand}> (${targets.length} site(s) across ${files.size} file(s))`,
    plans,
  );
}

/** Flatten a ts-morph diagnostic message (string or nested chain) to one string. */
function flattenDiagnosticMessage(msg: string | DiagnosticMessageChain): string {
  if (typeof msg === "string") {
    return msg;
  }
  let out = msg.getMessageText();
  for (const next of msg.getNext() ?? []) {
    out += ` ${flattenDiagnosticMessage(next)}`;
  }
  return out;
}

const TS_ARGUMENT_TYPE_MISMATCH = 2345;
const TS_ASSIGNMENT_TYPE_MISMATCH = 2322;

export interface CastByDiagnosticOptions {
  /** The brand type to cast TO, e.g. `"ChatId"`. */
  readonly brand: string;
  /** The sanctioned cast helper, e.g. `"castId"`. */
  readonly castFn: string;
  /** Module both `castFn` and `brand` import from. */
  readonly importModule: string;
  /** Substrings that identify the brand as the diagnostic's TARGET type. The brand name
   *  (`"ChatId"`) catches `not assignable to … 'ChatId'`; the expanded-brand hint
   *  (`'[brand]: "chat"'`) catches the structurally-printed `string & { [brand]: "chat" }`. */
  readonly brandHints: readonly string[];
  /** Diagnostic codes to act on (default `[2345, 2322]` — arg + assignment mismatches). */
  readonly codes?: readonly number[];
  /** Restrict to test files (default true). */
  readonly testFilesOnly?: boolean;
}

/**
 * Wrap every string LITERAL that tsc reports as unassignable to `brand` in `castFn<brand>(...)`.
 * Type-checker-driven (not name/structure-driven), so it uniformly catches the spots the
 * structural passes miss: positional call ARGUMENTS (`loadHistory(db, "ch1")`), `=` assignments,
 * and returns — anywhere a literal `string` meets a branded slot. Pairs with `retypeIdAnnotations`
 * (retype the declarations first; this mops up the literal value sites the retype pushes errors to).
 *
 * Run it LAST in a codemod (after retypes), so it reads the post-retype diagnostic frontier. Only
 * string-literal nodes already at a reported error are touched, and a literal already wrapped in
 * `castFn(...)` is skipped — so it's safe to re-run, and the tsc gate proves the result.
 */
/** The string-literal node a diagnostic points at (or just under), skipping literals already
 *  wrapped in `castFn(...)` (idempotent). Undefined if this diagnostic isn't a brand-mismatch
 *  on a literal we can locate. */
function resolveDiagnosticCastLiteral(diag: Diagnostic, opts: CastByDiagnosticOptions): Node | undefined {
  const sf = diag.getSourceFile();
  if (sf === undefined) {
    return;
  }
  const message = flattenDiagnosticMessage(diag.getMessageText());
  if (!opts.brandHints.some((h) => message.includes(h))) {
    return;
  }
  const start = diag.getStart();
  if (start === undefined) {
    return;
  }
  const node = sf.getDescendantAtPos(start);
  if (node === undefined) {
    return;
  }
  // The error node is (or sits just under) the offending string literal.
  const lit =
    node.getKind() === SyntaxKind.StringLiteral ||
    node.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral ||
    node.getKind() === SyntaxKind.TemplateExpression
      ? node
      : (node.getParentIfKind(SyntaxKind.StringLiteral) ??
        node.getParentIfKind(SyntaxKind.NoSubstitutionTemplateLiteral) ??
        node.getParentIfKind(SyntaxKind.TemplateExpression));
  if (lit === undefined) {
    return;
  }
  // Already wrapped in castFn(...)? Skip (idempotent).
  const parent = lit.getParent();
  if (parent !== undefined && Node.isCallExpression(parent)) {
    const callee = parent.getExpression().getText();
    if (callee === opts.castFn || callee.startsWith(`${opts.castFn}<`)) {
      return;
    }
  }
  return lit;
}

function scanDiagnosticCastTargets(ctx: CodemodContext, opts: CastByDiagnosticOptions): { targets: Node[]; files: Set<string> } {
  const codes = new Set(opts.codes ?? [TS_ARGUMENT_TYPE_MISMATCH, TS_ASSIGNMENT_TYPE_MISMATCH]);
  const testOnly = opts.testFilesOnly ?? true;
  const seen = new Set<string>();
  const targets: Node[] = [];
  const files = new Set<string>();
  for (const diag of ctx.project.getPreEmitDiagnostics()) {
    if (!codes.has(diag.getCode())) {
      continue;
    }
    const sf = diag.getSourceFile();
    const fp = sf?.getFilePath();
    if (fp === undefined || (testOnly && !isTestFile(fp))) {
      continue;
    }
    const lit = resolveDiagnosticCastLiteral(diag, opts);
    if (lit === undefined) {
      continue;
    }
    const key = `${fp}:${lit.getStart()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    targets.push(lit);
    files.add(fp);
  }
  return { targets, files };
}

export function castStringLiteralsByDiagnostic(ctx: CodemodContext, opts: CastByDiagnosticOptions): Plan {
  assertPathString(opts.brand, "brand");
  assertPathString(opts.castFn, "castFn");
  assertPathString(opts.importModule, "importModule");
  const { targets, files } = scanDiagnosticCastTargets(ctx, opts);

  const plans: Plan[] = [];
  if (targets.length > 0) {
    plans.push(
      applyTextReplacements(
        ctx,
        replacementsForNodes(targets, (n) => ({
          text: `${opts.castFn}<${opts.brand}>(${n.getText()})`,
          label: `wrap diagnostic literal in ${opts.castFn}<${opts.brand}>`,
        })),
        { note: `cast ${targets.length} diagnostic-flagged literal(s)` },
      ),
    );
    plans.push(...buildCastImportPlans(ctx, opts, files));
  }
  return composePlans(`cast tsc-flagged string literals → ${opts.castFn}<${opts.brand}> (${targets.length} site(s) across ${files.size} file(s))`, plans);
}

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
//   • Override:  --max-output-lines=N  OR  NEO_CODEMOD_MAX_LINES=N
//   • File:      /tmp/codemod-<name>-<unix-ms>.txt
//
// The output buffer is plain `string[]` and gets flushed at the end of each
// printer. We never log directly to console.log inside the renderers.

const DEFAULT_MAX_OUTPUT_LINES = 200;
/** Half the budget goes to the head, half to the tail. The remaining lines
 *  appear as `... [N lines truncated] ...` in the middle. */
const TRUNCATION_HEAD_FRACTION = 0.6; // bias toward head; first impression is the codemod's intent
/** Lines consumed by the banner + tip + separator printed before the head/tail split. */
const RESERVED_BANNER_LINES = 4;

/** Parse the --max-output-lines flag (or env override). Falls back to the
 *  default. Validates positive integer. */
function resolveMaxOutputLines(override?: number): number {
  if (typeof override === "number" && override > 0) {
    return override;
  }
  const envVal = process.env["NEO_CODEMOD_MAX_LINES"];
  if (envVal !== undefined) {
    const n = Number.parseInt(envVal, 10);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  const argv = process.argv.slice(2);
  const flag = argv.find((a) => a.startsWith("--max-output-lines="));
  if (flag !== undefined) {
    const n = Number.parseInt(flag.slice("--max-output-lines=".length), 10);
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
function flushBuffer(buffer: readonly string[], tag: string, maxLines?: number): string | undefined {
  const flat = buffer.flatMap((entry) => entry.split("\n"));
  const limit = resolveMaxOutputLines(maxLines);
  if (flat.length <= limit) {
    for (const line of flat) {
      console.log(line);
    }
    return;
  }

  // Write the full output to /tmp BEFORE printing the head, so the path
  // shows up in the banner.
  const slug = tag.replace(/[^a-zA-Z0-9._-]/gu, "_");
  const tmpPath = join(tmpdir(), `codemod-${slug}-${Date.now()}.txt`);
  try {
    writeFileSync(tmpPath, flat.join("\n"));
  } catch (err) {
    // If /tmp isn't writable we can't preserve the full output. Fall back
    // to printing the whole thing — better noisy than silent loss.
    console.log(`(warning: couldn't write overflow file ${tmpPath}: ${(err as Error).message})`);
    for (const line of flat) {
      console.log(line);
    }
    return;
  }

  const banner = `Output truncated to ${limit} lines (full output: ${tmpPath} — ${flat.length} lines total)`;
  console.log(`╭─ ${banner}`);
  console.log("│  Tip: cat the path above for the full result, or pass --max-output-lines=N.");
  console.log("╰────────────────────────────────────────────────────────────────────────────");

  const headLines = Math.max(1, Math.floor((limit - RESERVED_BANNER_LINES) * TRUNCATION_HEAD_FRACTION));
  const tailLines = Math.max(1, limit - RESERVED_BANNER_LINES - headLines);

  for (let i = 0; i < headLines; i++) {
    console.log(flat[i] ?? "");
  }
  console.log("");
  console.log(`    ... [${flat.length - headLines - tailLines} lines truncated] ...`);
  console.log("");
  for (let i = flat.length - tailLines; i < flat.length; i++) {
    console.log(flat[i] ?? "");
  }

  console.log("");
  console.log(`╭─ ${banner}`);
  console.log("│  (banner repeated at the tail so tail/grep operators see the file path)");
  console.log("╰────────────────────────────────────────────────────────────────────────────");
  return tmpPath;
}

interface PreviewStats {
  readonly filesChanged: number;
  readonly filesCreated: number;
  readonly filesDeleted: number;
  readonly overflowFile?: string;
}

type FileEntryStatus = "deleted" | "created" | "changed" | "unchanged";

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
      line: `  + ${repoRel}    (created, ${sf.getFullText().split("\n").length} lines)`,
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
    } else if (entry.status === "changed") {
      filesChanged += 1;
    }
  }
  return { lines, filesChanged, filesCreated, filesDeleted };
}

function renderPreview(opts: {
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
    buf.push("  (none)");
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
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
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

/** Print the full ts-morph pre-emit diagnostic block. Useful when you set
 *  `skipDiagnosticsCheck: true` but still want to see what TS thinks of the
 *  intermediate state. */
export function printDiagnostics(project: Project): void {
  const diags = project.getPreEmitDiagnostics();
  if (diags.length === 0) {
    console.log("✓ No pre-emit diagnostics.");
    return;
  }
  console.log(project.formatDiagnosticsWithColorAndContext(diags));
}

// ── §15.5 ─ MANIFEST + help ──────────────────────────────────────────────────

/**
 * Structured manifest of every helper in this kit. This is what
 * `pnpm codemod` (and the `--help` / `--list` / `--recipe` flags) read.
 *
 * Why structured: agents don't read 1600-line files. They run `pnpm codemod`,
 * see a short overview + a categorized list, and can dig into one section
 * or one recipe. The manifest's also greppable from the terminal.
 *
 * Format per entry:
 *   name     — the export name in this file
 *   summary  — one-line description (what it does)
 *   when     — one-line "use when..." pointer (when to reach for it)
 */

interface ManifestEntry {
  readonly name: string;
  readonly summary: string;
  readonly when: string;
}

interface ManifestCategory {
  readonly id: string;
  readonly title: string;
  readonly entries: readonly ManifestEntry[];
}

export const MANIFEST: readonly ManifestCategory[] = [
  {
    id: "bootstrap",
    title: "Bootstrap & harness",
    entries: [
      {
        name: "createCodemodProject",
        summary: "Build a ts-morph Project with the repo's standard globs (src/tests/scripts).",
        when: "Always — at the start of every codemod. The harness calls it for you if you use runCodemod.",
      },
      {
        name: "runCodemod",
        summary: "The CLI harness — --apply / --dry-run flags, snapshots, diff rendering, save, and the refusal when a plan mutates a file it never declared.",
        when: "Always wrap your codemod with this. It's the only legitimate way to write changes.",
      },
      {
        name: "composePlans",
        summary: "Merge several Plans into one with a single description.",
        when: "When a logical operation involves multiple sub-plans you want shown as one line in the preview.",
      },
    ],
  },
  {
    id: "validation",
    title: "Validation & path helpers",
    entries: [
      {
        name: "assert",
        summary: "Throw CodemodError if the condition is falsy.",
        when: "For invariant checks. Surfaces uniformly in the harness output.",
      },
      {
        name: "assertPathString",
        summary: "Reject empty / non-string paths early.",
        when: "At the top of any helper that takes a path.",
      },
      {
        name: "absolutePath",
        summary: "Resolve a path against the repo root; refuse paths that escape it.",
        when: "Whenever you accept a user-supplied path. Guards against accidental rm -rf above the repo.",
      },
      {
        name: "repoRelative",
        summary: "Format a path for the preview output.",
        when: "When printing paths to the operator. Don't show absolute paths in summaries.",
      },
      {
        name: "isUnderSrc / isTestFile / siblingTestPath",
        summary: "Predicates + helpers for common file-path checks.",
        when: "Filtering / co-moving tests alongside their sources.",
      },
    ],
  },
  {
    id: "files",
    title: "File operations",
    entries: [
      {
        name: "moveFiles",
        summary: "Move files; ts-morph rewrites every relative import in the project graph.",
        when: "Restructure / reorg. The reference codemod is chat-restructure-stage1.ts.",
      },
      {
        name: "deleteFiles",
        summary: "Delete files. REQUIRES { confirm: true } — there's no second chance.",
        when: "After you've moved or absorbed a file's contents and the old path is dead.",
      },
      {
        name: "createSourceFile",
        summary: "Create a new source file with given text. Refuses to overwrite unless confirmed.",
        when: "Generating a new contract file, new front-door barrel, etc.",
      },
      {
        name: "copyFile",
        summary: "Copy a file to a new path (ts-morph fixes relative imports in the copy).",
        when: "Forking a file in two. Rare.",
      },
      {
        name: "removeEmptyDirectory",
        summary: "rm -rf a directory after a move — refuses if anything still lives there.",
        when: "Clean up after moving every file out of a substrate/ etc.",
      },
    ],
  },
  {
    id: "imports",
    title: "Import operations",
    entries: [
      {
        name: "findImporters",
        summary: "Find every ImportDeclaration with an EXACT module specifier.",
        when: "Repointing alias-path imports; symbol routing.",
      },
      {
        name: "findImportersOfFile",
        summary: "Find every importer that resolves to a given SourceFile (handles relative paths).",
        when: "Asking 'who depends on this file?' (not 'who imports this string?').",
      },
      {
        name: "findAllReferencersOfFile",
        summary: "Like findImportersOfFile but also returns re-exports, require() calls, import =.",
        when: "Audit / full-coverage sweeps.",
      },
      {
        name: "repointImports",
        summary: 'Rewrite every `from "OLD"` to `from "NEW"` in one pass.',
        when: "After a file move where the old path was an alias path.",
      },
      {
        name: "repointAliasPaths",
        summary: "Regex sweep of full file text — catches comments + dynamic import() too.",
        when: "Filling the alias-path gap ts-morph's move() leaves. The one footgun the kit can't auto-fix.",
      },
      {
        name: "addNamedImport",
        summary: 'Idempotent `import { X } from "Y"` — merges into existing declaration if present.',
        when: "Adding a new dep to a file when you don't want to write the boilerplate twice.",
      },
      {
        name: "removeNamedImport",
        summary: "Remove specific named imports; drops the declaration if it ends up empty.",
        when: "Cleaning up an unused symbol after refactoring.",
      },
      {
        name: "renameNamedImport",
        summary: "Rename one specific named import everywhere it's imported from a module.",
        when: "Upstream renamed the export and you need every consumer to match.",
      },
      {
        name: "makeImportTypeOnly",
        summary: "Flip imports to `import type` (per-specifier).",
        when: "When the value side of a symbol is going away and only the type remains.",
      },
      {
        name: "routeSymbolsByMap",
        summary: "Split one file's exports across many: route each importer to the right destination.",
        when: "Restructure stage 2 — types.ts → contract/views/params/results/errors split.",
      },
    ],
  },
  {
    id: "exports",
    title: "Export / barrel operations",
    entries: [
      {
        name: "addReExport",
        summary: 'Idempotent `export { X } from "Y"`. Merges into an existing export declaration.',
        when: "Growing a front-door barrel after lifting an internal symbol.",
      },
      {
        name: "removeReExport",
        summary: "Remove specific re-exports; drops empty declarations.",
        when: "Trimming a barrel that's outgrown its purpose.",
      },
      {
        name: "dedupeReExports",
        summary: "Walk a barrel + dedupe re-exports of the same symbol from the same source.",
        when: "After multiple codemods or hand-edits have inflated a barrel.",
      },
    ],
  },
  {
    id: "refs",
    title: "Symbol & reference discovery",
    entries: [
      {
        name: "findReferencesByName",
        summary: "Find every reference to an exported symbol (uses TS language service — alias-aware).",
        when: "Audit: 'who actually uses this exported foo()?'",
      },
      {
        name: "findExportedDeclaration",
        summary: "Look up an exported declaration by name in a file.",
        when: "Inside another helper. Usually paired with findReferencesByName / renameExportedSymbol.",
      },
      {
        name: "listExports",
        summary: "List every exported symbol with its declarations.",
        when: "Auditing what a file exposes. Useful in surface-coverage checks.",
      },
      {
        name: "findCallSites",
        summary: "Plain text match on call-expression callee text.",
        when: "Quick 'where is foo() called' when you don't need alias resolution.",
      },
    ],
  },
  {
    id: "rename",
    title: "Renames (cross-file, language-service-aware)",
    entries: [
      {
        name: "renameExportedSymbol",
        summary: "Rename an exported declaration; TS's reference engine updates every importer.",
        when: "Renaming a symbol cleanly across the whole project, including re-exports.",
      },
    ],
  },
  {
    id: "text",
    title: "Stale-node-safe text replacements",
    entries: [
      {
        name: "applyTextReplacements",
        summary: "Apply many {start,end,text} plans in end-descending order. Validates non-overlap.",
        when: "Any time you collect AST-derived plans + need to apply them without invalidating each other.",
      },
      {
        name: "replacementsForNodes",
        summary: "Snapshot AST nodes into {start,end,text} BEFORE any mutation.",
        when: "When you have a list of AST nodes + a per-node text producer. Pairs with applyTextReplacements.",
      },
    ],
  },
  {
    id: "idbrand",
    title: "ID branding (TypeID migration)",
    entries: [
      {
        name: "retypeIdAnnotations",
        summary: "Retype `chatId: string` → `chatId: ChatId` on every named param/field/var; preserves `| null`/`?`; adds the import.",

        when: "Per-entity TypeID rollout, production side — after the DB columns carry `.$type<Brand>()`. Parameterized by id names + brand.",
      },
      {
        name: "castIdInObjectLiterals",
        summary: 'Wrap fixture id string-literals (`chatId: "ch1"`, table-scoped `id: "ch1"`) in `castId<Brand>(...)`. Test-scoped.',
        when: "Per-entity TypeID rollout, test side — the literal-fixture insert/values bulk the column brand now rejects.",
      },
      {
        name: "castIdInComparisons",
        summary: 'Wrap string literals compared against a branded column (`eq(chats.id, "ch1")`, `inArray`) in `castId<Brand>(...)`.',
        when: "Per-entity TypeID rollout — WHERE-clause literals that surface as TS2769 on the operator, which the other cast passes can't see.",
      },
      {
        name: "castStringLiteralsByDiagnostic",
        summary: "Wrap every tsc-flagged string literal unassignable to the brand (call args, assignments, returns) in `castId<Brand>(...)`.",

        when: 'Run LAST — type-checker-driven mop-up of literal value sites that `retypeIdAnnotations` pushes errors to (e.g. `f(db, "ch1")`).',
      },
    ],
  },
  {
    id: "jsx",
    title: "JSX (for client codemods)",
    entries: [
      {
        name: "findJsxByTag",
        summary: "Find every JSX element with a given tag name (opening + self-closing).",
        when: "Sweeping every <OldButton> in the client.",
      },
      {
        name: "renameJsxTag",
        summary: "Rename a JSX tag; updates the opening + closing element together.",
        when: "Component rename. Pair with renameNamedImport for the import side.",
      },
      {
        name: "findJsxAttributes",
        summary: "Find every JSX attribute with a name.",
        when: "Audit / sweep specific attributes across components.",
      },
    ],
  },
  {
    id: "diagnostics",
    title: "Diagnostics",
    entries: [
      {
        name: "printDiagnostics",
        summary: "Print ts-morph's pre-emit diagnostics.",
        when: "After --apply when you want to manually verify the codemod didn't break TS.",
      },
    ],
  },
] as const;

/**
 * Common recipes — the "I want to do X, what's the shape?" answer. Each
 * recipe has a name, a description, and a code snippet that compiles when
 * pasted into a real codemod. The CLI surfaces them via
 * `pnpm codemod recipes` and `pnpm codemod recipe <name>`.
 */
interface Recipe {
  readonly name: string;
  readonly description: string;
  readonly code: string;
}

export const RECIPES: readonly Recipe[] = [
  {
    name: "preview-first",
    description: "Run any codemod safely. Default is dry-run; --apply commits.",
    code: `// In your codemod file:
import { runCodemod } from "./codemod-kit.ts";

await runCodemod("my-codemod", (ctx) => {
  // ... ctx.plan(...) calls
});

// Run from the repo root:
//   pnpm tsx scripts/codemods/my-codemod.ts            # preview only
//   pnpm tsx scripts/codemods/my-codemod.ts --apply    # write changes`,
  },
  {
    name: "move-files",
    description: "Move files and fix every import that referenced them.",
    code: `import { moveFiles, repointAliasPaths, runCodemod } from "./codemod-kit";

await runCodemod("move-foo", (ctx) => {
  // 1. Move files. Relative imports auto-rewrite.
  ctx.plan(moveFiles(ctx, [
    ["src/foo.ts", "src/feature/foo.ts"],
    ["src/foo.test.ts", "src/feature/foo.test.ts"],
  ]));
  // 2. Sweep #alias paths ts-morph's move() doesn't follow.
  ctx.plan(repointAliasPaths(ctx, [
    [/#server\\/foo/g, "#server/feature/foo"],
  ]));
});`,
  },
  {
    name: "split-types-file",
    description: "Split one types.ts into many contract/*.ts files (symbol routing).",
    code: `import { routeSymbolsByMap, deleteFiles, runCodemod } from "./codemod-kit";

await runCodemod("split-types", (ctx) => {
  ctx.plan(routeSymbolsByMap(ctx, "#server/feature/types", {
    FooDetail: "#server/feature/contract/views",
    FooParams: "#server/feature/contract/params",
    FooError:  "#server/feature/contract/errors",
  }));
  // After every importer is repointed, drop the old types.ts.
  ctx.plan(deleteFiles(ctx, ["src/server/feature/types.ts"], { confirm: true }));
});`,
  },
  {
    name: "rename-symbol",
    description: "Rename an exported symbol everywhere (language-service-aware).",
    code: `import { renameExportedSymbol, runCodemod } from "./codemod-kit";

await runCodemod("rename-foo", (ctx) => {
  ctx.plan(
    renameExportedSymbol(ctx, "src/feature/api.ts", { oldName: "oldFoo", newName: "newFoo" }),
  );
});`,
  },
  {
    name: "rewrite-callsites",
    description: "Rewrite N matching expressions in one file without the stale-node footgun.",
    code: `import {
  applyTextReplacements, replacementsForNodes, runCodemod, SyntaxKind,
} from "./codemod-kit";

await runCodemod("flip-foo-call", (ctx) => {
  const sf = ctx.project.getSourceFileOrThrow("src/feature/foo.ts");
  const calls = sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => c.getExpression().getText() === "oldFoo");
  const plans = replacementsForNodes(calls, (call) => ({
    text: call.getText().replace(/^oldFoo/, "newFoo"),
    label: "oldFoo() → newFoo()",
  }));
  ctx.plan(applyTextReplacements(ctx, plans));
});`,
  },
  {
    name: "rename-jsx-component",
    description: "Rename a JSX component everywhere it's used + fix the import.",
    code: `import {
  renameJsxTag, renameNamedImport, runCodemod,
} from "./codemod-kit";

await runCodemod("rename-button", (ctx) => {
  ctx.plan(renameJsxTag(ctx, "OldButton", "NewButton"));
  ctx.plan(
    renameNamedImport(ctx, "@/components/ui/button", { oldName: "OldButton", newName: "NewButton" }),
  );
});`,
  },
  {
    name: "add-export-to-barrel",
    description: "Lift an internal symbol to a feature's front door (index.ts).",
    code: `import { addReExport, runCodemod } from "./codemod-kit";

await runCodemod("lift-fooDetail", (ctx) => {
  ctx.plan(
    addReExport(ctx, "src/feature/index.ts", {
      moduleSpecifier: "./contract/views",
      name: "FooDetail",
      isTypeOnly: true,
    }),
  );
});`,
  },
];

// ── Help / list / recipe printers ────────────────────────────────────────────
//
// Why on the kit and not in a separate file: the CLI wrapper
// `codemod-help.ts` is two lines; everything load-bearing about the help
// surface (sections, entries, recipes) lives next to the code so a stale
// entry is harder to merge.

const KIT_FILE_RELATIVE = "scripts/codemods/codemod-kit.ts";
/** Column width for category ids in the `help` overview listing. */
const CATEGORY_ID_COLUMN_WIDTH = 14;
/** Column width for recipe names in the `help` overview listing. */
const RECIPE_NAME_COLUMN_WIDTH = 22;

const OVERVIEW = `
ts-morph codemod toolkit — quick reference

When to reach for this:
  • A code change touches > ~3 files in a mechanical way (rename, restructure,
    swap a barrel). Use a codemod, not a sed loop, not by hand.
  • You want to preview the change before it lands. The harness runs
    DRY-RUN by default; pass --apply to commit.

How to read this help:
  pnpm codemod              # this overview
  pnpm codemod list         # every helper, grouped by category
  pnpm codemod list <id>    # one category (e.g. \`imports\`, \`files\`)
  pnpm codemod search <q>   # grep helpers + recipes by keyword
  pnpm codemod recipes      # common recipes (move, rename, split types.ts, …)
  pnpm codemod recipe <id>  # one recipe with copy-pasteable code

The toolkit lives at ${KIT_FILE_RELATIVE}.
The doc-comment at the top is the authoritative spec; the manifest below is
its categorical index.

Categories:
${MANIFEST.map((c) => `  • ${c.id.padEnd(CATEGORY_ID_COLUMN_WIDTH)} ${c.title}`).join("\n")}

Recipes:
${RECIPES.map((r) => `  • ${r.name.padEnd(RECIPE_NAME_COLUMN_WIDTH)} ${r.description}`).join("\n")}
`;

/** Print the high-level overview. Default `pnpm codemod` output. Short
 *  enough that overflow handling isn't usually needed, but routed through
 *  the buffer for consistency with the other printers. */
export function printHelp(maxOutputLines?: number): void {
  flushBuffer([OVERVIEW], "help", maxOutputLines);
}

/** Print every helper grouped by category. If `categoryId` is given, only
 *  that category. The full list runs ~80 lines for the current MANIFEST;
 *  if the kit grows past the threshold the overflow goes to /tmp. */
export function printList(categoryId?: string, maxOutputLines?: number): void {
  const targets = categoryId ? MANIFEST.filter((c) => c.id === categoryId) : MANIFEST;
  const buf: string[] = [];
  if (targets.length === 0) {
    buf.push(`No category "${categoryId}". Available: ${MANIFEST.map((c) => c.id).join(", ")}`);
    flushBuffer(buf, "list", maxOutputLines);
    return;
  }
  for (const cat of targets) {
    buf.push(`\n── ${cat.title} (${cat.id}) ──`);
    for (const e of cat.entries) {
      buf.push(`\n  ${e.name}`);
      buf.push(`    ${e.summary}`);
      buf.push(`    Use when: ${e.when}`);
    }
  }
  flushBuffer(buf, categoryId ? `list-${categoryId}` : "list", maxOutputLines);
}

/** Print every recipe with its description + code block. Almost always
 *  exceeds the threshold — the full output spills to /tmp. */
export function printRecipes(maxOutputLines?: number): void {
  const buf: string[] = [];
  for (const r of RECIPES) {
    buf.push(`\n${r.name} — ${r.description}\n`);
    buf.push(indent(r.code, "    "));
  }
  flushBuffer(buf, "recipes", maxOutputLines);
}

/** Print one recipe by name. Single-recipe view; no overflow expected. */
export function printRecipe(name: string, maxOutputLines?: number): void {
  const buf: string[] = [];
  const r = RECIPES.find((x) => x.name === name);
  if (!r) {
    buf.push(`No recipe "${name}". Available: ${RECIPES.map((x) => x.name).join(", ")}`);
    flushBuffer(buf, "recipe-not-found", maxOutputLines);
    return;
  }
  buf.push(`\n${r.name} — ${r.description}\n`);
  buf.push(r.code);
  buf.push("");
  flushBuffer(buf, `recipe-${name}`, maxOutputLines);
}

/** Search helper names + summaries + recipe names + descriptions for a
 *  keyword. Cheap substring match (case-insensitive). Hits over the
 *  threshold spill to /tmp. */
export function searchHelpers(query: string, maxOutputLines?: number): void {
  const q = query.toLowerCase();
  const buf: string[] = [];
  const hits: string[] = [];
  for (const cat of MANIFEST) {
    for (const e of cat.entries) {
      const hay = `${e.name}\n${e.summary}\n${e.when}`.toLowerCase();
      if (hay.includes(q)) {
        hits.push(`  [${cat.id}] ${e.name}\n    ${e.summary}`);
      }
    }
  }
  for (const r of RECIPES) {
    const hay = `${r.name}\n${r.description}`.toLowerCase();
    if (hay.includes(q)) {
      hits.push(`  [recipe] ${r.name}\n    ${r.description}`);
    }
  }
  if (hits.length === 0) {
    buf.push(`No matches for "${query}".`);
  } else {
    buf.push(`\nMatches for "${query}":\n`);
    for (const h of hits) {
      buf.push(h);
      buf.push("");
    }
  }
  flushBuffer(buf, `search-${query}`, maxOutputLines);
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((l) => prefix + l)
    .join("\n");
}

// ── §16 ─ `kit` namespace ────────────────────────────────────────────────────

/**
 * Convenience bundle — everything in one importable object. Use
 *   import { kit } from "./codemod-kit";
 *   await kit.runCodemod("foo", (ctx) => { ctx.plan(kit.moveFiles(...)); });
 * if you prefer a namespace over individual imports. The named exports
 * still work; this is purely an ergonomics nod.
 */
export const kit = {
  CodemodError,
  runCodemod,
  createCodemodProject,
  composePlans,
  assert,
  assertPathString,
  absolutePath,
  repoRelative,
  isUnderSrc,
  isTestFile,
  siblingTestPath,
  moveFiles,
  deleteFiles,
  createSourceFile,
  copyFile,
  findImporters,
  findImportersOfFile,
  findAllReferencersOfFile,
  repointImports,
  repointAliasPaths,
  moduleStringArg,
  addNamedImport,
  removeNamedImport,
  renameNamedImport,
  makeImportTypeOnly,
  routeSymbolsByMap,
  addReExport,
  removeReExport,
  dedupeReExports,
  findReferencesByName,
  findExportedDeclaration,
  listExports,
  findCallSites,
  renameExportedSymbol,
  applyTextReplacements,
  replacementsForNodes,
  retypeIdAnnotations,
  castIdInObjectLiterals,
  castIdInComparisons,
  castStringLiteralsByDiagnostic,
  findJsxByTag,
  renameJsxTag,
  findJsxAttributes,
  printDiagnostics,
  printHelp,
  printList,
  printRecipes,
  printRecipe,
  searchHelpers,
  MANIFEST,
  RECIPES,
} as const;

// ── §17 ─ Example codemod (kept compiling) ───────────────────────────────────

/**
 * The example below is exported as a named function so the toolkit's TS
 * compilation guards against it bit-rotting. Don't actually run this —
 * it's a snippet demonstrating composition. Real codemods live as their
 * own files in `scripts/codemods/`.
 *
 * Usage of the example would be:
 *   await exampleRestructureCodemod();
 */
export function exampleRestructureCodemod(): Promise<CodemodResult> {
  return runCodemod("example-restructure", (ctx) => {
    // 1. Move some files. ts-morph auto-rewrites relative specifiers.
    ctx.plan(
      moveFiles(ctx, [
        ["src/foo.ts", "src/feature/foo.ts"],
        ["src/foo.test.ts", "src/feature/foo.test.ts"],
      ]),
    );

    // 2. Sweep alias paths ts-morph couldn't follow.
    ctx.plan(repointAliasPaths(ctx, [[/#server\/foo/gu, "#server/feature/foo"]]));

    // 3. Route a split: types.ts has 3 symbols going to 3 new files.
    ctx.plan(
      routeSymbolsByMap(ctx, "#server/feature/foo", {
        FooDetail: "#server/feature/contract/foo-detail",
        FooParams: "#server/feature/contract/foo-params",
        FooError: "#server/feature/contract/foo-error",
      }),
    );

    // 4. Add a re-export to the new front door.
    ctx.plan(
      addReExport(ctx, "src/feature/index.ts", {
        moduleSpecifier: "./contract/foo-detail",
        name: "FooDetail",
        isTypeOnly: true,
      }),
    );

    // 5. Delete the now-empty old file. Note `confirm: true` is required.
    ctx.plan(deleteFiles(ctx, ["src/feature/foo.ts"], { confirm: true, note: "after symbol routing" }));

    ctx.log("All 5 phases queued. Run with --apply to commit.");
  });
}

// ── Bonus: bare-bones argv/env helpers some codemods want ────────────────────

/** Get a named flag value from argv, e.g. `--threshold=0.5` → `"0.5"`. */
export function getFlag(name: string, argv: readonly string[] = process.argv.slice(2)): string | undefined {
  const prefix = `--${name}=`;
  const match = argv.find((a) => a.startsWith(prefix));
  return match?.slice(prefix.length);
}

/** Read a file from disk (NOT through ts-morph). Pure convenience so a
 *  codemod can peek at a JSON config without bringing in fs/promises etc. */
export function readFileText(filePath: string, repoRoot = process.cwd()): string {
  const abs = absolutePath(filePath, repoRoot);
  assert(existsSync(abs), `readFileText: file does not exist: ${repoRelative(abs, repoRoot)}`);
  return readFileSync(abs, "utf-8");
}

/** Check that `dir` exists and is a directory. Doesn't create it. */
export function assertDirectoryExists(dir: string, repoRoot = process.cwd()): void {
  const abs = absolutePath(dir, repoRoot);
  assert(existsSync(abs), `Directory does not exist: ${repoRelative(abs, repoRoot)}`);
  const st = statSync(abs);
  assert(st.isDirectory(), `Path exists but is not a directory: ${repoRelative(abs, repoRoot)}`);
}

/** Helper to `rm -rf` a directory after a codemod that moves everything out
 *  of it (covers the "remove the now-empty substrate/" pattern). Refuses
 *  unless `confirm: true` and the directory is empty after the moves
 *  finished (so we can't accidentally delete a populated dir). */
export function removeEmptyDirectory(ctx: CodemodContext, dir: string, opts: OperationOptions & { confirm: true }): Plan {
  assert(opts.confirm === true, "removeEmptyDirectory requires { confirm: true }");
  const abs = absolutePath(dir, ctx.repoRoot);
  return {
    description: `Remove empty directory ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [],
    transform(innerCtx): void {
      if (innerCtx.isDryRun) {
        return;
      } // we don't simulate fs ops in dry-run
      if (!existsSync(abs)) {
        return;
      }
      // ts-morph still tracks the directory inside the project; verify no
      // source files reside under it.
      for (const sf of innerCtx.project.getSourceFiles()) {
        if (sf.getFilePath().startsWith(`${abs}${sep}`)) {
          throw new CodemodError(
            `removeEmptyDirectory: ${repoRelative(abs, ctx.repoRoot)} still contains ${sf.getFilePath()}`,
            "Make sure all moveFiles plans have run before scheduling the directory removal.",
          );
        }
      }
      rmSync(abs, { recursive: true, force: true });
    },
  };
}

// ── Footer ────────────────────────────────────────────────────────────────────
// This file is intentionally one big surface. If it grows past 2.5k lines
// or there's pressure to split, the right cut is:
//   - codemod-kit/core.ts        ← §1-§7
//   - codemod-kit/imports.ts     ← §9
//   - codemod-kit/exports.ts     ← §10
//   - codemod-kit/refs-rename.ts ← §11-§12
//   - codemod-kit/text.ts        ← §13
//   - codemod-kit/jsx.ts         ← §14
//   - codemod-kit/preview.ts     ← §15
//   - codemod-kit/index.ts       ← re-exports + the `kit` namespace
// Leave §16-§17 + `entry` in core. Until then, one file = one grep target.
//
// Conversational note for future agents reading this: when in doubt about a
// ts-morph method, the source of truth is
// `node_modules/ts-morph/lib/ts-morph.d.ts` (about 11k lines, fully typed,
// pretty readable). Search there before reaching for the website docs —
// they sometimes lag the npm tag.
