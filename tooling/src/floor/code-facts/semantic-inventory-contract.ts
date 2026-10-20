import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { FileSystemHost, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { z } from "zod";
import type { CompilerProgram, CompilerSourceOverlay } from "../compiler/compiler-programs-contract.ts";
import type { SourceCorpus } from "../compiler/ts-workspace-contract.ts";
import type { NativeAuthoredValueProjection } from "./authored-value-projection.ts";
import type { SourceBindingUsage } from "./binding-usage-contract.ts";
import type { IndexedCallParameters } from "./drizzle-column-read-contract.ts";
import type { DrizzleWrite } from "./drizzle-columns.ts";
import type { DrizzleCallEvidence, DrizzleEvidenceMode } from "./drizzle-evidence-contract.ts";
import { DRIZZLE_EVIDENCE_MODES } from "./drizzle-evidence-contract.ts";
import type { InventoryDrizzleQuery, InventorySchemaDependency } from "./drizzle-inventory-contract.ts";
import { drizzleInventorySchemas } from "./drizzle-inventory-contract.ts";
import type { DrizzleValueSourceEvidence } from "./drizzle-query-contract.ts";
import type { NativeDrizzleSqlFacts } from "./drizzle-sql-facts-contract.ts";
import { assertDrizzleSqlCoverage, drizzleSqlFactsSchema } from "./drizzle-sql-facts-contract.ts";
import type { NativeOrdinaryObservations } from "./ordinary-observations-contract.ts";
import type { InventoryOrdinaryObservations } from "./ordinary-observations-inventory.ts";
import { ordinaryObservationDemandSchema, ordinaryObservationsSchema } from "./ordinary-observations-inventory.ts";
import { authoredProjectionSchema, typeProjectionSchema } from "./projection-inventory-contract.ts";
import type {
  CallableBinding,
  CallableDeclaration,
  CallableInvocationFact,
  GlobalMemberOrigin,
  ModuleMemberOrigin,
  ReferenceFact,
} from "./reference-fact-contract.ts";
import { REFERENCE_UNRESOLVED_REASONS } from "./reference-fact-contract.ts";
import { schemaConfigurationSchema } from "./schema-configuration-inventory-contract.ts";
import type { SchemaIdentityModel } from "./schema-identity-contract.ts";
import type { SchemaFact } from "./schema-model-contract.ts";
import type { SchemaDataProjection, SchemaProjectedModel } from "./schema-projection-contract.ts";
import { schemaProjectionInventorySchema } from "./schema-projection-inventory-contract.ts";
import type { InventoryRuntime } from "./semantic-inventory-runtime-contract.ts";
import { inventoryImplementationSchema } from "./semantic-inventory-runtime-contract.ts";
import type { NativeCallMemberOrigin } from "./type-member-origin-contract.ts";
import type { NativeTypeObservations } from "./type-observations-contract.ts";
import { assertTypeObservationCoverage } from "./type-observations-coverage.ts";
import { typeObservationDemandSchema, typeObservationsSchema } from "./type-observations-inventory.ts";
import type { NativeTypeProjection } from "./type-projection-contract.ts";
import { assertTypeProjectionCoverage, canonicalTypeProjectionPlan, typeProjectionPlanSchema } from "./type-projection-contract.ts";
import { columnRowObservationSchema, storedValueObservationSchema } from "./value-observation-codec.ts";
import type { NativeColumnRowObservation, ProjectedStoredValueShape } from "./value-observation-contract.ts";
import { VALUE_OBSERVATION_FACETS } from "./value-observation-contract.ts";

export const INVENTORY_FORMAT = 25;
export const INVENTORY_FAMILIES = [
  "exports",
  "export-declarations",
  "modules",
  "bindings",
  "references",
  "witnesses",
  "runtime-exports",
  "shape-catalog",
  "shape-pairs",
  "declaration-outputs",
  "type-member-origins",
  "callable-declarations",
  "computed-names",
  "global-origins",
  "invocation-evidence",
  "drizzle-identities",
  "schema-data",
] as const;
export type InventoryFamily = (typeof INVENTORY_FAMILIES)[number];
export const DEFAULT_INVENTORY_FAMILIES = ["exports", "modules", "bindings", "references", "witnesses"] as const;
const familySchema = z
  .array(z.enum(INVENTORY_FAMILIES))
  .refine((values) => new Set(values).size === values.length, "duplicate inventory family")
  .readonly();

/** Normalize a closed demand before worker acquisition; omitted demand preserves the existing inventory. */
export function inventoryFamilies(families: unknown): readonly InventoryFamily[] {
  const parsed = familySchema.parse(families ?? DEFAULT_INVENTORY_FAMILIES);
  if (parsed.length === 0) {
    throw new Error("empty native fact demand requires explicit membership intent");
  }
  return parsed.toSorted();
}
export const INVENTORY_KEY_SEPARATOR = "\0";
export const INVENTORY_CONSUMER_CLASSES = ["product", "tooling", "test"] as const;
export type InventoryConsumerClass = (typeof INVENTORY_CONSUMER_CLASSES)[number];

/** A failed extraction, changed snapshot or ambiguous native interpretation supplies no current verdict. */
export class SemanticInventoryError extends Error {}
export const spanSchema = z.object({ file: z.string(), start: z.number().int(), end: z.number().int(), kind: z.number().int() });
export const INVENTORY_INPUT_KINDS = ["file", "directory", "exists", "authored"] as const;
export const inputSchema = z.object({ path: z.string(), kind: z.enum(INVENTORY_INPUT_KINDS), version: z.string() });
export const symbolSchema = z.object({ lexical: z.array(spanSchema), origins: z.array(spanSchema) });
export const memberOriginSchema = z.object({
  node: spanSchema,
  name: z.string().nullable(),
  leaf: spanSchema.nullable(),
  trace: z.object({ origin: spanSchema, declarations: z.array(spanSchema) }),
  result: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("resolved"), declarations: z.array(spanSchema).min(1) }),
    z.object({ kind: z.literal("unresolved"), reason: z.enum(REFERENCE_UNRESOLVED_REASONS), detail: z.string(), node: spanSchema }),
  ]),
});
export type InventoryMemberOrigin = z.infer<typeof memberOriginSchema>;
export const callableDeclarationValueSchema = z.object({ declaration: spanSchema, body: spanSchema.nullable() });
export type InventoryCallableDeclarationValue = z.infer<typeof callableDeclarationValueSchema>;
export const callableDeclarationSchema = z.object({
  node: spanSchema,
  trace: z.object({ origin: spanSchema, declarations: z.array(spanSchema) }),
  result: z.discriminatedUnion("kind", [
    callableDeclarationValueSchema.extend({ kind: z.literal("resolved") }),
    z.object({ kind: z.literal("unresolved"), reason: z.enum(REFERENCE_UNRESOLVED_REASONS), detail: z.string(), node: spanSchema }),
  ]),
});
export const computedNameSchema = z.object({
  node: spanSchema,
  trace: z.object({ origin: spanSchema, declarations: z.array(spanSchema) }),
  result: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("resolved"), value: z.string() }),
    z.object({ kind: z.literal("unresolved"), reason: z.enum(REFERENCE_UNRESOLVED_REASONS), detail: z.string(), node: spanSchema }),
  ]),
});
export const globalOriginSchema = z.object({
  node: spanSchema,
  trace: z.object({ origin: spanSchema, declarations: z.array(spanSchema) }),
  result: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("resolved"), globalName: z.string(), memberPath: z.array(z.string()), declarations: z.array(spanSchema) }),
    z.object({ kind: z.literal("unresolved"), reason: z.enum(REFERENCE_UNRESOLVED_REASONS), detail: z.string(), node: spanSchema }),
  ]),
});
export const INVOCATION_VALUE_FACETS = [
  "module",
  "global",
  "binding",
  "undefined",
  "namespace",
  "string",
  "reference-writes",
  "authored-composite",
  "stable",
  "type-projection",
  "drizzle-value-sources",
  "authored-value",
  ...VALUE_OBSERVATION_FACETS,
] as const;
export const invocationPlanSchema = z
  .object({
    mode: z.enum(["invocation", "value", "observations", "types"]),
    facets: z.array(z.enum(INVOCATION_VALUE_FACETS)),
    arguments: z.array(z.object({ index: z.union([z.literal(0), z.literal(1)]), facets: z.array(z.enum(INVOCATION_VALUE_FACETS)) })),
    typeProjection: typeProjectionPlanSchema.optional(),
    observations: ordinaryObservationDemandSchema(spanSchema).optional(),
    typeObservations: typeObservationDemandSchema(spanSchema).optional(),
  })
  .refine(
    (plan) =>
      ([...plan.facets, ...plan.arguments.flatMap((argument) => argument.facets)].includes("type-projection") ||
        plan.typeObservations?.questions?.some((question) => question.valueFacets?.includes("type-projection") === true) === true) ===
      (plan.typeProjection !== undefined),
    "native invocation type projection must name exactly its closed demand",
  )
  .refine(
    (plan) =>
      (plan.mode === "observations") === (plan.observations !== undefined) &&
      (plan.mode !== "observations" || (plan.facets.length === 0 && plan.arguments.length === 0 && plan.typeProjection === undefined)),
    "native ordinary observation mode must name exactly its closed cohort",
  )
  .refine(
    (plan) =>
      (plan.mode === "types") === (plan.typeObservations !== undefined) && (plan.mode !== "types" || (plan.facets.length === 0 && plan.arguments.length === 0)),
    "native type observation mode must name exactly its closed profile",
  );
