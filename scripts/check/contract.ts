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

/** ONE exemption row — the shared shape for every allowlist / sanctioned-home / deferred-debt table a gate
 *  carries. `why` is MANDATORY and TYPE-enforced: an exemption that cannot say why it exists is a rubber
 *  stamp, and one that cannot say what would END it is permanent by accident. Write the END CONDITION into
 *  the reason. The full law (and the mandatory STALE arm every table also owes) is
 *  `scripts/check/GATE-AUTHORING.md` §"The exemption grammar".
 *
 *  Widen it per gate by intersection, never by re-declaring a parallel shape:
 *  `Record<string, ExemptionRow & { readonly owners: readonly string[] }>` (own-tables-only.ts's
 *  SCHEMA_OWNERS is the archetype). */
export interface ExemptionRow {
  /** Why this exemption is granted AND the condition that would end it. Never empty. */
  readonly why: string;
}

/** A keyed exemption table: the KEY is the thing exempted (a repo-relative path, a domain name, a table
 *  name, a settings key); the VALUE carries the reason. Every table declared with this type owes a stale
 *  arm — a row matching zero live sites must be RED, not silence (GATE-AUTHORING.md §"The exemption
 *  grammar"). Kept as an alias rather than a branded type so a gate can widen the row by intersection. */
export type ExemptionTable<Row extends ExemptionRow = ExemptionRow> = Readonly<Record<string, Row>>;

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
    /** The `Finding.token` a node-anchored report must carry — WHICH arm bit, and (§4.3a) the position an
     *  `@orb-gate-ignore` would have to name. `messageIncludes` cannot answer this for a multi-arm gate:
     *  a token-emitting gate has no per-finding message, so every arm's needle matches the ONE group
     *  message and the row proves nothing about which arm fired. */
    readonly token?: string;
  };
  readonly why?: string; // one-liner: what this example proves (rendered in conformance failures)
};

/** What a gate DECLARES about its own scan, for the counts the harness structurally cannot observe.
 *  Every field is optional and every numeric field ACCUMULATES across calls (`unit` is last-wins), so a
 *  gate may declare once in `finalize` or per batch. Nothing here can shrink the harness's own observed
 *  file counts — a gate can add to the picture, never overwrite it green.
 *
 *  Two live uses (GATE-AUTHORING.md §"Harness mechanics"):
 *  - `admitted` — findings a committed RATCHET BUDGET absolved this run. Declared debt is not "clean";
 *    the reporter prints it as `admitted-by-ratchet: N` beside the ✓ so a green gate still shows the
 *    population it is carrying.
 *  - `unit`/`candidates`/`scanned`/`skipped` — a gate reading units the shared ts-morph walk cannot see
 *    (markdown, CSS, JSON rows). Without this its harness row reports the workspace file count, which is
 *    a denominator it never actually read, and (for a gate whose `scanRoot` admits nothing) its ZERO-SCAN
 *    alarm would be a false positive. */
export interface GateScanDeclaration {
  /** What one declared scan counts, singular ("doc", "stylesheet", "row"). Default `"unit"`. */
  readonly unit?: string;
  /** Units the gate could have read. Defaults to `scanned` when omitted. */
  readonly candidates?: number;
  /** Units the gate actually read. */
  readonly scanned?: number;
  /** Units deliberately not read, by REASON — the gate's own skip vocabulary. */
  readonly skipped?: Readonly<Record<string, number>>;
  /** Findings a committed ratchet baseline absolved this run (declared debt, NOT violations). */
  readonly admitted?: number;
}

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
  /** The SCAN-HEALTH sink (optional to call — the harness records file counts for every gate either way).
   *  Declare only what the harness cannot see: `admitted` ratchet debt, and non-file scan units. */
  readonly scan: (counts: GateScanDeclaration) => void;
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
