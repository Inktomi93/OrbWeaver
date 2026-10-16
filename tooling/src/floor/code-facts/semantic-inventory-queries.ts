// Indexed queries read one native fact family or origin; no adapter reconstructs a complete partition.

import type { DatabaseSync, SQLInputValue, StatementSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import type { JsonValue } from "@orb/kit/json";
import { z } from "zod";
import type { InventoryDrizzleCall, InventoryDrizzleQuery, InventorySchemaIdentityCatalog } from "./drizzle-inventory-contract.ts";
import { SCHEMA_DATA_CATALOG_KEY, SCHEMA_IDENTITY_CATALOG_KEY } from "./drizzle-inventory-contract.ts";
import type { InventorySchemaProjectedCatalog } from "./schema-projection-inventory-contract.ts";
import type {
  InventoryExportDeclarationQuery,
  InventoryExportDeclarations,
  InventoryFactKind,
  InventoryFamily,
  InventoryInput,
  InventoryInvocationAtom,
  InventoryInvocationEvidence,
  InventoryInvocationQuery,
  InventoryPartition,
  InventoryReadLease,
  InventorySpan,
  StoredInventoryPartition,
  StoredInventorySource,
} from "./semantic-inventory-contract.ts";
import {
  assertInvocationEvidence,
  callableDeclarationSchema,
  castRelationResultSchema,
  computedNameSchema,
  drizzleQueryKey,
  drizzleSchemas,
  exportDeclarationsSchema,
  globalOriginSchema,
  INVENTORY_FACTS,
  inputSchema,
  invocationAtomSchema,
  invocationEvidenceSchema,
  invocationQueryKey,
  memberOriginSchema,
  partitionSchema,
  SemanticInventoryError,
  schemaDataCatalogSchema,
  shapeCatalogSchema,
  shapePairQuerySchema,
  shapePairResultSchema,
  shapePairSchema,
  spanSchema,
  storedSourceSchema,
} from "./semantic-inventory-contract.ts";
import { readInventoryGeneration } from "./semantic-inventory-database.ts";
import { contentVersion } from "./semantic-inventory-inputs.ts";
import { inventoryString, inventoryStringSchema, inventoryTextVersion } from "./semantic-inventory-records.ts";

const integer = z.number().int();
const boolean = z.union([z.literal(0), z.literal(1)]).transform((value) => value === 1);
const sourceRow = storedSourceSchema.extend({
  authored: boolean,
  file: inventoryStringSchema,
  path: inventoryStringSchema,
  textVersion: inventoryStringSchema,
});
const inputRow = inputSchema.extend({ path: inventoryStringSchema, version: inventoryStringSchema });
const spanRow = spanSchema.extend({ file: inventoryStringSchema });
const invocationAtomRow = invocationAtomSchema.extend({ key: inventoryStringSchema });
const textRow = z.object({ ordinal: integer, value: z.string() });
const factRow = z.object({
  kind: z.enum(INVENTORY_FACTS),
  ordinal: integer,
  file: inventoryStringSchema.nullable(),
  name: inventoryStringSchema.nullable(),
  node: integer.nullable(),
  target: inventoryStringSchema.nullable(),
  dynamic: boolean.nullable(),
  specifier: inventoryStringSchema.nullable(),
});

/** Input validation streams the complete recorded dependency/resolution population. */
export function* readInventoryInputs(db: DatabaseSync, id: string): Iterable<InventoryInput> {
  for (const row of db.prepare("SELECT path,kind,version FROM inventory_input WHERE partition=? ORDER BY ordinal").iterate(id)) {
    yield inputRow.parse(row);
  }
}

/** Source identity and text versions are small metadata; text is loaded only when syntax is requested. */
export function* readInventorySourceMetadata(db: DatabaseSync, id: string): Iterable<StoredInventorySource> {
  for (const row of db
    .prepare("SELECT ordinal,file,path,consumerClass,authored,textVersion,textLength,textParts FROM inventory_source WHERE partition=? ORDER BY ordinal")
    .iterate(id)) {
    yield sourceRow.parse(row);
  }
}

/** Reassemble only one original source string, not a partition or generation JSON document. */
export function readInventorySourceText(db: DatabaseSync, id: string, source: StoredInventorySource): string {
  const decoded: string[] = [];
  function* parts(): Iterable<string> {
    for (const value of db.prepare("SELECT ordinal,value FROM inventory_text WHERE partition=? AND source=? ORDER BY ordinal").iterate(id, source.ordinal)) {
      const row = textRow.parse(value);
      if (row.ordinal !== decoded.length) {
        throw new Error(`native inventory source text sequence missing: ${source.file}`);
      }
      decoded.push(inventoryStringSchema.parse(row.value));
      yield row.value;
    }
  }
  const version = inventoryTextVersion(parts());
  if (decoded.length !== source.textParts || version !== source.textVersion) {
    throw new Error(`native inventory source text version differs: ${source.file}`);
  }
  const text = decoded.join("");
  if (text.length !== source.textLength) {
    throw new Error(`native inventory source text length differs: ${source.file}`);
  }
  return text;
}

/** Bounded-source enumeration for callers that explicitly consume source bytes. */
export function* readInventorySources(db: DatabaseSync, id: string): Iterable<InventoryPartition["sources"][number]> {
  for (const source of readInventorySourceMetadata(db, id)) {
    yield {
      file: source.file,
      path: source.path,
      consumerClass: source.consumerClass,
      authored: source.authored,
      text: readInventorySourceText(db, id, source),
    };
  }
}

function spanOf(db: DatabaseSync, id: string, node: number | null): InventorySpan {
  return spanRow.parse(db.prepare("SELECT file,start,end,kind FROM inventory_span WHERE partition=? AND ordinal=?").get(id, integer.parse(node)));
}

function declarations(db: DatabaseSync, id: string, fact: Pick<z.infer<typeof factRow>, "kind" | "ordinal">, role: string): InventorySpan[] {
  return db
    .prepare(`SELECT s.file,s.start,s.end,s.kind FROM inventory_declaration d JOIN inventory_span s ON s.partition=d.partition AND s.ordinal=d.node
    WHERE d.partition=? AND d.kind=? AND d.owner=? AND d.role=? ORDER BY d.ordinal`)
    .all(id, fact.kind, fact.ordinal, role)
    .map((row) => spanRow.parse(row));
}

function requireInventoryFamily(db: DatabaseSync, id: string, family: InventoryFamily): void {
  if (db.prepare("SELECT name FROM inventory_family WHERE partition=? AND name=?").get(id, family) === undefined) {
    throw new SemanticInventoryError(`native semantic inventory family unavailable: ${family}`);
  }
}

function* facts(
  db: DatabaseSync,
  id: string,
  kind: InventoryFactKind,
  query?: string | InventorySpan | { readonly node: InventorySpan; readonly family: InventoryFamily },
): Iterable<z.infer<typeof factRow>> {
  const family = typeof query === "object" && "node" in query ? query.family : kind;
  const selected = typeof query === "object" && "node" in query ? query.node : query;
  requireInventoryFamily(db, id, family);
  const values: SQLInputValue[] = [id, kind];
  let filter = "";
  if (typeof selected === "string") {
    filter += " AND f.file=?";
    values.push(inventoryString(selected));
  }
  if (typeof selected === "object") {
    filter += " AND f.node=(SELECT ordinal FROM inventory_span WHERE partition=? AND file=? AND start=? AND end=? AND kind=?)";
    values.push(id, inventoryString(selected.file), selected.start, selected.end, selected.kind);
  }
  for (const row of db
    .prepare(
      `SELECT f.kind,f.ordinal,f.file,f.name,f.node,f.target,f.dynamic,f.specifier FROM inventory_fact f WHERE f.partition=? AND f.kind=?${filter} ORDER BY f.ordinal`,
    )
    .iterate(...values)) {
    yield factRow.parse(row);
  }
}

function exportSourceText(db: DatabaseSync, id: string, file: string): string {
  const source = capturedInventorySource(db, id, file, "export");
  if (db.prepare("SELECT ordinal FROM inventory_list WHERE partition=? AND kind='available' AND value=?").get(id, inventoryString(file)) === undefined) {
    throw new SemanticInventoryError("native export declaration source is outside its native closure");
  }
  return readInventorySourceText(db, id, source);
}

/** A requested source/name has one capture even when absent; declaration rows must be complete. */
export function* readInventoryExportDeclarations(db: DatabaseSync, id: string, query: InventoryExportDeclarationQuery): Iterable<InventoryExportDeclarations> {
  requireInventoryFamily(db, id, "export-declarations");
  const row = db
    .prepare("SELECT ordinal,present,declarationCount FROM inventory_export_declaration WHERE partition=? AND file=? AND name=?")
    .get(id, inventoryString(query.file), inventoryString(query.name));
  if (row === undefined) {
    return;
  }
  if (db.prepare("SELECT ordinal FROM inventory_list WHERE partition=? AND kind='roots' AND value=?").get(id, inventoryString(query.file)) === undefined) {
    throw new SemanticInventoryError("native export source is outside its demanded native roots");
  }
  const texts = new Map([[query.file, exportSourceText(db, id, query.file)]]);
  const captured = z.object({ ordinal: integer, present: boolean, declarationCount: integer.nonnegative() }).parse(row);
  const nodes: InventorySpan[] = [];
  for (const value of db
    .prepare(`SELECT d.ordinal,s.file,s.start,s.end,s.kind FROM inventory_export_declaration_node d
    JOIN inventory_span s ON s.partition=d.partition AND s.ordinal=d.node WHERE d.partition=? AND d.owner=? ORDER BY d.ordinal`)
    .iterate(id, captured.ordinal)) {
    const entry = spanRow.extend({ ordinal: integer }).parse(value);
    if (entry.ordinal !== nodes.length) {
      throw new SemanticInventoryError("native export declaration sequence is incomplete");
    }
    const text = texts.get(entry.file) ?? exportSourceText(db, id, entry.file);
    texts.set(entry.file, text);
    if (!(entry.start >= 0 && entry.end >= entry.start && entry.end <= text.length)) {
      throw new SemanticInventoryError("native export declaration span exceeds its captured source");
    }
    nodes.push(spanSchema.parse(entry));
  }
  if (nodes.length !== captured.declarationCount || (!captured.present && nodes.length > 0)) {
    throw new SemanticInventoryError("native export declaration coverage is incomplete");
  }
  yield exportDeclarationsSchema.parse({ query, declarations: captured.present ? nodes : null });
}

export function* readInventoryExports(db: DatabaseSync, id: string, file?: string): Iterable<InventoryPartition["exports"][number]> {
  for (const row of facts(db, id, "exports", file)) {
    yield partitionSchema.shape.exports.element.parse({
      file: row.file,
      name: row.name,
      declarations: declarations(db, id, row, "declarations"),
    });
  }
}

export function* readInventoryModules(db: DatabaseSync, id: string, node?: InventorySpan): Iterable<InventoryPartition["modules"][number]> {
  for (const row of facts(db, id, "modules", node)) {
    yield partitionSchema.shape.modules.element.parse({
      node: spanOf(db, id, row.node),
      target: row.target,
      dynamic: row.dynamic,
      specifier: row.specifier,
      declarations: declarations(db, id, row, "declarations"),
    });
  }
}

export function* readInventoryBindings(db: DatabaseSync, id: string, node?: InventorySpan): Iterable<InventoryPartition["bindings"][number]> {
  if (node !== undefined) {
    capturedInventorySource(db, id, node.file);
  }
  for (const row of facts(db, id, "bindings", node)) {
    const span = spanOf(db, id, row.node);
    const source = capturedInventorySource(db, id, span.file);
    if (!source.authored) {
      requireAuxiliaryBindingSource(db, id, span.file);
      if ([...readInventoryGlobalBindings(db, id, span)].length !== 1) {
        throw new SemanticInventoryError("native auxiliary binding lacks closed row coverage");
      }
      continue;
    }
    yield {
      node: span,
      symbols: { lexical: declarations(db, id, row, "lexical"), origins: declarations(db, id, row, "origins") },
    };
  }
}

function capturedInventorySource(db: DatabaseSync, id: string, file: string, label = "binding"): StoredInventorySource {
  const rows = db
    .prepare("SELECT ordinal,file,path,consumerClass,authored,textVersion,textLength,textParts FROM inventory_source WHERE partition=? AND file=?")
    .all(id, inventoryString(file));
  if (rows.length !== 1) {
    throw new SemanticInventoryError(`native ${label} source ownership is unavailable`);
  }
  return sourceRow.parse(rows[0]);
}
function requireAuxiliaryBindingSource(db: DatabaseSync, id: string, file: string): void {
  requireInventoryFamily(db, id, "invocation-evidence");
  if (db.prepare("SELECT owner FROM inventory_invocation_source WHERE partition=? AND file=?").get(id, inventoryString(file)) === undefined) {
    throw new SemanticInventoryError("native auxiliary binding source has no closed invocation owner");
  }
}

/** Closed global binding metadata never grants the complete default binding family. */
export function* readInventoryGlobalBindings(db: DatabaseSync, id: string, node: InventorySpan | string): Iterable<InventoryPartition["bindings"][number]> {
  requireInventoryFamily(db, id, "global-origins");
  const bindingFact = db.prepare(
    `SELECT f.kind,f.ordinal,f.file,f.name,f.node,f.target,f.dynamic,f.specifier FROM inventory_fact f
    WHERE f.partition=? AND f.kind='bindings' AND f.node=(SELECT ordinal FROM inventory_span WHERE partition=? AND file=? AND start=? AND end=? AND kind=?) ORDER BY f.ordinal`,
  );
  const declarationRows = db.prepare(
    "SELECT d.ordinal,s.file,s.start,s.end,s.kind FROM inventory_declaration d JOIN inventory_span s ON s.partition=d.partition AND s.ordinal=d.node WHERE d.partition=? AND d.kind='bindings' AND d.owner=? AND d.role=? ORDER BY d.ordinal",
  );
  for (const row of db
    .prepare(
      `SELECT s.file,s.start,s.end,s.kind,b.lexicalCount,b.originCount FROM inventory_global_binding b JOIN inventory_span s ON s.partition=b.partition AND s.ordinal=b.node WHERE b.partition=? AND s.file=?${typeof node === "string" ? "" : " AND s.start=? AND s.end=? AND s.kind=?"}`,
    )
    .iterate(...(typeof node === "string" ? [id, inventoryString(node)] : [id, inventoryString(node.file), node.start, node.end, node.kind]))) {
    const selectedSpan = spanRow.parse(row);
    if (!capturedInventorySource(db, id, selectedSpan.file).authored) {
      requireAuxiliaryBindingSource(db, id, selectedSpan.file);
    }
    requireInventoryFamily(db, id, "global-origins");
    const matches = bindingFact
      .all(id, id, inventoryString(selectedSpan.file), selectedSpan.start, selectedSpan.end, selectedSpan.kind)
      .map((value) => factRow.parse(value));
    const fact = matches[0];
    if (matches.length !== 1 || fact === undefined) {
      throw new SemanticInventoryError("native global binding record is unavailable");
    }
    const read = (role: string, count: number): InventorySpan[] => {
      const rows = declarationRows.all(id, fact.ordinal, role);
      if (rows.length !== count || rows.some((value, index) => value["ordinal"] !== index)) {
        throw new SemanticInventoryError("native global binding declarations are incomplete");
      }
      return rows.map((value) => spanRow.parse(value));
    };
    yield {
      node: selectedSpan,
      symbols: { lexical: read("lexical", integer.parse(row["lexicalCount"])), origins: read("origins", integer.parse(row["originCount"])) },
    };
  }
}

/** Ambient origin values and traces retain their complete canonical declaration populations. */
export function* readInventoryGlobalOrigins(db: DatabaseSync, id: string, node: InventorySpan): Iterable<InventoryPartition["globalOrigins"][number]> {
  requireInventoryFamily(db, id, "global-origins");
  for (const row of db
    .prepare(
      "SELECT g.ordinal,g.origin,g.state,g.name,g.reason,g.detail,g.refusalNode,g.valueCount,g.traceCount,g.memberCount FROM inventory_global_origin g JOIN inventory_span s ON s.partition=g.partition AND s.ordinal=g.node WHERE g.partition=? AND s.file=? AND s.start=? AND s.end=? AND s.kind=? ORDER BY g.ordinal",
    )
    .iterate(id, inventoryString(node.file), node.start, node.end, node.kind)) {
    const owner = integer.parse(row["ordinal"]);
    const read = (role: string, count: number): InventorySpan[] => {
      const rows = db
        .prepare(
          "SELECT d.ordinal,s.file,s.start,s.end,s.kind FROM inventory_global_declaration d JOIN inventory_span s ON s.partition=d.partition AND s.ordinal=d.node WHERE d.partition=? AND d.owner=? AND d.role=? ORDER BY d.ordinal",
        )
        .all(id, owner, role);
      if (rows.length !== count || rows.some((value, index) => value["ordinal"] !== index)) {
        throw new SemanticInventoryError("native global origin declarations are incomplete");
      }
      return rows.map((value) => spanRow.parse(value));
    };
    const members = db.prepare("SELECT ordinal,name FROM inventory_global_member WHERE partition=? AND owner=? ORDER BY ordinal").all(id, owner);
    if (members.length !== integer.parse(row["memberCount"]) || members.some((value, index) => value["ordinal"] !== index)) {
      throw new SemanticInventoryError("native global member path is incomplete");
    }
    const valueDeclarations = read("value", integer.parse(row["valueCount"]));
    yield globalOriginSchema.parse({
      node,
      trace: { origin: spanOf(db, id, integer.parse(row["origin"])), declarations: read("trace", integer.parse(row["traceCount"])) },
      result:
        row["state"] === "resolved"
          ? {
              kind: "resolved",
              globalName: inventoryStringSchema.parse(row["name"]),
              memberPath: members.map((value) => inventoryStringSchema.parse(value["name"])),
              declarations: valueDeclarations,
            }
          : {
              kind: row["state"],
              reason: row["reason"],
              detail: inventoryStringSchema.parse(row["detail"]),
              node: spanOf(db, id, integer.parse(row["refusalNode"])),
            },
    });
  }
}

function invocationScalar(row: InventoryInvocationAtom): JsonValue {
  if (row.size > 0) {
    throw new SemanticInventoryError("native invocation scalar carries children");
  }
  switch (row.kind) {
    case "string":
      if (row.number !== null) {
        throw new SemanticInventoryError("native invocation string carries a number");
      }
      return inventoryStringSchema.parse(row.text);
    case "number":
      if (row.text !== null || row.number === null) {
        throw new SemanticInventoryError("native invocation number is missing");
      }
      return row.number;
    case "boolean":
      if (row.text !== null || (row.number !== 0 && row.number !== 1)) {
        throw new SemanticInventoryError("native invocation boolean is invalid");
      }
      return row.number === 1;
    case "null":
      if (row.text !== null || row.number !== null) {
        throw new SemanticInventoryError("native invocation null carries scalar data");
      }
      return null;
    case "object":
    case "array":
      throw new SemanticInventoryError("native invocation scalar has a container kind");
  }
}

function assertInvocationContainer(row: InventoryInvocationAtom): void {
  if (row.text !== null || row.number !== null) {
    throw new SemanticInventoryError("native invocation container carries scalar data");
  }
}
function assertInvocationChild(row: InventoryInvocationAtom, key: string, index: number, entries: readonly (readonly [string, JsonValue])[]): void {
  if ((row.kind === "array" && key !== String(index)) || entries.some(([existing]) => existing === key)) {
    throw new SemanticInventoryError("native invocation container identity is ambiguous");
  }
}
function invocationValue(atoms: readonly InventoryInvocationAtom[]): JsonValue {
  let cursor = 0;
  const read = (parent: number | null): readonly [string, JsonValue] => {
    const row = atoms[cursor++];
    if (row === undefined || row.ordinal !== cursor - 1 || row.parent !== parent) {
      throw new SemanticInventoryError("native invocation atom sequence is incomplete");
    }
    if (row.kind === "array" || row.kind === "object") {
      assertInvocationContainer(row);
      const entries: (readonly [string, JsonValue])[] = [];
      for (let index = 0; index < row.size; index++) {
        const child = read(row.ordinal);
        assertInvocationChild(row, child[0], index, entries);
        entries.push(child);
      }
      return [row.key, row.kind === "array" ? entries.map(([, value]) => value) : Object.fromEntries(entries)];
    }
    return [row.key, invocationScalar(row)];
  };
  const [rootKey, rootValue] = read(null);
  if (rootKey !== "" || cursor !== atoms.length) {
    throw new SemanticInventoryError("native invocation atom root is incomplete");
  }
  return rootValue;
}

function readDrizzleGraph(db: DatabaseSync, id: string, key: string, family: InventoryFamily = "drizzle-identities"): JsonValue {
  requireInventoryFamily(db, id, family);
  const rows = db.prepare("SELECT ordinal,atomCount FROM inventory_drizzle_evidence WHERE partition=? AND key=?").all(id, inventoryString(key));
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new SemanticInventoryError("native Drizzle demand has no captured fact graph");
  }
  const atoms = db
    .prepare("SELECT ordinal,parent,key,kind,text,number,size FROM inventory_drizzle_atom WHERE partition=? AND owner=? ORDER BY ordinal")
    .all(id, integer.parse(row["ordinal"]))
    .map((value) => invocationAtomSchema.extend({ key: inventoryStringSchema }).parse(value));
  if (atoms.length !== integer.parse(row["atomCount"])) {
    throw new SemanticInventoryError("native Drizzle fact graph is incomplete");
  }
  const decoded = invocationValue(atoms);
  assertInvocationSpans(db, id, decoded);
  return decoded;
}