export type InventoryInvocationPlan = z.infer<typeof invocationPlanSchema>;
export const invocationQuerySchema = invocationPlanSchema.safeExtend({ node: spanSchema });
export type InventoryInvocationQuery = z.infer<typeof invocationQuerySchema>;
export interface InventoryNativeInvocationQuery {
  readonly program: string;
  readonly query: InventoryInvocationQuery;
}

/** Value-source table identities borrow the one explicit complete native schema catalog. */
export function invocationNeedsValueSourceCatalog(plan: InventoryInvocationPlan): boolean {
  return (
    plan.facets.includes("drizzle-value-sources") ||
    plan.arguments.some((argument) => argument.facets.includes("drizzle-value-sources")) ||
    plan.typeObservations?.questions?.some((question) => question.valueFacets?.includes("drizzle-value-sources") === true) === true
  );
}

export function invocationQueryKey(query: InventoryInvocationQuery): string {
  const parsed = invocationQuerySchema.parse(query);
  if (new Set(parsed.arguments.map((argument) => argument.index)).size !== parsed.arguments.length) {
    throw new SemanticInventoryError("native invocation argument projection is ambiguous");
  }
  return JSON.stringify({
    ...parsed,
    ...(parsed.typeProjection === undefined ? {} : { typeProjection: canonicalTypeProjectionPlan(parsed.typeProjection) }),
    facets: [...new Set(parsed.facets)].sort(),
    arguments: parsed.arguments
      .map((argument) => ({ ...argument, facets: [...new Set(argument.facets)].sort() }))
      .sort((left, right) => left.index - right.index),
  });
}
const invocationTraceSchema = z.object({ origin: spanSchema, declarations: z.array(spanSchema) });
const invocationRefusalSchema = z.object({
  kind: z.literal("unresolved"),
  reason: z.enum(REFERENCE_UNRESOLVED_REASONS),
  detail: z.string(),
  node: spanSchema,
  trace: invocationTraceSchema,
  capture: z.literal("native-bind").optional(),
});
export type InventoryInvocationTrace = z.infer<typeof invocationTraceSchema>;
export type InventoryInvocationRefusal = z.infer<typeof invocationRefusalSchema>;
export type InventoryInvocationReference<T> =
  | { readonly kind: "resolved"; readonly value: T; readonly trace: InventoryInvocationTrace }
  | InventoryInvocationRefusal;

export function inventoryReferenceSchema<Value>(value: z.ZodType<Value>): z.ZodType<InventoryInvocationReference<Value>> {
  return z.union([invocationRefusalSchema, z.object({ kind: z.literal("resolved"), value, trace: invocationTraceSchema })]);
}
export const typeProjectionWireSchema = typeProjectionSchema(spanSchema, inventoryReferenceSchema);
export const authoredValueProjectionSchema = authoredProjectionSchema(spanSchema, inventoryReferenceSchema);
const invocationKindSchema = z.enum(["call", "construct", "bind"]);
export const drizzleSchemas = drizzleInventorySchemas(spanSchema, inventoryReferenceSchema, invocationKindSchema);

