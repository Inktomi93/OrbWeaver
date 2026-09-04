// Branded evidence identity shared by artifact allocation and run indices. Current writers must decide
// every axis; legacy null triples can only be constructed by a reader normalizing old immutable bytes.
import { z } from "zod";

export const contextIndexSchema = z.number().int().nonnegative().brand<"ContextIndex">();
export type ContextIndex = z.infer<typeof contextIndexSchema>;

export const pageIndexSchema = z.number().int().nonnegative().brand<"PageIndex">();
export type PageIndex = z.infer<typeof pageIndexSchema>;

export const evidenceWindowIdSchema = z.string().min(1).brand<"EvidenceWindowId">();
export type EvidenceWindowId = z.infer<typeof evidenceWindowIdSchema>;

export const artifactRefSchema = z
  .string()
  .min(1)
  .refine((value) => !(value.startsWith("/") || value.startsWith("../") || value.includes("/../") || value.startsWith("./")), {
    message: "artifact ref must be a run-relative path without dot traversal",
  })
  .brand<"ArtifactRef">();
export type ArtifactRef = z.infer<typeof artifactRefSchema>;

export const factBatchIdSchema = z.string().min(1).brand<"FactBatchId">();
export type FactBatchId = z.infer<typeof factBatchIdSchema>;

export const contextScopeDimensionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("exact"), value: contextIndexSchema }),
  z.object({ kind: z.literal("aggregate"), values: z.union([z.literal("all"), z.array(contextIndexSchema)]) }),
  z.object({ kind: z.literal("not-applicable"), reason: z.string().min(1) }),
]);
export const pageScopeDimensionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("exact"), value: pageIndexSchema }),
  z.object({ kind: z.literal("aggregate"), values: z.union([z.literal("all"), z.array(pageIndexSchema)]) }),
  z.object({ kind: z.literal("not-applicable"), reason: z.string().min(1) }),
]);
export const windowScopeDimensionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("exact"), value: evidenceWindowIdSchema }),
  z.object({ kind: z.literal("aggregate"), values: z.union([z.literal("all"), z.array(evidenceWindowIdSchema)]) }),
  z.object({ kind: z.literal("not-applicable"), reason: z.string().min(1) }),
]);

export type InstrumentScopeDimension<T extends ContextIndex | PageIndex | EvidenceWindowId> =
  | { readonly kind: "exact"; readonly value: T }
  | { readonly kind: "aggregate"; readonly values: "all" | T[] }
  | { readonly kind: "not-applicable"; readonly reason: string };

export const instrumentCurrentScopeSchema = z.object({
  kind: z.literal("scope-v1"),
  context: contextScopeDimensionSchema,
  page: pageScopeDimensionSchema,
  window: windowScopeDimensionSchema,
});
export type InstrumentCurrentScope = z.infer<typeof instrumentCurrentScopeSchema>;

export const instrumentLegacyScopeSchema = z.object({
  kind: z.literal("legacy"),
  context: z.number().int().nonnegative().nullable(),
  page: z.number().int().nonnegative().nullable(),
  window: z.string().nullable(),
});
export type InstrumentLegacyScope = z.infer<typeof instrumentLegacyScopeSchema>;

export const instrumentEvidenceScopeSchema = z.discriminatedUnion("kind", [instrumentCurrentScopeSchema, instrumentLegacyScopeSchema]);
export type InstrumentEvidenceScope = z.infer<typeof instrumentEvidenceScopeSchema>;

export function contextIndex(value: number): ContextIndex {
  return contextIndexSchema.parse(value);
}

export function pageIndex(value: number): PageIndex {
  return pageIndexSchema.parse(value);
}

export function evidenceWindowId(value: string | number): EvidenceWindowId {
  return evidenceWindowIdSchema.parse(String(value));
}

export function artifactRef(value: string): ArtifactRef {
  return artifactRefSchema.parse(value);
}

export function factBatchId(value: string): FactBatchId {
  return factBatchIdSchema.parse(value);
}

