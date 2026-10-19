// Shared JSON-column writer analysis. Gate policies consume this reader instead of discovering or walking the compiler project.
// ARM A — the row-derived taint analysis of `.set()` writers — is `json-column-writers.ts` (split out at the
// size cap 2026-09-18); ARM B (guard dominance) and the fact stay here.

import type { Block, CallExpression, Statement, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readUpsertSetArgument } from "../../floor/code-facts/drizzle-columns.ts";
import type { DrizzleWriteRootVerb } from "../../floor/code-facts/drizzle-vocabulary.ts";
import { DRIZZLE_INSERT_VERB, DRIZZLE_SET_VERB, DRIZZLE_UPDATE_VERB, DRIZZLE_UPSERT_VERB } from "../../floor/code-facts/drizzle-vocabulary.ts";
import { staticMemberAccess } from "../../floor/code-facts/reference-fact.ts";
import type { SchemaProjectedModel } from "../../floor/code-facts/schema-projection-contract.ts";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { defineFact } from "../contract/fact.ts";
import type { JsonColumnOriginContext } from "../contract/json-column-origin.ts";
import type { jsonColumnObservedReaders } from "./json-column-observed-readers.ts";
import { jsonColumnObservationPlan, jsonColumnObservedCohort } from "./json-column-observed-readers.ts";
import { createObservedJsonColumnOriginContext } from "./json-column-origin-context.ts";
import type { JsonColumnWriter, JsonWriteScan, JsonWriteUnknown } from "./json-column-writers.ts";
import {
  collectJsonWritersByColumnWith,
  collectWriters,
  DOMAIN_DIR,
  jsonWriterColumn,
  judgeOrUnknown,
  updatedTable,
  updatedTableWith,
} from "./json-column-writers.ts";

const CONTRACTS_DIR = "/packages/contracts/src/";

// ── ARM B: the versioned-config dominance arm (#879) ───────────────────────────────────────────────────
const DEFINE_VERSIONED_CONFIG = "defineVersionedConfig";
const GUARD_CALLEE = "requireIntactStoredConfig";
/** The exemption-key name for a write with no enclosing function / no readable one. */
const TOP_LEVEL_SITE = "(top-level)";
const ANONYMOUS_SITE = "(anonymous)";
/** How much of an OPAQUE `.set(<expr>)` the finding quotes as its position token. */
const OPAQUE_TOKEN_CHARS = 40;
/** The resolved declaration type of a `defineVersionedConfig(...)` binding, when no explicit type argument
 *  was written (`promptConfigConfig` is the live inferred spelling). */
const VERSIONED_CONFIG_TYPE_RE = /VersionedConfig<([^>]+)>/u;

const JSON_UNREADABLE_CONFIG_MESSAGE =
  "UNREADABLE `defineVersionedConfig(...)` declaration — the gate cannot resolve which TYPE this versioned " +
  "config owns (no explicit type argument, and the binding's declared type is not a `VersionedConfig<T>`). " +
  "Analysis is withheld rather than erasing its columns' write guard obligation. Write the type argument explicitly " +
  "(`defineVersionedConfig<PromptConfig>({ … })`) so the ownership is readable without the checker.";

/** Every drizzle table variable → the names of its `mode: "json"` columns, and the SUBSET whose `$type<T>`
 *  names a versioned-config-owned type. Derived from the schema package, never hand-listed. */
export interface JsonColumnIndex {
  /** table variable → every `mode:"json"` column (ARM A's subject). */
  readonly all: Map<string, ReadonlySet<string>>;
  /** table variable → the versioned-config-owned subset (ARM B's subject). */
  readonly versioned: Map<string, ReadonlySet<string>>;
}

function deriveJsonColumns(schema: SchemaProjectedModel, versionedTypes: ReadonlySet<string>): JsonColumnIndex {
  const all = new Map<string, ReadonlySet<string>>();
  const versioned = new Map<string, ReadonlySet<string>>();
  for (const table of schema.tables) {
    const json = table.columns.filter((column) => column.json !== null);
    if (json.length === 0) {
      continue;
    }
    all.set(table.identity.declarationName, new Set(json.map((column) => column.identity.propertyName)));
    const owned = json.filter((column) => {
      const declared = column.typeOverride?.node.getText().trim().split(".").at(-1);
      return declared !== undefined && versionedTypes.has(declared);
    });
    if (owned.length > 0) {
      versioned.set(table.identity.declarationName, new Set(owned.map((column) => column.identity.propertyName)));
    }
  }
  return { all, versioned };
}