export function drizzleQueryKey(query: InventoryDrizzleQuery): string {
  return JSON.stringify({ node: spanSchema.parse(query.node), mode: z.enum(DRIZZLE_EVIDENCE_MODES).parse(query.mode) });
}
export const moduleValueSchema = z.object({
  kind: z.literal("module"),
  moduleSpecifier: z.string(),
  exportedName: z.string(),
  memberPath: z.array(z.string()),
  declaration: spanSchema,
  canonical: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("project"), sourceFile: spanSchema, exportedName: z.string(), declaration: spanSchema }),
    z.object({ kind: z.literal("external-door"), moduleSpecifier: z.string(), exportedName: z.string(), declaration: spanSchema }),
  ]),
});
export const schemaConfigurationWireSchema = schemaConfigurationSchema(spanSchema, inventoryReferenceSchema, authoredValueProjectionSchema, moduleValueSchema);
export const schemaDataCatalogSchema = schemaProjectionInventorySchema(spanSchema, drizzleSchemas.catalog, schemaConfigurationWireSchema);
const originValueSchema = z.discriminatedUnion("kind", [
  moduleValueSchema,
  z.object({ kind: z.literal("global"), globalName: z.string(), memberPath: z.array(z.string()), declarations: z.array(spanSchema) }),
]);
const argumentFactSchema = z.union([
  invocationRefusalSchema,
  z.object({ kind: z.literal("resolved"), value: z.array(spanSchema), trace: invocationTraceSchema }),
]);
const callableBindingValueSchema = z.object({
  target: originValueSchema,
  callee: spanSchema,
  arguments: argumentFactSchema,
  invocation: z.literal("bind").optional(),
});
const callableInvocationFactSchema = z.union([
  invocationRefusalSchema,
  z.object({
    kind: z.literal("resolved"),
    value: callableBindingValueSchema.omit({ invocation: true }).extend({ invocation: invocationKindSchema }),
    trace: invocationTraceSchema,
  }),
]);
const callableBindingFactSchema = z.union([
  invocationRefusalSchema,
  z.object({ kind: z.literal("resolved"), value: callableBindingValueSchema, trace: invocationTraceSchema }),
]);
const moduleFactSchema = z.union([invocationRefusalSchema, z.object({ kind: z.literal("resolved"), value: moduleValueSchema, trace: invocationTraceSchema })]);
const nodeFactSchema = z.union([invocationRefusalSchema, z.object({ kind: z.literal("resolved"), value: spanSchema, trace: invocationTraceSchema })]);
const stringFactSchema = z.union([invocationRefusalSchema, z.object({ kind: z.literal("resolved"), value: z.string(), trace: invocationTraceSchema })]);
export const ordinaryObservationWireSchema = ordinaryObservationsSchema(
  spanSchema,
  inventoryReferenceSchema,
  originValueSchema,
  callableDeclarationValueSchema,
);
export const typeObservationWireSchema = typeObservationsSchema(spanSchema);
export const invocationEvidenceSchema = z.object({
  typeObservations: typeObservationWireSchema.optional(),
  drizzleSql: drizzleSqlFactsSchema(spanSchema, invocationRefusalSchema, inventoryReferenceSchema).optional(),
  observations: ordinaryObservationWireSchema.optional(),
  drizzleSourcesBasis: z.strictObject({ program: z.string(), partition: z.string() }).nullable().optional(),
  observationBasis: z.strictObject({ program: z.string(), partition: z.string() }).nullable().optional(),
  query: invocationQuerySchema,
  callee: spanSchema.nullable(),
  invocation: callableInvocationFactSchema.nullable(),
  profiles: z.array(
    z.object({
      node: spanSchema,
      module: moduleFactSchema.optional(),
      global: z.literal(true).optional(),
      binding: callableBindingFactSchema.optional(),
      undefined: z.boolean().optional(),
      namespace: z.array(spanSchema).optional(),
      string: stringFactSchema.optional(),
      stable: nodeFactSchema.optional(),
      "reference-writes": inventoryReferenceSchema(z.literal(true)).optional(),
      "authored-composite": nodeFactSchema.optional(),
      "type-projection": typeProjectionWireSchema.optional(),
      "drizzle-value-sources": drizzleSchemas.valueSources.optional(),
      "authored-value": authoredValueProjectionSchema.optional(),
      "stored-value": storedValueObservationSchema(spanSchema).optional(),
      "row-column": columnRowObservationSchema(spanSchema).optional(),
      "drizzle-write": inventoryReferenceSchema(z.strictObject({ method: z.string(), target: spanSchema, arg: spanSchema.nullable() }).nullable()).optional(),
      "indexed-parameters": z
        .array(
          z.strictObject({
            receiverIndex: z.number().int().nonnegative(),
            keyIndex: z.number().int().nonnegative(),
            node: spanSchema.refine((node) => node.kind === SyntaxKind.ElementAccessExpression),
          }),
        )
        .optional(),
      canonicalValue: z.object({ declaration: spanSchema, fact: nodeFactSchema }).optional(),
    }),
  ),
  sources: z.array(z.object({ file: z.string(), bindings: z.number().int().nonnegative(), computed: z.array(spanSchema) })),
});
export type InventoryInvocationEvidence = z.infer<typeof invocationEvidenceSchema>;
export interface NativeInvocationEvidence {
  readonly typeObservations?: NativeTypeObservations;
  readonly drizzleSql?: NativeDrizzleSqlFacts | undefined;
  readonly observations?: NativeOrdinaryObservations;
  readonly invocation: CallableInvocationFact | undefined;
  readonly modules: ReadonlyMap<Node, ReferenceFact<ModuleMemberOrigin>>;
  readonly globals: ReadonlyMap<Node, ReferenceFact<GlobalMemberOrigin>>;
  readonly callableBindings: ReadonlyMap<Node, ReferenceFact<CallableBinding>>;
  readonly undefinedMembers: ReadonlyMap<Node, boolean>;
  readonly namespaces: ReadonlyMap<Node, readonly Node[]>;
  readonly strings: ReadonlyMap<Node, ReferenceFact<string>>;
  readonly referenceWrites?: ReadonlyMap<Node, ReferenceFact<true>>;
  readonly authoredComposites?: ReadonlyMap<Node, ReferenceFact<Node>>;
  readonly stableValues: ReadonlyMap<Node, ReferenceFact<Node>>;
  readonly canonicalValues: ReadonlyMap<Node, ReferenceFact<Node>>;
  readonly typeProjections: ReadonlyMap<Node, NativeTypeProjection>;
  readonly drizzleValueSources?: ReadonlyMap<Node, DrizzleValueSourceEvidence> | undefined;
  readonly authoredValues: ReadonlyMap<Node, NativeAuthoredValueProjection>;
  readonly storedValues: ReadonlyMap<Node, ProjectedStoredValueShape>;
  readonly columnRows: ReadonlyMap<Node, NativeColumnRowObservation>;
  readonly drizzleWrites: ReadonlyMap<Node, ReferenceFact<DrizzleWrite | null>>;
  readonly indexedParameters: ReadonlyMap<Node, readonly IndexedCallParameters[]>;
  readonly declarations: (node: Node) => readonly Node[];
  readonly computedName: (node: Node) => ReferenceFact<string>;
}
export interface CapturedInvocationEvidence extends NativeInvocationEvidence {
  readonly captureSource?: (node: Node) => void;
  readonly drizzleSourcesBasis?: import("./drizzle-inventory-contract.ts").InventorySchemaBasis | null;
  readonly observationBasis?: import("./drizzle-inventory-contract.ts").InventorySchemaBasis | null;
  readonly sources: readonly SourceFile[];
}
export const invocationAtomSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  parent: z.number().int().nonnegative().nullable(),
  key: z.string(),
  kind: z.enum(["object", "array", "string", "number", "boolean", "null"]),
  text: z.string().nullable(),
  number: z.number().nullable(),
  size: z.number().int().nonnegative(),
});
export type InventoryInvocationAtom = z.infer<typeof invocationAtomSchema>;

