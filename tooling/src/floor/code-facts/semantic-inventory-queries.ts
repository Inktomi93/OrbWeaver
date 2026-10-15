// Indexed queries read one native fact family or origin; no adapter reconstructs a complete partition.

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { z } from "zod";
import type {
  InventoryFactKind,
  InventoryFamily,
  InventoryInput,
  InventoryPartition,
  InventorySpan,
  StoredInventorySource,
} from "./semantic-inventory-contract.ts";
import {
  callableDeclarationSchema,
  castRelationResultSchema,
  INVENTORY_FACTS,
  inputSchema,
  memberOriginSchema,
  partitionSchema,
  SemanticInventoryError,
  shapeCatalogSchema,
  shapePairQuerySchema,
  shapePairResultSchema,
  shapePairSchema,
  spanSchema,
  storedSourceSchema,
} from "./semantic-inventory-contract.ts";
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

function* facts(db: DatabaseSync, id: string, kind: InventoryFactKind, query?: string | InventorySpan): Iterable<z.infer<typeof factRow>> {
  requireInventoryFamily(db, id, kind);
  const values: SQLInputValue[] = [id, kind];
  let filter = "";
  if (typeof query === "string") {
    filter += " AND f.file=?";
    values.push(inventoryString(query));
  }
  if (typeof query === "object") {
    filter += " AND f.node=(SELECT ordinal FROM inventory_span WHERE partition=? AND file=? AND start=? AND end=? AND kind=?)";
    values.push(id, inventoryString(query.file), query.start, query.end, query.kind);
  }
  for (const row of db
    .prepare(
      `SELECT f.kind,f.ordinal,f.file,f.name,f.node,f.target,f.dynamic,f.specifier FROM inventory_fact f WHERE f.partition=? AND f.kind=?${filter} ORDER BY f.ordinal`,
    )
    .iterate(...values)) {
    yield factRow.parse(row);
  }
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
  for (const row of facts(db, id, "bindings", node)) {
    yield {
      node: spanOf(db, id, row.node),
      symbols: { lexical: declarations(db, id, row, "lexical"), origins: declarations(db, id, row, "origins") },
    };
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
