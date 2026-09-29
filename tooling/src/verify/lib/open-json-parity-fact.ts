// Shared open-JSON reader/writer parity analysis. It returns every semantic verdict; policy authority is applied by consumers.
// The COLUMN and WRITER side — which columns are open and what keys they declare, what key set a type or
// value names, and every TypeScript-side writer's contribution to a column's vocabulary — is
// `open-json-vocabulary.ts` (split out at the size cap 2026-09-18); row/column origin resolution is
// `open-json-row-origin.ts` and reader-shape recognition is `open-json-reader-shapes.ts` (both split out
// at the same cap, docs/law/Core-Tooling-Law.md §4.3). This file pools writer vocabularies, judges each
// reader hit, and wires the whole analysis up as a fact.
import type {
  BinaryExpression,
  CallExpression,
  ElementAccessExpression,
  PropertyAccessExpression,
  PropertyAssignment,
  TaggedTemplateExpression,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { SchemaModel } from "../contract/schema-fact.ts";
import type { ReaderHit } from "./open-json-reader-shapes.ts";
import { collectAccessReads, collectHelperReads, collectSqlReads } from "./open-json-reader-shapes.ts";
import type { OpenJsonColumn, Vocab } from "./open-json-vocabulary.ts";
import { colKey, collectAccumulatorWrites, collectPropertyWrites, deriveSchema } from "./open-json-vocabulary.ts";

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