/** The complete native schema roster remains owned by its catalog partition. */
export function readInventorySchemaIdentity(db: DatabaseSync, id: string): InventorySchemaIdentityCatalog {
  const catalog = drizzleSchemas.catalog.parse(readDrizzleGraph(db, id, SCHEMA_IDENTITY_CATALOG_KEY));
  assertSchemaCatalogSources(db, id, catalog.sources, "schema identity");
  return catalog;
}

/** A full catalog requires its own opted-in capture; identity-only rows never stand in for complete columns. */
export function readInventorySchemaData(db: DatabaseSync, id: string): InventorySchemaProjectedCatalog {
  const catalog = schemaDataCatalogSchema.parse(readDrizzleGraph(db, id, SCHEMA_DATA_CATALOG_KEY, "schema-data"));
  assertSchemaCatalogSources(db, id, catalog.sources, "full schema data");
  return catalog;
}

function assertSchemaCatalogSources(db: DatabaseSync, id: string, sources: InventorySchemaIdentityCatalog["sources"], label: string): void {
  for (const source of sources) {
    const captured = capturedInventorySource(db, id, source.node.file, label);
    if (contentVersion(readInventorySourceText(db, id, captured)) !== source.version) {
      throw new SemanticInventoryError(`native ${label} roster source version is stale`);
    }
  }
}

