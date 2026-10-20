// Indexed queries read one native fact family or origin; no adapter reconstructs a complete partition.

import type { DatabaseSync, SQLInputValue, SQLOutputValue, StatementSync } from "node:sqlite";
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
  computedNameSchema,
  drizzleQueryKey,
  drizzleSchemas,
  exportDeclarationsSchema,
  globalOriginSchema,
  INVENTORY_FACTS,
  INVENTORY_KEY_SEPARATOR,
  inputSchema,
  inventorySpanKey,
  invocationAtomSchema,
  invocationEvidenceSchema,
  invocationNeedsValueSourceCatalog,
  invocationQueryKey,
  memberOriginSchema,
  partitionSchema,
  referenceQuerySchema,
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
import type { InventoryFactFamily, InventoryReadSession } from "./semantic-inventory-loader.ts";
import { createInventoryReadSession, readInventoryFacts } from "./semantic-inventory-loader.ts";
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
const referenceQueryRow = z.object({ ordinal: integer.nonnegative(), resultCount: integer.nonnegative() });
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

// Batched reads join one JSON key list to the unique span index; CROSS JOIN keeps the key list as the outer loop.
const SPAN_REQUESTS =
  "json_each(?) q CROSS JOIN inventory_span n ON n.partition=? AND n.file=q.value->>0 AND n.start=q.value->>1 AND n.end=q.value->>2 AND n.kind=q.value->>3";
const requestRow = z.object({ request: integer.nonnegative() });

function spanRequests(nodes: readonly InventorySpan[]): string {
  return JSON.stringify(nodes.map((node) => [inventoryString(node.file), node.start, node.end, node.kind]));
}

function stringRequests(values: readonly string[]): string {
  return JSON.stringify(values.map(inventoryString));
}

function requestedKey<K>(keys: readonly K[], row: Record<string, SQLOutputValue>): K {
  const key = keys[requestRow.parse(row).request];
  if (key === undefined) {
    throw new SemanticInventoryError("native batched read answered a key it was not asked");
  }
  return key;
}

function requireSessionFamily(session: InventoryReadSession, id: string, family: InventoryFamily): void {
  if (session.statement("SELECT name FROM inventory_family WHERE partition=? AND name=?").get(id, family) === undefined) {
    throw new SemanticInventoryError(`native semantic inventory family unavailable: ${family}`);
  }
}

/** Ordered declaration spans of many fact owners, grouped by owner and role in stored order. */
function factDeclarations(
  session: InventoryReadSession,
  id: string,
  kind: InventoryFactKind,
  owners: readonly number[],
): ReadonlyMap<number, ReadonlyMap<string, InventorySpan[]>> {
  const grouped = new Map<number, Map<string, InventorySpan[]>>();
  for (const row of session
    .statement(`SELECT d.owner,d.role,s.file,s.start,s.end,s.kind FROM inventory_declaration d JOIN inventory_span s ON s.partition=d.partition AND s.ordinal=d.node
    WHERE d.partition=? AND d.kind=? AND d.owner IN (SELECT value FROM json_each(?)) ORDER BY d.owner,d.role,d.ordinal`)
    .iterate(id, kind, JSON.stringify(owners))) {
    const owner = integer.parse(row["owner"]);
    const role = z.string().parse(row["role"]);
    const roles = grouped.get(owner) ?? new Map<string, InventorySpan[]>();
    const spans = roles.get(role) ?? [];
    spans.push(spanRow.parse(row));
    roles.set(role, spans);
    grouped.set(owner, roles);
  }
  return grouped;
}

/** Fact rows keyed by their node span, in stored order, with each row's declaration roles. */
function nodeFacts(
  session: InventoryReadSession,
  id: string,
  kind: InventoryFactKind,
  nodes: readonly InventorySpan[],
): readonly { readonly node: InventorySpan; readonly fact: z.infer<typeof factRow>; readonly roles: ReadonlyMap<string, InventorySpan[]> }[] {
  requireSessionFamily(session, id, kind);
  const rows = session
    .statement(
      `SELECT q.key AS request,f.kind,f.ordinal,f.file,f.name,f.node,f.target,f.dynamic,f.specifier FROM ${SPAN_REQUESTS} CROSS JOIN inventory_fact f ON f.partition=n.partition AND f.kind=? AND f.node=n.ordinal ORDER BY q.key,f.ordinal`,
    )
    .all(spanRequests(nodes), id, kind)
    .map((row) => ({ node: requestedKey(nodes, row), fact: factRow.parse(row) }));
  const owned = factDeclarations(
    session,
    id,
    kind,
    rows.map(({ fact }) => fact.ordinal),
  );
  return rows.map((row) => ({ ...row, roles: owned.get(row.fact.ordinal) ?? new Map<string, InventorySpan[]>() }));
}

/** Captured source rows per requested file; more or fewer than one row is an ownership refusal at the caller. */
export const inventorySourcesByFile: InventoryFactFamily<string, readonly StoredInventorySource[]> = {
  key: (file) => file,
  read: (session, id, files) => {
    const sources = new Map<string, StoredInventorySource[]>();
    for (const row of session
      .statement(
        "SELECT q.key AS request,s.ordinal,s.file,s.path,s.consumerClass,s.authored,s.textVersion,s.textLength,s.textParts FROM json_each(?) q CROSS JOIN inventory_source s ON s.partition=? AND s.file=q.value ORDER BY q.key,s.ordinal",
      )
      .iterate(stringRequests(files), id)) {
      const file = requestedKey(files, row);
      const rows = sources.get(file) ?? [];
      rows.push(sourceRow.parse(row));
      sources.set(file, rows);
    }
    return sources;
  },
};

