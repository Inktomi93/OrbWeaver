// Which TABLE expression does a Drizzle write chain name? Write-ness is the verb's DECLARATION (an `insert`/`update`
// that drizzle-orm declares), never its spelling, and the chain is walked through hoisted builders, factories and wrappers.
//
// THREE ANSWERS, and the middle one is why this is not a boolean. `resolved(node)` is the table argument;
// `resolved(null)` is the honest NEGATIVE fact "no drizzle write verb in this chain" (a `map.set(…)`, a foreign
// `store.update(…)`); `unresolved` is a verb this reader found and could not follow or declare, which a caller
// must fail closed on. The table argument is handed back UNJUDGED: which table is guarded is the caller's law.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { readCallReturns } from "./call-returns.ts";
import { readMemberReference, resolveStableExpression } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import type { ReferenceFact, ReferenceUnresolvedReason, UnresolvedReferenceFact } from "./reference-fact-contract.ts";

/** The two Drizzle verbs that CHOOSE a table for a write. `delete` is excluded on purpose: it names a table
 *  but writes no columns, so a column-invariant caller has nothing to judge there. */
const WRITE_VERBS: ReadonlySet<string> = new Set(["update", "insert"]);

const DRIZZLE_PACKAGE_INFIX = "/drizzle-orm/";

type TableFact = ReferenceFact<MorphNode | null>;

interface ChainState {
  readonly active: Set<object>;
}

/** The member a call invokes and the declarations the checker resolves for it; empty when it resolves none. */
export interface CalledMember {
  readonly name: string;
  readonly nameNode: MorphNode;
  readonly declarations: readonly MorphNode[];
}

/** The member `call` invokes, normalized across dotted, bracketed and optional spellings. */
export function readCalledMember(call: CallExpression): ReferenceFact<CalledMember> {
  const member = readMemberReference(call.getExpression());
  if (member.kind === "unresolved") {
    return member;
  }
  const { name, receiver, nameNode } = member.value;
  const declarations = receiver.getType().getProperty(name)?.getDeclarations() ?? [];
  return { kind: "resolved", value: { name, nameNode, declarations }, trace: member.trace };
}

/** Is every declaration inside the installed drizzle-orm package? */
export function declaredInDrizzle(declarations: readonly MorphNode[]): boolean {
  return declarations.every((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").includes(DRIZZLE_PACKAGE_INFIX));
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
function callReceiver(call: CallExpression, state: ChainState): TableFact {
  const returns = readCallReturns(call);
  const fromArguments = firstTable(call.getArguments(), state, call);
  if (returns.kind === "unresolved") {
    return fromArguments.kind === "resolved" && fromArguments.value !== null ? fromArguments : unresolved(returns.reason, returns.node, returns.detail);
  }
  const fromReturns = firstTable(returns.value, state, call);
  return fromReturns.kind === "resolved" && fromReturns.value === null ? fromArguments : fromReturns;
}

/** An `insert(<t>)` / `update(<t>)` call: the table when drizzle declares the verb, none when something else does. */
function verbTable(call: CallExpression, nameNode: MorphNode): TableFact {
  const member = readCalledMember(call);
  if (member.kind === "unresolved") {
    return unresolved(member.reason, member.node, member.detail);
  }
  const { name, declarations } = member.value;
  if (declarations.length === 0) {
    return unresolved("missing", nameNode, `the checker resolved no declaration for ${name}()`);
  }
  if (!declaredInDrizzle(declarations)) {
    return found(null, nameNode);
  }
  const argument = call.getArguments()[0];
  return argument === undefined ? unresolved("missing", nameNode, `${name}() names no table`) : found(unwrapTarget(argument), nameNode);
}

function methodReceiver(call: CallExpression, callee: MorphNode, state: ChainState): TableFact {
  if (!Node.isPropertyAccessExpression(callee)) {
    return found(null, call);
  }
  return WRITE_VERBS.has(callee.getName()) ? verbTable(call, callee.getNameNode()) : walk(callee.getExpression(), state);
}

function walkEntered(current: MorphNode, state: ChainState): TableFact {
  if (Node.isCallExpression(current)) {
    const callee = unwrapTarget(current.getExpression());
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
  const current = unwrapTarget(node);
  if (state.active.has(current.compilerNode)) {
    return unresolved("cycle", current, `write-chain cycle returns to ${current.getKindName()}`);
  }
  state.active.add(current.compilerNode);
  const fact = walkEntered(current, state);
  state.active.delete(current.compilerNode);
  return fact;
}

/** The table expression the write chain ending at `receiver` names: the argument of its drizzle `update()`/
 *  `insert()`, `null` when the chain contains none, or one refusal. */
export function readDrizzleWriteTable(receiver: MorphNode): TableFact {
  return walk(receiver, { active: new Set<object>() });
}