/** Closed call identity includes its mode and the exact catalog partition used by the worker. */
export function readInventoryDrizzleCall(db: DatabaseSync, id: string, query: InventoryDrizzleQuery): InventoryDrizzleCall {
  const key = drizzleQueryKey(query);
  const fact = drizzleSchemas.call.parse(readDrizzleGraph(db, id, key));
  if (drizzleQueryKey(fact.query) !== key) {
    throw new SemanticInventoryError("native Drizzle query identity is foreign");
  }
  return fact;
}

/** One closed query and its related-value graph; absent rows never stand in for empty facts. */
export function* readInventoryInvocationEvidence(db: DatabaseSync, id: string, query: InventoryInvocationQuery): Iterable<InventoryInvocationEvidence> {
  // Public iterators yield control to callers; only the synchronous batch below can reuse validation.
  yield* invocationEvidence(db, id, query, undefined);
}

const INVOCATION_AVAILABLE_SQL = "SELECT ordinal FROM inventory_list WHERE partition=? AND kind='available' AND value=?";
interface InvocationReadSnapshot {
  readonly invocationQueries: Set<number>;
  readonly bindings: Map<string, readonly InventoryPartition["bindings"][number][]>;
  readonly spanSources: Map<string, { readonly source: StoredInventorySource; readonly membership: NonNullable<ReturnType<StatementSync["get"]>> }>;
  readonly available: StatementSync;
}