export function exactDimension<T extends ContextIndex | PageIndex | EvidenceWindowId>(value: T): InstrumentScopeDimension<T> {
  return { kind: "exact", value };
}

export function aggregateDimension<T extends ContextIndex | PageIndex | EvidenceWindowId>(values: "all" | readonly T[] = "all"): InstrumentScopeDimension<T> {
  return { kind: "aggregate", values: values === "all" ? values : [...values] };
}

export function notApplicableDimension<T extends ContextIndex | PageIndex | EvidenceWindowId>(reason: string): InstrumentScopeDimension<T> {
  if (reason === "") {
    throw new Error("scope N/A reason must be non-empty");
  }
  return { kind: "not-applicable", reason };
}

export function scopeV1(input: Omit<InstrumentCurrentScope, "kind">): InstrumentCurrentScope {
  return instrumentCurrentScopeSchema.parse({ kind: "scope-v1", ...input });
}

export function exactScope(context: number, page: number, window: string | number): InstrumentCurrentScope {
  return scopeV1({
    context: exactDimension(contextIndex(context)),
    page: exactDimension(pageIndex(page)),
    window: exactDimension(evidenceWindowId(window)),
  });
}

export function aggregateScope(): InstrumentCurrentScope {
  return scopeV1({ context: aggregateDimension(), page: aggregateDimension(), window: aggregateDimension() });
}

export function notApplicableScope(reason: string): InstrumentCurrentScope {
  return scopeV1({
    context: notApplicableDimension(reason),
    page: notApplicableDimension(reason),
    window: notApplicableDimension(reason),
  });
}

export interface InstrumentScopeQuery {
  readonly context: number | null;
  readonly page: number | null;
  readonly window: string | null;
}

function dimensionMatches<T extends string | number>(
  dimension:
    | { readonly kind: "exact"; readonly value: T }
    | { readonly kind: "aggregate"; readonly values: "all" | readonly T[] }
    | { readonly kind: "not-applicable" },
  value: T | null,
): boolean {
  if (value === null) {
    return true;
  }
  if (dimension.kind === "exact") {
    return dimension.value === value;
  }
  return dimension.kind === "aggregate" && (dimension.values === "all" || dimension.values.includes(value));
}

export function scopeMatches(scope: InstrumentEvidenceScope, query: InstrumentScopeQuery): boolean {
  if (scope.kind === "legacy") {
    return (
      (query.context === null || scope.context === query.context) &&
      (query.page === null || scope.page === query.page) &&
      (query.window === null || scope.window === query.window)
    );
  }
  return dimensionMatches(scope.context, query.context) && dimensionMatches(scope.page, query.page) && dimensionMatches(scope.window, query.window);
}

export function exactScopeIdentity(scope: InstrumentEvidenceScope): {
  readonly context: number | null;
  readonly page: number | null;
  readonly window: string | null;
} {
  if (scope.kind === "legacy") {
    return scope;
  }
  return {
    context: scope.context.kind === "exact" ? scope.context.value : null,
    page: scope.page.kind === "exact" ? scope.page.value : null,
    window: scope.window.kind === "exact" ? scope.window.value : null,
  };
}

function dimensionLabel(dimension: InstrumentCurrentScope["context"] | InstrumentCurrentScope["page"] | InstrumentCurrentScope["window"]): string {
  if (dimension.kind === "exact") {
    return String(dimension.value);
  }
  if (dimension.kind === "not-applicable") {
    return "n/a";
  }
  return dimension.values === "all" ? "all" : `[${dimension.values.join(",")}]`;
}

export function scopeLabel(scope: InstrumentEvidenceScope): string {
  if (scope.kind === "legacy") {
    return `legacy:c${String(scope.context ?? "?")}p${String(scope.page ?? "?")}w${scope.window ?? "?"}`;
  }
  return `c=${dimensionLabel(scope.context)} p=${dimensionLabel(scope.page)} w=${dimensionLabel(scope.window)}`;
}
