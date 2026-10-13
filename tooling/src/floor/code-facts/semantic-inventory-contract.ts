import type { FileSystemHost, Node, SourceFile } from "ts-morph";
import { z } from "zod";
import type { CompilerProgram, CompilerSourceOverlay } from "../compiler/compiler-programs-contract.ts";
import type { SourceCorpus } from "../compiler/ts-workspace-contract.ts";

export const INVENTORY_FORMAT = 1;
export const INVENTORY_KEY_SEPARATOR = "\0";
export const INVENTORY_CONSUMER_CLASSES = ["product", "tooling", "test"] as const;
export type InventoryConsumerClass = (typeof INVENTORY_CONSUMER_CLASSES)[number];

/** A failed extraction, changed snapshot or ambiguous native interpretation supplies no current verdict. */
export class SemanticInventoryError extends Error {}
export const spanSchema = z.object({ file: z.string(), start: z.number().int(), end: z.number().int(), kind: z.number().int() });
export const INVENTORY_INPUT_KINDS = ["file", "directory", "exists"] as const;
export const inputSchema = z.object({ path: z.string(), kind: z.enum(INVENTORY_INPUT_KINDS), version: z.string() });
export const symbolSchema = z.object({ lexical: z.array(spanSchema), origins: z.array(spanSchema) });
export const partitionSchema = z.object({
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

export type InventorySpan = z.infer<typeof spanSchema>;
export type InventoryInput = z.infer<typeof inputSchema>;
export type InventoryPartition = z.infer<typeof partitionSchema>;
export type InventorySymbols = z.infer<typeof symbolSchema>;

export interface InventoryOverlay {
  readonly root: string;
  readonly files: readonly { readonly path: string; readonly text: string }[];
  readonly deleted: readonly string[];
}

export interface InventoryBuildRequest {
  readonly root: string;
  readonly descriptor: CompilerProgram;
  readonly destination: string;
  readonly overlay?: InventoryOverlay;
}

export interface SemanticInventoryOptions {
  readonly root: string;
  readonly programs?: readonly CompilerProgram[];
  readonly databasePath?: string;
  readonly overlay?: CompilerSourceOverlay;
  readonly fileSystem?: FileSystemHost;
  readonly buildPartition?: (request: InventoryBuildRequest) => void;
}

/** One immutable complete generation; dispose transaction inventories when their transaction ends. */
export interface SemanticInventory extends Disposable {
  readonly generation: number;
  readonly programs: readonly string[];
  readonly canonicalPath: (path: string) => string;
  readonly sourceCorpus: () => SourceCorpus;
  readonly exports: (source: SourceFile, importer?: Node) => ReadonlyMap<string, readonly Node[]>;
  readonly moduleTarget: (node: Node) => SourceFile | undefined;
  readonly symbols: (node: Node) => InventorySymbols;
  readonly references: (node: Node) => readonly Node[];
  readonly witnessOrigins: (node: Node) => readonly Node[];
}