function invocationSnapshot(db: DatabaseSync): InvocationReadSnapshot {
  return { invocationQueries: new Set(), bindings: new Map(), spanSources: new Map(), available: db.prepare(INVOCATION_AVAILABLE_SQL) };
}

/** Take the private connection through a real selected-generation pin before creating reusable query state. */
export function acquireInventoryReadLease(db: DatabaseSync, generation: number, expected: readonly StoredInventoryPartition[]): InventoryReadLease {
  if (db.isTransaction) {
    throw new SemanticInventoryError("owned inventory read lease requires completed publication");
  }
  db.exec("PRAGMA query_only=ON");
  db.exec("BEGIN");
  const partitions = readInventoryGeneration(db, generation);
  const accepted = expected.toSorted((a, b) => {
    if (a.program === b.program) {
      return 0;
    }
    return a.program < b.program ? -1 : 1;
  });
  if (new Set(accepted.map((partition) => partition.program)).size !== accepted.length || !isDeepStrictEqual(partitions, accepted)) {
    throw new SemanticInventoryError("owned inventory selected generation differs from its accepted native partitions");
  }
  let open = true;
  const snapshots = new Map<string, InvocationReadSnapshot>();
  const selected = (id: string): InvocationReadSnapshot => {
    if (!(open && db.isOpen && db.isTransaction)) {
      throw new SemanticInventoryError("owned inventory read lease has been released");
    }
    if (!partitions.some((partition) => partition.id === id)) {
      throw new SemanticInventoryError("owned inventory native partition is unavailable");
    }
    let snapshot = snapshots.get(id);
    if (snapshot === undefined) {
      snapshot = invocationSnapshot(db);
      snapshots.set(id, snapshot);
    }
    return snapshot;
  };
  return {
    partitions,
    invocationEvidence: (id, query) => invocationEvidence(db, id, query, selected(id)),
    bindings: (id, file) => invocationSourceBindings(db, id, file, selected(id)),
    [Symbol.dispose]: (): void => {
      if (open) {
        open = false;
        for (const snapshot of snapshots.values()) {
          snapshot.invocationQueries.clear();
        }
        snapshots.clear();
        rollbackReadSnapshot(db);
      }
    },
  };
}