function capturedSources(session: InventoryReadSession, id: string, files: readonly string[], label: string): ReadonlyMap<string, StoredInventorySource> {
  const found = inventorySourcesByFile.read(session, id, [...new Set(files)]);
  return new Map(
    files.map((file) => {
      const rows = found.get(file) ?? [];
      const source = rows[0];
      if (rows.length !== 1 || source === undefined) {
        throw new SemanticInventoryError(`native ${label} source ownership is unavailable`);
      }
      return [file, source];
    }),
  );
}

/** Missing catalog rows are not an object with no fields. */
export const inventoryShapes: InventoryFactFamily<InventorySpan, InventoryPartition["shapes"][number]> = {
  key: inventorySpanKey,
  read: (session, id, nodes) => {
    requireSessionFamily(session, id, "shape-catalog");
    const owned = session
      .statement(
        `SELECT q.key AS request,s.ordinal,s.copyObject,s.respellObject FROM ${SPAN_REQUESTS} CROSS JOIN inventory_shape s ON s.partition=n.partition AND s.node=n.ordinal`,
      )
      .all(spanRequests(nodes), id)
      .map((row) => ({
        node: requestedKey(nodes, row),
        owner: integer.parse(row["ordinal"]),
        copy: boolean.parse(row["copyObject"]),
        respell: boolean.parse(row["respellObject"]),
      }));
    const owners = JSON.stringify(owned.map(({ owner }) => owner));
    const fields = new Map<string, string[]>();
    for (const row of session
      .statement(
        "SELECT owner,mode,name FROM inventory_shape_field WHERE partition=? AND owner IN (SELECT value FROM json_each(?)) ORDER BY owner,mode,ordinal",
      )
      .iterate(id, owners)) {
      const key = `${String(row["owner"])}${INVENTORY_KEY_SEPARATOR}${String(row["mode"])}`;
      fields.set(key, [...(fields.get(key) ?? []), inventoryStringSchema.parse(row["name"])]);
    }
    const origins = new Map<string, string[]>();
    for (const row of session
      .statement(
        "SELECT owner,kind,value FROM inventory_shape_origin WHERE partition=? AND owner IN (SELECT value FROM json_each(?)) ORDER BY owner,kind,ordinal",
      )
      .iterate(id, owners)) {
      const key = `${String(row["owner"])}${INVENTORY_KEY_SEPARATOR}${String(row["kind"])}`;
      origins.set(key, [...(origins.get(key) ?? []), inventoryStringSchema.parse(row["value"])]);
    }
    const listed = (map: ReadonlyMap<string, string[]>, owner: number, name: string): string[] =>
      map.get(`${String(owner)}${INVENTORY_KEY_SEPARATOR}${name}`) ?? [];
    return new Map(
      owned.map(({ node, owner, copy, respell }) => [
        inventorySpanKey(node),
        frozenFact(
          shapeCatalogSchema.parse({
            node,
            copy: copy ? listed(fields, owner, "copy") : null,
            respell: respell ? listed(fields, owner, "respell") : null,
            direct: listed(origins, owner, "direct"),
            queries: listed(origins, owner, "queries"),
          }),
        ),
      ]),
    );
  },
};

const PAIR_COLUMNS =
  "l.file AS leftFile,l.start AS leftStart,l.end AS leftEnd,l.kind AS leftKind,r.file AS rightFile,r.start AS rightStart,r.end AS rightEnd,r.kind AS rightKind,p.leftField,p.rightField,p.projection,p.lenient,p.state,p.reason,p.a,p.b,p.c,p.d";
// LEFT JOIN keeps a dangling node as a parse refusal instead of dropping its pair from coverage.
const PAIR_SPANS =
  "LEFT JOIN inventory_span l ON l.partition=p.partition AND l.ordinal=p.leftNode LEFT JOIN inventory_span r ON r.partition=p.partition AND r.ordinal=p.rightNode";

