// Reader-shape recognition for the open-json parity fact (split out of open-json-parity-fact.ts at the
// size cap, docs/law/Core-Tooling-Law.md §4.3). Collects the four reader shapes the 2026-08-18 audit
// found — `json_extract`/`json_each` SQL paths, `blob["k"]`, `blob.k`, and the one-hop `f(blob, "k")`
// helper — as `ReaderHit`s against an already-resolved open column, leaving verdict assembly to the caller.

import type { CallExpression, ElementAccessExpression, PropertyAccessExpression, TaggedTemplateExpression, Node as TsNode } from "ts-morph";
import { Node } from "ts-morph";
import { sqlTemplateText } from "../../floor/code-facts/drizzle-sql.ts";
import type { SqlAliasBindings } from "../../floor/code-facts/sql-alias-bindings.ts";
import { SQL_VIRTUAL_TABLE, sqlAliasBindings } from "../../floor/code-facts/sql-alias-bindings.ts";
import type { NativeValueObservationReaders } from "../../floor/code-facts/value-observation-contract.ts";
import type { nativeColumnRow } from "./native-value-projection.ts";
import { blobTargets } from "./open-json-row-origin.ts";
import type { OpenJsonColumn, Schema, Vocab } from "./open-json-vocabulary.ts";
import { addWrite } from "./open-json-vocabulary.ts";

// ── SQL text (readers AND json_set writers live in the same templates) ──────────────────────────────────
const SQL_READ_RE = /json_(?:extract|each)\(\s*([^,()]+?)\s*,\s*['"]\$\.([\w.]+)['"]/giu;
const SQL_WRITE_RE = /json_set\(\s*([^,()]+?)\s*,\s*['"]\$\.([\w.]+)['"]/giu;
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
  options: { readonly out: ReaderHit[]; readonly readColumn: (node: TsNode) => ReturnType<typeof nativeColumnRow> },
): void {
  const { out, readColumn } = options;
  for (const ea of elements) {
    const arg = ea.getArgumentExpression();
    const key = arg !== undefined && Node.isStringLiteral(arg) ? arg.getLiteralText() : undefined;
    const targets = key === undefined ? [] : blobTargets(ea.getExpression(), byProp, readColumn);
    if (key !== undefined && targets.length > 0) {
      out.push({ node: ea, offset: offsetOf(ea, key), key, targets });
    }
  }
  for (const pae of properties) {
    const targets = blobTargets(pae.getExpression(), byProp, readColumn);
    if (targets.length > 0) {
      out.push({ node: pae, offset: offsetOf(pae, pae.getName()), key: pae.getName(), targets });
    }
  }
}

/** The one-hop helper shape `f(blob, "k")` — the live `metaStr(r.captionMeta, "rating")` spelling, admitted
 *  only when the helper PROVES the string is a key by indexing the blob with it. */
export function collectHelperReads(
  calls: readonly CallExpression[],
  byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>,
  out: ReaderHit[],
  read: Pick<NativeValueObservationReaders, "columnRow" | "indexedParameters">,
): void {
  for (const call of calls) {
    const args = call.getArguments();
    const blobPos = args.findIndex((a) => blobTargets(a, byProp, read.columnRow).length > 0);
    const blobArg = blobPos < 0 ? undefined : args[blobPos];
    if (blobArg === undefined) {
      continue;
    }
    const targets = blobTargets(blobArg, byProp, read.columnRow);
    if (!args.some((argument, index) => index !== blobPos && Node.isStringLiteral(argument))) {
      continue;
    }
    const indexed = read.indexedParameters(call);
    args.forEach((a, i) => {
      if (i !== blobPos && Node.isStringLiteral(a) && indexed.some((indexedRead) => indexedRead.receiverIndex === blobPos && indexedRead.keyIndex === i)) {
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
    const text = sqlTemplateText(tt);
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
