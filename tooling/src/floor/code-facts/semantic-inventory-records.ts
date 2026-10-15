// Native facts retain their order and multiplicity; only physical spans are interned for storage.

import { createHash } from "node:crypto";
import { z } from "zod";
import type { InventoryFactKind, InventoryPartition, InventoryRecord, InventoryRecordTable, InventorySpan } from "./semantic-inventory-contract.ts";
import {
  castRelationResultSchema,
  INVENTORY_FAMILIES,
  INVENTORY_FAMILY_FIELDS,
  INVENTORY_INPUT_KINDS,
  INVENTORY_LISTS,
  inputSchema,
  memberOriginSchema,
  partitionMetadataSchema,
  partitionSchema,
  shapePairKey,
  shapePairSchema,
  spanSchema,
} from "./semantic-inventory-contract.ts";

const exportRecordSchema = partitionSchema.shape.exports.element.omit({ declarations: true });
const moduleRecordSchema = partitionSchema.shape.modules.element.omit({ declarations: true, node: true });
const witnessRecordSchema = partitionSchema.shape.witnesses.element.omit({ declarations: true, node: true });
const referenceRecordSchema = partitionSchema.shape.references.element.omit({ declaration: true, reference: true });

const TEXT_CHARS = 16_384;
const MAX_TEXT_RECORD_CHARS = TEXT_CHARS * "\\u0000".length + '""'.length;
const PARTITION = "partition TEXT NOT NULL REFERENCES inventory_partition(id)";
const ORDINAL = "ordinal INTEGER NOT NULL";
const CONSUMER = "consumerClass TEXT NOT NULL CHECK(consumerClass IN ('product','tooling','test'))";
const SPAN_REFERENCE = "FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)";

