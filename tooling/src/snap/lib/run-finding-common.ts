// Shared internal shape for producer-owned evidence readers. Correlation and exit policy do not live here.
import { readFile } from "node:fs/promises";
import type { InstrumentEvidenceScope } from "../../_shared/artifact-scope.ts";
import { exactScopeIdentity, notApplicableScope } from "../../_shared/artifact-scope.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Arm } from "../contract/arm-vocabulary.ts";
import { ARMS } from "../contract/arm-vocabulary.ts";
import type { SnapCompositeFinding, SnapFindingDisposition, SnapFindingEvidenceRef, SnapRunArtifact } from "../contract/run-index.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

export interface FindingDraft extends Omit<SnapCompositeFinding, "confidence" | "next" | "disposition"> {
  readonly correlation: string;
  /** REQUIRED of every producer (#1385 item 4), where the contract keeps it optional for legacy indices —
   *  a draft that does not say whether its evidence voted is exactly the row a reader cannot triage. */
  readonly disposition: SnapFindingDisposition;
}

/** A producer-owned row: the arm that wrote it is the one that votes, so its evidence is by construction
 *  already in that arm's failure count. Named once here rather than respelled at each producer. */
export function countedBy(counter: string): SnapFindingDisposition {
  return { counted: true, reason: counter };
}

interface MalformedFindingOwner {
  readonly arms?: readonly Arm[];
  readonly channel?: string;
  readonly source?: string;
}

function artifactArm(artifact: SnapRunArtifact): Arm | null {
  if (artifact.producerArm !== undefined && artifact.producerArm !== null) {
    return artifact.producerArm;
  }
  return ARMS.find((arm) => arm === artifact.producer) ?? null;
}

export function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : null;
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export function findingCompleteness(artifact: SnapRunArtifact): SnapCompositeFinding["completeness"] {
  return artifact.completeness === "unknown" ? "incomplete" : artifact.completeness;
}

export function findingRef(
  source: string,
  artifact: string,
  scope: InstrumentEvidenceScope = notApplicableScope("run-global finding reference"),
): SnapFindingEvidenceRef {
  return { source, artifact, scope };
}

export function findingLocation(context: number | null, page: number | null, window: string | null): string {
  const parts = [context === null ? null : `c${String(context)}`, page === null ? null : `p${String(page)}`, window === null ? null : `w${window}`].filter(
    (part) => part !== null,
  );
  return parts.length === 0 ? "run" : parts.join("/");
}

export function findingSymptom(value: string): string {
  const network = /net::[A-Z_]+/u.exec(value)?.[0];
  return (network ?? value).trim().toLowerCase().replace(/\s+/gu, " ");
}

export function malformedFinding(artifact: SnapRunArtifact, error: unknown, owner: MalformedFindingOwner = {}): FindingDraft {
  const source = owner.source ?? artifact.producer;
  const arm = artifactArm(artifact);
  return {
    severity: "error",
    arms: owner.arms ?? (arm === null ? [] : [arm]),
    channels: [owner.channel ?? artifact.producer],
    what: "structured evidence is malformed",
    where: artifact.relativePath,
    evidence: [findingRef(source, artifact.path, artifact.scope)],
    completeness: "incomplete",
    conflicts: [error instanceof Error ? error.message : String(error)],
    occurrences: 1,
    // The artifact would not parse, so whether the producer's own count included this evidence is exactly
    // what could not be read — claiming either polarity here would be a guess printed as a fact.
    disposition: { counted: false, reason: "unreadable-evidence" },
    correlation: `malformed:${artifact.relativePath}`,
  };
}

export function findingIdentity(ref: SnapFindingEvidenceRef): ReturnType<typeof exactScopeIdentity> {
  return exactScopeIdentity(ref.scope);
}
