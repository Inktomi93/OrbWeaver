// The existing worker captures canonical Project-owned facts; no compiler object crosses a native world.
import { relative } from "node:path";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { readDrizzleCallEvidence } from "../code-facts/drizzle-evidence.ts";
import type { InventorySchemaDependency, InventorySchemaIdentityCatalog, InventorySchemaIdentityTable } from "../code-facts/drizzle-inventory-contract.ts";
import { assertSchemaColumnRoster } from "../code-facts/drizzle-inventory-contract.ts";
import { projectSchemaIdentities, schemaIdentityQuery } from "../code-facts/schema-identity.ts";
import type { SchemaIdentityQuery } from "../code-facts/schema-identity-contract.ts";
import type { SchemaFact, SchemaModel, SchemaQuery } from "../code-facts/schema-model-contract.ts";
import { projectSchemaData } from "../code-facts/schema-projection.ts";
import { createSchemaQuery } from "../code-facts/schema-query.ts";
import { schemaDeclarationKey } from "../code-facts/schema-value.ts";
import type { InventoryBuildRequest, InventoryPartition, InventorySpan } from "../code-facts/semantic-inventory-contract.ts";
import { drizzleSchemas, inventoryNodeQueryKey } from "../code-facts/semantic-inventory-contract.ts";
import { contentVersion } from "../code-facts/semantic-inventory-inputs.ts";
import { encodeDrizzleCallEvidence, encodeSchemaIdentityCatalog } from "./drizzle-evidence-encode.ts";
import { encodeSchemaDataCatalog } from "./schema-projection-encode.ts";

/** Start/end/kind select the exact authored node even when a parent shares its spelling and span. */
export function inventoryQueryNode(source: SourceFile | undefined, query: InventorySpan): MorphNode {
  const leaf = source?.getDescendantAtPos(query.start);
  const node = [source, leaf, ...(leaf?.getAncestors() ?? [])].find(
    (candidate) => candidate?.getStart() === query.start && candidate.getEnd() === query.end && candidate.getKind() === query.kind,
  );
  if (node === undefined || node.wasForgotten()) {
    throw new Error("native query span is unavailable in its captured native program");
  }
  return node;
}