export const inventoryRecordTables = {
  memberOrigin: {
    name: "inventory_member_origin",
    columns: "ordinal,node,name,leaf,origin,state,reason,detail,refusalNode,valueCount,traceCount,leafCount",
    definition: `${PARTITION},${ORDINAL},node INTEGER NOT NULL,name TEXT,leaf INTEGER,origin INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('resolved','unresolved')),reason TEXT,detail TEXT,refusalNode INTEGER,valueCount INTEGER NOT NULL CHECK(valueCount>=0),traceCount INTEGER NOT NULL CHECK(traceCount>=0),leafCount INTEGER CHECK(leafCount>=0),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),${SPAN_REFERENCE},FOREIGN KEY(partition,leaf) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,origin) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,refusalNode) REFERENCES inventory_span(partition,ordinal),CHECK((state='resolved' AND name IS NOT NULL AND reason IS NULL AND detail IS NULL AND refusalNode IS NULL AND valueCount>0) OR (state='unresolved' AND reason IS NOT NULL AND detail IS NOT NULL AND refusalNode IS NOT NULL AND valueCount=0))`,
  },
  memberDeclaration: {
    name: "inventory_member_declaration",
    columns: "owner,role,ordinal,node",
    definition: `${PARTITION},owner INTEGER NOT NULL,role TEXT NOT NULL CHECK(role IN ('value','trace')),${ORDINAL},node INTEGER NOT NULL,PRIMARY KEY(partition,owner,role,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_member_origin(partition,ordinal),${SPAN_REFERENCE}`,
  },
  declarationOutput: {
    name: "inventory_declaration_output",
    columns: "ordinal,node,unknownOutput",
    definition: `${PARTITION},${ORDINAL},node INTEGER NOT NULL,unknownOutput INTEGER CHECK(unknownOutput IN (0,1)),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),${SPAN_REFERENCE}`,
  },
  shape: {
    name: "inventory_shape",
    columns: "ordinal,node,copyObject,respellObject",
    definition: `${PARTITION},${ORDINAL},node INTEGER NOT NULL,copyObject INTEGER NOT NULL CHECK(copyObject IN (0,1)),respellObject INTEGER NOT NULL CHECK(respellObject IN (0,1)),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),${SPAN_REFERENCE}`,
  },
  shapeField: {
    name: "inventory_shape_field",
    columns: "owner,mode,ordinal,name,type",
    definition: `${PARTITION},owner INTEGER NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('copy','respell')),${ORDINAL},name TEXT NOT NULL,type TEXT NOT NULL,PRIMARY KEY(partition,owner,mode,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_shape(partition,ordinal)`,
  },
  shapeOrigin: {
    name: "inventory_shape_origin",
    columns: "owner,kind,ordinal,value",
    definition: `${PARTITION},owner INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('direct','queries')),${ORDINAL},value TEXT NOT NULL,PRIMARY KEY(partition,owner,kind,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_shape(partition,ordinal)`,
  },
  pair: {
    name: "inventory_pair",
    columns: "ordinal,key,leftNode,rightNode,leftField,rightField,projection,lenient,state,reason,a,b,c,d",
    definition: `${PARTITION},${ORDINAL},key TEXT NOT NULL,leftNode INTEGER NOT NULL,rightNode INTEGER NOT NULL,leftField TEXT,rightField TEXT,projection TEXT NOT NULL CHECK(projection IN ('mutual','relation')),lenient INTEGER NOT NULL CHECK(lenient IN (0,1)),state TEXT NOT NULL CHECK(state IN ('answer','no-comparable','unavailable')),reason TEXT,a INTEGER CHECK(a IN (0,1)),b INTEGER CHECK(b IN (0,1)),c INTEGER CHECK(c IN (0,1)),d INTEGER CHECK(d IN (0,1)),CHECK((state='answer' AND reason IS NULL AND a IS NOT NULL AND ((projection='mutual' AND b IS NULL AND c IS NULL AND d IS NULL) OR (projection='relation' AND b IS NOT NULL AND c IS NOT NULL AND d IS NOT NULL))) OR (state='no-comparable' AND projection='relation' AND reason IS NULL AND a IS NULL AND b IS NULL AND c IS NULL AND d IS NULL) OR (state='unavailable' AND reason IN ('primitive-absent','node-absent') AND a IS NULL AND b IS NULL AND c IS NULL AND d IS NULL)),PRIMARY KEY(partition,ordinal),UNIQUE(partition,key),FOREIGN KEY(partition,leftNode) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,rightNode) REFERENCES inventory_span(partition,ordinal)`,
  },
  runtimeExport: {
    name: "inventory_runtime_export",
    columns: "ordinal,file,name,node,callable,initializerKind,initializerCallable",
    definition: `${PARTITION},${ORDINAL},file TEXT NOT NULL,name TEXT NOT NULL,node INTEGER NOT NULL,callable INTEGER NOT NULL CHECK(callable IN (0,1)),initializerKind INTEGER,initializerCallable INTEGER CHECK(initializerCallable IN (0,1)),PRIMARY KEY(partition,ordinal),${SPAN_REFERENCE},CHECK((initializerKind IS NULL AND initializerCallable IS NULL) OR (initializerKind IS NOT NULL AND initializerCallable IS NOT NULL))`,
  },
  brand: {
    name: "inventory_brand",
    columns: "ordinal,node,brand",
    definition: `${PARTITION},${ORDINAL},node INTEGER NOT NULL,brand TEXT,PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),${SPAN_REFERENCE}`,
  },
  family: {
    name: "inventory_family",
    columns: "ordinal,name",
    definition: `${PARTITION},${ORDINAL},name TEXT NOT NULL CHECK(name IN (${INVENTORY_FAMILIES.map((family) => `'${family}'`).join(",")})),PRIMARY KEY(partition,ordinal),UNIQUE(partition,name)`,
  },
  cast: {
    name: "inventory_cast",
    columns: "ordinal,node,leftToRight,rightToLeft,leftIsAny,rightIsAny,reason",
    definition: `${PARTITION},${ORDINAL},node INTEGER NOT NULL,leftToRight INTEGER CHECK(leftToRight IN (0,1)),rightToLeft INTEGER CHECK(rightToLeft IN (0,1)),leftIsAny INTEGER CHECK(leftIsAny IN (0,1)),rightIsAny INTEGER CHECK(rightIsAny IN (0,1)),reason TEXT,PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),${SPAN_REFERENCE},CHECK((reason IS NULL AND leftToRight IS NOT NULL AND rightToLeft IS NOT NULL AND leftIsAny IS NOT NULL AND rightIsAny IS NOT NULL) OR (reason='primitive-absent' AND leftToRight IS NULL AND rightToLeft IS NULL AND leftIsAny IS NULL AND rightIsAny IS NULL))`,
  },
  descriptor: {
    name: "inventory_descriptor",
    columns: "program,descriptorVersion,compilerOptionsJson,workerPid,intent",
    definition: `${PARTITION} PRIMARY KEY,program TEXT NOT NULL,descriptorVersion TEXT NOT NULL,compilerOptionsJson TEXT NOT NULL,workerPid INTEGER,intent TEXT NOT NULL CHECK(intent IN ('facts','membership'))`,
  },
  list: {
    name: "inventory_list",
    columns: "kind,ordinal,value",
    definition: `${PARTITION},kind TEXT NOT NULL CHECK(kind IN ('configPaths','projectReferences','roots','nativeRoots','available')),${ORDINAL},value TEXT NOT NULL,PRIMARY KEY(partition,kind,ordinal)`,
  },
  input: {
    name: "inventory_input",
    columns: "ordinal,path,kind,version",
    definition: `${PARTITION},${ORDINAL},path TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN (${INVENTORY_INPUT_KINDS.map((kind) => `'${kind}'`).join(",")})),version TEXT NOT NULL,PRIMARY KEY(partition,ordinal)`,
  },
  source: {
    name: "inventory_source",
    columns: "ordinal,file,path,consumerClass,authored,textVersion,textLength,textParts",
    definition: `${PARTITION},${ORDINAL},file TEXT NOT NULL,path TEXT NOT NULL,${CONSUMER},authored INTEGER NOT NULL CHECK(authored IN (0,1)),textVersion TEXT NOT NULL,textLength INTEGER NOT NULL,textParts INTEGER NOT NULL,PRIMARY KEY(partition,ordinal)`,
  },
  text: {
    name: "inventory_text",
    columns: "source,ordinal,value",
    definition: `${PARTITION},source INTEGER NOT NULL,${ORDINAL},value TEXT NOT NULL CHECK(json_valid(value) AND json_type(value)='text' AND length(value)<=${MAX_TEXT_RECORD_CHARS}),PRIMARY KEY(partition,source,ordinal),FOREIGN KEY(partition,source) REFERENCES inventory_source(partition,ordinal)`,
  },
  span: {
    name: "inventory_span",
    columns: "ordinal,file,start,end,kind",
    definition: `${PARTITION},${ORDINAL},file TEXT NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,kind INTEGER NOT NULL,PRIMARY KEY(partition,ordinal),UNIQUE(partition,file,start,end,kind)`,
  },
  fact: {
    name: "inventory_fact",
    columns: "kind,ordinal,file,name,node,target,dynamic,specifier",
    definition: `${PARTITION},kind TEXT NOT NULL CHECK(kind IN ('exports','modules','bindings','witnesses')),${ORDINAL},file TEXT,name TEXT,node INTEGER,target TEXT,dynamic INTEGER CHECK(dynamic IN (0,1)),specifier TEXT,PRIMARY KEY(partition,kind,ordinal),${SPAN_REFERENCE},CHECK((kind='exports' AND file IS NOT NULL AND name IS NOT NULL AND node IS NULL AND target IS NULL AND dynamic IS NULL AND specifier IS NULL) OR (kind='modules' AND file IS NULL AND name IS NULL AND node IS NOT NULL AND dynamic IS NOT NULL) OR (kind='bindings' AND file IS NULL AND name IS NULL AND node IS NOT NULL AND target IS NULL AND dynamic IS NULL AND specifier IS NULL) OR (kind='witnesses' AND file IS NULL AND name IS NOT NULL AND node IS NOT NULL AND target IS NULL AND dynamic IS NULL AND specifier IS NULL))`,
  },
  declaration: {
    name: "inventory_declaration",
    columns: "kind,owner,role,ordinal,node",
    definition: `${PARTITION},kind TEXT NOT NULL,owner INTEGER NOT NULL,role TEXT NOT NULL,${ORDINAL},node INTEGER NOT NULL,PRIMARY KEY(partition,kind,owner,role,ordinal),FOREIGN KEY(partition,kind,owner) REFERENCES inventory_fact(partition,kind,ordinal),${SPAN_REFERENCE},CHECK((kind='bindings' AND role IN ('lexical','origins')) OR (kind IN ('exports','modules','witnesses') AND role='declarations'))`,
  },
  reference: {
    name: "inventory_reference",
    columns: "ordinal,declaration,node,consumerClass",
    definition: `${PARTITION},${ORDINAL},declaration INTEGER NOT NULL,node INTEGER NOT NULL,${CONSUMER},PRIMARY KEY(partition,ordinal),FOREIGN KEY(partition,declaration) REFERENCES inventory_span(partition,ordinal),${SPAN_REFERENCE}`,
  },
} satisfies Record<InventoryRecordTable, { readonly name: string; readonly columns: string; readonly definition: string }>;

