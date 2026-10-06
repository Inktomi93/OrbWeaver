// Reader-shape recognition for the open-json parity fact (split out of open-json-parity-fact.ts at the
// size cap, docs/law/Core-Tooling-Law.md §4.3). Collects the four reader shapes the 2026-08-18 audit
// found — `json_extract`/`json_each` SQL paths, `blob["k"]`, `blob.k`, and the one-hop `f(blob, "k")`
// helper — as `ReaderHit`s against an already-resolved open column, leaving verdict assembly to the caller.
import type { CallExpression, ElementAccessExpression, PropertyAccessExpression, TaggedTemplateExpression, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { blobTargets, tailName } from "./open-json-row-origin.ts";
import type { SqlAliasBindings } from "./open-json-sql-bindings.ts";
import { SQL_VIRTUAL_TABLE, sqlAliasBindings } from "./open-json-sql-bindings.ts";
import type { OpenJsonColumn, Schema, Vocab } from "./open-json-vocabulary.ts";
import { addWrite, unwrap } from "./open-json-vocabulary.ts";

// ── SQL text (readers AND json_set writers live in the same templates) ──────────────────────────────────
const SQL_READ_RE = /json_(?:extract|each)\(\s*([^,()]+?)\s*,\s*['"]\$\.([\w.]+)['"]/giu;
const SQL_WRITE_RE = /json_set\(\s*([^,()]+?)\s*,\s*['"]\$\.([\w.]+)['"]/giu;
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
function resolveSqlRef(ref: string, aliases: SqlAliasBindings, offset: number, schema: Schema): readonly OpenJsonColumn[] {
  const { columns, tables } = schema;
  const parts = ref.replaceAll("«", "").replaceAll("»", "").trim().split(".");
  const tail = parts.at(-1) ?? "";
  const head = parts.length > 1 ? (parts.at(-2) ?? "") : undefined;
  // ATTRIBUTION FIRST, name-pooling last. A drizzle interpolation names the table VARIABLE; a raw SQL ref
  // names the template's own FROM/JOIN alias. Reversing this order silently pools every same-named column
  // (`metadata` is a column on SIX tables), which is how a table-attributed reader loses its table.
  const byTableVar = head === undefined || !ref.includes("«") ? [] : columns.filter((c) => c.table === head && c.prop === tail);
  if (byTableVar.length > 0) {
    return byTableVar;
  }
  const sqlTable = head === undefined ? undefined : aliases.tableOf(head.toLowerCase(), tail.toLowerCase(), offset);
  // A json_each/json_tree alias (#1802): `element.value` is the VIRTUAL row's column, which no drizzle column
  // is — attributing it would pool every column NAMED `value` (the open `settings.value` blob among them) and
  // red a key that blob's writers never spell. Nothing open is addressed; the ref resolves to nothing.
  if (sqlTable === SQL_VIRTUAL_TABLE) {
    return [];
  }
  const byAlias = sqlTable === undefined ? [] : columns.filter((c) => tables.get(c.table) === sqlTable && (c.sqlName === tail || c.prop === tail));
  return byAlias.length > 0 ? byAlias : columns.filter((c) => c.prop === tail || c.sqlName === tail);
}

// ── reader collection ───────────────────────────────────────────────────────────────────────────────────
export interface ReaderHit {
  readonly node: TsNode;
  readonly offset: number;
  readonly key: string;
  readonly targets: readonly OpenJsonColumn[];
}

function offsetOf(node: TsNode, needle: string): number {
  return Math.max(node.getText().indexOf(needle), 0);
}

/** `blob["k"]` and `blob.k`. */
export function collectAccessReads(
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
export function collectHelperReads(calls: readonly CallExpression[], byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>, out: ReaderHit[]): void {
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
function sqlMatch(m: RegExpExecArray | RegExpMatchArray, aliases: SqlAliasBindings, schema: Schema): SqlPath | undefined {
  const [, ref, path] = m;
  const key = (path ?? "").split(".")[0] ?? "";
  const targets = ref === undefined ? [] : resolveSqlRef(ref, aliases, m.index ?? 0, schema);
  return key.length === 0 || targets.length === 0 ? undefined : { key, path: `$.${path ?? ""}`, targets };
}

interface SqlPath {
  readonly key: string;
  readonly path: string;
  readonly targets: readonly OpenJsonColumn[];
}

/** SQL `json_extract`/`json_each` paths (readers), and the `json_set` paths in the same templates (writers —
 *  a SQL-side merge is a real producer of that key). */
export function collectSqlReads(templates: readonly TaggedTemplateExpression[], schema: Schema, out: ReaderHit[], vocabs: Map<string, Vocab>): void {
  for (const tt of templates) {
    if (tt.getTag().getText() !== "sql") {
      continue;
    }
    const text = sqlText(tt);
    const aliases = sqlAliasBindings(text);
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
