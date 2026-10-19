// THE COLUMN AND WRITER SIDE of open-JSON key parity: which `mode:"json"` columns are OPEN and what keys a
// typed one declares (`deriveSchema`), what key set a TYPE or a VALUE EXPRESSION names (`valueKeys` — AST
// first, checker type second; an open bag or a `sql` fragment is UNKNOWABLE), the per-column vocabulary
// those keys accumulate into (`Vocab`, `addWrite`), and the two TypeScript-side writer collections. Split
// out of `open-json-parity-fact.ts` at the size cap (2026-09-18); the SQL-side `json_set` writers stay with
// the SQL reader there because they share its templates. One-way: this module imports nothing from it.

import type { BinaryExpression, PropertyAssignment, Node as TsNode } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { DRIZZLE_UPSERT_VERB, DRIZZLE_WRITE_ARGUMENT_VERBS } from "../../floor/code-facts/drizzle-vocabulary.ts";
import type { SchemaProjectedColumn, SchemaProjectedModel } from "../../floor/code-facts/schema-projection-contract.ts";
import type { NativeTypeVocabulary } from "../../floor/code-facts/type-projection-contract.ts";
import type {
  NativeValueObservationReaders,
  ProjectedStoredValueMember,
  ProjectedStoredValueShape,
} from "../../floor/code-facts/value-observation-contract.ts";

export interface OpenJsonColumn {
  readonly table: string; // the drizzle table VARIABLE name
  readonly prop: string; // the camel property name
  readonly sqlName: string; // the snake column name (what SQL text spells)
  readonly open: boolean;
  readonly node: TsNode; // the schema PropertyAssignment — where "close the type" is done
  readonly declared: ReadonlySet<string> | undefined; // a TYPED column's own key vocabulary (undefined = unknowable)
}

export interface Schema {
  readonly columns: readonly OpenJsonColumn[];
  /** drizzle table VARIABLE → its SQL table name (what a raw-SQL FROM/JOIN spells). */
  readonly tables: ReadonlyMap<string, string>;
}

const OPEN_JSON_TYPE = /(?:^|\|)\s*(?:unknown|JsonValue|Record<\s*string\s*,)/u;

function explicitlyOpenJsonType(typeText: string | undefined): boolean {
  return typeText === undefined || OPEN_JSON_TYPE.test(typeText.replaceAll("readonly ", ""));
}

function declaredKeys(column: SchemaProjectedColumn, open: boolean): ReadonlySet<string> | undefined {
  if (open) {
    return;
  }
  if (column.json?.shape.kind === "closed") {
    return new Set(column.json.shape.keys);
  }
  if (column.typeOverride === null) {
    return new Set();
  }
  const vocabulary = column.typeOverride.vocabulary;
  if (vocabulary === undefined) {
    throw new Error("native schema selected-Type vocabulary is unavailable");
  }
  return new Set(vocabulary.properties);
}

/** The open-JSON columns of a drizzle schema model and the table-variable → SQL-name map raw SQL is resolved against. */
export function deriveSchema(model: SchemaProjectedModel): Schema {
  const columns: OpenJsonColumn[] = [];
  const tables = new Map<string, string>();
  for (const table of model.tables) {
    tables.set(table.identity.declarationName, table.sqlName.toLowerCase());
    for (const column of table.columns) {
      if (column.json === null) {
        continue;
      }
      const shape = column.json.shape;
      const open = shape.kind === "open" && explicitlyOpenJsonType(column.typeOverride?.node.getText());
      columns.push({
        table: table.identity.declarationName,
        prop: column.identity.propertyName,
        sqlName: column.sqlName,
        open,
        node: column.declaration,
        declared: declaredKeys(column, open),
      });
    }
  }
  return { columns, tables };
}

/** A stored PRIMITIVE (or an array of anything) names no top-level key — `settings.value`'s `JsonValue`
 *  string arm and `automation_rules.actions` are the live shapes. Without this, `getProperties()` returns
 *  the String/Array PROTOTYPE (`charAt`, `padEnd`, `flatMap`, …) and every such column claims a 40-key
 *  vocabulary it does not have — a false GREEN factory, the permissive direction (tooling/src/verify/gates/GATE-AUTHORING.md §5). */
