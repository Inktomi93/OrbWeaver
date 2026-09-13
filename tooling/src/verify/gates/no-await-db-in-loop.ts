// Spine-TypeScript-and-Patterns.md §8: an awaited Drizzle query inside a loop is an N+1 — one round trip per
// iteration. The query identity comes from the shared `readDrizzleClientCall` reader (the called METHOD is
// declared inside the installed drizzle-orm package), so `deps.db.select()`, an aliased handle and
// `db["insert"]()` are the same query while a same-named method on a local class is not. The loop test is a
// BOUNDED ancestor walk up from the delivered await, stopping at the first function boundary — an await
// inside a nested callback is not executed by the loop body. DECLARED LIMITS live in the mustPass rows.
//
// FAMILY `no-await-db-in-loop` — a declared SINGLETON. The reader it owns, `lib/drizzle-client-call.ts`, has
// exactly ONE importer (this module), which §5b.7 names as a shape to justify rather than assume: it lives in
// `lib/` because it is a substantial three-verdict identity reader over the installed drizzle package
// (drizzle · foreign · unresolved, with the method name and its anchor), and a policy module may not hold a
// private reader of that weight behind the contract (§5b.7). A second consumer — any policy asking "is this
// call a Drizzle round trip" — inherits it without a rewrite.
//
// POPULATION PORT: byte-identical, legacy at `e5a7a8a8c^`
// (`scanRoot: (p) => !(p.includes(".test.") || p.startsWith("tests/"))` over the whole harness corpus); the
// final `PRODUCTION_POPULATION` is that expression, and each of its two exclusion clauses owns its own
// mustPass row rather than sharing one.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyNodeFindingDetails } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { readDrizzleClientCall } from "../lib/drizzle-client-call.ts";

/** The legacy `DB_QUERY_RE` verb vocabulary, retained ONLY as the fail-closed backstop below: when the
 *  checker cannot bind the called member at all, a method spelled like a query verb is reported rather than
 *  silently admitted. A resolved NON-drizzle declaration is acquitted — that is the identity claim. */
const QUERY_VERBS = new Set(["query", "select", "insert", "update", "delete", "run", "execute", "executeMultiple", "batch", "transaction"]);

const LOOP_KINDS = new Set([SyntaxKind.ForStatement, SyntaxKind.ForOfStatement, SyntaxKind.ForInStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement]);

const MESSAGE =
  "an awaited Drizzle query runs inside a loop — the N+1 shape: one round trip per iteration. Batch it: " +
  "`inArray()` for per-id reads, a JOIN, `db.batch([...])` for multi-statement writes, `.values([...])` for " +
  "bulk inserts (Spine-TypeScript-and-Patterns.md §8).";

const FIX =
  "collapse the loop into one round trip (`inArray` / a JOIN / `db.batch` / bulk `.values`). When the " +
  "serialization is DELIBERATE — heartbeats, backpressure over a bound-variable cap, per-row error " +
  "observation — attach `@orb-waive no-await-db-in-loop(<the reported method>): <why one round trip per " +
  "iteration is the intent, and what would end it>` to that exact occurrence.";

/** THE FAIL-CLOSED THIRD ANSWER (#944) on the verb-vocabulary backstop, a SEPARATE text rather than a
 *  `${MESSAGE} …` suffix: the unreadable arm reports the same single finding under the same token as the
 *  drizzle verdict and differs ONLY in message, so a shared prefix would leave both arms unpinnable in
 *  either direction (guide §6.1). The two texts are disjoint. */
const UNREADABLE =
  "an awaited call inside a loop names a query verb on a receiver the checker cannot bind, so whether it is a Drizzle round trip CANNOT be established. Reported rather than silently admitted: an untyped seam is exactly where a real db handle hides, and the spelling alone is not the identity.";

/** Legacy `scanRoot` was `!(p.includes(".test.") || p.startsWith("tests/"))` over the whole harness corpus;
 *  the nine authored roots minus the test tree and every `*.test.*` basename is the same admitted set. */
const PRODUCTION_POPULATION = { in: ["@authored"], notUnder: ["tests/**"], notNamed: ["*.test.*"] } as const;

/** BOUNDED ancestor navigation on the delivered node — never a descendant sweep. Walks up from the await
 *  until it either enters a loop statement (RED) or crosses a function boundary, which means the await is
 *  executed by that inner function and not by the loop body. */
