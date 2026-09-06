// Gate: open-json-column-key-parity — an OPEN JSON column (`mode:"json"` whose `$type` is
// `Record<string, unknown>` / `unknown` / `JsonValue`, i.e. NO type crosses the write/read seam) whose READER
// names a key the WRITERS never produce renders empty forever while every other gate stays green. FOUNDING
// DEFECT (issue #164, fixed `5e19418b4`): `image_embeddings.caption_meta` was read through fourteen facet
// paths (`$.artStyle`, `$.palette`, …) by discovery's image analytics while both writers ever stored
// `{ model }` — declared, exported, wired to tRPC, rendered in a tab, integration-tested, and blank. The
// silent-reader audit (docs/history/reviews/misc/2026-08-18-silent-reader-audit.md §0) MEASURED that the class can
// only live here: 297 fields over 43 TYPED json-column types swept clean, because a type binds writer to
// reader. So the column set is DERIVED from the schema's openness, never hand-listed (§4.6: an empty
// derivation on a tree that HAS a schema is RED, never a silent pass).
//
// TWO ARMS, one class:
//   PARITY   — a reader key absent from an ENUMERABLE writer key-set. `caption_meta` verbatim.
//   UNPROVABLE — the column has named readers but its writers carry an OPEN-typed value end to end, so the
//     key vocabulary is undecidable statically. That is not a gate limitation to excuse; it IS the defect
//     condition (nothing binds the two sides), and the audit's preferred fix is the same one: CLOSE THE TYPE
//     — one named shape in `contracts` that both sides import (`packages/contracts/src/embeddings/index.ts`
//     is the worked example). Fires ONCE PER COLUMN, at its first reader, and only when exactly one open
//     column owns the read — otherwise the blame is unattributable.
//
// READER SHAPES (all four the audit found): a `json_extract`/`json_each` `'$.k'` path in a `sql` template
// (the column resolved through the template's own FROM/JOIN aliases or a drizzle `${table.col}`
// interpolation), `blob["k"]`, `blob.k`, and the one-hop `f(blob, "k")` helper — the last three fenced on an
// OPEN-BAG receiver TYPE (a string index signature / `unknown`), so a same-named local object is never
// mistaken for the column.
//
// DECLARED LIMITS, each with a mustPass row: a TYPED column is never judged (the type is the enforcer); an
// INTERPOLATED json path (`json_extract(${col}, ${sel.path})` — the live allowlisted caption drill) names no
// literal key; `Object.keys(blob)` / `blob[key]` iterate rather than name; a reader whose blob reached it
// through an untyped hop (a Map, a parameter named nothing like the column) is invisible to a column-scoped
// reader index — the audit's §9.1 limit, inherited deliberately because the alternative (a corpus-wide
// name sweep) is contaminated by the READER's own vocabulary map.
import type { CallExpression, SourceFile, TaggedTemplateExpression, Node as TsNode, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { fileLoaded } from "../lib/pass.ts";

// ── the two-map exemption registry (knob-wire-coverage's D107 grammar) ──────────────────────────────────
// Keyed `<tableVar>.<column>:<key>` (a table-attributed reader) or `<column>:<key>` (a name-attributed one),
// and `<tableVar>.<column>` for an UNPROVABLE row. DOORWAY = a sanctioned, indefinitely-open key space.
// DEFERRED = tracked debt with a remediation cite. Both self-clean in BOTH directions: a row whose key
// gained a writer (or whose column closed its type) is STALE-RED; a row naming a column that no longer
// exists is ORPHAN-RED.
const DOORWAY: ExemptionTable = {
  "characters.extensions": {
    why:
      "the ST/V2 card RESIDUE BUCKET — its key space is authored by SillyTavern and by every card in the " +
      "wild (`regex_scripts`, `depth_prompt`, `fav`, `world`), not by this codebase, so there is no writer " +
      "here to bind it to and no fixed vocabulary to drift from (silent-reader audit §3 row 5: 'by " +
      "construction it is the residue bucket'). The readers are the IMPORTER promoting known ST keys into " +
      "first-class columns — packages/server/src/domain/import/loader/collect.ts:162-164, whose own comment " +
      "states the provenance verbatim (\"The card's `extensions.world` NAME-LINK … 35 of 313 corpus cards " +
      'carry one. It stays in the extensions residue too (lossless)"), plus ' +
      "packages/server/src/kit/serde/card/index.ts's ST key promotions. A foreign format's keys, correctly " +
      "read defensively. " +
      "ENDS when the card serde promotes every ST extension key it reads into a typed contract shape, at " +
      "which point the column carries only unrecognised residue and has no named reader at all.",
  },
};

// NOTE for the next author: `imageEmbeddings.captionMeta` was this table's founding row for about an hour on
// 2026-08-18 and was DELETED the same day by doing the real fix instead — the column's `$type` and its three
// carriers now name `ImageCaptionMeta` (@orb/contracts/embeddings), so the column is TYPED and this gate no
// longer judges it at all. That is the disposition to prefer for every row below: close the type, delete the
// row, shrink the derivation.
const DEFERRED: ExemptionTable = {
  "messageVariants.metadata": {
    why:
      "the silent-reader audit's F3, unresolved: `json_extract(v.metadata, '$.reasoning_duration')` " +
      "(packages/server/src/domain/stats/write/rebuild-from-canon.ts:435,534 + the live-delta twin at " +
      "domain/chat/substrate/stats-delta.ts:191) accumulates into three rollup tables, while the only " +
      "producer is the ST import serde (kit/serde/chat/index.ts:634-646) — the live canon-write path writes " +
      "no metadata at all, so every turn this app generates contributes 0 reasoning ms. REMEDIATION is the " +
      "OWNER FORK tracked in issue #184 (stamp the key on the live turn vs re-source the stat from a " +
      "first-class column and delete the reader). Either arm closes the seam and this row goes STALE-RED.",
  },
};

const GATE_SELF = "tooling/src/verify/gates/open-json-column-key-parity.ts";
const SCHEMA_DIR = "/packages/db/src/schema/";
const SERVER_SRC = "/packages/server/src/";
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";

const MESSAGE =
  'an OPEN JSON column (mode:"json" + $type<Record<string, unknown>|unknown|JsonValue>) is READ by a key ' +
  "no writer produces, or its writers carry an open-typed value end to end so the key vocabulary is " +
  "unprovable. Nothing binds the two sides, so the surface renders empty forever while every gate stays " +
  "green — issue #164's image_embeddings.caption_meta verbatim. The token names the column and the key; the " +
  "class, its bound, and the per-column dispositions are measured in docs/history/reviews/misc/2026-08-18-silent-reader-audit.md §3.";

const FIX =
  "CLOSE THE TYPE: give the blob ONE named shape below both sides (packages/contracts/src/embeddings/index.ts " +
  "is the worked example — the write path builds it, the read path imports it, and tsc becomes the enforcer). " +
  "If the key is genuinely produced somewhere this reader index cannot see, make the producer's type say so. " +
  "A DOORWAY (sanctioned open key space) / DEFERRED (tracked debt, cited) row in " +
  `${GATE_SELF} is the last resort, never debt parking.`;

const STALE = (key: string): string =>
  `open-json-column-key-parity: DOORWAY/DEFERRED row "${key}" no longer matches a live violation — the key gained a producer, the column closed its type, or the reader is gone. A standing exemption for a site that is gone is a loaded gun: delete the row in ${GATE_SELF}.`;
const ORPHAN = (key: string): string =>
  `open-json-column-key-parity: DOORWAY/DEFERRED row "${key}" names a json column that no longer exists (renamed/deleted) — the row names nothing at all. Delete it in ${GATE_SELF}.`;
const BLIND = `open-json-column-key-parity: DERIVED NOTHING — no \`text(..., { mode: "json" })\` column was found in packages/db/src/schema/** on a tree that HAS a db schema. The column derivation is this gate's whole basis, so a green verdict would be a placebo (GATE-AUTHORING.md §4.6). Re-point the derivation at the schema's current spelling in ${GATE_SELF}.`;

// ── schema derivation ───────────────────────────────────────────────────────────────────────────────────
interface JsonColumn {
  readonly table: string; // the drizzle table VARIABLE name
  readonly prop: string; // the camel property name
  readonly sqlName: string; // the snake column name (what SQL text spells)
  readonly open: boolean;
  readonly node: TsNode; // the schema PropertyAssignment — where "close the type" is done
  readonly declared: ReadonlySet<string> | undefined; // a TYPED column's own key vocabulary (undefined = unknowable)
}

const JSON_MODE_RE = /mode:\s*"json"/u;
const TEXT_NAME_RE = /text\(\s*"([^"]+)"/u;
const TYPE_ARG_RE = /\$type<([\s\S]*?)>\(\)/u;
const SQLITE_TABLE_RE = /sqliteTable\(\s*"([^"]+)"/u;
const RECORD_STRING_RE = /^Record<\s*string\s*,/u;