/** Coverage is derived from the captured argument fact and requested facets, never family presence alone. */
export function assertInvocationEvidence(entry: InventoryInvocationEvidence): void {
  if (invocationNeedsValueSourceCatalog(entry.query) !== (entry.drizzleSourcesBasis !== undefined)) {
    throw new SemanticInventoryError("native value-source schema basis is missing or unrequested");
  }
  const profiles = new Map(entry.profiles.map((profile) => [inventoryNodeQueryKey(profile.node), profile]));
  if (profiles.size !== entry.profiles.length) {
    throw new SemanticInventoryError("native invocation profile identity is ambiguous");
  }
  const demanded = new Map<string, Set<string>>();
  const requireFacets = (node: InventorySpan, facets: InventoryInvocationPlan["facets"]): void => {
    if (facets.length === 0) {
      return;
    }
    const key = inventoryNodeQueryKey(node);
    const allowed = demanded.get(key) ?? new Set<string>();
    for (const facet of facets) {
      allowed.add(facet);
    }
    demanded.set(key, allowed);
    const profile = profiles.get(key);
    if (profile === undefined || facets.some((facet) => profile[facet] === undefined)) {
      throw new SemanticInventoryError("native invocation facet coverage is incomplete");
    }
  };
  assertInvocationProjection(entry, requireFacets);
  assertInvocationSqlEvidence(entry);
  for (const profile of entry.profiles) {
    assertValueObservationDemand(profile, demanded);
    const projection = profile["type-projection"];
    if (projection !== undefined) {
      if (
        entry.query.typeProjection === undefined ||
        JSON.stringify(canonicalTypeProjectionPlan(projection.plan)) !== JSON.stringify(canonicalTypeProjectionPlan(entry.query.typeProjection))
      ) {
        throw new SemanticInventoryError("native type projection demand coverage is foreign");
      }
      assertTypeProjectionCoverage(projection.values, entry.query.typeProjection);
      if (projection.values.origins !== undefined && inventoryNodeQueryKey(projection.values.origins.root) !== inventoryNodeQueryKey(profile.node)) {
        throw new SemanticInventoryError("native type origin root is foreign to its requested profile");
      }
    }
    if (profile.binding?.kind === "resolved") {
      requireFacets(profile.binding.value.callee, ["module"]);
    }
    assertCanonicalVariableProfile(profile);
  }
}
function assertInvocationSqlEvidence(entry: InventoryInvocationEvidence): void {
  const questions = entry.query.typeObservations?.questions?.filter((question) => question.kind === "drizzle-predicate-inputs") ?? [];
  assertDrizzleSqlCoverage(
    entry.drizzleSql,
    questions.length === 0 ? undefined : questions.flatMap((question) => question.nodes),
    entry.typeObservations?.predicateInputs?.flatMap((row) => row.predicates) ?? [],
    inventoryNodeQueryKey,
  );
}
function assertTypeValueProfiles(
  entry: InventoryInvocationEvidence,
  facts: NonNullable<InventoryInvocationEvidence["typeObservations"]>,
  requireFacets: (node: InventorySpan, facets: InventoryInvocationPlan["facets"]) => void,
): void {
  if (facts.valueProfiles === undefined && (entry.profiles.length > 0 || entry.sources.length > 0)) {
    throw new SemanticInventoryError("unrequested native type value profiles");
  }
  for (const value of facts.valueProfiles ?? []) {
    requireFacets(value.node, [...value.facets]);
  }
  for (const profile of entry.profiles) {
    const allowed = facts.valueProfiles?.find((value) => inventoryNodeQueryKey(value.node) === inventoryNodeQueryKey(profile.node));
    for (const facet of INVOCATION_VALUE_FACETS) {
      if (
        profile[facet] !== undefined &&
        allowed?.facets.some((value) => value === facet) !== true &&
        !(
          facet === "module" &&
          entry.profiles.some(
            (other) => other.binding?.kind === "resolved" && inventoryNodeQueryKey(other.binding.value.callee) === inventoryNodeQueryKey(profile.node),
          )
        )
      ) {
        throw new SemanticInventoryError("unrequested native type value facet");
      }
    }
  }
}
function assertInvocationProjection(
  entry: InventoryInvocationEvidence,
  requireFacets: (node: InventorySpan, facets: InventoryInvocationPlan["facets"]) => void,
): void {
  const plan = entry.query;
  if (plan.mode === "types") {
    const facts = entry.typeObservations;
    if (
      facts === undefined ||
      entry.invocation !== null ||
      entry.callee !== null ||
      entry.observations !== undefined ||
      entry.observationBasis !== undefined ||
      JSON.stringify(facts.demand) !== JSON.stringify(plan.typeObservations) ||
      inventoryNodeQueryKey(facts.anchor) !== inventoryNodeQueryKey(plan.node)
    ) {
      throw new SemanticInventoryError("native type observation profile is missing or foreign");
    }
    assertTypeObservationCoverage(facts, inventoryNodeQueryKey, (node) => node.kind);
    assertTypeValueProfiles(entry, facts, requireFacets);
    return;
  }
  if (entry.typeObservations !== undefined) {
    throw new SemanticInventoryError("unrequested native type observations");
  }
  if (plan.mode === "observations") {
    const graph = ordinaryInvocationGraph(entry);
    assertOrdinaryReturnedQueries(graph);
    assertOrdinaryGraphMembership(graph);
    assertOrdinaryProfiles(entry, graph, requireFacets);
    return;
  }
  if (entry.observations !== undefined || entry.observationBasis !== undefined) {
    throw new SemanticInventoryError("unrequested native ordinary observations");
  }
  if (plan.mode === "value") {
    if (entry.invocation !== null || entry.callee !== null || plan.arguments.length > 0) {
      throw new SemanticInventoryError("native value demand carries invocation meaning");
    }
    requireFacets(plan.node, plan.facets);
    return;
  }
  const invocation = entry.invocation;
  if (invocation === null || entry.callee === null) {
    throw new SemanticInventoryError("native invocation capture is missing");
  }
  requireFacets(entry.callee, plan.facets);
  if (invocation.kind !== "resolved") {
    return;
  }
  requireFacets(invocation.value.callee, plan.facets);
  assertInvocationArguments(invocation.value.arguments, plan, requireFacets);
}
function assertInvocationArguments(
  arguments_: InventoryInvocationReference<InventorySpan[]>,
  plan: InventoryInvocationPlan,
  requireFacets: (node: InventorySpan, facets: InventoryInvocationPlan["facets"]) => void,
): void {
  if (arguments_.kind !== "resolved") {
    return;
  }
  for (const projection of plan.arguments) {
    const argument = arguments_.value[projection.index];
    if (argument !== undefined) {
      requireFacets(argument, projection.facets);
    }
  }
}
function assertCanonicalVariableProfile(profile: InventoryInvocationEvidence["profiles"][number]): void {
  const module = profile.module;
  if (profile.stable === undefined || module?.kind !== "resolved" || module.value.canonical.kind !== "project") {
    return;
  }
  const declaration = module.value.canonical.declaration;
  if (
    declaration.kind === SyntaxKind.VariableDeclaration &&
    (profile.canonicalValue === undefined || inventoryNodeQueryKey(profile.canonicalValue.declaration) !== inventoryNodeQueryKey(declaration))
  ) {
    throw new SemanticInventoryError("native canonical variable value is missing or foreign");
  }
}

