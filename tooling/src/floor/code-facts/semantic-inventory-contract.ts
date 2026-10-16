import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { FileSystemHost, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { z } from "zod";
import type { CompilerProgram, CompilerSourceOverlay } from "../compiler/compiler-programs-contract.ts";
import type { SourceCorpus } from "../compiler/ts-workspace-contract.ts";
import { typeRelationSchema } from "./assignability-contract.ts";
import type { SourceBindingUsage } from "./binding-usage-contract.ts";
import type { DrizzleCallEvidence, DrizzleEvidenceMode } from "./drizzle-evidence-contract.ts";
import { DRIZZLE_EVIDENCE_MODES } from "./drizzle-evidence-contract.ts";
import type { InventoryDrizzleQuery, InventorySchemaDependency } from "./drizzle-inventory-contract.ts";
import { drizzleInventorySchemas } from "./drizzle-inventory-contract.ts";
import type {
  CallableBinding,
  CallableDeclaration,
  CallableInvocationFact,
  GlobalMemberOrigin,
  ModuleMemberOrigin,
  ReferenceFact,
} from "./reference-fact-contract.ts";
import { REFERENCE_UNRESOLVED_REASONS } from "./reference-fact-contract.ts";
import type { SchemaIdentityModel } from "./schema-identity-contract.ts";
import type { SchemaFact } from "./schema-model-contract.ts";
import type { NativeCallMemberOrigin } from "./type-member-origin-contract.ts";

export const INVENTORY_FORMAT = 15;
export const INVENTORY_FAMILIES = [
  "exports",
  "export-declarations",
  "modules",
  "bindings",
  "references",
  "witnesses",
  "cast-relations",
  "id-brands",
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
export const callableDeclarationSchema = z.object({
  node: spanSchema,
  trace: z.object({ origin: spanSchema, declarations: z.array(spanSchema) }),
  result: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("resolved"), declaration: spanSchema, body: spanSchema.nullable() }),
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
export const INVOCATION_VALUE_FACETS = ["module", "global", "binding", "undefined", "namespace", "string", "stable"] as const;
export const invocationPlanSchema = z.object({
  mode: z.enum(["invocation", "value"]),
  facets: z.array(z.enum(INVOCATION_VALUE_FACETS)),
  arguments: z.array(z.object({ index: z.union([z.literal(0), z.literal(1)]), facets: z.array(z.enum(INVOCATION_VALUE_FACETS)) })),
});
export type InventoryInvocationPlan = z.infer<typeof invocationPlanSchema>;
export const invocationQuerySchema = invocationPlanSchema.extend({ node: spanSchema });
export type InventoryInvocationQuery = z.infer<typeof invocationQuerySchema>;
export interface InventoryNativeInvocationQuery {
  readonly program: string;
  readonly query: InventoryInvocationQuery;
}

export function invocationQueryKey(query: InventoryInvocationQuery): string {
  const parsed = invocationQuerySchema.parse(query);
  if (new Set(parsed.arguments.map((argument) => argument.index)).size !== parsed.arguments.length) {
    throw new SemanticInventoryError("native invocation argument projection is ambiguous");
  }
  return JSON.stringify({
    ...parsed,
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
const invocationKindSchema = z.enum(["call", "construct", "bind"]);
export const drizzleSchemas = drizzleInventorySchemas(spanSchema, inventoryReferenceSchema, invocationKindSchema);

export function drizzleQueryKey(query: InventoryDrizzleQuery): string {
  return JSON.stringify({ node: spanSchema.parse(query.node), mode: z.enum(DRIZZLE_EVIDENCE_MODES).parse(query.mode) });
}
const moduleValueSchema = z.object({
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
export const invocationEvidenceSchema = z.object({
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
      canonicalValue: z.object({ declaration: spanSchema, fact: nodeFactSchema }).optional(),
    }),
  ),
  sources: z.array(z.object({ file: z.string(), bindings: z.number().int().nonnegative(), computed: z.array(spanSchema) })),
});
export type InventoryInvocationEvidence = z.infer<typeof invocationEvidenceSchema>;
export interface NativeInvocationEvidence {
  readonly invocation: CallableInvocationFact | undefined;
  readonly modules: ReadonlyMap<Node, ReferenceFact<ModuleMemberOrigin>>;
  readonly globals: ReadonlyMap<Node, ReferenceFact<GlobalMemberOrigin>>;
  readonly callableBindings: ReadonlyMap<Node, ReferenceFact<CallableBinding>>;
  readonly undefinedMembers: ReadonlyMap<Node, boolean>;
  readonly namespaces: ReadonlyMap<Node, readonly Node[]>;
  readonly strings: ReadonlyMap<Node, ReferenceFact<string>>;
  readonly stableValues: ReadonlyMap<Node, ReferenceFact<Node>>;
  readonly canonicalValues: ReadonlyMap<Node, ReferenceFact<Node>>;
  readonly declarations: (node: Node) => readonly Node[];
  readonly computedName: (node: Node) => ReferenceFact<string>;
}
export interface CapturedInvocationEvidence extends NativeInvocationEvidence {
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
  const profiles = new Map(entry.profiles.map((profile) => [inventoryNodeQueryKey(profile.node), profile]));
  if (profiles.size !== entry.profiles.length) {
    throw new SemanticInventoryError("native invocation profile identity is ambiguous");
  }
  const requireFacets = (node: InventorySpan, facets: InventoryInvocationPlan["facets"]): void => {
    if (facets.length === 0) {
      return;
    }
    const profile = profiles.get(inventoryNodeQueryKey(node));
    if (profile === undefined || facets.some((facet) => profile[facet] === undefined)) {
      throw new SemanticInventoryError("native invocation facet coverage is incomplete");
    }
  };
  assertInvocationProjection(entry, requireFacets);
  for (const profile of entry.profiles) {
    if (profile.binding?.kind === "resolved") {
      requireFacets(profile.binding.value.callee, ["module"]);
    }
    assertCanonicalVariableProfile(profile);
  }
}
function assertInvocationProjection(
  entry: InventoryInvocationEvidence,
  requireFacets: (node: InventorySpan, facets: InventoryInvocationPlan["facets"]) => void,
): void {
  const plan = entry.query;
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

/** Closed demand compares physical spans, never a replay node's compiler meaning. */
export function inventoryNodeQueryKey(node: InventorySpan): string {
  return JSON.stringify(spanSchema.parse(node));
}
export const castRelationResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resolved"), value: typeRelationSchema }),
  z.object({ kind: z.literal("unavailable"), reason: z.literal("primitive-absent") }),
]);
export type InventoryCastRelationResult = z.infer<typeof castRelationResultSchema>;
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
  copy: z.array(z.object({ name: z.string(), type: z.string() })).nullable(),
  respell: z.array(z.object({ name: z.string(), type: z.string() })).nullable(),
  direct: z.array(z.string()),
  queries: z.array(z.string()),
});
export type InventoryShape = z.infer<typeof shapeCatalogSchema>;
export const partitionSchema = z.object({
  intent: z.enum(["facts", "membership"]),
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
  drizzleCalls: z.array(drizzleSchemas.call).optional(),
  brands: z.array(z.object({ node: spanSchema, brand: z.string().nullable() })),
  casts: z.array(z.object({ node: spanSchema, result: castRelationResultSchema })),
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
  sources: z.array(
    z.object({ file: z.string(), path: z.string(), text: z.string(), authored: z.boolean(), consumerClass: z.enum(INVENTORY_CONSUMER_CLASSES) }),
  ),
  exports: z.array(z.object({ file: z.string(), name: z.string(), declarations: z.array(spanSchema) })),
  modules: z.array(
    z.object({ node: spanSchema, target: z.string().nullable(), declarations: z.array(spanSchema), dynamic: z.boolean(), specifier: z.string().nullable() }),
  ),
  bindings: z.array(z.object({ node: spanSchema, symbols: symbolSchema })),
  references: z.array(z.object({ declaration: spanSchema, reference: spanSchema, consumerClass: z.enum(INVENTORY_CONSUMER_CLASSES) })),
  witnesses: z.array(z.object({ node: spanSchema, name: z.string(), declarations: z.array(spanSchema) })),
});

export const partitionMetadataSchema = partitionSchema.omit({
  globalOrigins: true,
  globalBindings: true,
  invocationEvidence: true,
  schemaIdentity: true,
  drizzleCalls: true,
  computedNames: true,
  callableDeclarations: true,
  memberOrigins: true,
  declarationOutputs: true,
  shapes: true,
  pairs: true,
  runtimeExports: true,
  exportDeclarations: true,
  casts: true,
  brands: true,
  inputs: true,
  sources: true,
  exports: true,
  modules: true,
  bindings: true,
  references: true,
  witnesses: true,
});
export const storedPartitionSchema = partitionMetadataSchema.extend({ id: z.string() });
export type StoredInventoryPartition = z.infer<typeof storedPartitionSchema>;
export const INVENTORY_LISTS = ["configPaths", "projectReferences", "roots", "nativeRoots", "available"] as const;
export const INVENTORY_FAMILY_FIELDS = {
  exports: "exports",
  "export-declarations": "exportDeclarations",
  modules: "modules",
  bindings: "bindings",
  references: "references",
  witnesses: "witnesses",
  "cast-relations": "casts",
  "id-brands": "brands",
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
} as const satisfies Readonly<Record<InventoryFamily, keyof InventoryPartition>>;
export const INVENTORY_FACTS = ["exports", "modules", "bindings", "witnesses"] as const;
export type InventoryFactKind = (typeof INVENTORY_FACTS)[number];
export const INVENTORY_RECORD_TABLES = [
  "descriptor",
  "family",
  "list",
  "input",
  "source",
  "text",
  "span",
  "fact",
  "declaration",
  "reference",
  "cast",
  "brand",
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
  readonly root: string;
  readonly files: readonly { readonly path: string; readonly text: string }[];
  readonly deleted: readonly string[];
}

export interface InventoryBuildRequest {
  readonly schemaSources?: readonly InventorySpan[];
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

export interface SemanticInventoryOptions {
  readonly schemaQuery?: { readonly program: string; readonly sources: readonly InventorySpan[] };
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
  readonly fileSystem?: FileSystemHost;
  readonly buildPartition?: (request: InventoryBuildRequest) => void;
}

export type InventorySourceCorpus = SourceCorpus & Disposable;

/** One immutable complete generation; dispose transaction inventories when their transaction ends. */
export interface SemanticInventory extends Disposable {
  readonly schemaIdentity: (sources: readonly SourceFile[], program: string) => SchemaFact<SchemaIdentityModel>;
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
  readonly castRelation: (node: Node, program: string) => InventoryCastRelationResult;
  readonly idBrand: (node: Node, program: string) => string | null;
  readonly generation: number;
  readonly programs: readonly string[];
  readonly canonicalPath: (path: string) => string;
  /** Compare captured physical syntax, never typed meaning between compiler worlds. */
  readonly sameNode: (left: Node, right: Node) => boolean;
  readonly bindingUsage: (source: SourceFile) => SourceBindingUsage;
  readonly sourceCorpus: () => InventorySourceCorpus;
  readonly exports: (source: SourceFile, importer?: Node) => ReadonlyMap<string, readonly Node[]>;
  readonly moduleTarget: (node: Node) => SourceFile | undefined;
  readonly symbols: (node: Node) => InventorySymbols;
  readonly references: (node: Node) => readonly Node[];
  readonly witnessOrigins: (node: Node) => readonly Node[];
}

export interface InventoryReaderStorage {
  readonly shapeCohort?: boolean;
  readonly shapeOwners?: ReadonlyMap<SourceFile, string>;
  readonly db: DatabaseSync;
  readonly dispose: () => void;
}
