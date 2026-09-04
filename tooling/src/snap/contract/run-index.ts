import type { InstrumentArtifactCompleteness, InstrumentArtifactLimitReceipt, InstrumentArtifactRole } from "../../_shared/artifact-out.ts";
import type { ArtifactRef, EvidenceWindowId, InstrumentEvidenceScope } from "../../_shared/artifact-scope.ts";
import type { DiagnosticLevel, OrbConsoleCompleteness } from "../../_shared/browser-diagnostics.ts";
import type { Arm } from "./arm-vocabulary.ts";
import type { SnapArmState, SnapRunResults } from "./run-facts.ts";
import type { SessionBinding } from "./session.ts";

// Snap's immutable run-bundle contract. The browser writer and browser-free readers share this one
// versioned shape; published `latest` symlinks are conveniences, never the identity of a run.
export interface SnapRunArtifact {
  readonly path: string;
  readonly relativePath: ArtifactRef;
  /** Current writers always emit these allocation-owned fields; optional only for early immutable v1. */
  readonly publishedPath?: string | null;
  readonly bytes: number;
  readonly producer: string;
  readonly producerArm?: Arm | null;
  readonly channel?: string;
  readonly mediaType?: string;
  readonly schema: string | null;
  /** Primary machine evidence versus a human-only raw forensics fallback. */
  readonly role: InstrumentArtifactRole;
  /** File population truth; bounded means the artifact carries an explicit measured-limit receipt. */
  readonly completeness: InstrumentArtifactCompleteness;
  /** Optional only for immutable v1 indices written before producer classification landed. */
  readonly completenessDetail?: string;
  readonly scope: InstrumentEvidenceScope;
  readonly records?: number | null;
  readonly limits?: readonly InstrumentArtifactLimitReceipt[];
  readonly declaration?: "declared" | "legacy";
}

interface SnapCheckoutLocation {
  readonly name: string;
  readonly path: string;
  readonly rootRelativePath: string;
}

interface SnapCheckoutIdentity {
  readonly primary: SnapCheckoutLocation;
  readonly subject: SnapCheckoutLocation & { readonly kind: "primary" | "linked" | "unknown" };
}

export interface SnapStageProvenance {
  readonly mode: "live" | "isolated" | "session";
  readonly state: "bound" | "not-applicable" | "unavailable";
  readonly ownerCheckout: string | null;
  readonly band: number | null;
  readonly ref: string | null;
  readonly binding: SessionBinding | null;
  readonly failure: string | null;
}

export interface SnapRunArmVerdict {
  readonly arm: Arm;
  /** The authoritative mechanism that produced this fact. */
  readonly source: string;
  /** The exact browser/run interval over which that source was live. */
  readonly lifetime: string;
  readonly state: SnapArmState;
  readonly artifacts: readonly string[];
  readonly detail: string | null;
}

export interface SnapRunDiagnosticCompleteness {
  readonly source: "orb-console-ring";
  readonly channel: "browser-diagnostics";
  readonly state: "complete" | "incomplete" | "absent";
  readonly artifact: string | null;
  readonly reads: readonly OrbConsoleCompleteness[];
  readonly totals: {
    readonly reads: number;
    readonly records: number;
    readonly dropped: number;
    readonly complete: boolean;
  } | null;
  readonly recordArtifacts: readonly string[];
  readonly records: {
    readonly total: number;
    readonly levels: Readonly<Partial<Record<DiagnosticLevel, number>>>;
    readonly sources: Readonly<Record<string, number>>;
    readonly categories: Readonly<Record<string, number>>;
    readonly limitEvents: number;
    readonly complete: boolean;
  };
  /** Current-writer normalized populations. Optional only for early immutable v1 indices. */
  readonly counts?: readonly {
    readonly channel: string;
    readonly source: string;
    readonly category: string | null;
    readonly level: DiagnosticLevel;
    readonly context: number;
    readonly page: number;
    readonly window: EvidenceWindowId;
    readonly records: number;
  }[];
  readonly rawChannels?: readonly {
    readonly channel: string;
    readonly artifact: string;
    readonly scope: InstrumentEvidenceScope;
    readonly records: number | null;
    readonly limitEvents: number;
    readonly complete: boolean;
  }[];
}

export interface SnapFindingEvidenceRef {
  readonly source: string;
  readonly artifact: string;
  readonly scope: InstrumentEvidenceScope;
}