export function extractDrizzleIdentities(
  request: InventoryBuildRequest,
  sources: readonly SourceFile[],
  span: (node: MorphNode) => InventorySpan,
  owner: {
    readonly assertSource: (source: SourceFile) => void;
    readonly ordinarySchema?: (query: SchemaQuery | undefined) => void;
    readonly valueSourceDeclarations?: (declarations: ReadonlySet<string>) => void;
  },
): Pick<InventoryPartition, "schemaIdentity" | "schemaData" | "drizzleCalls"> {
  const byFile = new Map(sources.map((source) => [span(source).file, source]));
  for (const source of sources) {
    owner.assertSource(source);
  }
  const { selected, relativePath, schemaQuery, schema } = nativeSchemaQuery(request, sources, { byFile, span });
  owner.ordinarySchema?.(schemaQuery);
  const schemaIdentity =
    request.schemaSources === undefined || selected === undefined || schema === undefined
      ? undefined
      : encodeSchemaIdentityCatalog(selected, projectSchemaIdentities(schema), span, relativePath);
  const schemaData =
    request.schemaDataSources === undefined || selected === undefined || schema === undefined
      ? undefined
      : encodeSchemaDataCatalog(selected, projectSchemaData(schema, request.schemaDataProjection), span, {
          relativePath,
          projection: request.schemaDataProjection,
        });
  const dependency = request.schemaDependency;
  const catalog = dependency === undefined ? undefined : drizzleSchemas.catalog.parse(dependency.catalog);
  const declarations = catalog === undefined ? new Map<string, InventorySchemaIdentityTable>() : catalogDeclarations(catalog, byFile, span);
  const local = localColumnQuery(request, schema);
  const columns = dependency?.columns === undefined ? undefined : new Map(dependency.columns.map((column) => [column.key, column]));
  if (catalog?.fact.status === "ready") {
    owner.valueSourceDeclarations?.(
      new Set(catalog.fact.value.tables.map((table) => `${table.declaration.file}:${table.declaration.start}:${table.declaration.end}`)),
    );
  } else if (schema?.status === "ready") {
    owner.valueSourceDeclarations?.(new Set(schema.value.tables.map((table) => schemaDeclarationKey(table.declaration))));
  }

  const drizzleCalls = (request.drizzleQueries ?? []).map((query) => {
    const node = inventoryQueryNode(byFile.get(query.node.file), query.node);
    if (dependency === undefined && query.mode === "column") {
      if (local === undefined) {
        throw new Error("native local column demand has no ready complete paired catalog");
      }
      const evidence = readDrizzleCallEvidence(node, query.mode, local);
      return { query, basis: null, evidence: encodeDrizzleCallEvidence(evidence, span) };
    }
    if (dependency === undefined || catalog === undefined) {
      throw new Error("native Drizzle consumer has no atomic catalog dependency");
    }
    if (query.mode !== "column" && !Node.isCallExpression(node)) {
      throw new Error("native Drizzle demand is not a call");
    }
    assertColumnDependency(query.mode, dependency, catalog);
    const evidence = readDrizzleCallEvidence(node, query.mode, schemaIdentityQuery(catalog.fact, declarations, columns));
    return { query, basis: { program: dependency.program, partition: dependency.partition }, evidence: encodeDrizzleCallEvidence(evidence, span) };
  });
  for (const source of sources) {
    owner.assertSource(source);
  }
  return {
    ...(schemaData === undefined ? {} : { schemaData }),
    ...(schemaIdentity === undefined ? {} : { schemaIdentity }),
    ...(request.drizzleQueries === undefined ? {} : { drizzleCalls }),
  };
}

function nativeSchemaQuery(
  request: InventoryBuildRequest,
  sources: readonly SourceFile[],
  owner: { readonly byFile: ReadonlyMap<string, SourceFile>; readonly span: (node: MorphNode) => InventorySpan },
): {
  readonly selected: readonly SourceFile[] | undefined;
  readonly relativePath: (source: SourceFile) => string;
  readonly schemaQuery: SchemaQuery | undefined;
  readonly schema: SchemaFact<SchemaModel> | undefined;
} {
  const { byFile, span } = owner;
  const selected = (request.schemaSources ?? request.schemaDataSources)?.map((query) => {
    const node = inventoryQueryNode(byFile.get(query.file), query);
    if (!Node.isSourceFile(node)) {
      throw new Error("native schema roster contains a non-source query");
    }
    return node;
  });
  const relativePath = (source: SourceFile): string => relative(request.root, source.getFilePath()).replaceAll("\\", "/");
  assertCatalogRosters(request);
  const querySources = selected ?? ordinaryCatalogSources(request, byFile);
  const schemaQuery =
    querySources === undefined
      ? undefined
      : createSchemaQuery({
          files: querySources,
          relativePath,
          checker: () => {
            const source = sources[0];
            if (source === undefined) {
              throw new Error("native schema owner has no captured Project");
            }
            return source.getProject().getTypeChecker();
          },
        });
  const schema = schemaQuery?.schema();
  if (selected === undefined && schema !== undefined && request.schemaDependency !== undefined && querySources !== undefined) {
    const local = encodeSchemaIdentityCatalog(querySources, projectSchemaIdentities(schema), span, relativePath);
    if (JSON.stringify(local.fact) !== JSON.stringify(request.schemaDependency.catalog.fact)) {
      throw new Error("native ordinary consumer and complete catalog identity disagree");
    }
  }
  return { selected, relativePath, schemaQuery, schema };
}