export interface InventoryNativeQuery {
  readonly program: string;
  readonly node: InventorySpan;
}
export const moduleTargetQuerySchema = z.strictObject({
  importer: spanSchema.refine((node) => node.kind === SyntaxKind.SourceFile),
  node: spanSchema.refine((node) => node.kind === SyntaxKind.ImportDeclaration || node.kind === SyntaxKind.ExportDeclaration),
});
export type InventoryModuleTargetQuery = z.infer<typeof moduleTargetQuerySchema>;
export interface InventoryNativeModuleTargetQuery {
  readonly program: string;
  readonly query: InventoryModuleTargetQuery;
}
/** Importer admission remains distinct from a related module's physical source. */
export function moduleTargetQueryKey(query: InventoryModuleTargetQuery): string {
  return JSON.stringify(moduleTargetQuerySchema.parse(query));
}

/** Closed demand compares physical spans, never a replay node's compiler meaning. */
export function inventoryNodeQueryKey(node: InventorySpan): string {
  return JSON.stringify(spanSchema.parse(node));
}
export const exportDeclarationQuerySchema = z.object({ file: z.string(), name: z.string() });
export type InventoryExportDeclarationQuery = z.infer<typeof exportDeclarationQuerySchema>;
export interface InventoryNativeExportDeclarationQuery {
  readonly program: string;
  readonly query: InventoryExportDeclarationQuery;
}
export const exportDeclarationsSchema = z.object({ query: exportDeclarationQuerySchema, declarations: z.array(spanSchema).nullable() });
export type InventoryExportDeclarations = z.infer<typeof exportDeclarationsSchema>;

/** Exact source/name identity distinguishes a captured absence from an unrequested export. */
export function exportDeclarationQueryKey(query: InventoryExportDeclarationQuery): string {
  return JSON.stringify(exportDeclarationQuerySchema.parse(query));
}
export const runtimeExportSchema = z.object({
  file: z.string(),
  name: z.string(),
  declaration: spanSchema,
  callable: z.boolean(),
  initializer: z.object({ kind: z.number().int(), callable: z.boolean() }).nullable(),
});
export type InventoryRuntimeExport = z.infer<typeof runtimeExportSchema>;
const RELATION_VALUE_COUNT = 4;
export const SHAPE_PAIR_PROJECTIONS = ["mutual", "relation"] as const;
export const shapePairQuerySchema = z.object({
  left: spanSchema,
  right: spanSchema,
  leftField: z.string().nullable(),
  rightField: z.string().nullable(),
  projection: z.enum(SHAPE_PAIR_PROJECTIONS),
  lenient: z.boolean(),
});
export type InventoryShapeQuery = z.infer<typeof shapePairQuerySchema>;
export interface ShapeQuerySide {
  readonly node: Node;
  readonly field: string | null;
}
/** Stable query identity includes both independent member projections and strictness. */
export function shapePairKey(query: InventoryShapeQuery): string {
  return JSON.stringify(shapePairQuerySchema.parse(query));
}
export const shapePairResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("answer"), values: z.union([z.tuple([z.boolean()]), z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean()])]) }),
  z.object({ kind: z.literal("no-comparable") }),
  z.object({ kind: z.literal("unavailable"), reason: z.enum(["primitive-absent", "node-absent"]) }),
]);
export type InventoryShapePairResult = z.infer<typeof shapePairResultSchema>;
export const shapePairSchema = z
  .object({ query: shapePairQuerySchema, result: shapePairResultSchema })
  .refine(
    ({ query, result }) => result.kind !== "answer" || result.values.length === (query.projection === "mutual" ? 1 : RELATION_VALUE_COUNT),
    "native shape pair answer does not match its projection",
  );