/** The TYPE one `defineVersionedConfig(...)` owns — the EXPLICIT type argument, else the binding's resolved
 *  `VersionedConfig<T>` (the live inferred `promptConfigConfig` spelling). `undefined` = readable neither
 *  way, which this gate REPORTS rather than silently dropping the column obligation it carries. */
function ownedTypeOf(call: CallExpression, typeText: (node: TsNode) => string): string | undefined {
  const explicit = call.getTypeArguments()[0]?.getText().trim();
  if (explicit !== undefined && explicit !== "") {
    return explicit;
  }
  const decl = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const inferred = decl === undefined ? undefined : VERSIONED_CONFIG_TYPE_RE.exec(typeText(decl))?.[1];
  // A resolved type prints qualified (`import("…/preset").PromptConfig`); the DECLARED name is the tail.
  const name = inferred?.trim().split(".").at(-1);
  return name === undefined || name === "" || name.includes("(") ? undefined : name;
}

/** Every versioned-config declaration in `contracts`, split into the types it could read and the calls it
 *  could not (the #944 fail-closed half — a `continue` here would erase obligations silently). */
function deriveVersionedTypes(
  candidates: readonly CallExpression[],
  typeText: (node: TsNode) => string,
): {
  readonly types: Set<string>;
  readonly unresolved: CallExpression[];
  readonly calls: number;
} {
  const types = new Set<string>();
  const unresolved: CallExpression[] = [];
  let calls = 0;
  for (const call of candidates) {
    if (call.getSourceFile().getFilePath().includes(CONTRACTS_DIR)) {
      if (call.getExpression().getText() !== DEFINE_VERSIONED_CONFIG) {
        continue;
      }
      calls += 1;
      const owned = ownedTypeOf(call, typeText);
      if (owned === undefined) {
        unresolved.push(call);
      } else {
        types.add(owned);
      }
    }
  }
  return { types, unresolved, calls };
}

// ── ARM B: the versioned-config dominance arm ──────────────────────────────────────────────────────────

/** One whole-replace write of a versioned-config column, and the exemption key that would forgive it. */
export interface JsonGuardTarget {
  readonly node: TsNode;
  readonly token: string;
  /** `<repo-relative file>#<enclosing function>` — the GUARD_EXEMPT key. */
  readonly key: string;
  readonly dominated: boolean;
  readonly opaque: boolean;
}

/** The enclosing function's BODY BLOCK and the name a reader would call it — the unit dominance is judged
 *  in. A write outside any function body has no place to put a guard and is never dominated. */
interface EnclosingFunction {
  readonly body: Block;
  readonly name: string;
}

function enclosingBody(node: TsNode): EnclosingFunction | undefined {
  let found: EnclosingFunction | undefined;
  for (const a of node.getAncestors()) {
    const body =
      Node.isFunctionDeclaration(a) || Node.isMethodDeclaration(a) || Node.isFunctionExpression(a) || Node.isArrowFunction(a) ? a.getBody() : undefined;
    if (body === undefined || !Node.isBlock(body)) {
      continue;
    }
    const named =
      Node.isFunctionDeclaration(a) || Node.isMethodDeclaration(a) ? a.getName() : a.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName();
    found = { body, name: named === undefined || named === "" ? ANONYMOUS_SITE : named };
    break;
  }
  return found;
}

/** Which of `statements` this node sits under, by identity — the position dominance compares. */
function statementIndexIn(node: TsNode, statements: readonly Statement[]): number {
  for (let cur: TsNode | undefined = node; cur !== undefined; cur = cur.getParent()) {
    const at = statements.indexOf(cur as Statement);
    if (at >= 0) {
      return at;
    }
  }
  return -1;
}

/** DOMINANCE, not presence: some `requireIntactStoredConfig(...)` call's own top-level statement must
 *  PRECEDE the write's top-level statement in the same function body. A guard nested inside an EARLIER
 *  statement counts (`if (row !== undefined) { guard }` is the live correct shape — an absent row is a
 *  legitimate first write); a guard in the write's own statement, in a sibling branch, or after it, does not. */
function isDominatedByGuard(node: TsNode, body: Block): boolean {
  const statements = body.getStatements();
  const writeAt = statementIndexIn(node, statements);
  if (writeAt < 0) {
    return false;
  }
  return body.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    if (call.getExpression().getText() !== GUARD_CALLEE) {
      return false;
    }
    const guardAt = statementIndexIn(call, statements);
    return guardAt >= 0 && guardAt < writeAt;
  });
}

