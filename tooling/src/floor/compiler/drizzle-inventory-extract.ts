// The existing worker captures canonical Project-owned facts; no compiler object crosses a native world.
import { relative } from "node:path";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { readDrizzleCallEvidence } from "../code-facts/drizzle-evidence.ts";
import type { InventorySchemaIdentityCatalog, InventorySchemaIdentityTable } from "../code-facts/drizzle-inventory-contract.ts";
import { projectSchemaIdentities, schemaIdentityQuery } from "../code-facts/schema-identity.ts";
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
  assertSource: (source: SourceFile) => void,
): Pick<InventoryPartition, "schemaIdentity" | "schemaData" | "drizzleCalls"> {
  const byFile = new Map(sources.map((source) => [span(source).file, source]));
  for (const source of sources) {
    assertSource(source);
  }
  const selected = (request.schemaSources ?? request.schemaDataSources)?.map((query) => {
    const node = inventoryQueryNode(byFile.get(query.file), query);
    if (!Node.isSourceFile(node)) {
      throw new Error("native schema roster contains a non-source query");
    }
    return node;
  });
  const relativePath = (source: SourceFile): string => relative(request.root, source.getFilePath()).replaceAll("\\", "/");
  assertCatalogRosters(request);
  const schema =
    selected === undefined
      ? undefined
      : createSchemaQuery({
          files: selected,
          relativePath,
          checker: () => {
            const source = sources[0];
            if (source === undefined) {
              throw new Error("native schema owner has no captured Project");
            }
            return source.getProject().getTypeChecker();
          },
        }).schema();
  const schemaIdentity =
    request.schemaSources === undefined || selected === undefined || schema === undefined
      ? undefined
      : encodeSchemaIdentityCatalog(selected, projectSchemaIdentities(schema), span, relativePath);
  const schemaData =
    request.schemaDataSources === undefined || selected === undefined || schema === undefined
      ? undefined
      : encodeSchemaDataCatalog(selected, projectSchemaData(schema), span, relativePath);
  const dependency = request.schemaDependency;
  const catalog = dependency === undefined ? undefined : drizzleSchemas.catalog.parse(dependency.catalog);
  const declarations = catalog === undefined ? new Map<string, InventorySchemaIdentityTable>() : catalogDeclarations(catalog, byFile, span);
  const drizzleCalls = (request.drizzleQueries ?? []).map((query) => {
    if (dependency === undefined || catalog === undefined) {
      throw new Error("native Drizzle consumer has no atomic catalog dependency");
    }
    const node = inventoryQueryNode(byFile.get(query.node.file), query.node);
    if (!Node.isCallExpression(node)) {
      throw new Error("native Drizzle demand is not a call");
    }
    const evidence = readDrizzleCallEvidence(node, query.mode, schemaIdentityQuery(catalog.fact, declarations));
    return { query, basis: { program: dependency.program, partition: dependency.partition }, evidence: encodeDrizzleCallEvidence(evidence, span) };
  });
  for (const source of sources) {
    assertSource(source);
  }
  return {
    ...(schemaData === undefined ? {} : { schemaData }),
    ...(schemaIdentity === undefined ? {} : { schemaIdentity }),
    ...(request.drizzleQueries === undefined ? {} : { drizzleCalls }),
  };
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