export const shapeCatalogSchema = z.object({
  node: spanSchema,
  copy: z.array(z.string()).nullable(),
  respell: z.array(z.string()).nullable(),
  direct: z.array(z.string()),
  queries: z.array(z.string()),
});
export type InventoryShape = z.infer<typeof shapeCatalogSchema>;
export const referenceQuerySchema = z.object({
  root: spanSchema,
  query: spanSchema,
  references: z.array(z.object({ reference: spanSchema, consumerClass: z.enum(INVENTORY_CONSUMER_CLASSES) })),
});
export type InventoryReferenceQuery = z.infer<typeof referenceQuerySchema>;
export interface InventoryReferencePair {
  readonly root: InventorySpan;
  readonly node: InventorySpan;
}
export interface InventoryNativeReferenceQuery extends InventoryReferencePair {
  readonly program: string;
}

/** Importer and exact queried syntax jointly own a language-service request. */
export function referenceQueryKey(pair: InventoryReferencePair): string {
  return JSON.stringify([inventoryNodeQueryKey(pair.root), inventoryNodeQueryKey(pair.node)]);
}
export const INVENTORY_REFERENCE_MODES = ["complete", "closed"] as const;
export type InventoryReferenceMode = (typeof INVENTORY_REFERENCE_MODES)[number];
export interface InventoryReferenceDemand<Query> {
  readonly mode: InventoryReferenceMode;
  readonly queries: readonly Query[];
}

export const partitionSchema = z.object({
  intent: z.enum(["facts", "membership"]),
  referenceMode: z.enum(INVENTORY_REFERENCE_MODES).optional(),
  referenceQueries: z.array(referenceQuerySchema).optional(),
  families: familySchema,
  available: z.array(z.string()),
  shapes: z.array(shapeCatalogSchema),
  pairs: z.array(shapePairSchema),
  runtimeExports: z.array(runtimeExportSchema),
  exportDeclarations: z.array(exportDeclarationsSchema).optional(),
  declarationOutputs: z.array(z.object({ node: spanSchema, unknown: z.boolean().nullable() })),
  memberOrigins: z.array(memberOriginSchema),
  callableDeclarations: z.array(callableDeclarationSchema),
  computedNames: z.array(computedNameSchema),
  globalOrigins: z.array(globalOriginSchema),
  globalBindings: z.array(spanSchema),
  invocationEvidence: z.array(invocationEvidenceSchema),
  schemaIdentity: drizzleSchemas.catalog.optional(),
  schemaData: schemaDataCatalogSchema.optional(),
  drizzleCalls: z.array(drizzleSchemas.call).optional(),
  format: z.literal(INVENTORY_FORMAT),
  program: z.string(),
  descriptorVersion: z.string(),
  compilerOptionsJson: z.string(),
  configPaths: z.array(z.string()),
  projectReferences: z.array(z.string()),
  workerPid: z.number().int().optional(),
  roots: z.array(z.string()),
  nativeRoots: z.array(z.string()),
  inputs: z.array(inputSchema),
  implementation: inventoryImplementationSchema.optional(),
  sources: z.array(
    z.object({ file: z.string(), path: z.string(), text: z.string(), authored: z.boolean(), consumerClass: z.enum(INVENTORY_CONSUMER_CLASSES) }),
  ),
  exports: z.array(z.object({ file: z.string(), name: z.string(), declarations: z.array(spanSchema) })),
  modules: z.array(
    z.object({ node: spanSchema, target: z.string().nullable(), declarations: z.array(spanSchema), dynamic: z.boolean(), specifier: z.string().nullable() }),
  ),
  bindings: z.array(z.object({ node: spanSchema, symbols: symbolSchema })),
  references: z.array(z.object({ declaration: spanSchema, reference: spanSchema, consumerClass: z.enum(INVENTORY_CONSUMER_CLASSES) })),
  /** Extractor-recorded name spans whose reference rows repeat their declaration's rows; storage keeps one copy. */
  referenceNames: z.array(z.object({ name: spanSchema, declaration: spanSchema })).optional(),
  witnesses: z.array(z.object({ node: spanSchema, name: z.string(), declarations: z.array(spanSchema) })),
});

export const partitionMetadataSchema = partitionSchema.omit({
  referenceQueries: true,
  globalOrigins: true,
  globalBindings: true,
  invocationEvidence: true,
  schemaIdentity: true,
  schemaData: true,
  drizzleCalls: true,
  computedNames: true,
  callableDeclarations: true,
  memberOrigins: true,
  declarationOutputs: true,
  shapes: true,
  pairs: true,
  runtimeExports: true,
  exportDeclarations: true,
  inputs: true,
  implementation: true,
  sources: true,
  exports: true,
  modules: true,
  bindings: true,
  references: true,
  referenceNames: true,
  witnesses: true,
});
export const storedPartitionSchema = partitionMetadataSchema.extend({ id: z.string(), referenceMode: z.enum(INVENTORY_REFERENCE_MODES) });
export type StoredInventoryPartition = z.infer<typeof storedPartitionSchema>;
/** The native file set a partition proves for its program, whatever its intent. */
export type InventoryMembership = Pick<StoredInventoryPartition, "program" | "roots" | "available">;
export const INVENTORY_LISTS = ["configPaths", "projectReferences", "roots", "nativeRoots", "available"] as const;
export const INVENTORY_FAMILY_FIELDS = {
  exports: "exports",
  "export-declarations": "exportDeclarations",
  modules: "modules",
  bindings: "bindings",
  references: "references",
  witnesses: "witnesses",
  "runtime-exports": "runtimeExports",
  "shape-catalog": "shapes",
  "shape-pairs": "pairs",
  "declaration-outputs": "declarationOutputs",
  "type-member-origins": "memberOrigins",
  "callable-declarations": "callableDeclarations",
  "computed-names": "computedNames",
  "global-origins": "globalOrigins",
  "invocation-evidence": "invocationEvidence",
  "drizzle-identities": "drizzleCalls",
  "schema-data": "schemaData",
} as const satisfies Readonly<Record<InventoryFamily, keyof InventoryPartition>>;
export const INVENTORY_FACTS = ["exports", "modules", "bindings", "witnesses"] as const;
export type InventoryFactKind = (typeof INVENTORY_FACTS)[number];
export const INVENTORY_RECORD_TABLES = [
  "descriptor",
  "family",
  "list",
  "input",
  "runtimeHeader",
  "runtimeSource",
  "runtimeResolution",
  "source",
  "text",
  "span",
  "fact",
  "declaration",
  "reference",
  "referenceName",
  "referenceQuery",
  "referenceQueryNode",
  "runtimeExport",
  "exportDeclaration",
  "exportDeclarationNode",
  "shape",
  "shapeField",
  "shapeOrigin",
  "pair",
  "declarationOutput",
  "memberOrigin",
  "memberDeclaration",
  "callableDeclaration",
  "callableTrace",
  "computedName",
  "computedTrace",
  "globalOrigin",
  "globalDeclaration",
  "globalMember",
  "globalBinding",
  "invocationEvidence",
  "invocationAtom",
  "invocationSource",
  "drizzleEvidence",
  "drizzleAtom",
] as const;
export type InventoryRecordTable = (typeof INVENTORY_RECORD_TABLES)[number];
export interface InventoryRecord {
  readonly table: InventoryRecordTable;
  readonly values: readonly SQLInputValue[];
}
export const storedSourceSchema = partitionSchema.shape.sources.element
  .omit({ text: true })
  .extend({ ordinal: z.number().int(), textVersion: z.string(), textLength: z.number().int(), textParts: z.number().int() });