function namesNoKey(arm: NativeTypeVocabulary["arms"][number]): boolean {
  return arm.string || arm.number || arm.boolean || arm.literal || arm.array || arm.tuple || arm.null || arm.undefined;
}

/** Vocabulary reduction remains the policy's judgment over complete native arm observations. */
function typeKeys(t: NativeTypeVocabulary): ReadonlySet<string> | undefined {
  const out = new Set<string>();
  for (const arm of t.arms) {
    if (namesNoKey(arm)) {
      continue;
    }
    if (arm.any || isOpenBagArm(arm) || arm.symbolName === "SQL") {
      return;
    }
    for (const name of arm.properties) {
      out.add(name);
    }
  }
  return out;
}

// ── the writer vocabulary ───────────────────────────────────────────────────────────────────────────────
export interface Vocab {
  readonly keys: Set<string>;
  opaque: boolean; // at least one writer's value shape is unknowable
}

const MAX_HOP = 2;

/** The KEY SET a value expression stores, or undefined when it is unknowable. AST first (a literal shape is
 *  exact), TYPE second (a named type is exact too — and an open-bag type is precisely what "unknowable"
 *  means here, which is the UNPROVABLE arm's whole signal). */
function memberShapeKeys(member: ProjectedStoredValueMember, hop: number): ReadonlySet<string> | undefined {
  if (member.kind === "spread") {
    return shapeKeys(member.value, hop + 1);
  }
  if (member.kind === "computed") {
    return;
  }
  return new Set(member.kind === "named" ? [member.name] : []);
}

function shapeKeys(fact: ProjectedStoredValueShape, hop: number): ReadonlySet<string> | undefined {
  if (fact.kind === "sql" || fact.kind === "unresolved") {
    return;
  }
  if (fact.kind === "empty") {
    return new Set();
  }
  if (fact.kind === "object") {
    return fact.members.map((member) => memberShapeKeys(member, hop)).reduce(unionKeys, new Set<string>());
  }
  if (fact.kind === "choice") {
    return fact.values.map((value) => shapeKeys(value, hop)).reduce(unionKeys);
  }
  if ((fact.kind === "call" || fact.kind === "binding") && hop < MAX_HOP) {
    return fact.values.map((value) => shapeKeys(value, hop + 1)).reduce(unionKeys);
  }
  return typeKeys(fact.type);
}

function valueKeys(expr: TsNode | undefined, read: (node: TsNode) => ProjectedStoredValueShape): ReadonlySet<string> | undefined {
  return expr === undefined ? new Set() : shapeKeys(read(expr), 0);
}

function unionKeys(a: ReadonlySet<string> | undefined, b: ReadonlySet<string> | undefined): ReadonlySet<string> | undefined {
  return a === undefined || b === undefined ? undefined : new Set([...a, ...b]);
}

// ── writer collection ───────────────────────────────────────────────────────────────────────────────────
/** The write methods whose argument carries a column's value; a `select({…})` projection carries none. */
const WRITE_CALLEES: ReadonlySet<string> = new Set([...DRIZZLE_WRITE_ARGUMENT_VERBS, DRIZZLE_UPSERT_VERB]);

/** The drizzle write a property assignment sits in (`.set({…})` / `.values({…})` / `onConflictDoUpdate({ set: {…} })`):
 *  the enclosing call's own drizzle write, `resolved(null)` when that call is no drizzle write, or the refusal. */
const MAX_ANCESTOR_HOPS = 8; // object literal → property → nested object → argument: a write is always closer than this

export function enclosingWriteCall(prop: TsNode): import("ts-morph").CallExpression | undefined {
  return enclosingWrite(prop, (call) => call);
}

function enclosingWrite<Value>(prop: TsNode, read: (call: import("ts-morph").CallExpression) => Value): Value | undefined {
  let cur: TsNode | undefined = prop.getParent();
  let write: Value | undefined;
  for (let depth = 0; cur !== undefined && write === undefined && depth < MAX_ANCESTOR_HOPS; depth += 1) {
    const here = cur.asKind(SyntaxKind.CallExpression);
    const callee = here?.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    write = here !== undefined && callee !== undefined && WRITE_CALLEES.has(callee.getName()) ? read(here) : undefined;
    cur = here === undefined ? cur.getParent() : undefined;
  }
  return write;
}