function awaitedInLoopBody(node: MorphNode): boolean {
  let current: MorphNode | undefined = node.getParent();
  while (current !== undefined && !Node.isSourceFile(current)) {
    if (LOOP_KINDS.has(current.getKind())) {
      return true;
    }
    if (Node.isFunctionDeclaration(current) || Node.isArrowFunction(current) || Node.isFunctionExpression(current) || Node.isMethodDeclaration(current)) {
      return false;
    }
    current = current.getParent();
  }
  return false;
}

/** The waiver-carrier boundary the central engine uses: a statement, or one of the declaration kinds it
 *  treats as a scope. ONE ROUND TRIP PER ITERATION IS ONE FINDING, and the reason is the waiver plane, not
 *  tidiness: a marker binds to its carrier and suppresses only when EXACTLY ONE finding of its position
 *  token lies inside it, so two awaits in one carrier make the site UNWAIVABLE BY CONSTRUCTION — the
 *  central engine calls the marker over-broad and suppresses neither. The live shape that proved it is a
 *  ternary whose two branches are MUTUALLY EXCLUSIVE (`assets/persistence/asset-refs.ts`): one statement,
 *  two awaited queries, exactly one round trip per iteration. */
function waiverCarrier(node: MorphNode): object {
  let current = node;
  let parent = current.getParent();
  while (parent !== undefined && !(Node.isBlock(parent) || Node.isSourceFile(parent) || Node.isModuleBlock(parent))) {
    current = parent;
    parent = current.getParent();
  }
  return current.compilerNode;
}

/** A bracket-spelled member's name node is the STRING LITERAL, so the authored token starts one character
 *  in; deriving the offset from the node's own text covers both spellings. The fail-closed arm carries the
 *  disjoint `UNREADABLE` text — the only thing that distinguishes it from the drizzle verdict. */
function findingDetails(method: string, anchor: MorphNode, unreadable: boolean): GatePolicyNodeFindingDetails {
  const offset = anchor.getText().indexOf(method);
  return unreadable ? { token: method, offset, message: UNREADABLE } : { token: method, offset };
}