function assertColumnDependency(
  mode: import("../code-facts/drizzle-evidence-contract.ts").DrizzleEvidenceMode,
  dependency: InventorySchemaDependency,
  catalog: InventorySchemaIdentityCatalog,
): void {
  if (mode !== "column") {
    return;
  }
  if (dependency.columns === undefined) {
    throw new Error("native Drizzle column demand has no complete catalog dependency");
  }
  assertSchemaColumnRoster(catalog, dependency.columns);
}

function localColumnQuery(request: InventoryBuildRequest, schema: SchemaFact<SchemaModel> | undefined): SchemaIdentityQuery | undefined {
  if (request.schemaDependency !== undefined || request.drizzleQueries?.some((query) => query.mode === "column") !== true) {
    return;
  }
  if (schema?.status !== "ready" || request.schemaSources === undefined || request.schemaDataSources === undefined) {
    throw new Error("native local column demand has no ready complete paired catalog");
  }
  const tables = new Map(schema.value.tables.map((table) => [schemaDeclarationKey(table.declaration), table]));
  const columns = new Map(schema.value.tables.flatMap((table) => table.columns.map((column) => [column.identity.key, column.identity] as const)));
  return schemaIdentityQuery(projectSchemaIdentities(schema), tables, columns);
}

function catalogDeclarations(
  catalog: InventorySchemaIdentityCatalog,
  byFile: ReadonlyMap<string, SourceFile>,
  span: (node: MorphNode) => InventorySpan,
): ReadonlyMap<string, InventorySchemaIdentityTable> {
  const declarations = new Map<string, InventorySchemaIdentityTable>();
  for (const captured of catalog.sources) {
    const source = byFile.get(captured.node.file);
    if (source !== undefined && contentVersion(source.getFullText()) !== captured.version) {
      throw new Error("native Drizzle consumer and catalog source versions disagree");
    }
  }
  if (catalog.fact.status !== "ready") {
    return declarations;
  }
  for (const table of catalog.fact.value.tables) {
    const source = byFile.get(table.declaration.file);
    if (source === undefined) {
      continue;
    }
    const declaration = inventoryQueryNode(source, table.declaration);
    const call = inventoryQueryNode(source, table.call);
    if (!Node.isVariableDeclaration(declaration) || declaration.getName() !== table.identity.declarationName || !Node.isCallExpression(call)) {
      throw new Error("native Drizzle catalog declaration identity is foreign");
    }
    if (inventoryNodeQueryKey(span(declaration)) !== inventoryNodeQueryKey(table.declaration)) {
      throw new Error("native Drizzle catalog declaration identity disagrees");
    }
    declarations.set(schemaDeclarationKey(declaration), table);
  }
  return declarations;
}

function assertCatalogRosters(request: InventoryBuildRequest): void {
  if (
    request.schemaSources !== undefined &&
    request.schemaDataSources !== undefined &&
    JSON.stringify(request.schemaSources.map(inventoryNodeQueryKey).toSorted()) !==
      JSON.stringify(request.schemaDataSources.map(inventoryNodeQueryKey).toSorted())
  ) {
    throw new Error("native schema identity and full-data rosters disagree");
  }
}

function ordinaryCatalogSources(request: InventoryBuildRequest, byFile: ReadonlyMap<string, SourceFile>): readonly SourceFile[] | undefined {
  if (request.invocationQueries?.some((query) => query.mode === "observations") !== true) {
    return;
  }
  const catalog = request.schemaDependency?.catalog;
  if (catalog === undefined) {
    return;
  }
  const sources: SourceFile[] = [];
  for (const captured of catalog.sources) {
    const source = byFile.get(captured.node.file);
    if (source === undefined) {
      return;
    }
    if (
      source.wasForgotten() ||
      contentVersion(source.getFullText()) !== captured.version ||
      source.getStart() !== captured.node.start ||
      source.getEnd() !== captured.node.end ||
      source.getKind() !== captured.node.kind
    ) {
      throw new Error("native ordinary complete catalog source is foreign or stale");
    }
    sources.push(source);
  }
  return sources;
}