function invocationSourceBindings(
  db: DatabaseSync,
  id: string,
  file: string,
  snapshot: InvocationReadSnapshot | undefined,
): readonly InventoryPartition["bindings"][number][] {
  const captured = snapshot?.bindings.get(file);
  if (captured !== undefined) {
    return captured;
  }
  capturedInventorySource(db, id, file);
  const rows = [...readInventoryGlobalBindings(db, id, file)];
  snapshot?.bindings.set(file, rows);
  return rows;
}

/** Staging coverage borrows one transaction for this call; it never carries data into an owned reader lease. */
export function hasInventoryInvocationCoverage(db: DatabaseSync, id: string, queries: readonly InventoryInvocationQuery[]): boolean {
  if (queries.length === 0) {
    return true;
  }
  const ownsSnapshot = !db.isTransaction;
  if (ownsSnapshot) {
    db.exec("BEGIN");
  }
  try {
    const snapshot = invocationSnapshot(db);
    const covered = queries.every((query) => [...invocationEvidence(db, id, query, snapshot)].length === 1);
    if (ownsSnapshot) {
      db.exec("COMMIT");
    }
    return covered;
  } catch (error) {
    if (ownsSnapshot) {
      rollbackReadSnapshot(db);
    }
    throw error;
  }
}

function rollbackReadSnapshot(db: DatabaseSync): void {
  if (db.isTransaction) {
    db.exec("ROLLBACK");
  }
}

function* invocationEvidence(
  db: DatabaseSync,
  id: string,
  query: InventoryInvocationQuery,
  snapshot: InvocationReadSnapshot | undefined,
): Iterable<InventoryInvocationEvidence> {
  requireInventoryFamily(db, id, "invocation-evidence");
  const key = invocationQueryKey(query);
  for (const row of db
    .prepare("SELECT ordinal,node,atomCount FROM inventory_invocation_evidence WHERE partition=? AND key=?")
    .iterate(id, inventoryString(key))) {
    const atoms = db
      .prepare("SELECT ordinal,parent,key,kind,text,number,size FROM inventory_invocation_atom WHERE partition=? AND owner=? ORDER BY ordinal")
      .all(id, integer.parse(row["ordinal"]))
      .map((value) => invocationAtomRow.parse(value));
    if (atoms.length !== integer.parse(row["atomCount"])) {
      throw new SemanticInventoryError("native invocation fact graph is incomplete");
    }
    const decoded = invocationValue(atoms);
    assertInvocationSpans(db, id, decoded, snapshot);
    const fact = invocationEvidenceSchema.parse(decoded);
    const owner = integer.parse(row["ordinal"]);
    if (snapshot?.invocationQueries.has(owner) !== true) {
      const root = spanOf(db, id, integer.parse(row["node"]));
      if (invocationQueryKey({ ...fact.query, node: root }) !== key) {
        throw new SemanticInventoryError("native invocation root span is foreign");
      }
      const node = fact.query.node;
      if (node.file !== root.file || node.start !== root.start || node.end !== root.end || node.kind !== root.kind) {
        throw new SemanticInventoryError("native invocation query identity is stale");
      }
    }
    assertInvocationEvidence(fact);
    const owned = db
      .prepare("SELECT ordinal,file,bindingCount FROM inventory_invocation_source WHERE partition=? AND owner=? ORDER BY ordinal")
      .all(id, integer.parse(row["ordinal"]));
    if (
      owned.length !== fact.sources.length ||
      owned.some((source, index) => {
        const captured = fact.sources.at(index);
        return (
          captured === undefined ||
          source["ordinal"] !== index ||
          inventoryStringSchema.parse(source["file"]) !== captured.file ||
          source["bindingCount"] !== captured.bindings
        );
      })
    ) {
      throw new SemanticInventoryError("native invocation source ownership is incomplete");
    }
    assertInvocationChildren(db, id, fact, snapshot);
    // Only a private pinned partition or this synchronous coverage operation can retain validated row identity.
    snapshot?.invocationQueries.add(owner);
    yield fact;
  }
}

