// THE COLUMN AND WRITER SIDE of open-JSON key parity: which `mode:"json"` columns are OPEN and what keys a
// typed one declares (`deriveSchema`), what key set a TYPE or a VALUE EXPRESSION names (`valueKeys` — AST
// first, checker type second; an open bag or a `sql` fragment is UNKNOWABLE), the per-column vocabulary
// those keys accumulate into (`Vocab`, `addWrite`), and the two TypeScript-side writer collections. Split
// out of `open-json-parity-fact.ts` at the size cap (2026-09-18); the SQL-side `json_set` writers stay with
// the SQL reader there because they share its templates. One-way: this module imports nothing from it.
import type { BinaryExpression, CallExpression, PropertyAssignment, Node as TsNode, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SchemaModel } from "../contract/schema-fact.ts";

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

// The inline import type is deliberate: named as `SchemaColumn`, biome's typed `noUnnecessaryConditions`
// misreads the nullable `json` field below as non-nullish; the original spelling kept the rule honest.
function declaredKeys(column: import("../contract/schema-fact.ts").SchemaColumn, open: boolean): ReadonlySet<string> | undefined {
  if (open) {
    return;
  }
  if (column.json?.shape.kind === "closed") {
    return new Set(column.json.shape.keys);
  }
  return new Set(column.typeOverride?.type.getProperties().map((property) => property.getName()) ?? []);
}