export const gate = defineGate({
  id: "no-await-db-in-loop",
  family: "no-await-db-in-loop",
  authority: "ordinary",
  severity: "error",
  population: PRODUCTION_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const reported = new Set<object>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.AwaitExpression],
          visit: (node) => {
            if (!Node.isAwaitExpression(node)) {
              return;
            }
            const call = node.getExpression();
            // THE LOOP TEST RUNS FIRST, and it is pure syntax: resolving a property symbol on every awaited
            // call in a 7,000-file population is the ten-minute shape the id-brand lane measured. Only an
            // await the loop body actually executes ever pays for the checker.
            if (!(Node.isCallExpression(call) && awaitedInLoopBody(node))) {
              return;
            }
            const verdict = readDrizzleClientCall(call);
            if (verdict.kind === "foreign") {
              return;
            }
            // FAIL-CLOSED: a member the checker cannot bind, spelled like a query verb, is reported. An
            // unbindable receiver is exactly where a real db handle hides (an `any` seam, a broken door).
            const failClosed = verdict.kind === "unresolved" && verdict.method !== null && QUERY_VERBS.has(verdict.method);
            const anchor = verdict.nameNode;
            if (!(verdict.kind === "drizzle" || failClosed) || anchor === null) {
              return;
            }
            const carrier = waiverCarrier(node);
            if (reported.has(carrier)) {
              return;
            }
            reported.add(carrier);
            const method = verdict.method as string;
            // A bracket-spelled member's name node is the STRING LITERAL, so the authored token starts one
            // character in; deriving the offset from the node's own text covers both spellings.
            ctx.report.node(anchor, findingDetails(method, anchor, failClosed));
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts":
          "export declare class Db {\n  select(): Db;\n  from(table: unknown): Db;\n  where(predicate: unknown): Promise<readonly unknown[]>;\n}\n",
        "packages/server/src/domain/x/persistence/ternary.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(db: Db, xs: readonly string[], scoped: boolean): Promise<void> {\n  for (const x of xs) {\n    const rows = scoped ? await db.select().from(x).where(1) : await db.select().from(x).where(2);\n    void rows;\n  }\n}\n',
      },
      expect: { count: 1, token: "where" },
      why: "ONE ROUND TRIP PER ITERATION IS ONE FINDING. The two branches of a ternary are MUTUALLY EXCLUSIVE, so the loop makes one call — and reporting twice would make the site UNWAIVABLE BY CONSTRUCTION, because a positioned marker binds to its carrier and the central engine calls a marker matching two findings over-broad. The live `assets/persistence/asset-refs.ts` shape is exactly this",
    },
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts":
          "export declare class Db {\n  select(): Db;\n  insert(table: unknown): Db;\n  batch(statements: readonly unknown[]): Promise<void>;\n  from(table: unknown): Promise<readonly unknown[]>;\n}\n",
        "packages/server/src/domain/x/persistence/reads.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(db: Db, xs: readonly string[]): Promise<void> {\n  for (const x of xs) {\n    void x;\n    await db.select().from({});\n  }\n}\n',
      },
      expect: { count: 1, token: "from" },
      why: "the founding shape (§8) — an awaited `db.select().from(…)` in a for-of body: one round trip per iteration. The awaited call's own method is `from`, which the legacy `db.<verb>` text regex could only reach because the whole chain text still began with `db.`",
    },
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts": "export declare class Db {\n  insert(table: unknown): Promise<void>;\n}\n",
        "packages/server/src/domain/x/persistence/writes.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(deps: { readonly handle: Db }, xs: readonly string[]): Promise<void> {\n  while (xs.length > 0) {\n    await deps.handle.insert({});\n  }\n}\n',
      },
      expect: { count: 1, token: "insert" },
      why: "THE RECEIVER IS NOT NAMED `db`: a client reached through a deps object is the same round trip, and the legacy `\\b(db|tx)\\.` regex was blind to every handle whose binding was spelled anything else",
    },
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts": "export declare class Db {\n  insert(table: unknown): Promise<void>;\n}\n",
        "packages/server/src/domain/x/persistence/bracket.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(db: Db, xs: readonly string[]): Promise<void> {\n  for (const x of xs) {\n    void x;\n    await db["insert"]({});\n  }\n}\n',
      },
      expect: { count: 1, token: "insert" },
      why: "the BRACKET spelling of the same write — an ElementAccessExpression is not a PropertyAccessExpression and the text regex never matched it (#1506)",
    },
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts": "export declare class Db {\n  query: { readonly chats: { findMany(): Promise<readonly unknown[]> } };\n}\n",
        "packages/server/src/domain/x/persistence/relational.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(db: Db, xs: readonly string[]): Promise<void> {\n  for (const x of xs) {\n    void x;\n    await db.query.chats.findMany();\n  }\n}\n',
      },
      expect: { count: 1, token: "findMany" },
      why: "the RELATIONAL query API — `findMany` is not in any verb vocabulary, and the method's own drizzle declaration is what identifies it",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/persistence/untyped.ts":
          "export async function f(db: Record<string, (table: unknown) => Promise<void>>, xs: readonly string[]): Promise<void> {\n  for (const x of xs) {\n    void x;\n    await db.insert({});\n  }\n}\n",
      },
      expect: { count: 1, token: "insert", messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944) — the backstop's control: an INDEX-SIGNATURE receiver gives the checker no named property symbol for `insert`, so the drizzle claim cannot be proven either way. An unprovable query-verb call inside a loop is reported rather than silently admitted, because an untyped seam is exactly where a real handle hides. The row REACHED the arm before #2041 but could not PROVE it: the `messageIncludes` is the addition, because the unreadable arm emits the SAME single finding under the SAME token as the drizzle verdict and differed only in the descriptor message, so the old `{ count: 1, token }` passed identically whether the backstop fired or the `local-method.ts` identity arm did",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts": "export declare class Db {\n  insert(table: unknown): Promise<void>;\n}\n",
        "packages/server/src/domain/x/persistence/single.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(db: Db): Promise<void> {\n  await db.insert({});\n}\n',
      },
      why: "one awaited query outside any loop is the ordinary shape — the whole corpus does this",
    },
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts": "export declare class Db {\n  insert(table: unknown): Promise<void>;\n}\n",
        "packages/server/src/domain/x/persistence/local-method.ts":
          "export class Cache {\n  insert(value: unknown): Promise<void> {\n    void value;\n    return Promise.resolve();\n  }\n}\nexport async function f(cache: Cache, xs: readonly string[]): Promise<void> {\n  for (const x of xs) {\n    void x;\n    await cache.insert({});\n  }\n}\n",
      },
      why: "THE IDENTITY COUNTERFACTUAL: a same-named `insert` declared by a LOCAL class, awaited in a loop, with the drizzle package present in the same project. Everything the detector keys on matches except the method's declaration home — deleting the drizzle-path comparison turns this row red",
    },
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts": "export declare class Db {\n  insert(table: unknown): Promise<void>;\n}\n",
        "packages/server/src/domain/x/persistence/nested.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(db: Db, chunks: readonly (readonly string[])[]): Promise<void> {\n  for (const xs of chunks) {\n    const runs = xs.map(async (x) => {\n      void x;\n      await db.insert({});\n    });\n    await Promise.all(runs);\n  }\n}\n',
      },
      why: "the FUNCTION BOUNDARY: an await inside a callback the loop merely CONSTRUCTS is not executed per iteration — the walk stops there deliberately, which is what makes the batched `Promise.all` fan-out legal. THE FIXTURE CONTAINS THE LOOP THE LIMIT IS ABOUT (w9 D5, #2046): the previous version had no loop statement at all, so it proved the ABSENCE of a loop and the boundary stop could be deleted with every row staying green. The `await Promise.all(runs)` IS executed per iteration and is correctly silent — it is not a drizzle call",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/persistence/other-verb.ts":
          "export async function f(db: Record<string, (table: unknown) => Promise<void>>, xs: readonly string[]): Promise<void> {\n  for (const x of xs) {\n    void x;\n    await db.hydrate({});\n  }\n}\n",
      },
      why: "DECLARED LIMIT, and the receipt for `QUERY_VERBS` — the SAME unbindable INDEX-SIGNATURE receiver as the fail-closed row, awaited in a loop, whose method is NOT spelled like a query verb. The backstop is a VOCABULARY claim: an unprovable call is reported only when its spelling is one of the ten Drizzle verbs, because reporting every unbindable awaited call in a loop is not this policy's subject. Widening the verb set to any non-empty method reds this row (w9 :262, #2046)",
    },
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts": "export declare class Db {\n  insert(table: unknown): Promise<void>;\n}\n",
        "packages/server/src/domain/x/persistence/anchor.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(db: Db): Promise<void> {\n  await db.insert({});\n}\n',
        "tests/server/domain/x/loop-fixture.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(db: Db, xs: readonly string[]): Promise<void> {\n  for (const x of xs) {\n    void x;\n    await db.insert({});\n  }\n}\n',
      },
      why: "THE POPULATION FENCE, `notUnder: tests/**` half — the founding N+1 shape inside the test tree, beside an in-population anchor. A spec that drives N rows one at a time is describing the round trips, not committing them; the N+1 rule is about production round trips. Dropping the `tests/**` exclusion reds this row (w9 :262, #2046)",
    },
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts": "export declare class Db {\n  insert(table: unknown): Promise<void>;\n}\n",
        "packages/server/src/domain/x/persistence/anchor.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(db: Db): Promise<void> {\n  await db.insert({});\n}\n',
        "packages/server/src/domain/x/persistence/loops.test.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(db: Db, xs: readonly string[]): Promise<void> {\n  for (const x of xs) {\n    void x;\n    await db.insert({});\n  }\n}\n',
      },
      why: "THE POPULATION FENCE, `notNamed: *.test.*` half — the same shape in a COLOCATED-basename spec inside a production tree, which the `tests/**` clause above cannot reach. The two clauses are separately falsifiable and each has its own row (w9 :262, #2046)",
    },
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts": "export declare class Db {\n  batch(statements: readonly unknown[]): Promise<void>;\n}\n",
        "packages/server/src/domain/x/persistence/waived.ts":
          'import type { Db } from "drizzle-orm";\nexport async function f(db: Db, chunks: readonly (readonly unknown[])[]): Promise<void> {\n  for (const chunk of chunks) {\n    // @orb-waive no-await-db-in-loop(batch): bounded per-chunk batch — deliberate backpressure over the libSQL bound-variable cap. Ends if the driver lifts the cap.\n    await db.batch(chunk);\n  }\n}\n',
      },
      why: "the ONE central positioned waiver naming the exact reported method — the live `discovery/verbs/distill.ts` chunked-batch shape, and the exact marker its legacy `@orb-gate-ignore` translated to",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/persistence/unrelated.ts":
          "export async function f(io: { readonly write: (value: unknown) => Promise<void> }, xs: readonly string[]): Promise<void> {\n  for (const x of xs) {\n    await io.write(x);\n  }\n}\n",
      },
      why: "DECLARED LIMIT — an awaited call in a loop that is neither drizzle-proven nor spelled like a query verb is out of subject. This policy is about database round trips, not about awaiting in loops generally",
    },
  ],
});