/** SQLite TEXT is UTF-8; scalar JSON escapes preserve native lone UTF-16 surrogates. */
export function inventoryString(value: string): string {
  return JSON.stringify(value);
}

export const inventoryStringSchema = z.string().transform((value) => z.string().parse(JSON.parse(value)));

/** JSON is bounded to one source-text fragment, never a source collection or a partition. */
export function* inventoryTextParts(text: string): Iterable<string> {
  for (let start = 0; start < Math.max(1, text.length); start += TEXT_CHARS) {
    yield inventoryString(text.slice(start, start + TEXT_CHARS));
  }
}

/** Hash the same ordered fragment representation that is persisted, including lone surrogate code units. */
export function inventoryTextVersion(parts: Iterable<string>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(`${String(part.length)}:`).update(part);
  }
  return hash.digest("hex");
}

/** Stream normalized rows to hashing or SQLite without constructing a serialized population. */
export function visitInventoryRecords(partition: InventoryPartition, write: (record: InventoryRecord) => void): void {
  const metadata = partitionMetadataSchema.parse(partition);
  if ((metadata.intent === "membership") !== (metadata.families.length === 0)) {
    throw new Error("native membership and typed fact intent disagree");
  }
  for (const family of INVENTORY_FAMILIES) {
    if (!metadata.families.includes(family) && partition[INVENTORY_FAMILY_FIELDS[family]].length > 0) {
      throw new Error(`native inventory populated an undeclared family: ${family}`);
    }
  }
  const emit = (table: InventoryRecordTable, ...values: InventoryRecord["values"]): void => write({ table, values });
  emit(
    "descriptor",
    inventoryString(metadata.program),
    inventoryString(metadata.descriptorVersion),
    inventoryString(metadata.compilerOptionsJson),
    metadata.workerPid ?? null,
    metadata.intent,
  );
  metadata.families.forEach((family, ordinal) => {
    emit("family", ordinal, family);
  });
  for (const kind of INVENTORY_LISTS) {
    metadata[kind].forEach((value, ordinal) => {
      emit("list", kind, ordinal, inventoryString(value));
    });
  }
  partition.inputs.forEach((entry, ordinal) => {
    const input = inputSchema.parse(entry);
    emit("input", ordinal, inventoryString(input.path), input.kind, inventoryString(input.version));
  });
  partition.sources.forEach((entry, ordinal) => {
    const source = partitionSchema.shape.sources.element.parse(entry);
    emit(
      "source",
      ordinal,
      inventoryString(source.file),
      inventoryString(source.path),
      source.consumerClass,
      Number(source.authored),
      inventoryString(inventoryTextVersion(inventoryTextParts(source.text))),
      source.text.length,
      Math.max(1, Math.ceil(source.text.length / TEXT_CHARS)),
    );
    let index = 0;
    for (const part of inventoryTextParts(source.text)) {
      emit("text", ordinal, index++, part);
    }
  });
  const spans = new Map<string, number>();
  const frozenSpans = new WeakMap<InventorySpan, number>();
  const spanId = (value: InventorySpan): number => {
    const cached = frozenSpans.get(value);
    if (cached !== undefined) {
      return cached;
    }
    const span = spanSchema.parse(value);
    const key = JSON.stringify([span.file, span.start, span.end, span.kind]);
    const existing = spans.get(key);
    if (existing !== undefined) {
      if (Object.isFrozen(value)) {
        frozenSpans.set(value, existing);
      }
      return existing;
    }
    const ordinal = spans.size;
    spans.set(key, ordinal);
    if (Object.isFrozen(value)) {
      frozenSpans.set(value, ordinal);
    }
    emit("span", ordinal, inventoryString(span.file), span.start, span.end, span.kind);
    return ordinal;
  };
  const declarations = (kind: InventoryFactKind, owner: number, role: string, values: readonly InventorySpan[]): void => {
    values.forEach((value, ordinal) => {
      emit("declaration", kind, owner, role, ordinal, spanId(value));
    });
  };
  partition.exports.forEach((entry, ordinal) => {
    const fact = exportRecordSchema.parse(entry);
    emit("fact", "exports", ordinal, inventoryString(fact.file), inventoryString(fact.name), null, null, null, null);
    declarations("exports", ordinal, "declarations", entry.declarations);
  });
  partition.modules.forEach((entry, ordinal) => {
    const fact = moduleRecordSchema.parse(entry);
    emit(
      "fact",
      "modules",
      ordinal,
      null,
      null,
      spanId(entry.node),
      fact.target === null ? null : inventoryString(fact.target),
      Number(fact.dynamic),
      fact.specifier === null ? null : inventoryString(fact.specifier),
    );
    declarations("modules", ordinal, "declarations", entry.declarations);
  });
  const bindingCounts = new Map<number, number | null>();
  partition.bindings.forEach((entry, ordinal) => {
    const node = spanId(entry.node);
    bindingCounts.set(node, bindingCounts.has(node) ? null : entry.symbols.lexical.length);
    emit("fact", "bindings", ordinal, null, null, node, null, null, null);
    declarations("bindings", ordinal, "lexical", entry.symbols.lexical);
    declarations("bindings", ordinal, "origins", entry.symbols.origins);
  });
  partition.witnesses.forEach((entry, ordinal) => {
    const fact = witnessRecordSchema.parse(entry);
    emit("fact", "witnesses", ordinal, null, inventoryString(fact.name), spanId(entry.node), null, null, null);
    declarations("witnesses", ordinal, "declarations", entry.declarations);
  });
  partition.brands.forEach((entry, ordinal) => {
    const fact = partitionSchema.shape.brands.element.parse(entry);
    emit("brand", ordinal, spanId(fact.node), fact.brand === null ? null : inventoryString(fact.brand));
  });
  partition.declarationOutputs.forEach((entry, ordinal) => {
    const fact = partitionSchema.shape.declarationOutputs.element.parse(entry);
    emit("declarationOutput", ordinal, spanId(fact.node), fact.unknown === null ? null : Number(fact.unknown));
  });
  partition.memberOrigins.forEach((entry, ordinal) => {
    const fact = memberOriginSchema.parse(entry);
    const result = fact.result;
    const outcome =
      result.kind === "resolved"
        ? [result.kind, null, null, null, result.declarations.length]
        : [result.kind, result.reason, inventoryString(result.detail), spanId(result.node), 0];
    const leaf = fact.leaf === null ? null : spanId(fact.leaf);
    const leafCount = leaf === null ? null : bindingCounts.get(leaf);
    if (metadata.families.includes("bindings") && leaf !== null && (leafCount === null || leafCount === undefined)) {
      throw new Error("native call member leaf binding is unavailable in its native partition");
    }
    emit(
      "memberOrigin",
      ordinal,
      spanId(fact.node),
      fact.name === null ? null : inventoryString(fact.name),
      leaf,
      spanId(fact.trace.origin),
      ...outcome,
      fact.trace.declarations.length,
      leafCount ?? null,
    );
    fact.trace.declarations.forEach((node, index) => {
      emit("memberDeclaration", ordinal, "trace", index, spanId(node));
    });
    if (result.kind === "resolved") {
      result.declarations.forEach((node, index) => {
        emit("memberDeclaration", ordinal, "value", index, spanId(node));
      });
    }
  });
  partition.shapes.forEach((shape, ordinal) => {
    emit("shape", ordinal, spanId(shape.node), Number(shape.copy !== null), Number(shape.respell !== null));
    for (const mode of ["copy", "respell"] as const) {
      shape[mode]?.forEach((field, index) => {
        emit("shapeField", ordinal, mode, index, inventoryString(field.name), inventoryString(field.type));
      });
    }
    for (const kind of ["direct", "queries"] as const) {
      shape[kind].forEach((value, index) => {
        emit("shapeOrigin", ordinal, kind, index, inventoryString(value));
      });
    }
  });
  partition.pairs.forEach((entry, ordinal) => {
    const { query, result } = shapePairSchema.parse(entry);
    const values = result.kind === "answer" ? result.values : [];
    emit(
      "pair",
      ordinal,
      inventoryString(shapePairKey(query)),
      spanId(query.left),
      spanId(query.right),
      query.leftField === null ? null : inventoryString(query.leftField),
      query.rightField === null ? null : inventoryString(query.rightField),
      query.projection,
      Number(query.lenient),
      result.kind,
      result.kind === "unavailable" ? result.reason : null,
      ...Array.from({ length: 4 }, (_, index) => (values[index] === undefined ? null : Number(values[index]))),
    );
  });
  partition.runtimeExports.forEach((entry, ordinal) => {
    const fact = partitionSchema.shape.runtimeExports.element.parse(entry);
    emit(
      "runtimeExport",
      ordinal,
      inventoryString(fact.file),
      inventoryString(fact.name),
      spanId(fact.declaration),
      Number(fact.callable),
      fact.initializer?.kind ?? null,
      fact.initializer === null ? null : Number(fact.initializer.callable),
    );
  });
  partition.casts.forEach((entry, ordinal) => {
    const result = castRelationResultSchema.parse(entry.result);
    const values =
      result.kind === "resolved"
        ? [Number(result.value.leftToRight), Number(result.value.rightToLeft), Number(result.value.leftIsAny), Number(result.value.rightIsAny), null]
        : [null, null, null, null, result.reason];
    emit("cast", ordinal, spanId(entry.node), ...values);
  });
  partition.references.forEach((entry, ordinal) => {
    const fact = referenceRecordSchema.parse(entry);
    emit("reference", ordinal, spanId(entry.declaration), spanId(entry.reference), fact.consumerClass);
  });
}