/** A display-only correlation over producer-owned evidence. It never contributes an exit vote. */
export interface SnapCompositeFinding {
  readonly severity: "error" | "warning" | "annotation";
  readonly arms: readonly Arm[];
  readonly channels: readonly string[];
  readonly what: string;
  readonly where: string;
  readonly evidence: readonly SnapFindingEvidenceRef[];
  readonly confidence: "direct" | "correlated";
  readonly completeness: "complete" | "bounded" | "incomplete";
  readonly conflicts: readonly string[];
  readonly occurrences: number;
  readonly next: string;
}

export interface SnapRunIndex {
  readonly v: 1;
  readonly identity: {
    readonly runId: string;
    readonly checkout: string;
    readonly root: string;
    /** Current writers always emit these; optional only for early immutable v1 indices. */
    readonly indexPath?: string;
    readonly slotPath?: string;
    readonly checkouts?: SnapCheckoutIdentity;
    readonly sha: string;
    readonly ref: string;
    readonly dirty: { readonly state: "clean" | "dirty" | "unknown"; readonly digest: string | null };
    /** Optional only for immutable v1 indices written before field-level Git failure evidence landed. */
    readonly gitFailures?: readonly { readonly field: string; readonly detail: string }[];
  };
  readonly process: {
    readonly host: string;
    readonly pid: number;
    readonly argv: readonly string[];
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly lane: string | null;
    readonly agent: string | null;
  };
  readonly provenance: {
    readonly session: string | null;
    /** Optional only so browser-free readers remain compatible with immutable v1 indices written before
     *  typed session provenance landed. Current writers always emit all three fields. */
    readonly sessionCall?: number | null;
    readonly evidenceWindow?: number | null;
    readonly sessionBinding?: SessionBinding | null;
    /** String members are early immutable-v1 compatibility; current writers emit the typed receipt. */
    readonly stage: SnapStageProvenance | SnapStageProvenance["mode"];
    readonly concurrency: readonly string[];
  };
  readonly verdict: {
    readonly exit: number;
    readonly state: "passed" | "failed" | "refused";
    readonly arms: readonly SnapRunArmVerdict[];
  };
  /** Exact byte-stable terminal transcript only. Structured readers and arm verdicts use `results`. */
  readonly resultPairs: readonly (readonly [string, string])[];
  /** Absent only on immutable legacy-v1 indices. Current writers always emit typed results. */
  readonly results?: SnapRunResults;
  readonly diagnostics: SnapRunDiagnosticCompleteness;
  readonly artifacts: readonly SnapRunArtifact[];
  /** Optional only for immutable v1 indices written before the composite receipt landed. */
  readonly findings?: readonly SnapCompositeFinding[];
}

/** A run whose SLOT IS GONE, as the run list prints it.
 *
 *  SEAM (2026-09-04, lanes p-snap-printers ↔ p-snap-receipts): the retention ledger and its reader
 *  (`prunedRuns(root, instrument)` over `reports/runs/<instrument>/.pruned.jsonl`) are the RECEIPTS lane's
 *  and land in `tooling/src/_shared/artifacts.ts`. This declares only the shape this module's PRINTER
 *  consumes, so the two halves could be built in parallel; it is structurally identical to that reader's
 *  `PrunedRun` on purpose. Folded in 2026-09-04: this is now a re-export of the reader's own
 *  `PrunedRun` — one home, one shape. */
export type { PrunedRun as SnapPrunedRun } from "../../_shared/run-retention.ts";

/** `--reports`' own filters (#1345). The list is a NAVIGATION surface — ten slots have to map back to the
 *  ten commands that made them — so it takes a window (`--last`) and a lane, and nothing else: any
 *  narrower question is a `--report` on one run. */
export interface SnapRunListQuery {
  /** How many newest rows to print. Null = the display cap. */
  readonly last: number | null;
  readonly lane: string | null;
}

export interface SnapReportQuery {
  readonly target: string;
  readonly mode: "all" | "problems";
  readonly level: "error" | "warning" | "info" | "verbose" | null;
  readonly arm: string | null;
  readonly channel: string | null;
  readonly source: string | null;
  readonly category: string | null;
  readonly text: string | null;
  readonly page: number | null;
  readonly context: number | null;
  readonly window: string | null;
}
