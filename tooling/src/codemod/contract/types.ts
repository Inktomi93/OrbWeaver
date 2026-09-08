// The kit's exported shapes — plans, options, results (no-inline-types: tool types live in
// contract/). Split from codemod-kit.ts §2/§4/§5 + the per-helper option interfaces (P4 of #393).
import type { ImportSpecifier, JsxOpeningElement, JsxSelfClosingElement, Project, SourceFile } from "ts-morph";
import type { CompilerProgram } from "#verify";

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

/** Filter predicate for selecting specific named imports inside a
 *  declaration. `(spec) => spec.getName() === "foo"`. */
export type ImportSpecFilter = (spec: ImportSpecifier) => boolean;

/** Type-narrowing alias — a JSX opening or self-closing element (both
 *  carry tag-name + attributes). */
export type JsxLike = JsxOpeningElement | JsxSelfClosingElement;

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

export interface CreateProjectOptions {
  /** Path to tsconfig.json. Default: `./tsconfig.json` from process.cwd(). */
  readonly tsConfigFilePath?: string;
  /** Replace the default glob set entirely. Use when you know exactly what
   *  you want to operate on (e.g. only src/client). */
  readonly replaceGlobs?: readonly string[];
}

// The runCodemod harness: CLI flags, dry-run default, snapshot/diff/apply, the preview-integrity
// guard, the manipulation-error refusal, the compiler-world diagnostics check.
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
 *   - Post-transform diagnostics in each affected file's authored compiler program, including
 *     unchanged TypeScript-resolved consumers (catch broken TS before it hits disk)
 *   - Per-file diff rendering for the preview
 *
 * Pass `name` for the log header. Pass `setup` to customize the project.
 */
export interface RunCodemodOptions {
  /** The invoking program's OWN argv (`process.argv.slice(2)` at its cli/entry). REQUIRED, and required
   *  on purpose: `runCodemod` used to read the global `process.argv` itself, which made a library's
   *  write/dry-run decision depend on how the process was started and unreachable from any caller. A
   *  required field makes an omission a tsc error rather than a silent downgrade to dry-run — the one
   *  failure mode that would swallow an operator's `--apply` (Core-Tooling-Law §4.9). */
  readonly argv: readonly string[];
  readonly setup?: CreateProjectOptions;
  /** Set true to skip the post-transform authored-program diagnostics check.
   *  Useful when the codemod intentionally lands the project in a transient
   *  broken state (e.g. you're mid-restructure and a follow-up commit
   *  finishes the refactor). Off by default — the check catches real bugs. */
  readonly skipDiagnosticsCheck?: boolean;
  /** Set true to apply without `--apply` appearing in `argv`. Use in tests. */
  readonly forceApply?: boolean;
  /** Override the repo root used for path-escape guards. Defaults to
   *  `process.cwd()` resolved. */
  readonly repoRoot?: string;
  /** Max stdout lines before the preview output spills to /tmp.
   *  Defaults to 200; overridable via the `--max-output-lines=N` flag (parsed by `codemod/cli.ts` and
   *  passed in) or the `NEO_CODEMOD_MAX_LINES=N` env var. The spill file path appears at BOTH
   *  the head and the tail of the truncated output so head/tail readers see
   *  the pointer. */
  readonly maxOutputLines?: number;
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

/**
 * Per-file snapshot captured at the start of the codemod. Used to render
 * the preview diff (current text - snapshot text) before deciding to save.
 */
export interface FileSnapshot {
  readonly filePath: string;
  readonly originalText: string;
  /** True when the file was created during the codemod (no original to diff against). */
  readonly wasCreated: boolean;
}

/** Native pre-transform compiler facts retained across the in-memory codemod transaction. */
export interface ProgramDiagnosticBaseline {
  readonly programs: readonly CompilerProgram[];
  readonly consumersByPath: ReadonlyMap<string, ReadonlySet<string>>;
  /** Every authored compiler program whose native pre-transform closure contains this physical path. */
  readonly containingProgramIdsByPath: ReadonlyMap<string, ReadonlySet<string>>;
  readonly globalProgramIdsByPath: ReadonlyMap<string, ReadonlySet<string>>;
}