/** OPEN = no type crosses the seam. A union is open when ANY arm is (the
 *  `RefineryStagePayload | Record<string, unknown>` durability escape hatch is still an open door for a
 *  key the typed arm lacks). */
function isOpenTypeText(text: string | undefined): boolean {
  if (text === undefined) {
    return true; // an un-$type'd json column is the most open shape there is
  }
  return text.split("|").some((raw) => {
    const arm = raw.replaceAll("readonly ", "").replaceAll("[]", "").trim();
    return arm === "unknown" || arm === "JsonValue" || RECORD_STRING_RE.test(arm);
  });
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

/** The `$type<X>()` type ARGUMENT node of a column initializer (the checker's door to a typed column's own
 *  key vocabulary), else undefined. */
function typeArgNode(init: TsNode): TsNode | undefined {
  const call = init
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().asKind(SyntaxKind.PropertyAccessExpression)?.getName() === "$type");
  return call?.getTypeArguments()[0];
}

/** One `text(…, { mode: "json" })` property assignment → its column record, else undefined. */
function columnOf(table: string, pa: TsNode): JsonColumn | undefined {
  const init = pa.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  const text = init?.getText() ?? "";
  if (init === undefined || !JSON_MODE_RE.test(text)) {
    return;
  }
  const typeText = TYPE_ARG_RE.exec(text)?.[1];
  const open = isOpenTypeText(typeText);
  const argNode = typeText === undefined ? undefined : typeArgNode(init);
  const prop = pa.asKindOrThrow(SyntaxKind.PropertyAssignment).getName();
  return {
    table,
    prop,
    sqlName: TEXT_NAME_RE.exec(text)?.[1] ?? prop,
    open,
    node: pa,
    declared: open || argNode === undefined ? undefined : typeKeys(argNode.getType()),
  };
}