export type StoredInventorySource = z.infer<typeof storedSourceSchema>;

export type InventorySpan = z.infer<typeof spanSchema>;
export type InventoryInput = z.infer<typeof inputSchema>;
export interface InventoryInputContext {
  readonly authored: ReadonlySet<string>;
  readonly fileSystem?: FileSystemHost | undefined;
}
export type InventoryPartition = z.infer<typeof partitionSchema>;
export type InventorySymbols = z.infer<typeof symbolSchema>;

export interface InventoryOverlay {
  /** Projected byte availability never grants authored membership. */
  readonly authoredAddedPaths: readonly string[];
  readonly root: string;
  readonly files: readonly { readonly path: string; readonly text: string }[];
  readonly deleted: readonly string[];
}

export type InventoryFileProjection = Pick<InventoryOverlay, "root" | "files" | "deleted">;

export interface InventoryBuildRequest {
  readonly referenceDemand?: InventoryReferenceDemand<InventoryReferencePair>;
  readonly moduleTargetQueries?: readonly InventoryModuleTargetQuery[];
  readonly schemaSources?: readonly InventorySpan[];
  readonly schemaDataSources?: readonly InventorySpan[];
  readonly schemaDataProjection?: SchemaDataProjection;
  readonly schemaDependency?: InventorySchemaDependency;
  readonly drizzleQueries?: readonly InventoryDrizzleQuery[];
  readonly exportQueries?: readonly InventoryExportDeclarationQuery[];
  readonly invocationQueries?: readonly InventoryInvocationQuery[];
  readonly globalOriginQueries?: readonly InventorySpan[];
  readonly globalBindingQueries?: readonly InventorySpan[];
  readonly computedNameQueries?: readonly InventorySpan[];
  readonly callableQueries?: readonly InventorySpan[];
  readonly intent?: "facts" | "membership";
  readonly shapeQueries?: readonly InventoryShapeQuery[];
  readonly families?: readonly InventoryFamily[];
  readonly root: string;
  readonly descriptor: CompilerProgram;
  readonly destination: string;
  readonly overlay?: InventoryOverlay;
}

export interface InventoryWorkerRequest extends InventoryBuildRequest {
  readonly controllerImplementation: InventoryRuntime;
}

/** Canonical authored files whose answers a verb reports; acquisition keeps every world that can change them. */
export interface InventoryScope {
  readonly files: readonly string[];
}

export interface SemanticInventoryOptions {
  readonly scope?: InventoryScope;
  readonly referenceDemand?: InventoryReferenceDemand<InventoryNativeReferenceQuery>;
  readonly moduleTargetQueries?: readonly InventoryNativeModuleTargetQuery[];
  readonly schemaQuery?: { readonly program: string; readonly sources: readonly InventorySpan[] };
  readonly schemaDataQuery?: { readonly program: string; readonly sources: readonly InventorySpan[]; readonly projection?: SchemaDataProjection };
  readonly drizzleQueries?: readonly { readonly program: string; readonly query: InventoryDrizzleQuery }[];
  readonly exportQueries?: readonly InventoryNativeExportDeclarationQuery[];
  readonly invocationQueries?: readonly InventoryNativeInvocationQuery[];
  readonly globalOriginQueries?: readonly InventoryNativeQuery[];
  readonly globalBindingQueries?: readonly InventoryNativeQuery[];
  readonly callableQueries?: readonly InventoryNativeQuery[];
  readonly computedNameQueries?: readonly InventoryNativeQuery[];
  readonly shapePlan?: {
    readonly sources: readonly SourceFile[];
    /** Existing native source contexts, when discovery is not the primary authored-root interpretation. */
    readonly owners?: ReadonlyMap<SourceFile, CompilerProgram>;
    readonly prepare: (catalog: SemanticInventory) => readonly InventoryShapeQuery[];
  };
  readonly families?: readonly InventoryFamily[];
  readonly root: string;
  readonly programs?: readonly CompilerProgram[];
  readonly databasePath?: string;
  readonly overlay?: CompilerSourceOverlay;
  /** Known transaction byte overrides are independent of authored additions. */
  readonly projectedPaths?: readonly string[];
  readonly fileSystem?: FileSystemHost;
  readonly buildPartition?: (request: InventoryBuildRequest) => void;
}

export type InventorySourceCorpus = SourceCorpus & Disposable;

