// review-mirror evidence is the durable handoff to an adversarial reviewer: the mirror proves what bytes
// were generated, E5/E6 name semantic review targets, and E7 records the exact interactive-control census.

export type ReviewFamily = "E5" | "E6";
export type PendingGuardClassification = "direct-pending" | "derived-pending" | "epoch" | "missing" | "other-guard";

export interface ReviewFocus {
  readonly id: string;
  readonly family: ReviewFamily;
  readonly title: string;
  readonly path: string;
  readonly symbol: string;
  readonly why: string;
}

export interface ResolvedReviewFocus extends ReviewFocus {
  readonly line: number;
}

export interface PendingGuardReceipt {
  readonly path: string;
  readonly line: number;
  readonly component: string;
  readonly control: "Button" | "Switch";
  readonly handler: string;
  readonly mutations: readonly string[];
  readonly disabled: string | null;
  readonly classification: PendingGuardClassification;
}

export interface PendingGuardCensus {
  readonly scannedTsx: number;
  readonly directControls: number;
  /** Controls whose safety cannot be mechanically established: no disabled guard, or an unclassified guard. */
  readonly reviewResiduals: number;
  readonly rows: readonly PendingGuardReceipt[];
  readonly totals: Readonly<Record<PendingGuardClassification, number>>;
}

export interface MirrorSummary {
  readonly target: string;
  readonly tracked: number;
  readonly mirroredFiles: number;
  readonly mirroredCode: number;
  readonly mirroredBytes: number;
  readonly stripped: number;
  readonly copied: number;
  readonly dropped: number;
  readonly errors: readonly string[];
  readonly missingCode: readonly string[];
}

export interface ReviewMirrorEvidence {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly sourceCommit: string;
  readonly mirror: MirrorSummary;
  readonly reviewFocus: readonly ResolvedReviewFocus[];
  readonly pendingGuard: PendingGuardCensus;
}