function pairOf(row: Record<string, SQLOutputValue>): InventoryPartition["pairs"][number] {
  const side = (prefix: "left" | "right"): InventorySpan =>
    spanRow.parse({ file: row[`${prefix}File`], start: row[`${prefix}Start`], end: row[`${prefix}End`], kind: row[`${prefix}Kind`] });
  const query = shapePairQuerySchema.parse({
    left: side("left"),
    right: side("right"),
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
  return shapePairSchema.parse({ query, result });
}

/** Stored pair answers by normalized query key; coverage is the actual stored key set, not family presence. */
export const inventoryPairs: InventoryFactFamily<string, InventoryPartition["pairs"][number]> = {
  key: (queryKey) => queryKey,
  read: (session, id, keys) => {
    requireSessionFamily(session, id, "shape-pairs");
    return new Map(
      session
        .statement(`SELECT q.key AS request,${PAIR_COLUMNS} FROM json_each(?) q CROSS JOIN inventory_pair p ON p.partition=? AND p.key=q.value ${PAIR_SPANS}`)
        .all(stringRequests(keys), id)
        .map((row) => [requestedKey(keys, row), pairOf(row)]),
    );
  },
};

/** Binding rows per requested node; source ownership and the auxiliary-source refusal hold per node. */
export const inventoryBindingsAt: InventoryFactFamily<InventorySpan, readonly InventoryPartition["bindings"][number][]> = {
  key: inventorySpanKey,
  read: (session, id, nodes) => {
    const sources = capturedSources(
      session,
      id,
      nodes.map((node) => node.file),
      "binding",
    );
    const bindings = new Map<string, InventoryPartition["bindings"][number][]>();
    for (const { node, roles } of nodeFacts(session, id, "bindings", nodes)) {
      if (sources.get(node.file)?.authored !== true) {
        requireAuxiliaryBindingSource(session.db, id, node.file);
        if ([...readInventoryGlobalBindings(session.db, id, node)].length !== 1) {
          throw new SemanticInventoryError("native auxiliary binding lacks closed row coverage");
        }
        continue;
      }
      const key = inventorySpanKey(node);
      bindings.set(key, [
        ...(bindings.get(key) ?? []),
        frozenFact({ node, symbols: { lexical: roles.get("lexical") ?? [], origins: roles.get("origins") ?? [] } }),
      ]);
    }
    return bindings;
  },
};

/** Module rows per requested import, export or dynamic-import node. */
export const inventoryModulesAt: InventoryFactFamily<InventorySpan, readonly InventoryPartition["modules"][number][]> = {
  key: inventorySpanKey,
  read: (session, id, nodes) => {
    const modules = new Map<string, InventoryPartition["modules"][number][]>();
    for (const { node, fact, roles } of nodeFacts(session, id, "modules", nodes)) {
      const key = inventorySpanKey(node);
      modules.set(key, [
        ...(modules.get(key) ?? []),
        partitionSchema.shape.modules.element.parse({
          node,
          target: fact.target,
          dynamic: fact.dynamic,
          specifier: fact.specifier,
          declarations: roles.get("declarations") ?? [],
        }),
      ]);
    }
    return modules;
  },
};

/** Witness rows per requested satisfies node. */
export const inventoryWitnessesAt: InventoryFactFamily<InventorySpan, readonly InventoryPartition["witnesses"][number][]> = {
  key: inventorySpanKey,
  read: (session, id, nodes) => {
    const witnesses = new Map<string, InventoryPartition["witnesses"][number][]>();
    for (const { node, fact, roles } of nodeFacts(session, id, "witnesses", nodes)) {
      const key = inventorySpanKey(node);
      witnesses.set(key, [
        ...(witnesses.get(key) ?? []),
        partitionSchema.shape.witnesses.element.parse({ node, name: fact.name, declarations: roles.get("declarations") ?? [] }),
      ]);
    }
    return witnesses;
  },
};

/** Export rows per requested exporting file, in stored order. */
export const inventoryExportsOf: InventoryFactFamily<string, readonly InventoryPartition["exports"][number][]> = {
  key: (file) => file,
  read: (session, id, files) => {
    requireSessionFamily(session, id, "exports");
    const rows = session
      .statement(
        "SELECT q.key AS request,f.kind,f.ordinal,f.file,f.name,f.node,f.target,f.dynamic,f.specifier FROM json_each(?) q CROSS JOIN inventory_fact f ON f.partition=? AND f.kind='exports' AND f.file=q.value ORDER BY q.key,f.ordinal",
      )
      .all(stringRequests(files), id)
      .map((row) => ({ file: requestedKey(files, row), fact: factRow.parse(row) }));
    const owned = factDeclarations(
      session,
      id,
      "exports",
      rows.map(({ fact }) => fact.ordinal),
    );
    const exports = new Map<string, InventoryPartition["exports"][number][]>();
    for (const { file, fact } of rows) {
      exports.set(file, [
        ...(exports.get(file) ?? []),
        partitionSchema.shape.exports.element.parse({
          file: fact.file,
          name: fact.name,
          declarations: owned.get(fact.ordinal)?.get("declarations") ?? [],
        }),
      ]);
    }
    return exports;
  },
};

// Retained facts are shared by every caller of a pinned session; freezing turns a consumer mutation into a refusal.
function frozenFact<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      frozenFact(child);
    }
  }
  return value;
}

function spanColumns(alias: string, prefix: string): string {
  return `${alias}.file AS ${prefix}File,${alias}.start AS ${prefix}Start,${alias}.end AS ${prefix}End,${alias}.kind AS ${prefix}Kind`;
}

// LEFT JOIN keeps a dangling span reference as a parse refusal instead of dropping its owning row.
function spanJoin(alias: string, owner: string, column: string): string {
  return `LEFT JOIN inventory_span ${alias} ON ${alias}.partition=${owner}.partition AND ${alias}.ordinal=${owner}.${column}`;
}

function spanColumn(row: Record<string, SQLOutputValue>, prefix: string): InventorySpan {
  return spanRow.parse({ file: row[`${prefix}File`], start: row[`${prefix}Start`], end: row[`${prefix}End`], kind: row[`${prefix}Kind`] });
}

const OWNED_SPAN_TABLES = {
  computedTrace: "inventory_computed_trace",
  callableTrace: "inventory_callable_trace",
  globalDeclaration: "inventory_global_declaration",
  memberDeclaration: "inventory_member_declaration",
} as const;

/** Child spans of many owners in stored order, keyed by owner and role; a role-less table files every row under "". */
function ownedSpans(
  session: InventoryReadSession,
  id: string,
  table: keyof typeof OWNED_SPAN_TABLES,
  owners: readonly number[],
): ReadonlyMap<string, readonly { readonly ordinal: number; readonly span: InventorySpan }[]> {
  const roled = table === "globalDeclaration" || table === "memberDeclaration";
  const grouped = new Map<string, { readonly ordinal: number; readonly span: InventorySpan }[]>();
  for (const row of session
    .statement(
      `SELECT t.owner,${roled ? "t.role" : "'' AS role"},t.ordinal,s.file,s.start,s.end,s.kind FROM ${OWNED_SPAN_TABLES[table]} t JOIN inventory_span s ON s.partition=t.partition AND s.ordinal=t.node WHERE t.partition=? AND t.owner IN (SELECT value FROM json_each(?)) ORDER BY t.owner,${roled ? "t.role," : ""}t.ordinal`,
    )
    .iterate(id, JSON.stringify(owners))) {
    const key = `${String(row["owner"])}${INVENTORY_KEY_SEPARATOR}${String(row["role"])}`;
    grouped.set(key, [...(grouped.get(key) ?? []), { ordinal: integer.parse(row["ordinal"]), span: spanRow.parse(row) }]);
  }
  return grouped;
}

