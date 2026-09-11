// "Which TABLE expression does this Drizzle write chain name?" — the subject reader behind every
// single-writer / column-invariant policy, answered by BINDING rather than by spelling.
//
// `readDrizzleClientCall` answers whether ONE call is a Drizzle client verb. This answers the chain
// question above it: `.set(…)` / `.values(…)` / `.onConflictDoUpdate(…)` are all written downstream of the
// `update(t)` / `insert(t)` that chose the table, and the repo reaches that verb through a hoisted builder
// (`const q = db.update(t); q.set(…)`), through a FACTORY that returns one (`makeUpdate(db).set(…)`, same
// module or imported), and through any number of intervening `.where`/`.values` links. Every one of those
// hops is the SHARED binding resolver plus `readCallReturns`; nothing here re-implements an alias chain,
// and there is no depth budget — the walk is bounded by a node-identity cycle guard.
//
// THREE ANSWERS, and the middle one is why this is not a boolean. `resolved(node)` is the table argument;
// `resolved(null)` is the honest NEGATIVE fact "there is no Drizzle write verb in this chain at all"
// (a `map.set(…)`, a foreign fluent API), which is absence of a SUBJECT rather than a failure to read;
// `unresolved` is a write verb this reader found and could not follow, which a caller must fail closed on.
// Collapsing the last two is exactly how an aliased or computed table walks past a name-keyed policy.
//
// The table argument is handed back UNJUDGED: which table is guarded, and whether an unbindable identifier
// is "somebody else's table" or "a subject I refuse", are the calling policy's law, decided on the shared
// module-origin fact of this node.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { ReferenceFact, ReferenceUnresolvedReason, UnresolvedReferenceFact } from "../contract/reference-fact.ts";
import { unwrapExpression } from "./ast-read.ts";
import { readCallReturns } from "./authored-key-set.ts";
import { resolveStableExpression } from "./reference-fact.ts";

/** The two Drizzle verbs that CHOOSE a table for a write. `delete` is excluded on purpose: it names a table
 *  but writes no columns, so a column-invariant caller has nothing to judge there. */
const WRITE_VERBS = new Set(["update", "insert"]);

type TableFact = ReferenceFact<MorphNode | null>;

interface ChainState {
  readonly active: Set<object>;
}

function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [], origin: node } };
}

function found(node: MorphNode | null, origin: MorphNode): TableFact {
  return { kind: "resolved", value: node, trace: { declarations: [], origin } };
}

/** The first candidate that names a table, or the first refusal if none did. A chain has at most one write
 *  verb, so "first" is not a choice between rivals — it is the only answer any candidate can give. */
function firstTable(candidates: readonly MorphNode[], state: ChainState, origin: MorphNode): TableFact {
  let refusal: UnresolvedReferenceFact | undefined;
  let hit: TableFact | undefined;
  for (const candidate of candidates) {
    if (hit !== undefined) {
      continue;
    }
    const fact = walk(candidate, state);
    if (fact.kind === "unresolved") {
      refusal = refusal ?? fact;
    } else if (fact.value !== null) {
      hit = fact;
    }
  }
  return hit ?? refusal ?? found(null, origin);
}

/** `makeUpdate(db).set(…)` / `run(db.update(t))` — a call in receiver position is either a FACTORY whose
 *  returns carry the builder, or a wrapper whose ARGUMENTS do. Both are tried; a factory this reader cannot
 *  enter is only a refusal when the arguments do not answer either. */
function callReceiver(call: import("ts-morph").CallExpression, state: ChainState): TableFact {
  const returns = readCallReturns(call);
  const fromArguments = firstTable(call.getArguments(), state, call);
  if (returns.kind === "unresolved") {
    return fromArguments.kind === "resolved" && fromArguments.value !== null ? fromArguments : unresolved(returns.reason, returns.node, returns.detail);
  }
  const fromReturns = firstTable(returns.value, state, call);
  return fromReturns.kind === "resolved" && fromReturns.value === null ? fromArguments : fromReturns;
}

function methodReceiver(call: import("ts-morph").CallExpression, callee: MorphNode, state: ChainState): TableFact {
  if (!Node.isPropertyAccessExpression(callee)) {
    return found(null, call);
  }
  if (!WRITE_VERBS.has(callee.getName())) {
    return walk(callee.getExpression(), state);
  }
  const argument = call.getArguments()[0];
  return argument === undefined
    ? unresolved("missing", callee.getNameNode(), `${callee.getName()}() names no table`)
    : found(unwrapExpression(argument), callee.getNameNode());
}

function walkEntered(current: MorphNode, state: ChainState): TableFact {
  if (Node.isCallExpression(current)) {
    const callee = unwrapExpression(current.getExpression());
    return Node.isIdentifier(callee) ? callReceiver(current, state) : methodReceiver(current, callee, state);
  }
  if (!Node.isIdentifier(current)) {
    return found(null, current);
  }
  const stable = resolveStableExpression(current);
  if (stable.kind === "unresolved") {
    // A binding whose initializer is a CALL is exactly the hoisted-builder shape; every other refusal here
    // means the identifier is not a chain this reader can follow, which is absence of a subject.
    return stable.reason === "dynamic" && Node.isCallExpression(stable.node) ? walk(stable.node, state) : found(null, current);
  }
  return stable.value.compilerNode === current.compilerNode ? found(null, current) : walk(stable.value, state);
}

function walk(node: MorphNode, state: ChainState): TableFact {
  const current = unwrapExpression(node);
  if (state.active.has(current.compilerNode)) {
    return unresolved("cycle", current, `write-chain cycle returns to ${current.getKindName()}`);
  }
  state.active.add(current.compilerNode);
  const fact = walkEntered(current, state);
  state.active.delete(current.compilerNode);
  return fact;
}

/** The table expression the write chain ending at `receiver` names: the argument of its `update()`/
 *  `insert()`, `null` when the chain contains neither, or one refusal. */
export function readDrizzleWriteTable(receiver: MorphNode): TableFact {
  return walk(receiver, { active: new Set<object>() });
}