/** The `sqliteTable(<sqlName>, {…})` a variable declaration initializes, else undefined. */
function sqliteTableInit(decl: TsNode): { readonly init: TsNode; readonly sqlName: string } | undefined {
  const init = decl.asKind(SyntaxKind.VariableDeclaration)?.getInitializer();
  const text = init?.getText() ?? "";
  const sqlName = text.startsWith("sqliteTable(") ? SQLITE_TABLE_RE.exec(text)?.[1] : undefined;
  return init === undefined || sqlName === undefined ? undefined : { init, sqlName };
}

interface Schema {
  readonly columns: readonly JsonColumn[];
  /** drizzle table VARIABLE → its SQL table name (what a raw-SQL FROM/JOIN spells). */
  readonly tables: ReadonlyMap<string, string>;
}

function deriveSchema(files: readonly SourceFile[]): Schema {
  const columns: JsonColumn[] = [];
  const tables = new Map<string, string>();
  for (const sf of files) {
    for (const decl of sf.getVariableDeclarations()) {
      const table = sqliteTableInit(decl);
      if (table === undefined) {
        continue;
      }
      tables.set(decl.getName(), table.sqlName.toLowerCase());
      for (const pa of table.init.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
        const col = columnOf(decl.getName(), pa);
        if (col !== undefined) {
          columns.push(col);
        }
      }
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

function addWrite(vocabs: Map<string, Vocab>, targets: readonly JsonColumn[], keys: ReadonlySet<string> | undefined): void {
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

const colKey = (c: JsonColumn): string => `${c.table}.${c.prop}`;

/** Every writer's key contribution, per column. A write whose table is unresolvable contributes to EVERY
 *  column of that property name (the lenient direction — a missed writer would be a false accusation). */
function collectPropertyWrites(sf: SourceFile, byProp: ReadonlyMap<string, readonly JsonColumn[]>, vocabs: Map<string, Vocab>): void {
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
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
function collectAccumulatorWrites(sf: SourceFile, byProp: ReadonlyMap<string, readonly JsonColumn[]>, vocabs: Map<string, Vocab>): void {
  for (const bin of sf.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
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
function resolveSqlRef(ref: string, aliases: ReadonlyMap<string, string>, schema: Schema): readonly JsonColumn[] {
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
  readonly targets: readonly JsonColumn[];
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
function blobTargets(receiver: TsNode, byProp: ReadonlyMap<string, readonly JsonColumn[]>): readonly JsonColumn[] {
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
function collectAccessReads(sf: SourceFile, byProp: ReadonlyMap<string, readonly JsonColumn[]>, out: ReaderHit[]): void {
  for (const ea of sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const arg = ea.getArgumentExpression();
    const key = arg !== undefined && Node.isStringLiteral(arg) ? arg.getLiteralText() : undefined;
    const targets = key === undefined ? [] : blobTargets(ea.getExpression(), byProp);
    if (key !== undefined && targets.length > 0) {
      out.push({ node: ea, offset: offsetOf(ea, key), key, targets });
    }
  }
  for (const pae of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
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
function collectHelperReads(sf: SourceFile, byProp: ReadonlyMap<string, readonly JsonColumn[]>, out: ReaderHit[]): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
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
  readonly targets: readonly JsonColumn[];
}

/** SQL `json_extract`/`json_each` paths (readers), and the `json_set` paths in the same templates (writers —
 *  a SQL-side merge is a real producer of that key). */
function collectSqlReads(sf: SourceFile, schema: Schema, out: ReaderHit[], vocabs: Map<string, Vocab>): void {
  for (const tt of sf.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression)) {
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
function pooledVocab(targets: readonly JsonColumn[], vocabs: ReadonlyMap<string, Vocab>): Vocab {
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

const tokenOf = (targets: readonly JsonColumn[], key: string): string =>
  targets.length === 1 && targets[0] !== undefined ? `${colKey(targets[0])}:${key}` : `${targets[0]?.prop ?? "?"}:${key}`;

interface Verdict {
  readonly hit: ReaderHit;
  readonly token: string;
}

interface Judged {
  readonly violations: readonly Verdict[];
  readonly claimed: ReadonlySet<string>;
}

const exempt = (token: string): boolean => token in DOORWAY || token in DEFERRED;

/** One reader hit's verdict, or undefined when it is satisfied / unattributable. */
function verdictOf(hit: ReaderHit, vocabs: ReadonlyMap<string, Vocab>, unprovable: Set<string>): Verdict | undefined {
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

function judge(hits: readonly ReaderHit[], vocabs: ReadonlyMap<string, Vocab>): Judged {
  const violations: Verdict[] = [];
  const claimed = new Set<string>();
  const unprovable = new Set<string>();
  for (const hit of hits) {
    const verdict = verdictOf(hit, vocabs, unprovable);
    if (verdict !== undefined) {
      claimed.add(verdict.token);
      if (!exempt(verdict.token)) {
        violations.push(verdict);
      }
    }
  }
  return { violations, claimed };
}

function indexByProp(columns: readonly JsonColumn[]): Map<string, JsonColumn[]> {
  const byProp = new Map<string, JsonColumn[]>();
  for (const col of columns) {
    byProp.set(col.prop, [...(byProp.get(col.prop) ?? []), col]);
  }
  return byProp;
}

function runGate(ctx: GateRunCtx): void {
  const files = ctx.project.getSourceFiles();
  const schemaFiles = files.filter((f) => f.getFilePath().includes(SCHEMA_DIR));
  const schema = deriveSchema(schemaFiles);
  if (schema.columns.length === 0) {
    if (schemaFiles.length > 0) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND });
    }
    return; // a synthetic mini-project with no schema at all is a legitimate zero (GATE-AUTHORING §4.5)
  }

  const byProp = indexByProp(schema.columns);
  const serverFiles = files.filter((f) => f.getFilePath().includes(SERVER_SRC));
  const vocabs = new Map<string, Vocab>();
  const hits: ReaderHit[] = [];
  for (const sf of serverFiles) {
    collectPropertyWrites(sf, byProp, vocabs);
    collectAccumulatorWrites(sf, byProp, vocabs);
  }
  for (const sf of serverFiles) {
    collectSqlReads(sf, schema, hits, vocabs);
    collectAccessReads(sf, byProp, hits);
    collectHelperReads(sf, byProp, hits);
  }

  const verdict = judge(hits, vocabs);
  for (const { hit, token } of verdict.violations) {
    ctx.report(hit.node, { token, offset: hit.offset });
  }
  staleAndOrphan(ctx, schema.columns, verdict.claimed);
}

/** Both staleness modes in ONE test (GATE-AUTHORING §4.4a): a row no live violation CLAIMED is stale; a row
 *  naming a column the schema no longer declares is an orphan. Guarded on a real-tree anchor that is no
 *  row's own path, so a conformance mini-project never judges the real registry. */
function staleAndOrphan(ctx: GateRunCtx, columns: readonly JsonColumn[], claimed: ReadonlySet<string>): void {
  if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
    return;
  }
  const live = new Set(columns.map(colKey));
  const liveProps = new Set(columns.map((c) => c.prop));
  for (const key of [...Object.keys(DOORWAY), ...Object.keys(DEFERRED)]) {
    const column = key.split(":")[0] ?? "";
    // MODE (B) first: the row's COLUMN is gone (renamed/deleted), so the row names nothing at all — judged
    // without ever loading the row's own site, which is what makes it observable.
    if (!(column.includes(".") ? live.has(column) : liveProps.has(column))) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: ORPHAN(key) });
    } else if (!claimed.has(key)) {
      // MODE (A): the column still exists but nothing violates any more — the key gained a producer, or the
      // reader is gone. `claimed` is populated ONLY by a live verdict, never by the table itself.
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: STALE(key) });
    }
  }
}

export const gate: GateDescriptor = {
  name: "open-json-column-key-parity",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project", // the verdict compares readers and writers that live in different packages
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes("packages/db/src/schema/") || p.includes("packages/server/src/"),
  run: runGate,

  mustFlag: [
    {
      files: {
        "packages/db/src/schema/embeddings.ts":
          'export const imageEmbeddings = sqliteTable("image_embeddings", {\n  captionMeta: text("caption_meta", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/embeddings/indexer/caption.ts":
          "export async function analyse(db, id, model) {\n  await db.insert(imageEmbeddings).values({ captionMeta: { model } });\n}\n",
        "packages/server/src/domain/discovery/persistence/embed-store-reads.ts":
          "export async function facetRows(db) {\n  return await db.all(sql`SELECT id FROM image_embeddings ie WHERE json_extract(ie.caption_meta, '$.artStyle') IS NOT NULL`);\n}\n",
      },
      expect: { count: 1, token: "imageEmbeddings.captionMeta:artStyle" },
      why: "THE FOUNDING DEFECT verbatim (issue #164): the writer stores `{ model }` and the reader json_extracts `$.artStyle` off the same open column — a rendered surface that is blank forever with every gate green",
    },
    {
      files: {
        "packages/db/src/schema/embeddings.ts":
          'export const imageEmbeddings = sqliteTable("image_embeddings", {\n  captionMeta: text("caption_meta", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/embeddings/indexer/caption.ts":
          "export async function analyse(db, id, model) {\n  await db.insert(imageEmbeddings).values({ captionMeta: { model } });\n}\n",
        "packages/server/src/domain/discovery/image-analytics/facets.ts":
          'export function label(row: { captionMeta: { [k: string]: unknown } }): unknown {\n  return row.captionMeta["palette"];\n}\n',
      },
      expect: { count: 1, token: "imageEmbeddings.captionMeta:palette" },
      why: 'the `blob["k"]` spelling of the same defect — a string-keyed read off an open bag, which is text and not a type at every tier (audit §0.3). A name/shape matcher would pass it',
    },
    {
      files: {
        "packages/db/src/schema/embeddings.ts":
          'export const imageEmbeddings = sqliteTable("image_embeddings", {\n  captionMeta: text("caption_meta", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/embeddings/persistence/queries.ts":
          "export async function store(db, input: { captionMeta: { [k: string]: unknown } }) {\n  await db.insert(imageEmbeddings).values({ captionMeta: input.captionMeta });\n}\n",
        "packages/server/src/domain/discovery/image-analytics/facets.ts":
          'export function label(row: { captionMeta: { [k: string]: unknown } }): unknown {\n  return row.captionMeta["artStyle"];\n}\n',
      },
      expect: { count: 1, token: "imageEmbeddings.captionMeta" },
      why: "the UNPROVABLE arm: the writer carries an OPEN-typed value end to end, so nothing in the tree can say whether `artStyle` is ever produced — the exact shape that let the founding defect exist. Reported at the schema column, where CLOSING THE TYPE fixes it",
    },
    {
      // THE DRIZZLE-SQL WRITE FENCE (D148 #679 U8, RED-FIRST discriminating). A `.set({ col: sql`…` })` write
      // (or any value TYPED as drizzle `SQL`) stores an UNKNOWABLE key set — the raw fragment is opaque to the
      // checker. Without the fence, `typeKeys` harvests the `SQL` interface's members (getSQL/queryChunks/…) as
      // a fake, NON-opaque vocabulary: the reader key then misses it and the gate emits a per-key PARITY token
      // `widgets.residue:someKey`, so this row (expecting the whole-column UNPROVABLE token) goes RED. With the
      // fence the write is opaque, the read is the UNPROVABLE arm, and the token is `widgets.residue` — the same
      // treatment `namesNoKey` already gives String/Array to keep their prototypes out of the vocabulary. On the
      // REAL tree this is exactly what U8's `writePluginCardData` `.set({ extensions: sql`json_set(…)` })`
      // triggered: 5 open-json reds off `characters.extensions` + a staled DOORWAY, all 0 after the fence.
      // The column here is a SYNTHETIC `widgets.residue` on purpose — the real `characters.extensions` is a
      // DOORWAY row, so its UNPROVABLE token is exempted and the finding is swallowed (0, not 1); a fresh
      // non-exempt column is what lets the pin actually observe the flip.
      files: {
        "packages/db/src/schema/widget.ts":
          'export const widgets = sqliteTable("widgets", {\n  residue: text("residue", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/widget/persistence/write.ts":
          "interface SQL { getSQL(): void; queryChunks: unknown[] }\nexport async function writeState(db, frag: SQL) {\n  await db.update(widgets).set({ residue: frag });\n}\n",
        "packages/server/src/domain/widget/read.ts":
          "export function readState(db) {\n  return db.all(sql`SELECT id FROM widgets w WHERE json_extract(w.residue, '$.someKey') IS NOT NULL`);\n}\n",
      },
      expect: { count: 1, token: "widgets.residue" },
      why: "the drizzle-SQL write fence, red-first: WITHOUT it `typeKeys` harvests the `SQL` interface's prototype members as a fake vocabulary and the reader key misses it, emitting the per-key parity token `widgets.residue:someKey` (this row, expecting the whole-column UNPROVABLE token, then fails); WITH it the write is opaque, so the read is UNPROVABLE and the token is `widgets.residue`. A synthetic non-DOORWAY column is used because the real `characters.extensions` (the U8 carrier) is exempt and would swallow the finding.",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/schema/settings.ts":
          'export const settings = sqliteTable("settings", {\n  value: text("value", { mode: "json" }).$type<JsonValue>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/write.ts":
          "export async function save(db) {\n  await db.insert(settings).values({ value: { theme: 1 } });\n}\n",
        "packages/server/src/domain/automation/persistence/migrate.ts":
          "export async function arms(db) {\n  return await db.all(sql`select element.key from json_each(actions_json) as element where json_extract(element.value, '$.type') = 'tool'`);\n}\n",
      },
      why: "#1802 — a `json_each(…) AS element` alias is a table-valued function's VIRTUAL row: `element.value` is json_each's own column, never the open `settings.value` blob, so the read addresses nothing open (the pool-by-name fallback used to attribute it and red a key the blob's writers never spell — a lying, run-order-dependent verdict)",
    },
    {
      files: {
        "packages/db/src/schema/embeddings.ts":
          'export const imageEmbeddings = sqliteTable("image_embeddings", {\n  captionMeta: text("caption_meta", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/embeddings/indexer/caption.ts":
          "export async function analyse(db, model, artStyle) {\n  await db.insert(imageEmbeddings).values({ captionMeta: { model, artStyle } });\n}\n",
        "packages/server/src/domain/discovery/persistence/embed-store-reads.ts":
          "export async function facetRows(db) {\n  return await db.all(sql`SELECT id FROM image_embeddings ie WHERE json_extract(ie.caption_meta, '$.artStyle') IS NOT NULL`);\n}\n",
      },
      why: "THE FIX shape: the writer's literal produces the very key the reader names — parity holds, and this row is the gate's regression pin against re-flagging a corrected column",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts":
          'export const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }).$type<ChatMetadata>(),\n});\nexport interface ChatMetadata { readonly background?: string }\n',
        "packages/server/src/domain/chat/verbs/read.ts": "export function bg(meta: ChatMetadata): unknown {\n  return meta.background;\n}\n",
      },
      why: "DECLARED LIMIT — a TYPED column is NEVER judged: the type binds writer to reader, which is why the audit's 297-field sweep over 43 typed column types found zero (§0). The gate's whole scope is the open set",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts":
          'export const chats = sqliteTable("chats", {\n  runtimeVariables: text("runtime_variables", { mode: "json" }).$type<Record<string, string>>(),\n});\n',
        "packages/server/src/domain/chat/verbs/vars.ts": "export function names(vars: Record<string, string>): string[] {\n  return Object.keys(vars);\n}\n",
      },
      why: "DECLARED LIMIT — a USER-AUTHORED key space (macro names) read by `Object.keys` names no key at all: there is no fixed vocabulary to drift from, so it is not this class (audit §3 row 13)",
    },
    {
      files: {
        "packages/db/src/schema/embeddings.ts":
          'export const imageEmbeddings = sqliteTable("image_embeddings", {\n  captionMeta: text("caption_meta", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/embeddings/indexer/caption.ts":
          "export async function analyse(db, model) {\n  await db.insert(imageEmbeddings).values({ captionMeta: { model } });\n}\n",
        "packages/server/src/domain/discovery/persistence/embed-store-reads.ts":
          "export async function byFacet(db, sel: { path: string }) {\n  return await db.all(sql`SELECT id FROM image_embeddings ie WHERE json_extract($" +
          "{imageEmbeddings.captionMeta}, $" +
          "{sel.path}) IS NOT NULL`);\n}\n",
      },
      why: "DECLARED LIMIT — an INTERPOLATED json path names no literal key, so it is invisible here (the live allowlisted caption drill, audit §4). The vocabulary it pivots on is closed one tier up, in contracts",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts":
          'export const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/chat/verbs/local.ts": "export function local(): unknown {\n  const metadata = { model: 1 };\n  return metadata.model;\n}\n",
        "packages/server/src/domain/chat/verbs/named.ts":
          'interface JwtClaims { readonly [k: string]: unknown }\nexport function claim(row: { metadata: JwtClaims }): unknown {\n  return row.metadata["sub"];\n}\n',
      },
      why: "the OPEN-BAG type fence: a same-named LOCAL object is not the column. Without it every `metadata.x` in the server would enter the reader index and the gate would be a false-positive factory",
    },
  ],
};