/** An owner's child sequence must hold exactly its recorded count with contiguous ordinals. */
function ownedSequence(
  grouped: ReadonlyMap<string, readonly { readonly ordinal: number; readonly span: InventorySpan }[]>,
  sequence: { readonly owner: number; readonly role: string; readonly count: number },
  refusal: string,
): InventorySpan[] {
  const rows = grouped.get(`${String(sequence.owner)}${INVENTORY_KEY_SEPARATOR}${sequence.role}`) ?? [];
  if (rows.length !== sequence.count || rows.some((row, index) => row.ordinal !== index)) {
    throw new SemanticInventoryError(refusal);
  }
  return rows.map(({ span }) => span);
}

function refusalOf(row: Record<string, SQLOutputValue>): {
  readonly kind: SQLOutputValue | undefined;
  readonly reason: SQLOutputValue | undefined;
  readonly detail: string;
  readonly node: InventorySpan;
} {
  return { kind: row["state"], reason: row["reason"], detail: inventoryStringSchema.parse(row["detail"]), node: spanColumn(row, "refusal") };
}

/** Ambient origin values and traces retain their complete canonical declaration populations. */
export const inventoryGlobalOrigins: InventoryFactFamily<InventorySpan, InventoryPartition["globalOrigins"][number]> = {
  key: inventorySpanKey,
  read: (session, id, nodes) => {
    requireSessionFamily(session, id, "global-origins");
    const rows = session
      .statement(
        `SELECT q.key AS request,g.ordinal,g.state,g.name,g.reason,g.detail,g.valueCount,g.traceCount,g.memberCount,${spanColumns("o", "origin")},${spanColumns("r", "refusal")} FROM ${SPAN_REQUESTS} CROSS JOIN inventory_global_origin g ON g.partition=n.partition AND g.node=n.ordinal ${spanJoin("o", "g", "origin")} ${spanJoin("r", "g", "refusalNode")}`,
      )
      .all(spanRequests(nodes), id);
    const owners = rows.map((row) => integer.parse(row["ordinal"]));
    const children = ownedSpans(session, id, "globalDeclaration", owners);
    const members = new Map<number, { readonly ordinal: number; readonly name: string }[]>();
    for (const row of session
      .statement(
        "SELECT owner,ordinal,name FROM inventory_global_member WHERE partition=? AND owner IN (SELECT value FROM json_each(?)) ORDER BY owner,ordinal",
      )
      .iterate(id, JSON.stringify(owners))) {
      const owner = integer.parse(row["owner"]);
      members.set(owner, [...(members.get(owner) ?? []), { ordinal: integer.parse(row["ordinal"]), name: inventoryStringSchema.parse(row["name"]) }]);
    }
    return new Map(
      rows.map((row) => {
        const node = requestedKey(nodes, row);
        const owner = integer.parse(row["ordinal"]);
        const path = members.get(owner) ?? [];
        if (path.length !== integer.parse(row["memberCount"]) || path.some((value, index) => value.ordinal !== index)) {
          throw new SemanticInventoryError("native global member path is incomplete");
        }
        const refusal = "native global origin declarations are incomplete";
        const valueDeclarations = ownedSequence(children, { owner, role: "value", count: integer.parse(row["valueCount"]) }, refusal);
        return [
          inventorySpanKey(node),
          globalOriginSchema.parse({
            node,
            trace: {
              origin: spanColumn(row, "origin"),
              declarations: ownedSequence(children, { owner, role: "trace", count: integer.parse(row["traceCount"]) }, refusal),
            },
            result:
              row["state"] === "resolved"
                ? {
                    kind: "resolved",
                    globalName: inventoryStringSchema.parse(row["name"]),
                    memberPath: path.map((value) => value.name),
                    declarations: valueDeclarations,
                  }
                : refusalOf(row),
          }),
        ];
      }),
    );
  },
};

/** A present null row is a non-exported declaration, not missing native evidence. */
export const inventoryDeclarationOutputs: InventoryFactFamily<InventorySpan, InventoryPartition["declarationOutputs"][number]> = {
  key: inventorySpanKey,
  read: (session, id, nodes) => {
    requireSessionFamily(session, id, "declaration-outputs");
    return new Map(
      session
        .statement(
          `SELECT q.key AS request,o.unknownOutput FROM ${SPAN_REQUESTS} CROSS JOIN inventory_declaration_output o ON o.partition=n.partition AND o.node=n.ordinal`,
        )
        .all(spanRequests(nodes), id)
        .map((row) => {
          const node = requestedKey(nodes, row);
          return [inventorySpanKey(node), { node, unknown: row["unknownOutput"] === null ? null : boolean.parse(row["unknownOutput"]) }];
        }),
    );
  },
};