/** The unwrapped `.set(...)` / `onConflictDoUpdate({ set })` argument, for the OPAQUE test. */
function unwrapArg(arg: TsNode | undefined): TsNode | undefined {
  return arg !== undefined && Node.isParenthesizedExpression(arg) ? unwrapArg(arg.getExpression()) : arg;
}

/** Every whole-replace write of a versioned-config column reachable from one `set` object, plus the
 *  fail-closed OPAQUE verdict when the gate cannot read the object at all. */
function guardTargetsOf(
  setArg: TsNode | undefined,
  target: { readonly cols: ReadonlySet<string>; readonly table: import("../../floor/code-facts/schema-projection-contract.ts").SchemaProjectedTable },
  root: string,
  context: JsonColumnOriginContext,
): JsonGuardTarget[] {
  const { cols, table } = target;
  const arg = unwrapArg(setArg);
  if (arg === undefined) {
    return [];
  }
  const site = enclosingBody(arg);
  const key = `${arg.getSourceFile().getFilePath().replace(`${root}/`, "")}#${site === undefined ? TOP_LEVEL_SITE : site.name}`;
  const dominates = (n: TsNode): boolean => site !== undefined && isDominatedByGuard(n, site.body);
  if (!Node.isObjectLiteralExpression(arg)) {
    return [{ node: arg, token: arg.getText().slice(0, OPAQUE_TOKEN_CHARS), key, dominated: dominates(arg), opaque: true }];
  }
  const found: JsonColumnWriter[] = [];
  collectWriters(arg, { cols, out: found, table }, context, 0);
  return found
    .filter((w) => (w.wholeReplace || w.historicalHeal) && cols.has(jsonWriterColumn(w)))
    .map((w) => ({ node: w.node, token: jsonWriterColumn(w), key, dominated: dominates(w.node), opaque: false }));
}

/** The write verb → the fluent chain verb that names its table. An upsert's `set` replaces the blob of an
 *  EXISTING row, so it owes the guard exactly as `.set()` does. */
const WRITE_VERBS: ReadonlyMap<string, DrizzleWriteRootVerb> = new Map([
  [DRIZZLE_SET_VERB, DRIZZLE_UPDATE_VERB],
  [DRIZZLE_UPSERT_VERB, DRIZZLE_INSERT_VERB],
]);

/** The `set` object of ONE write call, when that call writes a table owning a versioned-config column. */
function versionedSetArg(
  call: CallExpression,
  versionedColumns: ReadonlyMap<string, ReadonlySet<string>>,
  context: JsonColumnOriginContext,
): { readonly arg: TsNode | undefined; readonly cols: ReadonlySet<string>; readonly table: string } | undefined {
  const callee = context.schemaReaders.member(call.getExpression());
  if (callee === undefined) {
    return;
  }
  const chainVerb = WRITE_VERBS.get(callee.name);
  let table: string | undefined;
  if (chainVerb !== undefined) {
    table =
      context.writerReaders === undefined
        ? updatedTable(callee.receiver, context.schema, chainVerb)
        : updatedTableWith(callee.receiver, context.writerReaders, chainVerb);
  }
  const cols = table === undefined ? undefined : versionedColumns.get(table);
  if (cols === undefined || table === undefined) {
    return;
  }
  return { arg: callee.name === DRIZZLE_UPSERT_VERB ? readUpsertSetArgument(call.getArguments()[0]) : call.getArguments()[0], cols, table };
}

/** Every versioned-config write site in the domain corpus, classified. */
function collectJsonGuardTargets(
  calls: readonly CallExpression[],
  versionedColumns: ReadonlyMap<string, ReadonlySet<string>>,
  root: string,
  scan: JsonWriteScan,
): JsonGuardTarget[] {
  const out: JsonGuardTarget[] = [];
  for (const call of calls) {
    if (call.getSourceFile().getFilePath().includes(DOMAIN_DIR)) {
      const context = scan.contextFor(call);
      const schema = context.schema;
      const target = versionedSetArg(call, versionedColumns, context);
      if (target !== undefined) {
        const table = schema.tables.find((candidate) => candidate.identity.declarationName === target.table);
        if (table === undefined) {
          throw new Error(`json-column-writes: versioned table disappeared: ${target.table}`);
        }
        out.push(...(judgeOrUnknown(call, scan.unknowns, () => guardTargetsOf(target.arg, { cols: target.cols, table }, root, context)) ?? []));
      }
    }
  }
  return out;
}