/** One immutable complete generation; dispose transaction inventories when their transaction ends. */
export interface SemanticInventory extends Disposable {
  readonly schemaIdentity: (sources: readonly SourceFile[], program: string) => SchemaFact<SchemaIdentityModel>;
  readonly schemaData: (sources: readonly SourceFile[], program: string, projection?: SchemaDataProjection) => SchemaFact<SchemaProjectedModel>;
  readonly drizzleEvidence: (node: Node, program: string, mode: DrizzleEvidenceMode) => DrizzleCallEvidence;
  readonly exportDeclarations: (source: SourceFile, program: string, name: string) => readonly Node[] | null;
  readonly invocationEvidence: (node: Node, program: string, plan: InventoryInvocationPlan) => NativeInvocationEvidence;
  readonly globalOrigin: (node: Node, program: string) => ReferenceFact<GlobalMemberOrigin>;
  readonly globalBinding: (node: Node, program: string) => readonly Node[];
  readonly computedName: (node: Node, program: string) => ReferenceFact<string>;
  readonly callableDeclaration: (node: Node, program: string) => ReferenceFact<CallableDeclaration>;
  readonly callMemberOrigin: (node: Node, program: string) => NativeCallMemberOrigin;
  readonly declarationOutput: (node: Node, program: string) => boolean | null;
  readonly assertShapeSource: (source: SourceFile) => void;
  readonly shape: (node: Node) => InventoryShape;
  readonly shapePair: (query: InventoryShapeQuery) => readonly { readonly program: string; readonly result: InventoryShapePairResult }[];
  readonly runtimeExports: (node: SourceFile, program: string) => readonly InventoryRuntimeExport[];
  readonly generation: number;
  readonly programs: readonly string[];
  readonly canonicalPath: (path: string) => string;
  /** Compare captured physical syntax, never typed meaning between compiler worlds. */
  readonly sameNode: (left: Node, right: Node) => boolean;
  readonly bindingUsage: (source: SourceFile) => SourceBindingUsage;
  readonly sourceCorpus: () => InventorySourceCorpus;
  readonly exports: (source: SourceFile, importer?: Node) => ReadonlyMap<string, readonly Node[]>;
  readonly moduleTarget: (node: Node, program?: string, importer?: SourceFile) => SourceFile | undefined;
  readonly symbols: (node: Node) => InventorySymbols;
  readonly references: (node: Node, program?: string, importer?: SourceFile) => readonly Node[];
  readonly witnessOrigins: (node: Node) => readonly Node[];
}

export interface InventoryReaderSourceMetadata {
  readonly texts: Map<string, { readonly partition: string; readonly source: StoredInventorySource }>;
  readonly aliases: Map<string, string>;
  readonly authored: Set<string>;
}

/** Acquired only by transitioning an owned connection to its selected-generation read snapshot. */
export interface InventoryReadLease extends Disposable {
  readonly assertOpen: () => void;
  readonly partitions: readonly StoredInventoryPartition[];
  readonly invocationEvidence: (id: string, query: InventoryInvocationQuery) => Iterable<InventoryInvocationEvidence>;
  readonly bindings: (id: string, file: string) => readonly InventoryPartition["bindings"][number][];
}

export interface InventoryReaderStorage {
  readonly assertImplementation?: () => void;
  readonly moduleTargetQueries?: readonly InventoryNativeModuleTargetQuery[];
  readonly shapeCohort?: boolean;
  readonly shapeOwners?: ReadonlyMap<SourceFile, string>;
  readonly db: DatabaseSync;
  readonly dispose: () => void;
}

function assertValueObservationDemand(profile: InventoryInvocationEvidence["profiles"][number], demanded: ReadonlyMap<string, ReadonlySet<string>>): void {
  for (const facet of VALUE_OBSERVATION_FACETS) {
    if (profile[facet] !== undefined && demanded.get(inventoryNodeQueryKey(profile.node))?.has(facet) !== true) {
      throw new SemanticInventoryError("native value observation exceeds its closed facet demand");
    }
  }
}

function ordinaryInvocationGraph(entry: InventoryInvocationEvidence): InventoryOrdinaryObservations {
  const graph = entry.observations;
  if (
    graph === undefined ||
    entry.observationBasis === undefined ||
    JSON.stringify(graph.demand) !== JSON.stringify(entry.query.observations) ||
    entry.invocation !== null ||
    entry.callee !== null
  ) {
    throw new SemanticInventoryError("native ordinary observation cohort is missing or foreign");
  }
  if (inventoryNodeQueryKey(graph.anchor) !== inventoryNodeQueryKey(entry.query.node)) {
    throw new SemanticInventoryError("native ordinary source anchor is foreign");
  }
  return graph;
}
function assertOrdinaryReturnedQueries(graph: InventoryOrdinaryObservations): void {
  if (
    graph.returned.length !== graph.demand.reads.length ||
    graph.returned.some((read, index) => {
      const demanded = graph.demand.reads[index];
      return (
        demanded === undefined ||
        inventoryNodeQueryKey(read.node) !== inventoryNodeQueryKey(demanded.node) ||
        JSON.stringify(read.path) !== JSON.stringify(demanded.path)
      );
    })
  ) {
    throw new SemanticInventoryError("native ordinary returned-query coverage is missing or foreign");
  }
}
function assertOrdinaryGraphMembership(graph: InventoryOrdinaryObservations): void {
  for (const roster of [graph.nodes.map((value) => value.node), graph.calls.map((value) => value.call), graph.keys, graph.initialCalls, graph.terminals]) {
    if (new Set(roster.map(inventoryNodeQueryKey)).size !== roster.length) {
      throw new SemanticInventoryError("native ordinary graph membership is ambiguous");
    }
  }
  const calls = new Set(graph.calls.map((value) => inventoryNodeQueryKey(value.call)));
  const initial = new Set(graph.initialCalls.map(inventoryNodeQueryKey));
  if (
    [...graph.closureCalls, ...graph.initialCalls].some((node) => !calls.has(inventoryNodeQueryKey(node))) ||
    graph.demand.roots.some((node) => !initial.has(inventoryNodeQueryKey(node))) ||
    graph.terminals.some((node) => !initial.has(inventoryNodeQueryKey(node)))
  ) {
    throw new SemanticInventoryError("native ordinary root/initial-closure/terminal membership is incomplete");
  }
}
function assertOrdinaryProfiles(
  entry: InventoryInvocationEvidence,
  graph: InventoryOrdinaryObservations,
  requireFacets: (node: InventorySpan, facets: InventoryInvocationPlan["facets"]) => void,
): void {
  if (new Set(graph.profileNodes.map(inventoryNodeQueryKey)).size !== graph.profileNodes.length || graph.profileNodes.length !== entry.profiles.length) {
    throw new SemanticInventoryError("native ordinary lexical profile obligations are missing or foreign");
  }
  for (const node of graph.profileNodes) {
    requireFacets(node, [
      "module",
      "global",
      "string",
      "stable",
      "authored-value",
      ...(node.kind === SyntaxKind.CallExpression ? ["drizzle-write" as const] : []),
    ]);
  }
}
