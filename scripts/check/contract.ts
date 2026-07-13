// The ONE interface every single-pass gate module exports. A gate never walks anything itself — it
// declares the SyntaxKinds it wants + a per-node predicate, and the runner (pass.ts) feeds it via one
// shared walk.
import type { Node, Project, SourceFile, SyntaxKind, TypeChecker } from "ts-morph";

export type Severity = "error" | "warn"; // "warn" is the advisory tier reserved for a future non-failing gate.

/** A single-pass finding — one per distinct violation instance (a class-string gate emits one per
 *  offending token, not one per className). The reason lives once on the gate descriptor
 *  (`message`/`fix`); a Finding never repeats prose. `message`/`fix` here are per-occurrence overrides
 *  for the rare finding whose text varies (e.g. a stale-registry arm naming the dead entry). */
export interface Finding {
  readonly file: string; // repo-relative, posix — the jump-link path
  readonly line: number; // 1-based, FROM THE NODE. 0 only for genuinely file-level findings.
  readonly column: number; // 1-based, FROM THE NODE. 0 for file-level findings.
  readonly token?: string; // the exact offending lexeme (the class token / identifier / import name)
  readonly message?: string; // per-occurrence override; normally OMITTED — the reason lives on the gate
  readonly fix?: string; // per-occurrence override; normally OMITTED — the fix lives on the gate
  readonly severity?: Severity; // default "error"
}

export type ScopeSafety =
  | "incremental-safe" // per-file verdicts: running on just the changed files is correct for those files
  | "whole-project"; // cross-file: registry/parity/uniqueness/coverage — needs the full tree

export type GateStatus = "active" | "dormant";

/** What fileset a run covers. v1 uses only `project`; the field lets a gate's finalize self-guard its
 *  stale/ratchet arm on `scope.kind === "project"`. */
export type Scope =
  | { readonly kind: "project" }
  | { readonly kind: "package"; readonly name: string }
  | { readonly kind: "folder"; readonly glob: string }
  | { readonly kind: "changed"; readonly paths: readonly string[] };

/** A self-proof example: single virtual file (per-node gates) or a multi-file map (whole-project gates
 *  whose bite depends on another file). */
export type GateExample = {
  /** `"code string"` → one virtual file at `at` (or a scanRoot default); a path→source map → a mini-project. */
  readonly files: string | Readonly<Record<string, string>>;
  /** Single-string form only: the virtual path the snippet lands at. */
  readonly at?: string;
  /** mustFlag only, optional precision: the finding must match. */
  readonly expect?: {
    readonly messageIncludes?: string;
    readonly line?: number;
    readonly count?: number;
  };
  readonly why?: string; // one-liner: what this example proves (rendered in conformance failures)
};

/** Per-run context handed to every hook. */
export interface GateRunCtx {
  readonly root: string;
  readonly project: Project; // the ONE shared workspace
  readonly scope: Scope; // §4 — what fileset this run covers
  readonly files: readonly SourceFile[]; // the scoped fileset the walk will visit
  /** Lazy — first access creates the Program/binder (pay once, shared by every gate that asks). */
  readonly checker: () => TypeChecker;
  /** The finding sink. Overload 1: node-anchored (line/column from the node). Overload 2: token-anchored
   *  — `offset` is the token's 0-based index into `node.getText()`, so the column lands on the token
   *  itself. Overload 3: file-level / explicit (caller supplies the whole Finding). */
  readonly report: {
    (node: Node, atToken?: { readonly token: string; readonly offset: number }): void;
    (finding: Finding): void;
  };
}

export interface GateDescriptor {
  readonly name: string; // kebab, must equal the filename (loader-enforced)
  readonly docRow: string; // the Core-Enforcement-Active-Gates.md citation
  readonly status: GateStatus;
  readonly scopeSafety: ScopeSafety;

  // ---- the REASON, written ONCE -----------------------------
  /** The rule this gate enforces: what is wrong + why. The reporter prints this once as the group
   *  header, then lists every occurrence beneath it — a Finding never repeats this prose. */
  readonly message: string;
  /** How to correct it. Printed once under the group header. */
  readonly fix?: string;
  /** Which files this gate reads AT ALL — replaces file.ts's hand-kept GATE_SCOPES table. */
  readonly scanRoot?: (repoRelPath: string) => boolean;

  // ---- the NODE SUBSCRIPTION (per-node gates) --------------------------------
  /** SyntaxKinds this gate wants. The loader builds Map<SyntaxKind, Gate[]> from these.
   *  Omit for file-level / fs-level gates. */
  readonly kinds?: readonly SyntaxKind[];
  /** The per-node check. MUST be read-only. May accumulate into module-local state consumed by `finalize`. */
  readonly visit?: (node: Node, sf: SourceFile, ctx: GateRunCtx) => void;

  // ---- per-FILE hook (line-scans, per-file setup/teardown) -------------------
  readonly visitFile?: (sf: SourceFile, ctx: GateRunCtx) => void;

  // ---- whole-project / fs-level pass ------------------------------------------
  /** A `whole-project` gate's own pass over the SAME shared Project (never a new Project). */
  readonly run?: (ctx: GateRunCtx) => void;
  /** True when this gate's hooks read the real filesystem rather than only the ts-morph Project, so the
   *  conformance runner materializes its examples into a real temp dir instead of an in-memory Project. */
  readonly fsBacked?: boolean;

  // ---- lifecycle around the single walk ---------------------------------------
  readonly begin?: (ctx: GateRunCtx) => void; // reset accumulators
  readonly finalize?: (ctx: GateRunCtx) => void; // judge accumulated state (ratchet stale arms live here)

  // ---- SELF-PROOF (required — the loader refuses an un-proven gate) ------------
  /** ≥1 example the gate must flag. */
  readonly mustFlag: readonly GateExample[];
  /** ≥1 example the gate must not flag. */
  readonly mustPass: readonly GateExample[];
}