/** Computed keys retain the canonical scalar/refusal and every ordered binding hop. */
export const inventoryComputedNames: InventoryFactFamily<InventorySpan, InventoryPartition["computedNames"][number]> = {
  key: inventorySpanKey,
  read: (session, id, nodes) => {
    requireSessionFamily(session, id, "computed-names");
    const rows = session
      .statement(
        `SELECT q.key AS request,c.ordinal,c.state,c.value,c.reason,c.detail,c.traceCount,${spanColumns("o", "origin")},${spanColumns("r", "refusal")} FROM ${SPAN_REQUESTS} CROSS JOIN inventory_computed_name c ON c.partition=n.partition AND c.node=n.ordinal ${spanJoin("o", "c", "origin")} ${spanJoin("r", "c", "refusalNode")}`,
      )
      .all(spanRequests(nodes), id);
    const traces = ownedSpans(
      session,
      id,
      "computedTrace",
      rows.map((row) => integer.parse(row["ordinal"])),
    );
    return new Map(
      rows.map((row) => {
        const node = requestedKey(nodes, row);
        const trace = ownedSequence(
          traces,
          { owner: integer.parse(row["ordinal"]), role: "", count: integer.parse(row["traceCount"]) },
          "native computed-name trace is incomplete",
        );
        return [
          inventorySpanKey(node),
          computedNameSchema.parse({
            node,
            trace: { origin: spanColumn(row, "origin"), declarations: trace },
            result: row["state"] === "resolved" ? { kind: "resolved", value: inventoryStringSchema.parse(row["value"]) } : refusalOf(row),
          }),
        ];
      }),
    );
  },
};

/** Callable traces retain their full ordered chain; missing tails cannot impersonate a shorter origin. */
export const inventoryCallableDeclarations: InventoryFactFamily<InventorySpan, InventoryPartition["callableDeclarations"][number]> = {
  key: inventorySpanKey,
  read: (session, id, nodes) => {
    requireSessionFamily(session, id, "callable-declarations");
    const rows = session
      .statement(
        `SELECT q.key AS request,c.ordinal,c.state,c.body,c.reason,c.detail,c.traceCount,${spanColumns("o", "origin")},${spanColumns("d", "declaration")},${spanColumns("b", "body")},${spanColumns("r", "refusal")} FROM ${SPAN_REQUESTS} CROSS JOIN inventory_callable_declaration c ON c.partition=n.partition AND c.node=n.ordinal ${spanJoin("o", "c", "origin")} ${spanJoin("d", "c", "declaration")} ${spanJoin("b", "c", "body")} ${spanJoin("r", "c", "refusalNode")}`,
      )
      .all(spanRequests(nodes), id);
    const traces = ownedSpans(
      session,
      id,
      "callableTrace",
      rows.map((row) => integer.parse(row["ordinal"])),
    );
    return new Map(
      rows.map((row) => {
        const node = requestedKey(nodes, row);
        const trace = ownedSequence(
          traces,
          { owner: integer.parse(row["ordinal"]), role: "", count: integer.parse(row["traceCount"]) },
          "native callable declaration trace is incomplete",
        );
        return [
          inventorySpanKey(node),
          callableDeclarationSchema.parse({
            node,
            trace: { origin: spanColumn(row, "origin"), declarations: trace },
            result:
              row["state"] === "resolved"
                ? { kind: "resolved", declaration: spanColumn(row, "declaration"), body: row["body"] === null ? null : spanColumn(row, "body") }
                : refusalOf(row),
          }),
        ];
      }),
    );
  },
};

/** Member facts retain every declaration, the original normalization/refusal trace and the leaf binding population. */
export const inventoryMemberOrigins: InventoryFactFamily<InventorySpan, InventoryPartition["memberOrigins"][number]> = {
  key: inventorySpanKey,
  read: (session, id, nodes) => {
    requireSessionFamily(session, id, "type-member-origins");
    requireSessionFamily(session, id, "bindings");
    const rows = session
      .statement(
        `SELECT q.key AS request,o.ordinal,o.name,o.leaf,o.state,o.reason,o.detail,o.valueCount,o.traceCount,o.leafCount,${spanColumns("l", "leaf")},${spanColumns("g", "origin")},${spanColumns("r", "refusal")} FROM ${SPAN_REQUESTS} CROSS JOIN inventory_member_origin o ON o.partition=n.partition AND o.node=n.ordinal ${spanJoin("l", "o", "leaf")} ${spanJoin("g", "o", "origin")} ${spanJoin("r", "o", "refusalNode")}`,
      )
      .all(spanRequests(nodes), id);
    const children = ownedSpans(
      session,
      id,
      "memberDeclaration",
      rows.map((row) => integer.parse(row["ordinal"])),
    );
    const leaves = rows.filter((row) => row["leaf"] !== null).map((row) => spanColumn(row, "leaf"));
    const bindings = leaves.length === 0 ? new Map<string, readonly InventoryPartition["bindings"][number][]>() : inventoryBindingsAt.read(session, id, leaves);
    const refusal = "native call member declaration population is incomplete";
    return new Map(
      rows.map((row) => {
        const node = requestedKey(nodes, row);
        const owner = integer.parse(row["ordinal"]);
        const value = ownedSequence(children, { owner, role: "value", count: integer.parse(row["valueCount"]) }, refusal);
        const trace = ownedSequence(children, { owner, role: "trace", count: integer.parse(row["traceCount"]) }, refusal);
        const leaf = row["leaf"] === null ? null : spanColumn(row, "leaf");
        if (leaf !== null) {
          const leafBindings = bindings.get(inventorySpanKey(leaf)) ?? [];
          if (leafBindings.length !== 1) {
            throw new SemanticInventoryError("native call member leaf binding is unavailable in its native partition");
          }
          if (leafBindings[0]?.symbols.lexical.length !== integer.parse(row["leafCount"])) {
            throw new SemanticInventoryError(refusal);
          }
        }
        return [
          inventorySpanKey(node),
          memberOriginSchema.parse({
            node,
            name: row["name"] === null ? null : inventoryStringSchema.parse(row["name"]),
            leaf,
            trace: { origin: spanColumn(row, "origin"), declarations: trace },
            result: row["state"] === "resolved" ? { kind: "resolved", declarations: value } : refusalOf(row),
          }),
        ];
      }),
    );
  },
};

