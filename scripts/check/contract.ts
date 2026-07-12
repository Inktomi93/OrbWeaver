// The ONE interface every single-pass gate module exports (TSMORPH-SINGLE-PASS-AUDIT.md §1.1 + §9).
// A gate NEVER walks anything itself — it DECLARES the SyntaxKinds it wants + a per-node predicate, and
// the runner (pass.ts) feeds it via one shared walk. This is the read-side foundation; it runs ALONGSIDE
// the legacy `Check` (harness.ts) during the parity migration — nothing here changes the legacy verdict.
//
// The richer `Finding` (§9.1) adds node-derived line+column (via getLineAndColumnAtPos, 1-indexed) and an
// actionable `fix` string on top of the legacy `{file,line,message}` — the location comes from the AST
// node, never a regex newline-guess.
import type { Node, Project, SourceFile, SyntaxKind, TypeChecker } from "ts-morph";

export type Severity = "error" | "warn"; // v1: every gate is "error" (today's semantics); "warn" is the
// advisory tier the field reserves so a future non-failing gate needs no schema change (§9.4).

/** A single-pass finding — EXHAUSTIVE + PER-OCCURRENCE (owner ruling 1): one finding per distinct
 *  violation INSTANCE (for a class-string gate, per offending TOKEN — `className="rounded-lg shadow-md"`
 *  is TWO findings, not one). It carries only the coordinate + the offending token; the human-readable
 *  reason (what's wrong + WHY + HOW to fix) lives ONCE on the gate descriptor (`message`/`fix`) and the
 *  reporter prints it once per group — a Finding never repeats prose (owner ruling 2).
 *
 *  `message` is retained as an OPTIONAL override for the rare finding whose text genuinely varies per
 *  occurrence (a stale-registry arm naming the dead entry); the reporter falls back to the descriptor's
 *  `message` when a finding omits its own. Superset of the legacy `Violation`. */
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

export type GateStatus = "active" | "dormant"; // dormancy is DECLARED IN the module (§1.3)

/** What fileset a run covers (§4.1). v1 uses only `project`; the field is threaded so a gate's
 *  finalize can self-guard its stale/ratchet arm on `scope.kind === "project"` (§4.4). */
export type Scope =
  | { readonly kind: "project" }
  | { readonly kind: "package"; readonly name: string }
  | { readonly kind: "folder"; readonly glob: string }
  | { readonly kind: "changed"; readonly paths: readonly string[] };

/** A self-proof example (§1.1). Single virtual file (per-node gates) OR a multi-file map (whole-project
 *  gates whose bite depends on another file). Documentation-with-teeth — a handful of lines, not a dump. */
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
  /** The finding sink (§9.1). All forms emit ONE finding per call — exhaustive/per-occurrence.
   *  Overload 1: node-anchored (line/column FROM the node) — the whole node IS the occurrence.
   *  Overload 2: token-anchored — a lexeme WITHIN a node (a class token inside a className string);
   *    `offset` is the token's 0-based index into `node.getText()`, so the column lands on the token
   *    itself, not the enclosing string. The offending token is recorded on the finding.
   *  Overload 3: file-level / explicit (caller supplies the whole Finding, line/column 0 for a
   *    file-level hit, or a stale-registry arm naming the dead entry). */
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

  // ---- the REASON, written ONCE (owner ruling 2) -----------------------------
  /** The rule this gate enforces: WHAT is wrong + WHY we enforce it (pointer-bearing, per
   *  diagnostic-legibility). The reporter prints this ONCE as the group header, then lists every
   *  occurrence beneath it — a Finding never repeats this prose. */
  readonly message: string;
  /** HOW to correct it / WHERE the themed vocabulary lives (§9.2). Printed once under the group header. */
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
  /** TRUE when this gate's hooks read the real filesystem (readdirSync/existsSync/readFileSync) rather
   *  than only the ts-morph Project — so the conformance runner MATERIALIZES its examples into a real
   *  auto-cleaned temp dir (loaded as a real-fs Project rooted there) instead of an in-memory Project
   *  (which has no disk for those fs calls to see). TSMORPH-SINGLE-PASS-AUDIT.md §1.6. */
  readonly fsBacked?: boolean;

  // ---- lifecycle around the single walk ---------------------------------------
  readonly begin?: (ctx: GateRunCtx) => void; // reset accumulators
  readonly finalize?: (ctx: GateRunCtx) => void; // judge accumulated state (ratchet stale arms live here)

  // ---- SELF-PROOF (required — the loader refuses an un-proven gate) ------------
  /** ≥1 example the gate MUST flag — the standing "it bites" divergence proof. */
  readonly mustFlag: readonly GateExample[];
  /** ≥1 example the gate must NOT flag — the false-positive guard. */
  readonly mustPass: readonly GateExample[];
}