export interface JsonColumnWriteAnalysis {
  readonly writers: ReadonlyMap<string, readonly JsonColumnWriter[]>;
  readonly guardTargets: readonly JsonGuardTarget[];
  /** Writes judged unknown (D328), one entry per write; the gate reports each as an advisory unknown. */
  readonly unknowns: readonly JsonWriteUnknown[];
}

export interface JsonColumnWriteFact {
  readonly analyze: (schema: SchemaProjectedModel) => JsonColumnWriteAnalysis;
}

// The calls this reader judges: a write whose callee member is a WRITE_VERBS verb (or a computed key the static
// reader cannot name), and a contracts `defineVersionedConfig(` declaration. Every other call returns before any
// observation is read, so these are the observation roots; the ordinary closure adds what their writes carry.
function isJudgedCall(call: CallExpression): boolean {
  const callee = call.getExpression();
  if (Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee)) {
    const name = staticMemberAccess(callee)?.name;
    return name === undefined || WRITE_VERBS.has(name);
  }
  return call.getSourceFile().getFilePath().includes(CONTRACTS_DIR) && callee.getText() === DEFINE_VERSIONED_CONFIG;
}

/** One shared, invocation-local analysis of JSON columns and their writer shapes. */
export const jsonColumnWriteFact = defineFact({
  id: "json-column-writes",
  population: {
    in: ["@db", "@server", "@contracts"],
    under: ["packages/db/src/schema/**", "packages/server/src/domain/**", "packages/contracts/src/**"],
  },
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const calls: CallExpression[] = [];
    let judged: readonly CallExpression[] = [];
    const native = ctx.nativeTypes;
    if (native === undefined) {
      throw new Error("native JSON writer observation context is unavailable");
    }
    let plan: InventoryInvocationPlan | undefined;
    return {
      prepare: (): void => {
        judged = calls.filter(isJudgedCall);
        plan = jsonColumnObservationPlan(judged, []);
        native.request({ kind: "invocation-evidence", nodes: ctx.files, plan });
      },
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (Node.isCallExpression(node)) {
              calls.push(node);
            }
          },
        },
      ],
      finish: (): JsonColumnWriteFact => {
        const first = ctx.files[0];
        if (first === undefined) {
          throw new Error("json-column-writes: effective source population is empty");
        }
        const rel = ctx.relativePath(first);
        const root = first
          .getSourceFile()
          .getFilePath()
          .replaceAll("\\", "/")
          .slice(0, -(rel.length + 1));
        ctx.receipt({ kind: "population", source: "json-column-write-sources", members: ctx.files.length });
        return Object.freeze({
          analyze: (schema: SchemaProjectedModel): JsonColumnWriteAnalysis => {
            if (plan === undefined) {
              throw new Error("native JSON writer observation cohort was not prepared");
            }
            const delivered = jsonColumnObservedCohort(native.invocationEvidence(ctx.files, plan), schema);
            const observationsFor = (node: TsNode): ReturnType<typeof jsonColumnObservedReaders> => {
              const value = delivered.get(node.getSourceFile());
              if (value === undefined) {
                throw new Error("native JSON writer source world is unavailable");
              }
              return value;
            };
            const contexts = new Map<object, JsonColumnOriginContext>();
            const contextFor = (call: CallExpression): JsonColumnOriginContext => {
              const value = observationsFor(call);
              let context = contexts.get(value.graph);
              if (context === undefined) {
                context = createObservedJsonColumnOriginContext(schema, value);
                contexts.set(value.graph, context);
              }
              return context;
            };
            const versioned = deriveVersionedTypes(judged, (node) => {
              const type = observationsFor(node).selected({ base: { kind: "node", node }, steps: [], displayAt: node });
              if (type?.display === null || type === null) {
                throw new Error("native JSON versioned binding display is unavailable");
              }
              return type.display;
            });
            if (versioned.unresolved.length > 0) {
              const declarations = versioned.unresolved.map((call) => call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ?? "(unbound)");
              throw new Error(`${JSON_UNREADABLE_CONFIG_MESSAGE} Unreadable declaration: ${declarations.join(", ")}.`);
            }
            const columns = deriveJsonColumns(schema, versioned.types);
            const unknowns: JsonWriteUnknown[] = [];
            const scan: JsonWriteScan = { contextFor, unknowns };
            const writers = collectJsonWritersByColumnWith(judged, columns.all, scan);
            const guardTargets = collectJsonGuardTargets(judged, columns.versioned, root, scan);
            const unknownWrites = [...new Map(unknowns.map((unknown) => [unknown.node, unknown])).values()];
            return Object.freeze({ writers, guardTargets, unknowns: unknownWrites });
          },
        });
      },
    };
  },
});
