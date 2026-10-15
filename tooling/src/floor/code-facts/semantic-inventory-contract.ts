import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { FileSystemHost, Node, SourceFile } from "ts-morph";
import { z } from "zod";
import type { CompilerProgram, CompilerSourceOverlay } from "../compiler/compiler-programs-contract.ts";
import type { SourceCorpus } from "../compiler/ts-workspace-contract.ts";
import { typeRelationSchema } from "./assignability-contract.ts";

export const INVENTORY_FORMAT = 7;
export const INVENTORY_FAMILIES = ["exports", "modules", "bindings", "references", "witnesses", "cast-relations", "id-brands", "runtime-exports"] as const;
export type InventoryFamily = (typeof INVENTORY_FAMILIES)[number];
export const DEFAULT_INVENTORY_FAMILIES = ["exports", "modules", "bindings", "references", "witnesses"] as const;
const familySchema = z
  .array(z.enum(INVENTORY_FAMILIES))
  .min(1)
  .refine((values) => new Set(values).size === values.length, "duplicate inventory family")
  .readonly();

/** Normalize a closed demand before worker acquisition; omitted demand preserves the existing inventory. */
export function inventoryFamilies(families: unknown): readonly InventoryFamily[] {
  return familySchema.parse(families ?? DEFAULT_INVENTORY_FAMILIES).toSorted();
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
export const castRelationResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resolved"), value: typeRelationSchema }),
  z.object({ kind: z.literal("unavailable"), reason: z.literal("primitive-absent") }),
]);
export type InventoryCastRelationResult = z.infer<typeof castRelationResultSchema>;
export const runtimeExportSchema = z.object({
  file: z.string(),
  name: z.string(),
  declaration: spanSchema,
  callable: z.boolean(),
  initializer: z.object({ kind: z.number().int(), callable: z.boolean() }).nullable(),
});
export type InventoryRuntimeExport = z.infer<typeof runtimeExportSchema>;
export const partitionSchema = z.object({
  families: familySchema,
  runtimeExports: z.array(runtimeExportSchema),
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
  runtimeExports: true,
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
export const INVENTORY_LISTS = ["configPaths", "projectReferences", "roots", "nativeRoots"] as const;
export const INVENTORY_FAMILY_FIELDS = {
  exports: "exports",
  modules: "modules",
  bindings: "bindings",
  references: "references",
  witnesses: "witnesses",
  "cast-relations": "casts",
  "id-brands": "brands",
  "runtime-exports": "runtimeExports",
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
  readonly families?: readonly InventoryFamily[];
  readonly root: string;
  readonly descriptor: CompilerProgram;
  readonly destination: string;
  readonly overlay?: InventoryOverlay;
}

export interface SemanticInventoryOptions {
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
  readonly runtimeExports: (node: SourceFile, program: string) => readonly InventoryRuntimeExport[];
  readonly castRelation: (node: Node, program: string) => InventoryCastRelationResult;
  readonly idBrand: (node: Node, program: string) => string | null;
  readonly generation: number;
  readonly programs: readonly string[];
  readonly canonicalPath: (path: string) => string;
  /** Compare captured physical syntax, never typed meaning between compiler worlds. */
  readonly sameNode: (left: Node, right: Node) => boolean;
  readonly sourceCorpus: () => InventorySourceCorpus;
  readonly exports: (source: SourceFile, importer?: Node) => ReadonlyMap<string, readonly Node[]>;
  readonly moduleTarget: (node: Node) => SourceFile | undefined;
  readonly symbols: (node: Node) => InventorySymbols;
  readonly references: (node: Node) => readonly Node[];
  readonly witnessOrigins: (node: Node) => readonly Node[];
}

export interface InventoryReaderStorage {
  readonly db: DatabaseSync;
  readonly dispose: () => void;
}