function assertInvocationSpans(db: DatabaseSync, id: string, value: JsonValue, snapshot?: InvocationReadSnapshot): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      assertInvocationSpans(db, id, child, snapshot);
    }
    return;
  }
  const parsed = spanSchema.safeParse(value);
  if (parsed.success) {
    assertInvocationSpan(db, id, parsed.data, snapshot);
    return;
  }
  for (const child of Object.values(value)) {
    assertInvocationSpans(db, id, child, snapshot);
  }
}

function assertInvocationSpan(db: DatabaseSync, id: string, span: InventorySpan, snapshot: InvocationReadSnapshot | undefined): void {
  const captured = snapshot?.spanSources.get(span.file);
  const source = captured?.source ?? capturedInventorySource(db, id, span.file);
  if (span.start < 0 || span.end < span.start || span.end > source.textLength) {
    throw new SemanticInventoryError("native invocation span is outside its captured source closure");
  }
  const membership = captured?.membership ?? (snapshot?.available ?? db.prepare(INVOCATION_AVAILABLE_SQL)).get(id, inventoryString(span.file));
  if (membership === undefined) {
    throw new SemanticInventoryError("native invocation span is outside its captured source closure");
  }
  if (captured === undefined) {
    snapshot?.spanSources.set(span.file, { source, membership });
  }
}

function assertInvocationChildren(db: DatabaseSync, id: string, fact: InventoryInvocationEvidence, snapshot: InvocationReadSnapshot | undefined): void {
  for (const source of fact.sources) {
    if (invocationSourceBindings(db, id, source.file, snapshot).length !== source.bindings) {
      throw new SemanticInventoryError("native invocation binding-source coverage is incomplete");
    }
    if (source.computed.some((node) => [...readInventoryComputedNames(db, id, node)].length !== 1)) {
      throw new SemanticInventoryError("native invocation computed-name coverage is incomplete");
    }
  }
  if (fact.profiles.some((profile) => profile.global === true && [...readInventoryGlobalOrigins(db, id, profile.node)].length !== 1)) {
    throw new SemanticInventoryError("native invocation global-origin coverage is incomplete");
  }
}

export function* readInventoryWitnesses(db: DatabaseSync, id: string, node?: InventorySpan): Iterable<InventoryPartition["witnesses"][number]> {
  for (const row of facts(db, id, "witnesses", node)) {
    yield partitionSchema.shape.witnesses.element.parse({
      node: spanOf(db, id, row.node),
      name: row.name,
      declarations: declarations(db, id, row, "declarations"),
    });
  }
}

/** Preserve native repeated rows and ordering; consumer-level union policy remains in inventoryReader. */
export function* readInventoryReferences(db: DatabaseSync, id: string, origin?: InventorySpan): Iterable<InventoryPartition["references"][number]> {
  requireInventoryFamily(db, id, "references");
  const values: SQLInputValue[] = [id];
  const filter =
    origin === undefined ? "" : " AND r.declaration=(SELECT ordinal FROM inventory_span WHERE partition=? AND file=? AND start=? AND end=? AND kind=?)";
  if (origin !== undefined) {
    values.push(id, inventoryString(origin.file), origin.start, origin.end, origin.kind);
  }
  const rows = db
    .prepare(`SELECT d.file AS declarationFile,d.start AS declarationStart,d.end AS declarationEnd,d.kind AS declarationKind,
    s.file,s.start,s.end,s.kind,r.consumerClass FROM inventory_reference r
    JOIN inventory_span d ON d.partition=r.partition AND d.ordinal=r.declaration
    JOIN inventory_span s ON s.partition=r.partition AND s.ordinal=r.node WHERE r.partition=?${filter} ORDER BY r.ordinal`)
    .iterate(...values);
  for (const row of rows) {
    yield partitionSchema.shape.references.element.parse({
      declaration: {
        file: inventoryStringSchema.parse(row["declarationFile"]),
        start: row["declarationStart"],
        end: row["declarationEnd"],
        kind: row["declarationKind"],
      },
      reference: spanRow.parse(row),
      consumerClass: row["consumerClass"],
    });
  }
}

/** One scalar native cast result; missing rows remain unavailable to the contextual reader. */
export function* readInventoryCasts(db: DatabaseSync, id: string, node?: InventorySpan): Iterable<InventoryPartition["casts"][number]> {
  requireInventoryFamily(db, id, "cast-relations");
  const filter = node === undefined ? "" : " AND s.file=? AND s.start=? AND s.end=? AND s.kind=?";
  const values: SQLInputValue[] = node === undefined ? [id] : [id, inventoryString(node.file), node.start, node.end, node.kind];
  for (const row of db
    .prepare(
      `SELECT s.file,s.start,s.end,s.kind,c.leftToRight,c.rightToLeft,c.leftIsAny,c.rightIsAny,c.reason FROM inventory_cast c JOIN inventory_span s ON s.partition=c.partition AND s.ordinal=c.node WHERE c.partition=?${filter} ORDER BY c.ordinal`,
    )
    .iterate(...values)) {
    const result =
      row["reason"] === null
        ? {
            kind: "resolved",
            value: {
              leftToRight: boolean.parse(row["leftToRight"]),
              rightToLeft: boolean.parse(row["rightToLeft"]),
              leftIsAny: boolean.parse(row["leftIsAny"]),
              rightIsAny: boolean.parse(row["rightIsAny"]),
            },
          }
        : { kind: "unavailable", reason: row["reason"] };
    yield { node: spanRow.parse(row), result: castRelationResultSchema.parse(result) };
  }
}

/** Brand absence is a native answer on a present row, never a substitute for missing query evidence. */
export function* readInventoryBrands(db: DatabaseSync, id: string, node?: InventorySpan): Iterable<InventoryPartition["brands"][number]> {
  requireInventoryFamily(db, id, "id-brands");
  const filter = node === undefined ? "" : " AND s.file=? AND s.start=? AND s.end=? AND s.kind=?";
  const values: SQLInputValue[] = node === undefined ? [id] : [id, inventoryString(node.file), node.start, node.end, node.kind];
  for (const row of db
    .prepare(
      `SELECT s.file,s.start,s.end,s.kind,b.brand FROM inventory_brand b JOIN inventory_span s ON s.partition=b.partition AND s.ordinal=b.node WHERE b.partition=?${filter} ORDER BY b.ordinal`,
    )
    .iterate(...values)) {
    yield { node: spanRow.parse(row), brand: row["brand"] === null ? null : inventoryStringSchema.parse(row["brand"]) };
  }
}

