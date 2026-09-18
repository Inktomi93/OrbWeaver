// Shared open-JSON reader/writer parity analysis. It returns every semantic verdict; policy authority is applied by consumers.
// The COLUMN and WRITER side — which columns are open and what keys they declare, what key set a type or
// value names, and every TypeScript-side writer's contribution to a column's vocabulary — is
// `open-json-vocabulary.ts` (split out at the size cap 2026-09-18); SQL text, reader collection and the
// verdict stay here.
import type {
  BinaryExpression,
  CallExpression,
  ElementAccessExpression,
  PropertyAccessExpression,
  PropertyAssignment,
  TaggedTemplateExpression,
  Node as TsNode,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { SchemaModel } from "../contract/schema-fact.ts";
import type { OpenJsonColumn, Schema, Vocab } from "./open-json-vocabulary.ts";
import { addWrite, colKey, collectAccumulatorWrites, collectPropertyWrites, deriveSchema, isOpenBag, unwrap } from "./open-json-vocabulary.ts";

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

interface OpenJsonVerdict {
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
