// Pure validation of immutable run-index artifact rows and every cross-record artifact reference.
import { dirname, isAbsolute, resolve } from "node:path";
import { instrumentArtifactCompletenessSchema, instrumentArtifactRoleSchema } from "../../_shared/artifact-out.ts";
import { artifactRefSchema, instrumentCurrentScopeSchema, instrumentEvidenceScopeSchema } from "../../_shared/artifact-scope.ts";
import { ARMS } from "../contract/arm-vocabulary.ts";
import type { SnapRunArtifact, SnapRunIndex } from "../contract/run-index.ts";

export function assertArtifactRow(value: SnapRunArtifact, indexPath: string): void {
  if (
    typeof value.path !== "string" ||
    !isAbsolute(value.path) ||
    !artifactRefSchema.safeParse(value.relativePath).success ||
    typeof value.bytes !== "number" ||
    typeof value.producer !== "string" ||
    !instrumentArtifactRoleSchema.safeParse(value.role).success ||
    !instrumentArtifactCompletenessSchema.safeParse(value.completeness).success ||
    !instrumentEvidenceScopeSchema.safeParse(value.scope).success ||
    !(value.completenessDetail === undefined || typeof value.completenessDetail === "string")
  ) {
    throw new Error(`${indexPath} contains a malformed artifact inventory row`);
  }
  if (resolve(dirname(indexPath), value.relativePath) !== resolve(value.path)) {
    throw new Error(`${indexPath} contains an artifact path outside its immutable run slot`);
  }
  if (value.declaration === "declared") {
    const valid =
      instrumentCurrentScopeSchema.safeParse(value.scope).success &&
      (value.publishedPath === null || (typeof value.publishedPath === "string" && isAbsolute(value.publishedPath))) &&
      (value.producerArm === null || ARMS.some((arm) => arm === value.producerArm)) &&
      typeof value.channel === "string" &&
      typeof value.mediaType === "string" &&
      (value.records === null || Number.isInteger(value.records)) &&
      Array.isArray(value.limits) &&
      value.limits.every(
        (receipt) =>
          typeof receipt.source === "string" &&
          typeof receipt.complete === "boolean" &&
          Array.isArray(receipt.events) &&
          receipt.events.every(
            (event) =>
              typeof event.kind === "string" &&
              typeof event.path === "string" &&
              (event.original === null || typeof event.original === "number") &&
              (event.retained === null || typeof event.retained === "number") &&
              (event.omitted === null || typeof event.omitted === "number"),
          ),
      );
    if (!valid) {
      throw new Error(`${indexPath} contains an incomplete declared artifact row`);
    }
  }
}

export function assertArtifactReferences(index: SnapRunIndex, path: string): void {
  const inventory = new Set(index.artifacts.map((artifact) => artifact.path));
  const references = [
    ...index.verdict.arms.flatMap((arm) => arm.artifacts),
    ...index.diagnostics.recordArtifacts,
    ...(index.diagnostics.rawChannels ?? []).map((channel) => channel.artifact),
    ...(index.diagnostics.artifact === null ? [] : [index.diagnostics.artifact]),
    ...(index.findings ?? []).flatMap((finding) => finding.evidence.map((evidence) => evidence.artifact).filter((artifact) => artifact !== path)),
  ];
  const missing = references.find((artifact) => !inventory.has(artifact));
  if (missing !== undefined) {
    throw new Error(`${path} references un-inventoried artifact ${missing}`);
  }
  const relativeInventory = new Set(index.artifacts.map((artifact) => artifact.relativePath));
  const missingFactRef = index.results?.batches
    .flatMap((batch) => [...batch.core, ...batch.arms])
    .flatMap((fact) => fact.artifacts)
    .find((ref) => !relativeInventory.has(ref));
  if (missingFactRef !== undefined) {
    throw new Error(`${path} fact references un-inventoried artifact ${missingFactRef}`);
  }
}