/** A present null row is a non-exported declaration, not missing native evidence. */
export function* readInventoryDeclarationOutputs(
  db: DatabaseSync,
  id: string,
  node: InventorySpan,
): Iterable<InventoryPartition["declarationOutputs"][number]> {
  requireInventoryFamily(db, id, "declaration-outputs");
  for (const row of db
    .prepare(
      "SELECT s.file,s.start,s.end,s.kind,o.unknownOutput FROM inventory_declaration_output o JOIN inventory_span s ON s.partition=o.partition AND s.ordinal=o.node WHERE o.partition=? AND s.file=? AND s.start=? AND s.end=? AND s.kind=? ORDER BY o.ordinal",
    )
    .iterate(id, inventoryString(node.file), node.start, node.end, node.kind)) {
    yield { node: spanRow.parse(row), unknown: row["unknownOutput"] === null ? null : boolean.parse(row["unknownOutput"]) };
  }
}

/** Computed keys retain the canonical scalar/refusal and every ordered binding hop. */
export function* readInventoryComputedNames(db: DatabaseSync, id: string, node: InventorySpan): Iterable<InventoryPartition["computedNames"][number]> {
  requireInventoryFamily(db, id, "computed-names");
  for (const row of db
    .prepare(
      "SELECT c.ordinal,c.origin,c.state,c.value,c.reason,c.detail,c.refusalNode,c.traceCount FROM inventory_computed_name c JOIN inventory_span s ON s.partition=c.partition AND s.ordinal=c.node WHERE c.partition=? AND s.file=? AND s.start=? AND s.end=? AND s.kind=? ORDER BY c.ordinal",
    )
    .iterate(id, inventoryString(node.file), node.start, node.end, node.kind)) {
    const trace = db
      .prepare(
        "SELECT t.ordinal,s.file,s.start,s.end,s.kind FROM inventory_computed_trace t JOIN inventory_span s ON s.partition=t.partition AND s.ordinal=t.node WHERE t.partition=? AND t.owner=? ORDER BY t.ordinal",
      )
      .all(id, integer.parse(row["ordinal"]));
    if (trace.length !== integer.parse(row["traceCount"]) || trace.some((value, index) => value["ordinal"] !== index)) {
      throw new SemanticInventoryError("native computed-name trace is incomplete");
    }
    const span = (column: string): InventorySpan => spanOf(db, id, integer.parse(row[column]));
    yield computedNameSchema.parse({
      node,
      trace: { origin: span("origin"), declarations: trace.map((value) => spanRow.parse(value)) },
      result:
        row["state"] === "resolved"
          ? { kind: "resolved", value: inventoryStringSchema.parse(row["value"]) }
          : { kind: row["state"], reason: row["reason"], detail: inventoryStringSchema.parse(row["detail"]), node: span("refusalNode") },
    });
  }
}

/** Callable traces retain their full ordered chain; missing tails cannot impersonate a shorter origin. */
export function* readInventoryCallableDeclarations(
  db: DatabaseSync,
  id: string,
  node: InventorySpan,
): Iterable<InventoryPartition["callableDeclarations"][number]> {
  requireInventoryFamily(db, id, "callable-declarations");
  for (const row of db
    .prepare(
      "SELECT c.ordinal,c.origin,c.state,c.declaration,c.body,c.reason,c.detail,c.refusalNode,c.traceCount FROM inventory_callable_declaration c JOIN inventory_span s ON s.partition=c.partition AND s.ordinal=c.node WHERE c.partition=? AND s.file=? AND s.start=? AND s.end=? AND s.kind=? ORDER BY c.ordinal",
    )
    .iterate(id, inventoryString(node.file), node.start, node.end, node.kind)) {
    const trace = db
      .prepare(
        "SELECT t.ordinal,s.file,s.start,s.end,s.kind FROM inventory_callable_trace t JOIN inventory_span s ON s.partition=t.partition AND s.ordinal=t.node WHERE t.partition=? AND t.owner=? ORDER BY t.ordinal",
      )
      .all(id, integer.parse(row["ordinal"]));
    if (trace.length !== integer.parse(row["traceCount"]) || trace.some((value, index) => value["ordinal"] !== index)) {
      throw new SemanticInventoryError("native callable declaration trace is incomplete");
    }
    const span = (column: string): InventorySpan => spanOf(db, id, integer.parse(row[column]));
    yield callableDeclarationSchema.parse({
      node,
      trace: { origin: span("origin"), declarations: trace.map((value) => spanRow.parse(value)) },
      result:
        row["state"] === "resolved"
          ? { kind: "resolved", declaration: span("declaration"), body: row["body"] === null ? null : span("body") }
          : { kind: row["state"], reason: row["reason"], detail: inventoryStringSchema.parse(row["detail"]), node: span("refusalNode") },
    });
  }
}