/** Runtime export rows per exporting file; declaration spans retain their importing-world identity. */
export const inventoryRuntimeExportsOf: InventoryFactFamily<string, readonly InventoryPartition["runtimeExports"][number][]> = {
  key: (file) => file,
  read: (session, id, files) => {
    requireSessionFamily(session, id, "runtime-exports");
    const exports = new Map<string, InventoryPartition["runtimeExports"][number][]>();
    for (const row of session
      .statement(`SELECT q.key AS request,r.file AS exportingFile,r.name,r.callable,r.initializerKind,r.initializerCallable,s.file,s.start,s.end,s.kind
      FROM json_each(?) q CROSS JOIN inventory_runtime_export r ON r.partition=? AND r.file=q.value JOIN inventory_span s ON s.partition=r.partition AND s.ordinal=r.node ORDER BY q.key,r.ordinal`)
      .iterate(stringRequests(files), id)) {
      const file = requestedKey(files, row);
      exports.set(file, [
        ...(exports.get(file) ?? []),
        partitionSchema.shape.runtimeExports.element.parse({
          file: inventoryStringSchema.parse(row["exportingFile"]),
          name: inventoryStringSchema.parse(row["name"]),
          declaration: spanRow.parse(row),
          callable: boolean.parse(row["callable"]),
          initializer:
            row["initializerKind"] === null ? null : { kind: integer.parse(row["initializerKind"]), callable: boolean.parse(row["initializerCallable"]) },
        }),
      ]);
    }
    return exports;
  },
};

