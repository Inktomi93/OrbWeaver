// Shared open-JSON reader/writer parity analysis. It returns every semantic verdict; policy authority is applied by consumers.
import type {
  BinaryExpression,
  CallExpression,
  ElementAccessExpression,
  PropertyAccessExpression,
  PropertyAssignment,
  TaggedTemplateExpression,
  Node as TsNode,
  Type,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { SchemaModel } from "../contract/schema-fact.ts";

export interface OpenJsonColumn {
  readonly table: string; // the drizzle table VARIABLE name
  readonly prop: string; // the camel property name
  readonly sqlName: string; // the snake column name (what SQL text spells)
  readonly open: boolean;
  readonly node: TsNode; // the schema PropertyAssignment — where "close the type" is done
  readonly declared: ReadonlySet<string> | undefined; // a TYPED column's own key vocabulary (undefined = unknowable)
}

/** A stored PRIMITIVE (or an array of anything) names no top-level key — `settings.value`'s `JsonValue`
 *  string arm and `automation_rules.actions` are the live shapes. Without this, `getProperties()` returns
 *  the String/Array PROTOTYPE (`charAt`, `padEnd`, `flatMap`, …) and every such column claims a 40-key
 *  vocabulary it does not have — a false GREEN factory, the permissive direction (GATE-AUTHORING.md §5). */
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

interface Schema {
  readonly columns: readonly OpenJsonColumn[];
  /** drizzle table VARIABLE → its SQL table name (what a raw-SQL FROM/JOIN spells). */
  readonly tables: ReadonlyMap<string, string>;
}

const OPEN_JSON_TYPE = /(?:^|\|)\s*(?:unknown|JsonValue|Record<\s*string\s*,)/u;

function explicitlyOpenJsonType(typeText: string | undefined): boolean {
  return typeText === undefined || OPEN_JSON_TYPE.test(typeText.replaceAll("readonly ", ""));
}

function declaredKeys(column: import("../contract/schema-fact.ts").SchemaColumn, open: boolean): ReadonlySet<string> | undefined {
  if (open) {
    return;
  }
  if (column.json?.shape.kind === "closed") {
    return new Set(column.json.shape.keys);
  }
  return new Set(column.typeOverride?.type.getProperties().map((property) => property.getName()) ?? []);
}

function deriveSchema(model: SchemaModel): Schema {
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

// ── the writer vocabulary ───────────────────────────────────────────────────────────────────────────────
interface Vocab {
  readonly keys: Set<string>;
  opaque: boolean; // at least one writer's value shape is unknowable
}

/** Strip the wrappers that never change a value's shape. */
function unwrap(node: TsNode): TsNode {
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

function addWrite(vocabs: Map<string, Vocab>, targets: readonly OpenJsonColumn[], keys: ReadonlySet<string> | undefined): void {
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

const colKey = (c: OpenJsonColumn): string => `${c.table}.${c.prop}`;

/** Every writer's key contribution, per column. A write whose table is unresolvable contributes to EVERY
 *  column of that property name (the lenient direction — a missed writer would be a false accusation). */
function collectPropertyWrites(nodes: readonly PropertyAssignment[], byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>, vocabs: Map<string, Vocab>): void {
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
function collectAccumulatorWrites(
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

// ── SQL text (readers AND json_set writers live in the same templates) ──────────────────────────────────
const SQL_READ_RE = /json_(?:extract|each)\(\s*([^,()]+?)\s*,\s*['"]\$\.([\w.]+)['"]/giu;
const SQL_WRITE_RE = /json_set\(\s*([^,()]+?)\s*,\s*['"]\$\.([\w.]+)['"]/giu;
const SQL_ALIAS_RE = /\b(?:from|join)\s+([a-z_][a-z0-9_]*)\s+(?:as\s+)?([a-z][a-z0-9_]*)\b/giu;
/** `FROM/JOIN json_each(<arg>) [AS] <alias>` / `json_tree(...)` — a TABLE-VALUED FUNCTION, not a table (#1802).
 *  The arg may carry one level of nested parens (`json_each(json_extract(«col», '$.k'))`). Its alias binds the
 *  virtual row whose `.value` / `.key` / `.type` are json_each's own columns, never a drizzle column. */
const SQL_VIRTUAL_ALIAS_RE = /\b(?:from|join)\s+json_(?:each|tree)\s*\((?:[^()]|\([^()]*\))*\)\s+(?:as\s+)?([a-z][a-z0-9_]*)\b/giu;
/** The alias-map value for a virtual alias — no drizzle table is ever spelled with a leading colon. */
const VIRTUAL_TABLE = ":json_each";

/** A `sql` template's text with every `${expr}` rendered as «expr» — so a drizzle column interpolation is
 *  resolvable and an interpolated PATH is visibly not a literal. */
function sqlText(tt: TaggedTemplateExpression): string {
  const tpl = tt.getTemplate();
  if (Node.isNoSubstitutionTemplateLiteral(tpl)) {
    return tpl.getLiteralText();
  }
  let out = tpl.getHead().getLiteralText();
  for (const span of tpl.getTemplateSpans()) {
    out += `«${span.getExpression().getText()}»${span.getLiteral().getLiteralText()}`;
  }
  return out;
}

/** The columns a SQL column reference names: a drizzle `«table.prop»` interpolation, an `alias.snake` the
 *  template's own FROM/JOIN declares, or a bare `snake` name. */
function resolveSqlRef(ref: string, aliases: ReadonlyMap<string, string>, schema: Schema): readonly OpenJsonColumn[] {
  const { columns, tables } = schema;
  const parts = ref.replaceAll("«", "").replaceAll("»", "").trim().split(".");
  const tail = parts.at(-1) ?? "";
  const head = parts.length > 1 ? (parts.at(-2) ?? "") : undefined;
  // ATTRIBUTION FIRST, name-pooling last. A drizzle interpolation names the table VARIABLE; a raw SQL ref
  // names the template's own FROM/JOIN alias. Reversing this order silently pools every same-named column
  // (`metadata` is a column on SIX tables), which is how a table-attributed reader loses its table.
  const byTableVar = head === undefined ? [] : columns.filter((c) => c.table === head && c.prop === tail);
  if (byTableVar.length > 0) {
    return byTableVar;
  }
  const sqlTable = head === undefined ? undefined : aliases.get(head.toLowerCase());
  // A json_each/json_tree alias (#1802): `element.value` is the VIRTUAL row's column, which no drizzle column
  // is — attributing it would pool every column NAMED `value` (the open `settings.value` blob among them) and
  // red a key that blob's writers never spell. Nothing open is addressed; the ref resolves to nothing.
  if (sqlTable === VIRTUAL_TABLE) {
    return [];
  }
  const byAlias = sqlTable === undefined ? [] : columns.filter((c) => tables.get(c.table) === sqlTable && (c.sqlName === tail || c.prop === tail));
  return byAlias.length > 0 ? byAlias : columns.filter((c) => c.prop === tail || c.sqlName === tail);
}

function aliasMap(text: string): Map<string, string> {
  const out = new Map<string, string>();
  // Virtual aliases FIRST, so a later same-named real alias in the same template cannot be shadowed silently
  // (the real-alias loop below re-sets the key; a virtual alias only ever names json_each's row).
  for (const m of text.matchAll(SQL_VIRTUAL_ALIAS_RE)) {
    const alias = m[1];
    if (alias !== undefined) {
      out.set(alias.toLowerCase(), VIRTUAL_TABLE);
    }
  }
  for (const m of text.matchAll(SQL_ALIAS_RE)) {
    const table = m[1];
    const alias = m[2];
    if (table !== undefined && alias !== undefined) {
      out.set(alias.toLowerCase(), table.toLowerCase());
      out.set(table.toLowerCase(), table.toLowerCase());
    }
  }
  return out;
}

// ── reader collection ───────────────────────────────────────────────────────────────────────────────────
interface ReaderHit {
  readonly node: TsNode;
  readonly offset: number;
  readonly key: string;
  readonly targets: readonly OpenJsonColumn[];
}

/** The trailing name of a receiver expression (`row.captionMeta` → captionMeta, `metadata` → metadata). */
function tailName(expr: TsNode): string | undefined {
  const e = unwrap(expr);
  if (Node.isIdentifier(e)) {
    return e.getText();
  }
  return Node.isPropertyAccessExpression(e) ? e.getName() : undefined;
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

function isOpenBag(t: Type): boolean {
  const arms = t.isUnion() ? t.getUnionTypes() : [t];
  return arms.some(isOpenBagArm);
}

/** The open columns a blob receiver names, or [] when it is not one. */
function blobTargets(receiver: TsNode, byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>): readonly OpenJsonColumn[] {
  const name = tailName(receiver);
  const cols = name === undefined ? undefined : byProp.get(name);
  if (cols === undefined || !cols.some((c) => c.open)) {
    return [];
  }
  if (!isOpenBag(receiver.getType())) {
    return [];
  }
  const e = unwrap(receiver);
  const head = Node.isPropertyAccessExpression(e) ? unwrap(e.getExpression()).getText() : undefined;
  const exact = head === undefined ? [] : cols.filter((c) => c.table === head);
  return exact.length > 0 ? exact : cols;
}

function offsetOf(node: TsNode, needle: string): number {
  return Math.max(node.getText().indexOf(needle), 0);
}

/** `blob["k"]` and `blob.k`. */
function collectAccessReads(
  elements: readonly ElementAccessExpression[],
  properties: readonly PropertyAccessExpression[],
  byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>,
  out: ReaderHit[],
): void {
  for (const ea of elements) {
    const arg = ea.getArgumentExpression();
    const key = arg !== undefined && Node.isStringLiteral(arg) ? arg.getLiteralText() : undefined;
    const targets = key === undefined ? [] : blobTargets(ea.getExpression(), byProp);
    if (key !== undefined && targets.length > 0) {
      out.push({ node: ea, offset: offsetOf(ea, key), key, targets });
    }
  }
  for (const pae of properties) {
    const targets = blobTargets(pae.getExpression(), byProp);
    if (targets.length > 0) {
      out.push({ node: pae, offset: offsetOf(pae, pae.getName()), key: pae.getName(), targets });
    }
  }
}

/** Does the callee INDEX its blob parameter with its key parameter (`m[key]`)? That proof is what makes a
 *  string argument a KEY rather than a kind/label: without it `onRuleError(rc, "action_error", res.detail)`
 *  reads as a caption-class violation (it did — the one false positive this arm produced before the proof). */
function indexesBlobParam(callee: TsNode, blobPos: number, keyPos: number): boolean {
  const fn = Node.isFunctionDeclaration(callee) || Node.isArrowFunction(callee) || Node.isFunctionExpression(callee) ? callee : undefined;
  const params = fn?.getParameters() ?? [];
  const blobName = params[blobPos]?.getName();
  const keyName = params[keyPos]?.getName();
  if (fn === undefined || blobName === undefined || keyName === undefined) {
    return false;
  }
  return fn
    .getDescendantsOfKind(SyntaxKind.ElementAccessExpression)
    .some((ea) => tailName(ea.getExpression()) === blobName && unwrap(ea.getArgumentExpression() ?? ea).getText() === keyName);
}

/** The declaration bodies an identifier callee resolves to (a `function f()` or a `const f = (…) => …`). */
function calleeBodies(call: CallExpression): TsNode[] {
  const callee = unwrap(call.getExpression());
  if (!Node.isIdentifier(callee)) {
    return [];
  }
  return callee.getDefinitionNodes().flatMap((def) => {
    if (Node.isFunctionDeclaration(def)) {
      return [def as TsNode];
    }
    const init = Node.isVariableDeclaration(def) ? def.getInitializer() : undefined;
    return init === undefined ? [] : [unwrap(init)];
  });
}

/** The one-hop helper shape `f(blob, "k")` — the live `metaStr(r.captionMeta, "rating")` spelling, admitted
 *  only when the helper PROVES the string is a key by indexing the blob with it. */
function collectHelperReads(calls: readonly CallExpression[], byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>, out: ReaderHit[]): void {
  for (const call of calls) {
    const args = call.getArguments();
    const blobPos = args.findIndex((a) => blobTargets(a, byProp).length > 0);
    const blobArg = blobPos < 0 ? undefined : args[blobPos];
    if (blobArg === undefined) {
      continue;
    }
    const targets = blobTargets(blobArg, byProp);
    const bodies = calleeBodies(call);
    args.forEach((a, i) => {
      if (i !== blobPos && Node.isStringLiteral(a) && bodies.some((b) => indexesBlobParam(b, blobPos, i))) {
        out.push({ node: call, offset: offsetOf(call, a.getLiteralText()), key: a.getLiteralText(), targets });
      }
    });
  }
}

/** One `json_*(<ref>, '$.<path>')` match → the open columns it addresses and the TOP-LEVEL key it names
 *  (`$.a.b` is a read of `a`). Empty when the ref resolves to nothing open. */
function sqlMatch(m: RegExpExecArray | RegExpMatchArray, aliases: ReadonlyMap<string, string>, schema: Schema): SqlPath | undefined {
  const [, ref, path] = m;
  const key = (path ?? "").split(".")[0] ?? "";
  const targets = ref === undefined ? [] : resolveSqlRef(ref, aliases, schema);
  return key.length === 0 || targets.length === 0 ? undefined : { key, path: `$.${path ?? ""}`, targets };
}

interface SqlPath {
  readonly key: string;
  readonly path: string;
  readonly targets: readonly OpenJsonColumn[];
}

/** SQL `json_extract`/`json_each` paths (readers), and the `json_set` paths in the same templates (writers —
 *  a SQL-side merge is a real producer of that key). */
function collectSqlReads(templates: readonly TaggedTemplateExpression[], schema: Schema, out: ReaderHit[], vocabs: Map<string, Vocab>): void {
  for (const tt of templates) {
    if (tt.getTag().getText() !== "sql") {
      continue;
    }
    const text = sqlText(tt);
    const aliases = aliasMap(text);
    for (const m of text.matchAll(SQL_READ_RE)) {
      const hit = sqlMatch(m, aliases, schema);
      const open = hit?.targets.filter((c) => c.open) ?? [];
      if (hit !== undefined && open.length > 0) {
        out.push({ node: tt, offset: offsetOf(tt, hit.path), key: hit.key, targets: open });
      }
    }
    for (const m of text.matchAll(SQL_WRITE_RE)) {
      const hit = sqlMatch(m, aliases, schema);
      if (hit !== undefined) {
        addWrite(vocabs, hit.targets, new Set([hit.key]));
      }
    }
  }
}

// ── the verdict ─────────────────────────────────────────────────────────────────────────────────────────
/** The pooled writer vocabulary of a reader's target columns: a TYPED column contributes its own declared
 *  keys (the type IS its writer contract), an open one contributes what its writers spell. */
function pooledVocab(targets: readonly OpenJsonColumn[], vocabs: ReadonlyMap<string, Vocab>): Vocab {
  const pooled: Vocab = { keys: new Set(), opaque: false };
  for (const col of targets) {
    const own = vocabs.get(colKey(col));
    const declared = col.open ? undefined : col.declared;
    if (declared !== undefined) {
      for (const k of declared) {
        pooled.keys.add(k);
      }
      continue;
    }
    if (own === undefined) {
      pooled.opaque = true;
      continue;
    }
    pooled.opaque ||= own.opaque;
    for (const k of own.keys) {
      pooled.keys.add(k);
    }
  }
  return pooled;
}

const tokenOf = (targets: readonly OpenJsonColumn[], key: string): string =>
  targets.length === 1 && targets[0] !== undefined ? `${colKey(targets[0])}:${key}` : `${targets[0]?.prop ?? "?"}:${key}`;

export interface OpenJsonVerdict {
  readonly hit: ReaderHit;
  readonly token: string;
}

export interface OpenJsonJudged {
  readonly violations: readonly OpenJsonVerdict[];
  readonly claimed: ReadonlySet<string>;
}

/** One reader hit's verdict, or undefined when it is satisfied / unattributable. */
function verdictOf(hit: ReaderHit, vocabs: ReadonlyMap<string, Vocab>, unprovable: Set<string>): OpenJsonVerdict | undefined {
  const pooled = pooledVocab(hit.targets, vocabs);
  if (pooled.keys.has(hit.key)) {
    return;
  }
  // An EMPTY vocabulary is not a proof of absence — you cannot say a key is missing from a set nobody could
  // enumerate. That case is the UNPROVABLE arm's, never PARITY's.
  if (!(pooled.opaque || pooled.keys.size === 0)) {
    return { hit, token: tokenOf(hit.targets, hit.key) };
  }
  // UNPROVABLE: reported ONCE per column, at its first reader (the blame is the SEAM, not this one key), and
  // only when exactly one open column owns the read — otherwise the column is unattributable.
  const openTargets = hit.targets.filter((c) => c.open);
  const only = openTargets.length === 1 ? openTargets[0] : undefined;
  const token = only === undefined ? undefined : colKey(only);
  if (token === undefined || unprovable.has(token)) {
    return;
  }
  unprovable.add(token);
  return { hit, token };
}

function judge(hits: readonly ReaderHit[], vocabs: ReadonlyMap<string, Vocab>): OpenJsonJudged {
  const violations: OpenJsonVerdict[] = [];
  const claimed = new Set<string>();
  const unprovable = new Set<string>();
  for (const hit of hits) {
    const verdict = verdictOf(hit, vocabs, unprovable);
    if (verdict !== undefined) {
      claimed.add(verdict.token);
      violations.push(verdict);
    }
  }
  return { violations, claimed };
}

function indexByProp(columns: readonly OpenJsonColumn[]): Map<string, OpenJsonColumn[]> {
  const byProp = new Map<string, OpenJsonColumn[]>();
  for (const col of columns) {
    byProp.set(col.prop, [...(byProp.get(col.prop) ?? []), col]);
  }
  return byProp;
}

export interface OpenJsonAnalysis {
  readonly columns: readonly OpenJsonColumn[];
  readonly verdict: OpenJsonJudged;
}

export interface OpenJsonParityFact {
  readonly analyze: (schema: SchemaModel) => OpenJsonAnalysis;
}

export const openJsonParityFact = defineFact({
  id: "open-json-parity",
  population: { in: ["@db", "@server"], under: ["packages/db/src/schema/**", "packages/server/src/**"] },
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const properties: PropertyAssignment[] = [];
    const binaries: BinaryExpression[] = [];
    const elements: ElementAccessExpression[] = [];
    const accesses: PropertyAccessExpression[] = [];
    const calls: CallExpression[] = [];
    const templates: TaggedTemplateExpression[] = [];
    return {
      visitors: [
        {
          kinds: [
            SyntaxKind.PropertyAssignment,
            SyntaxKind.BinaryExpression,
            SyntaxKind.ElementAccessExpression,
            SyntaxKind.PropertyAccessExpression,
            SyntaxKind.CallExpression,
            SyntaxKind.TaggedTemplateExpression,
          ],
          visit: (node, sourceFile) => {
            if (!ctx.relativePath(sourceFile).startsWith("packages/server/src/")) {
              return;
            }
            if (Node.isPropertyAssignment(node)) {
              properties.push(node);
            } else if (Node.isBinaryExpression(node)) {
              binaries.push(node);
            } else if (Node.isElementAccessExpression(node)) {
              elements.push(node);
            } else if (Node.isPropertyAccessExpression(node)) {
              accesses.push(node);
            } else if (Node.isCallExpression(node)) {
              calls.push(node);
            } else if (Node.isTaggedTemplateExpression(node)) {
              templates.push(node);
            }
          },
        },
      ],
      finish: (): OpenJsonParityFact => {
        ctx.receipt({ kind: "population", source: "open-json-parity-sources", members: ctx.files.length });
        return Object.freeze({
          analyze: (model: SchemaModel): OpenJsonAnalysis => {
            const schema = deriveSchema(model);
            const byProp = indexByProp(schema.columns);
            const vocabs = new Map<string, Vocab>();
            const hits: ReaderHit[] = [];
            collectPropertyWrites(properties, byProp, vocabs);
            collectAccumulatorWrites(binaries, byProp, vocabs);
            collectSqlReads(templates, schema, hits, vocabs);
            collectAccessReads(elements, accesses, byProp, hits);
            collectHelperReads(calls, byProp, hits);
            return Object.freeze({ columns: schema.columns, verdict: judge(hits, vocabs) });
          },
        });
      },
    };
  },
});