/** Member facts retain every declaration and the original normalization/refusal trace. */
export function* readInventoryMemberOrigins(db: DatabaseSync, id: string, node: InventorySpan): Iterable<InventoryPartition["memberOrigins"][number]> {
  requireInventoryFamily(db, id, "type-member-origins");
  requireInventoryFamily(db, id, "bindings");
  const memberDeclarations = (owner: number, role: string, count: number): InventorySpan[] => {
    const rows = db
      .prepare(
        "SELECT d.ordinal,s.file,s.start,s.end,s.kind FROM inventory_member_declaration d JOIN inventory_span s ON s.partition=d.partition AND s.ordinal=d.node WHERE d.partition=? AND d.owner=? AND d.role=? ORDER BY d.ordinal",
      )
      .all(id, owner, role);
    if (rows.length !== count || rows.some((row, index) => row["ordinal"] !== index)) {
      throw new SemanticInventoryError("native call member declaration population is incomplete");
    }
    return rows.map((row) => spanRow.parse(row));
  };
  for (const row of db
    .prepare(
      "SELECT o.ordinal,o.node,o.name,o.leaf,o.origin,o.state,o.reason,o.detail,o.refusalNode,o.valueCount,o.traceCount,o.leafCount FROM inventory_member_origin o JOIN inventory_span s ON s.partition=o.partition AND s.ordinal=o.node WHERE o.partition=? AND s.file=? AND s.start=? AND s.end=? AND s.kind=? ORDER BY o.ordinal",
    )
    .iterate(id, inventoryString(node.file), node.start, node.end, node.kind)) {
    const owner = integer.parse(row["ordinal"]);
    const span = (column: string): InventorySpan => spanOf(db, id, integer.parse(row[column]));
    const value = memberDeclarations(owner, "value", integer.parse(row["valueCount"]));
    const trace = memberDeclarations(owner, "trace", integer.parse(row["traceCount"]));
    if (row["leaf"] !== null) {
      const bindings = [...readInventoryBindings(db, id, span("leaf"))];
      if (bindings.length !== 1) {
        throw new SemanticInventoryError("native call member leaf binding is unavailable in its native partition");
      }
      if (bindings[0]?.symbols.lexical.length !== integer.parse(row["leafCount"])) {
        throw new SemanticInventoryError("native call member declaration population is incomplete");
      }
    }
    yield memberOriginSchema.parse({
      node,
      name: row["name"] === null ? null : inventoryStringSchema.parse(row["name"]),
      leaf: row["leaf"] === null ? null : span("leaf"),
      trace: { origin: span("origin"), declarations: trace },
      result:
        row["state"] === "resolved"
          ? { kind: "resolved", declarations: value }
          : { kind: row["state"], reason: row["reason"], detail: inventoryStringSchema.parse(row["detail"]), node: span("refusalNode") },
    });
  }
}

/** Missing catalog rows are not an object with no fields. */
export function readInventoryShape(db: DatabaseSync, id: string, node: InventorySpan): InventoryPartition["shapes"][number] {
  requireInventoryFamily(db, id, "shape-catalog");
  const row = db
    .prepare(
      "SELECT s.ordinal,s.node,s.copyObject,s.respellObject FROM inventory_shape s JOIN inventory_span n ON n.partition=s.partition AND n.ordinal=s.node WHERE s.partition=? AND n.file=? AND n.start=? AND n.end=? AND n.kind=?",
    )
    .get(id, inventoryString(node.file), node.start, node.end, node.kind);
  if (row === undefined) {
    throw new SemanticInventoryError("native shape catalog span is unavailable");
  }
  const owner = integer.parse(row["ordinal"]);
  const fields = (mode: "copy" | "respell"): InventoryPartition["shapes"][number]["copy"] =>
    !boolean.parse(row[mode === "copy" ? "copyObject" : "respellObject"])
      ? null
      : db
          .prepare("SELECT name,type FROM inventory_shape_field WHERE partition=? AND owner=? AND mode=? ORDER BY ordinal")
          .all(id, owner, mode)
          .map((field) => ({ name: inventoryStringSchema.parse(field["name"]), type: inventoryStringSchema.parse(field["type"]) }));
  const origins = (kind: "direct" | "queries"): string[] =>
    db
      .prepare("SELECT value FROM inventory_shape_origin WHERE partition=? AND owner=? AND kind=? ORDER BY ordinal")
      .all(id, owner, kind)
      .map((value) => inventoryStringSchema.parse(value["value"]));
  return shapeCatalogSchema.parse({ node, copy: fields("copy"), respell: fields("respell"), direct: origins("direct"), queries: origins("queries") });
}

/** Coverage is the actual normalized query set, not family presence. */
export function* readInventoryPairs(db: DatabaseSync, id: string, queryKey?: string): Iterable<InventoryPartition["pairs"][number]> {
  requireInventoryFamily(db, id, "shape-pairs");
  const values: SQLInputValue[] = queryKey === undefined ? [id] : [id, inventoryString(queryKey)];
  for (const row of db
    .prepare(
      `SELECT leftNode,rightNode,leftField,rightField,projection,lenient,state,reason,a,b,c,d FROM inventory_pair WHERE partition=?${queryKey === undefined ? "" : " AND key=?"} ORDER BY ordinal`,
    )
    .iterate(...values)) {
    const query = shapePairQuerySchema.parse({
      left: spanOf(db, id, integer.parse(row["leftNode"])),
      right: spanOf(db, id, integer.parse(row["rightNode"])),
      leftField: row["leftField"] === null ? null : inventoryStringSchema.parse(row["leftField"]),
      rightField: row["rightField"] === null ? null : inventoryStringSchema.parse(row["rightField"]),
      projection: row["projection"],
      lenient: boolean.parse(row["lenient"]),
    });
    const result = shapePairResultSchema.parse({
      kind: row["state"],
      values: [row["a"], row["b"], row["c"], row["d"]].filter((value) => value !== null).map((value) => boolean.parse(value)),
      reason: row["reason"],
    });
    yield shapePairSchema.parse({ query, result });
  }
}

/** Read one exporting file; declaration spans retain their importing-world identity. */
export function* readInventoryRuntimeExports(db: DatabaseSync, id: string, file: string): Iterable<InventoryPartition["runtimeExports"][number]> {
  requireInventoryFamily(db, id, "runtime-exports");
  for (const row of db
    .prepare(`SELECT r.file AS exportingFile,r.name,r.callable,r.initializerKind,r.initializerCallable,s.file,s.start,s.end,s.kind
    FROM inventory_runtime_export r JOIN inventory_span s ON s.partition=r.partition AND s.ordinal=r.node
    WHERE r.partition=? AND r.file=? ORDER BY r.ordinal`)
    .iterate(id, inventoryString(file))) {
    yield partitionSchema.shape.runtimeExports.element.parse({
      file: inventoryStringSchema.parse(row["exportingFile"]),
      name: inventoryStringSchema.parse(row["name"]),
      declaration: spanRow.parse(row),
      callable: boolean.parse(row["callable"]),
      initializer:
        row["initializerKind"] === null ? null : { kind: integer.parse(row["initializerKind"]), callable: boolean.parse(row["initializerCallable"]) },
    });
  }
}