function* facts(db: DatabaseSync, id: string, kind: InventoryFactKind): Iterable<z.infer<typeof factRow>> {
  requireInventoryFamily(db, id, kind);
  for (const row of db
    .prepare(
      "SELECT f.kind,f.ordinal,f.file,f.name,f.node,f.target,f.dynamic,f.specifier FROM inventory_fact f WHERE f.partition=? AND f.kind=? ORDER BY f.ordinal",
    )
    .iterate(id, kind)) {
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
  if (file !== undefined) {
    yield* inventoryExportsOf.read(createInventoryReadSession(db), id, [file]).get(file) ?? [];
    return;
  }
  for (const row of facts(db, id, "exports")) {
    yield partitionSchema.shape.exports.element.parse({
      file: row.file,
      name: row.name,
      declarations: declarations(db, id, row, "declarations"),
    });
  }
}

export function* readInventoryModules(db: DatabaseSync, id: string, node?: InventorySpan): Iterable<InventoryPartition["modules"][number]> {
  if (node !== undefined) {
    yield* inventoryModulesAt.read(createInventoryReadSession(db), id, [node]).get(inventorySpanKey(node)) ?? [];
    return;
  }
  for (const row of facts(db, id, "modules")) {
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
    yield* inventoryBindingsAt.read(createInventoryReadSession(db), id, [node]).get(inventorySpanKey(node)) ?? [];
    return;
  }
  for (const row of facts(db, id, "bindings")) {
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
function assertInvocationChild(row: InventoryInvocationAtom, key: string, index: number, siblings: ReadonlySet<string>): void {
  if ((row.kind === "array" && key !== String(index)) || siblings.has(key)) {
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
      const keys = new Set<string>();
      for (let index = 0; index < row.size; index++) {
        const child = read(row.ordinal);
        assertInvocationChild(row, child[0], index, keys);
        entries.push(child);
        keys.add(child[0]);
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
    .map((value) => invocationAtomRow.parse(value));
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
  const assertOpen = (): void => {
    if (!(open && db.isOpen && db.isTransaction)) {
      throw new SemanticInventoryError("owned inventory read lease has been released");
    }
  };
  const selected = (id: string): InvocationReadSnapshot => {
    assertOpen();
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
    assertOpen,
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
export function hasInventoryInvocationCoverage(
  db: DatabaseSync,
  id: string,
  queries: readonly InventoryInvocationQuery[],
  observationBasis: import("./drizzle-inventory-contract.ts").InventorySchemaBasis | null = null,
): boolean {
  if (queries.length === 0) {
    return true;
  }
  const ownsSnapshot = !db.isTransaction;
  if (ownsSnapshot) {
    db.exec("BEGIN");
  }
  try {
    const snapshot = invocationSnapshot(db);
    const covered = queries.every((query) => {
      const matches = [...invocationEvidence(db, id, query, snapshot)];
      return (
        matches.length === 1 &&
        (query.mode !== "observations" || JSON.stringify(matches[0]?.observationBasis) === JSON.stringify(observationBasis)) &&
        (!invocationNeedsValueSourceCatalog(query) || JSON.stringify(matches[0]?.drizzleSourcesBasis) === JSON.stringify(observationBasis))
      );
    });
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
  const covered = <V>(family: InventoryFactFamily<InventorySpan, V>, nodes: readonly InventorySpan[]): boolean =>
    readInventoryFacts(db, family, id, nodes).every((value) => value !== undefined);
  for (const source of fact.sources) {
    if (invocationSourceBindings(db, id, source.file, snapshot).length !== source.bindings) {
      throw new SemanticInventoryError("native invocation binding-source coverage is incomplete");
    }
    if (!covered(inventoryComputedNames, source.computed)) {
      throw new SemanticInventoryError("native invocation computed-name coverage is incomplete");
    }
  }
  if (fact.observations !== undefined && !covered(inventoryComputedNames, fact.observations.keys)) {
    throw new SemanticInventoryError("native ordinary computed-name coverage is incomplete");
  }
  if (
    !covered(
      inventoryGlobalOrigins,
      fact.profiles.filter((profile) => profile.global === true).map((profile) => profile.node),
    )
  ) {
    throw new SemanticInventoryError("native invocation global-origin coverage is incomplete");
  }
}

export function* readInventoryWitnesses(db: DatabaseSync, id: string, node?: InventorySpan): Iterable<InventoryPartition["witnesses"][number]> {
  if (node !== undefined) {
    yield* inventoryWitnessesAt.read(createInventoryReadSession(db), id, [node]).get(inventorySpanKey(node)) ?? [];
    return;
  }
  for (const row of facts(db, id, "witnesses")) {
    yield partitionSchema.shape.witnesses.element.parse({
      node: spanOf(db, id, row.node),
      name: row.name,
      declarations: declarations(db, id, row, "declarations"),
    });
  }
}

/** Preserve native repeated rows and ordering; consumer-level union policy remains in inventoryReader.
 *  Storage keeps one row group per declaration plus name links; each link replays its declaration's group
 *  directly after that group, which is exactly where the extractor emitted the name's copy. */
export function* readInventoryReferences(db: DatabaseSync, id: string, origin?: InventorySpan): Iterable<InventoryPartition["references"][number]> {
  requireInventoryFamily(db, id, "references");
  if (origin === undefined) {
    yield* readAllInventoryReferences(db, id);
    return;
  }
  const ordinal = db
    .prepare("SELECT ordinal FROM inventory_span WHERE partition=? AND file=? AND start=? AND end=? AND kind=?")
    .get(id, inventoryString(origin.file), origin.start, origin.end, origin.kind);
  if (ordinal === undefined) {
    return;
  }
  const originId = z.object({ ordinal: z.number() }).parse(ordinal).ordinal;
  // Logical order of every group keyed by this span: its own rows, then each declaration it names.
  const groups: { readonly owner: number; readonly first: number; readonly link: number }[] = [];
  const own = db.prepare("SELECT MIN(ordinal) AS first FROM inventory_reference WHERE partition=? AND declaration=?").get(id, originId);
  const ownFirst = z.object({ first: z.number().nullable() }).parse(own).first;
  if (ownFirst !== null) {
    groups.push({ owner: originId, first: ownFirst, link: -1 });
  }
  for (const row of db
    .prepare(
      "SELECT n.ordinal AS link,n.declaration AS owner,(SELECT MIN(r.ordinal) FROM inventory_reference r WHERE r.partition=n.partition AND r.declaration=n.declaration) AS first FROM inventory_reference_name n WHERE n.partition=? AND n.name=?",
    )
    .iterate(id, originId)) {
    const link = z.object({ link: z.number(), owner: z.number(), first: z.number().nullable() }).parse(row);
    if (link.first !== null) {
      groups.push({ owner: link.owner, first: link.first, link: link.link });
    }
  }
  groups.sort((left, right) => left.first - right.first || left.link - right.link);
  const rows = db.prepare(
    `SELECT s.file,s.start,s.end,s.kind,r.consumerClass FROM inventory_reference r
    JOIN inventory_span s ON s.partition=r.partition AND s.ordinal=r.node WHERE r.partition=? AND r.declaration=? ORDER BY r.ordinal`,
  );
  const declaration = spanSchema.parse(origin);
  for (const group of groups) {
    for (const row of rows.iterate(id, group.owner)) {
      yield partitionSchema.shape.references.element.parse({ declaration, reference: spanRow.parse(row), consumerClass: row["consumerClass"] });
    }
  }
}

function* readAllInventoryReferences(db: DatabaseSync, id: string): Iterable<InventoryPartition["references"][number]> {
  const linkRow = z.object({ declaration: z.number(), file: z.unknown(), start: z.number(), end: z.number(), kind: z.number() });
  const links = new Map<number, InventorySpan[]>();
  for (const row of db
    .prepare(
      "SELECT n.declaration,s.file,s.start,s.end,s.kind FROM inventory_reference_name n JOIN inventory_span s ON s.partition=n.partition AND s.ordinal=n.name WHERE n.partition=? ORDER BY n.ordinal",
    )
    .iterate(id)) {
    const link = linkRow.parse(row);
    const names = links.get(link.declaration) ?? [];
    names.push(spanRow.parse(row));
    links.set(link.declaration, names);
  }
  const rows = db
    .prepare(`SELECT r.declaration AS owner,d.file AS declarationFile,d.start AS declarationStart,d.end AS declarationEnd,d.kind AS declarationKind,
    s.file,s.start,s.end,s.kind,r.consumerClass FROM inventory_reference r
    JOIN inventory_span d ON d.partition=r.partition AND d.ordinal=r.declaration
    JOIN inventory_span s ON s.partition=r.partition AND s.ordinal=r.node WHERE r.partition=? ORDER BY r.ordinal`)
    .iterate(id);
  let owner: number | undefined;
  let group: InventoryPartition["references"][number][] = [];
  const replay = function* (): Iterable<InventoryPartition["references"][number]> {
    for (const name of owner === undefined ? [] : (links.get(owner) ?? [])) {
      for (const row of group) {
        yield { ...row, declaration: name };
      }
    }
  };
  for (const row of rows) {
    const rowOwner = z.number().parse(row["owner"]);
    if (rowOwner !== owner) {
      yield* replay();
      owner = rowOwner;
      group = [];
    }
    const entry = partitionSchema.shape.references.element.parse({
      declaration: {
        file: inventoryStringSchema.parse(row["declarationFile"]),
        start: row["declarationStart"],
        end: row["declarationEnd"],
        kind: row["declarationKind"],
      },
      reference: spanRow.parse(row),
      consumerClass: row["consumerClass"],
    });
    group.push(entry);
    yield entry;
  }
  yield* replay();
}

/** Exact native queries preserve zero answers, ordering and repetitions independently of declaration liveness. */
export function* readInventoryReferenceQueries(
  db: DatabaseSync,
  id: string,
  pair?: import("./semantic-inventory-contract.ts").InventoryReferencePair,
): Iterable<import("./semantic-inventory-contract.ts").InventoryReferenceQuery> {
  requireInventoryFamily(db, id, "references");
  const values: SQLInputValue[] =
    pair === undefined
      ? [id]
      : [
          id,
          inventoryString(pair.node.file),
          pair.node.start,
          pair.node.end,
          pair.node.kind,
          inventoryString(pair.root.file),
          pair.root.start,
          pair.root.end,
          pair.root.kind,
        ];
  const filter = pair === undefined ? "" : " AND s.file=? AND s.start=? AND s.end=? AND s.kind=? AND a.file=? AND a.start=? AND a.end=? AND a.kind=?";
  let ordinal = 0;
  let children = 0;
  for (const value of db
    .prepare(
      `SELECT q.ordinal,q.resultCount,s.file,s.start,s.end,s.kind,a.file AS rootFile,a.start AS rootStart,a.end AS rootEnd,a.kind AS rootKind FROM inventory_reference_query q JOIN inventory_span s ON s.partition=q.partition AND s.ordinal=q.node JOIN inventory_span a ON a.partition=q.partition AND a.ordinal=q.root WHERE q.partition=?${filter} ORDER BY q.ordinal`,
    )
    .iterate(...values)) {
    const row = referenceQueryRow.parse(value);
    if (pair === undefined && row.ordinal !== ordinal++) {
      throw new SemanticInventoryError("native reference query sequence is incomplete");
    }
    const requested = spanRow.parse(value);
    const root = spanSchema.parse({
      file: inventoryStringSchema.parse(value["rootFile"]),
      start: value["rootStart"],
      end: value["rootEnd"],
      kind: value["rootKind"],
    });
    const references: import("./semantic-inventory-contract.ts").InventoryReferenceQuery["references"] = [];
    for (const child of db
      .prepare(
        "SELECT r.ordinal,s.file,s.start,s.end,s.kind,r.consumerClass FROM inventory_reference_query_node r JOIN inventory_span s ON s.partition=r.partition AND s.ordinal=r.node WHERE r.partition=? AND r.owner=? ORDER BY r.ordinal",
      )
      .iterate(id, row.ordinal)) {
      if (child["ordinal"] !== references.length) {
        throw new SemanticInventoryError("native reference result sequence is incomplete");
      }
      references.push(referenceQuerySchema.shape.references.element.parse({ reference: spanRow.parse(child), consumerClass: child["consumerClass"] }));
    }
    if (references.length !== row.resultCount) {
      throw new SemanticInventoryError("native reference result coverage is incomplete");
    }
    children += references.length;
    assertReferenceSpans(db, id, [root, requested, ...references.map((result) => result.reference)]);
    yield referenceQuerySchema.parse({ root, query: requested, references });
  }
  if (pair === undefined) {
    assertReferenceCounts(db, id, ordinal, children);
  }
}
function assertReferenceCounts(db: DatabaseSync, id: string, queries: number, children: number): void {
  if (
    db.prepare("SELECT COUNT(*) AS count FROM inventory_reference_query WHERE partition=?").get(id)?.["count"] !== queries ||
    db.prepare("SELECT COUNT(*) AS count FROM inventory_reference_query_node WHERE partition=?").get(id)?.["count"] !== children
  ) {
    throw new SemanticInventoryError("native reference query ownership is incomplete or orphaned");
  }
}

function assertReferenceSpans(db: DatabaseSync, id: string, spans: readonly InventorySpan[]): void {
  for (const span of spans) {
    const source = capturedInventorySource(db, id, span.file);
    if (
      span.start < 0 ||
      span.end < span.start ||
      span.end > source.textLength ||
      db.prepare(INVOCATION_AVAILABLE_SQL).get(id, inventoryString(span.file)) === undefined
    ) {
      throw new SemanticInventoryError("native reference span is outside its captured native closure");
    }
  }
}

export function readInventoryShape(db: DatabaseSync, id: string, node: InventorySpan): InventoryPartition["shapes"][number] {
  const shape = inventoryShapes.read(createInventoryReadSession(db), id, [node]).get(inventorySpanKey(node));
  if (shape === undefined) {
    throw new SemanticInventoryError("native shape catalog span is unavailable");
  }
  return shape;
}

/** Coverage is the actual normalized query set, not family presence; one statement joins both spans of every pair. */
export function* readInventoryPairs(db: DatabaseSync, id: string, queryKey?: string): Iterable<InventoryPartition["pairs"][number]> {
  if (queryKey !== undefined) {
    const pair = inventoryPairs.read(createInventoryReadSession(db), id, [queryKey]).get(queryKey);
    if (pair !== undefined) {
      yield pair;
    }
    return;
  }
  requireInventoryFamily(db, id, "shape-pairs");
  for (const row of db.prepare(`SELECT ${PAIR_COLUMNS} FROM inventory_pair p ${PAIR_SPANS} WHERE p.partition=? ORDER BY p.ordinal`).iterate(id)) {
    yield pairOf(row);
  }
}

/** A present null row is a non-exported declaration, not missing native evidence. */
export function* readInventoryDeclarationOutputs(
  db: DatabaseSync,
  id: string,
  node: InventorySpan,
): Iterable<InventoryPartition["declarationOutputs"][number]> {
  const output = inventoryDeclarationOutputs.read(createInventoryReadSession(db), id, [node]).get(inventorySpanKey(node));
  if (output !== undefined) {
    yield output;
  }
}

/** Read one exporting file; declaration spans retain their importing-world identity. */
export function* readInventoryRuntimeExports(db: DatabaseSync, id: string, file: string): Iterable<InventoryPartition["runtimeExports"][number]> {
  yield* inventoryRuntimeExportsOf.read(createInventoryReadSession(db), id, [file]).get(file) ?? [];
}