/** The open-JSON columns of a drizzle schema model and the table-variable → SQL-name map raw SQL is resolved against. */
export function deriveSchema(model: SchemaModel): Schema {
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
function namesNoKey(arm: Type): boolean {
  return arm.isString() || arm.isNumber() || arm.isBoolean() || arm.isLiteral() || arm.isArray() || arm.isTuple() || arm.isNull() || arm.isUndefined();
}

/** A drizzle `SQL` expression (the value a `sql`-tagged template or `sql.raw(…)` produces). Its stored key
 *  set is a raw json_set/json_patch fragment the checker cannot read, so it is UNKNOWABLE — never the SQL
 *  class's own PROTOTYPE methods (queryChunks/getSQL/mapWith/…), which is the exact prototype-vocabulary
 *  false-positive the `namesNoKey` guard already fences off for String/Array. `.set({ col: sql`json_set(…)` })`
 *  is the live carrier (the D148 `writePluginCardData` per-card-state merge). */
function isDrizzleSqlArm(arm: Type): boolean {
  return (arm.getAliasSymbol()?.getName() ?? arm.getSymbol()?.getName()) === "SQL";
}

/** Every property name a TYPE names, or undefined when the type is itself an open bag / unresolvable. */
function typeKeys(t: Type): ReadonlySet<string> | undefined {
  const arms = t.isUnion() ? t.getUnionTypes() : [t];
  const out = new Set<string>();
  let unknowable = false;
  for (const arm of arms) {
    if (namesNoKey(arm)) {
      continue;
    }
    if (arm.isAny() || isOpenBagArm(arm) || isDrizzleSqlArm(arm)) {
      unknowable = true;
      break;
    }
    for (const p of arm.getProperties()) {
      out.add(p.getName());
    }
  }
  return unknowable ? undefined : out;
}

// ── the writer vocabulary ───────────────────────────────────────────────────────────────────────────────
export interface Vocab {
  readonly keys: Set<string>;
  opaque: boolean; // at least one writer's value shape is unknowable
}

/** Strip the wrappers that never change a value's shape. */
export function unwrap(node: TsNode): TsNode {
  let cur = node;
  for (;;) {
    if (Node.isParenthesizedExpression(cur) || Node.isAsExpression(cur) || Node.isNonNullExpression(cur) || Node.isSatisfiesExpression(cur)) {
      cur = cur.getExpression();
    } else {
      return cur;
    }
  }
}

const MAX_HOP = 2;

/** The KEY SET a value expression stores, or undefined when it is unknowable. AST first (a literal shape is
 *  exact), TYPE second (a named type is exact too — and an open-bag type is precisely what "unknowable"
 *  means here, which is the UNPROVABLE arm's whole signal). */
function valueKeys(expr: TsNode | undefined, hop: number): ReadonlySet<string> | undefined {
  if (expr === undefined) {
    return new Set();
  }
  const node = unwrap(expr);
  if (Node.isTaggedTemplateExpression(node)) {
    return; // a `sql`-tagged raw fragment (json_set/json_patch) — an UNKNOWABLE key set, never the SQL prototype
  }
  if (node.getKind() === SyntaxKind.NullKeyword || node.getText() === "undefined") {
    return new Set(); // a CLEAR writes no keys
  }
  if (Node.isObjectLiteralExpression(node)) {
    return objectLiteralKeys(node, hop);
  }
  if (Node.isConditionalExpression(node)) {
    return unionKeys(valueKeys(node.getWhenTrue(), hop), valueKeys(node.getWhenFalse(), hop));
  }
  if (hop < MAX_HOP && Node.isIdentifier(node)) {
    const via = identifierValue(node);
    if (via !== undefined) {
      return valueKeys(via, hop + 1);
    }
  }
  if (hop < MAX_HOP && Node.isCallExpression(node)) {
    const returned = returnedValues(node);
    if (returned.length > 0) {
      return returned.map((r) => valueKeys(r, hop + 1)).reduce(unionKeys);
    }
  }
  return typeKeys(node.getType());
}

function unionKeys(a: ReadonlySet<string> | undefined, b: ReadonlySet<string> | undefined): ReadonlySet<string> | undefined {
  return a === undefined || b === undefined ? undefined : new Set([...a, ...b]);
}

/** One object-literal member's key contribution: a spread RECURSES (an open-bag spread makes the whole
 *  literal unknowable), a computed key names nothing statically, a plain/shorthand key is itself. */
function memberKeys(prop: TsNode, hop: number): ReadonlySet<string> | undefined {
  if (Node.isSpreadAssignment(prop)) {
    return valueKeys(prop.getExpression(), hop + 1);
  }
  if (Node.isPropertyAssignment(prop)) {
    return Node.isComputedPropertyName(prop.getNameNode()) ? undefined : new Set([prop.getName()]);
  }
  return Node.isShorthandPropertyAssignment(prop) ? new Set([prop.getName()]) : new Set();
}

function objectLiteralKeys(obj: TsNode, hop: number): ReadonlySet<string> | undefined {
  return obj
    .asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    .getProperties()
    .map((prop) => memberKeys(prop, hop))
    .reduce(unionKeys, new Set<string>());
}

/** The initializer a same-file `const`/`let` binds, one hop. */
function identifierValue(id: TsNode): TsNode | undefined {
  return id
    .asKindOrThrow(SyntaxKind.Identifier)
    .getDefinitionNodes()
    .flatMap((def) => {
      const init = def.asKind(SyntaxKind.VariableDeclaration)?.getInitializer();
      return init === undefined ? [] : [init];
    })
    .at(0);
}

/** Every expression a locally-declared callee RETURNS, one hop. */
function returnedValues(call: CallExpression): TsNode[] {
  const callee = unwrap(call.getExpression());
  if (!Node.isIdentifier(callee)) {
    return [];
  }
  const out: TsNode[] = [];
  for (const def of callee.getDefinitionNodes()) {
    if (!(Node.isFunctionDeclaration(def) || Node.isVariableDeclaration(def))) {
      continue;
    }
    for (const ret of def.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
      const e = ret.getExpression();
      if (e !== undefined) {
        out.push(e);
      }
    }
  }
  return out;
}

// ── writer collection ───────────────────────────────────────────────────────────────────────────────────
const WRITE_CALLEES: ReadonlySet<string> = new Set(["set", "values", "onConflictDoUpdate"]);

/** The drizzle table variable a `.set(`/`.values(` chain targets — walk back to `.update(<t>)`/`.insert(<t>)`. */
const TABLE_CALLEES: ReadonlySet<string> = new Set(["update", "insert"]);

function targetTable(node: TsNode): string | undefined {
  let cur: TsNode | undefined = node;
  let table: string | undefined;
  while (cur !== undefined && table === undefined) {
    const here = cur.asKind(SyntaxKind.CallExpression);
    const callee = here?.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    const arg = callee !== undefined && TABLE_CALLEES.has(callee.getName()) ? here?.getArguments()[0] : undefined;
    table = arg === undefined ? undefined : unwrap(arg).getText();
    cur = Node.isCallExpression(cur) || Node.isPropertyAccessExpression(cur) ? cur.getExpression() : undefined;
  }
  return table;
}

/** Is this property assignment inside a drizzle WRITE argument (`.set({…})` / `.values({…})` /
 *  `onConflictDoUpdate({ set: {…} })`)? Returns the write CALL, else undefined. */
const MAX_ANCESTOR_HOPS = 8; // object literal → property → nested object → argument: a write is always closer than this

function enclosingWriteCall(prop: TsNode): CallExpression | undefined {
  let cur: TsNode | undefined = prop.getParent();
  let call: CallExpression | undefined;
  for (let depth = 0; cur !== undefined && call === undefined && depth < MAX_ANCESTOR_HOPS; depth += 1) {
    const here = cur.asKind(SyntaxKind.CallExpression);
    const callee = here?.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    call = callee !== undefined && WRITE_CALLEES.has(callee.getName()) ? here : undefined;
    cur = here === undefined ? cur.getParent() : undefined;
  }
  return call;
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
 *  column of that property name (the lenient direction — a missed writer would be a false accusation). */
export function collectPropertyWrites(
  nodes: readonly PropertyAssignment[],
  byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>,
  vocabs: Map<string, Vocab>,
): void {
  for (const pa of nodes) {
    const cols = byProp.get(pa.getName());
    if (cols === undefined || enclosingWriteCall(pa) === undefined) {
      continue;
    }
    const table = targetTable(pa);
    const attributed = table === undefined ? [] : cols.filter((c) => c.table === table);
    addWrite(vocabs, attributed.length > 0 ? attributed : cols, valueKeys(pa.getInitializer(), 0));
  }
}

/** The accumulator spelling a write helper uses (`const set: Partial<Row> = {}; set.metadata = …`) — the
 *  json-column-write-parity precedent. Name-keyed: it contributes to every column of that name. */
export function collectAccumulatorWrites(
  nodes: readonly BinaryExpression[],
  byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>,
  vocabs: Map<string, Vocab>,
): void {
  for (const bin of nodes) {
    const lhs = bin.getLeft().asKind(SyntaxKind.PropertyAccessExpression);
    const cols = lhs === undefined || bin.getOperatorToken().getText() !== "=" ? undefined : byProp.get(lhs.getName());
    if (cols !== undefined) {
      addWrite(vocabs, cols, valueKeys(bin.getRight(), 0));
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

function isOpenBagArm(arm: Type): boolean {
  if (arm.isUnknown()) {
    return true;
  }
  const name = arm.getAliasSymbol()?.getName() ?? arm.getSymbol()?.getName();
  return arm.getStringIndexType() !== undefined && (name === undefined || ANONYMOUS_SYMBOLS.has(name));
}

export function isOpenBag(t: Type): boolean {
  const arms = t.isUnion() ? t.getUnionTypes() : [t];
  return arms.some(isOpenBagArm);
}