function vocabOf(vocabs: Map<string, Vocab>, key: string): Vocab {
  const found = vocabs.get(key);
  if (found !== undefined) {
    return found;
  }
  const fresh: Vocab = { keys: new Set(), opaque: false };
  vocabs.set(key, fresh);
  return fresh;
}

export function addWrite(vocabs: Map<string, Vocab>, targets: readonly OpenJsonColumn[], keys: ReadonlySet<string> | undefined): void {
  for (const col of targets) {
    const v = vocabOf(vocabs, colKey(col));
    if (keys === undefined) {
      v.opaque = true;
    } else {
      for (const k of keys) {
        v.keys.add(k);
      }
    }
  }
}

export const colKey = (c: OpenJsonColumn): string => `${c.table}.${c.prop}`;

/** Every writer's key contribution, per column. A write whose table is unresolvable contributes to EVERY
 *  column of that property name (the lenient direction — a missed writer would be a false accusation); a call
 *  drizzle does not declare is no writer at all. */
export function collectPropertyWrites(
  nodes: readonly PropertyAssignment[],
  byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>,
  vocabs: Map<string, Vocab>,
  read: Pick<NativeValueObservationReaders, "drizzleWrite" | "storedValue">,
): void {
  for (const pa of nodes) {
    const cols = byProp.get(pa.getName());
    const write = cols === undefined ? undefined : enclosingWrite(pa, read.drizzleWrite);
    if (cols === undefined || write === undefined || (write.kind === "resolved" && write.value === null)) {
      continue;
    }
    const table = write.kind === "resolved" ? write.value?.target.getText() : undefined;
    const attributed = table === undefined ? [] : cols.filter((c) => c.table === table);
    addWrite(vocabs, attributed.length > 0 ? attributed : cols, valueKeys(pa.getInitializer(), read.storedValue));
  }
}

/** The accumulator spelling a write helper uses (`const set: Partial<Row> = {}; set.metadata = …`) — the
 *  json-column-write-parity precedent. Name-keyed: it contributes to every column of that name. */
export function collectAccumulatorWrites(
  nodes: readonly BinaryExpression[],
  byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>,
  vocabs: Map<string, Vocab>,
  readValue: (node: TsNode) => ProjectedStoredValueShape,
): void {
  for (const bin of nodes) {
    const lhs = bin.getLeft().asKind(SyntaxKind.PropertyAccessExpression);
    const cols = lhs === undefined || bin.getOperatorToken().getText() !== "=" ? undefined : byProp.get(lhs.getName());
    if (cols !== undefined) {
      addWrite(vocabs, cols, valueKeys(bin.getRight(), readValue));
    }
  }
}

/** A NAMED type is a contract; an ANONYMOUS index-signature bag is not. That distinction is the whole
 *  thesis of the audit (§0: "wherever a persisted shape is TYPED, the type system already binds writer to
 *  reader"), and it is also the fence that keeps two whole families out of the reader index: a same-named
 *  local object (`const metadata = { a: 1 }; metadata.a`, no index signature at all) and a same-named
 *  FOREIGN bag that DOES carry one but under its own name (`payload: JWTPayload` in infra/auth — eleven
 *  false positives before this fence, every one of them a jose claim read, not a db column read). */
// `Record` is the MAPPED-TYPE spelling of an anonymous bag (it is what the schema's own `$type` writes), so
// it counts as anonymous; `__type`/`__object` are how the checker names a bare `{ [k: string]: … }`.
const ANONYMOUS_SYMBOLS: ReadonlySet<string> = new Set(["__type", "__object", "Record"]);

function isOpenBagArm(arm: NativeTypeVocabulary["arms"][number]): boolean {
  return arm.unknown || (arm.stringIndex && (arm.symbolName === null || ANONYMOUS_SYMBOLS.has(arm.symbolName)));
}

export function isOpenBag(t: NativeTypeVocabulary): boolean {
  return t.arms.some(isOpenBagArm);
}
