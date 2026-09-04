// Read-time compatibility for v1 indices written before exact/aggregate/not-applicable scope carriers.
import { instrumentLegacyScopeSchema } from "../../_shared/artifact-scope.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function normalizeLegacyScopeCarrier(value: unknown): unknown {
  if (!isRecord(value) || value["scope"] !== undefined) {
    return value;
  }
  return {
    ...value,
    ...(value["declaration"] === "declared" ? { declaration: "legacy" } : {}),
    scope: instrumentLegacyScopeSchema.parse({
      kind: "legacy",
      context: value["context"] ?? null,
      page: value["page"] ?? null,
      window: value["window"] ?? null,
    }),
  };
}

export function normalizeLegacyIndex(value: unknown): unknown {
  if (!isRecord(value) || value["v"] !== 1) {
    return value;
  }
  const artifacts = Array.isArray(value["artifacts"]) ? value["artifacts"].map(normalizeLegacyScopeCarrier) : value["artifacts"];
  const diagnostics = isRecord(value["diagnostics"])
    ? {
        ...value["diagnostics"],
        rawChannels: Array.isArray(value["diagnostics"]["rawChannels"])
          ? value["diagnostics"]["rawChannels"].map(normalizeLegacyScopeCarrier)
          : value["diagnostics"]["rawChannels"],
      }
    : value["diagnostics"];
  const findings = Array.isArray(value["findings"])
    ? value["findings"].map((finding) =>
        isRecord(finding) && Array.isArray(finding["evidence"]) ? { ...finding, evidence: finding["evidence"].map(normalizeLegacyScopeCarrier) } : finding,
      )
    : value["findings"];
  return { ...value, artifacts, diagnostics, findings };
}
