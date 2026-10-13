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
import type { CalledMember, DrizzleWriteChain, DrizzleWriteRoot } from "./drizzle-write-chain-contract.ts";
import { readMemberReference, resolveStableExpression } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import type { ReferenceFact, ReferenceUnresolvedReason, UnresolvedReferenceFact } from "./reference-fact-contract.ts";

/** The two Drizzle verbs that CHOOSE a table for a write. `delete` is excluded on purpose: it names a table
 *  but writes no columns, so a column-invariant caller has nothing to judge there. */
export const DRIZZLE_WRITE_ROOT_VERBS = ["update", "insert"] as const;
export type DrizzleWriteRootVerb = (typeof DRIZZLE_WRITE_ROOT_VERBS)[number];
const WRITE_VERBS: ReadonlySet<string> = new Set(DRIZZLE_WRITE_ROOT_VERBS);

const DRIZZLE_PACKAGE_INFIX = "/drizzle-orm/";

type TableFact = ReferenceFact<MorphNode | null>;

interface ChainState {
  readonly active: Set<object>;
  readonly verbs: ReadonlySet<string>;
}

export type { CalledMember } from "./drizzle-write-chain-contract.ts";

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
function firstTable(candidates: readonly DrizzleWriteChain[], origin: MorphNode): TableFact {
  let refusal: UnresolvedReferenceFact | undefined;
  let hit: TableFact | undefined;
  for (const candidate of candidates) {
    if (hit !== undefined) {
      continue;
    }
    const fact = declaredTable(candidate);
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
function callTable(chain: Extract<DrizzleWriteChain, { kind: "call" }>): TableFact {
  const returns = chain.returns;
  const fromArguments = firstTable(chain.arguments, chain.node);
  if (returns.kind === "unresolved") {
    return fromArguments.kind === "resolved" && fromArguments.value !== null ? fromArguments : unresolved(returns.reason, returns.node, returns.detail);
  }
  const fromReturns = firstTable(returns.value, chain.node);
  return fromReturns.kind === "resolved" && fromReturns.value === null ? fromArguments : fromReturns;
}

/** An `insert(<t>)` / `update(<t>)` call: the table when drizzle declares the verb, none when something else does. */
function verbTable(chain: Extract<DrizzleWriteChain, { kind: "root" }>): TableFact {
  const member = chain.member;
  if (member.kind === "unresolved") {
    return unresolved(member.reason, member.node, member.detail);
  }
  const { name, declarations } = member.value;
  const nameNode = member.value.nameNode;
  if (declarations.length === 0) {
    return unresolved("missing", nameNode, `the checker resolved no declaration for ${name}()`);
  }
  if (!declaredInDrizzle(declarations)) {
    return found(null, nameNode);
  }
  const argument = chain.table;
  return argument === undefined ? unresolved("missing", nameNode, `${name}() names no table`) : found(unwrapTarget(argument), nameNode);
}

function methodReceiver(call: CallExpression, callee: MorphNode, state: ChainState): DrizzleWriteChain {
  const member = readMemberReference(callee);
  if (member.kind === "unresolved") {
    return { kind: "empty", node: call };
  }
  return state.verbs.has(member.value.name)
    ? { kind: "root", node: call, member: readCalledMember(call), table: call.getArguments()[0] }
    : walk(member.value.receiver, state);
}

function walkEntered(current: MorphNode, state: ChainState): DrizzleWriteChain {
  if (Node.isCallExpression(current)) {
    const callee = unwrapTarget(current.getExpression());
    if (!Node.isIdentifier(callee)) {
      return methodReceiver(current, callee, state);
    }
    const returns = readCallReturns(current);
    return {
      kind: "call",
      node: current,
      returns: returns.kind === "unresolved" ? returns : { ...returns, value: returns.value.map((value) => walk(value, state)) },
      arguments: current.getArguments().map((argument) => walk(argument, state)),
    };
  }
  if (!Node.isIdentifier(current)) {
    return { kind: "empty", node: current };
  }
  const stable = resolveStableExpression(current);
  if (stable.kind === "unresolved") {
    // A binding whose initializer is a CALL is exactly the hoisted-builder shape; every other refusal here
    // means the identifier is not a chain this reader can follow, which is absence of a subject.
    return stable.reason === "dynamic" && Node.isCallExpression(stable.node) ? walk(stable.node, state) : { kind: "empty", node: current };
  }
  return stable.value.compilerNode === current.compilerNode ? { kind: "empty", node: current } : walk(stable.value, state);
}

function walk(node: MorphNode, state: ChainState): DrizzleWriteChain {
  const current = unwrapTarget(node);
  if (state.active.has(current.compilerNode)) {
    return { kind: "unresolved", fact: unresolved("cycle", current, `write-chain cycle returns to ${current.getKindName()}`) };
  }
  state.active.add(current.compilerNode);
  const fact = walkEntered(current, state);
  state.active.delete(current.compilerNode);
  return fact;
}

function declaredTable(chain: DrizzleWriteChain): TableFact {
  switch (chain.kind) {
    case "root":
      return verbTable(chain);
    case "call":
      return callTable(chain);
    case "empty":
      return found(null, chain.node);
    case "unresolved":
      return chain.fact;
  }
}

/** The canonical source tree, retaining roots and unknown paths before declaration admission. */
export function readDrizzleWriteChain(receiver: MorphNode, verb?: DrizzleWriteRootVerb): DrizzleWriteChain {
  return walk(receiver, { active: new Set<object>(), verbs: verb === undefined ? WRITE_VERBS : new Set([verb]) });
}

function rootsOf(chain: DrizzleWriteChain): ReferenceFact<readonly DrizzleWriteRoot[]> {
  if (chain.kind === "unresolved") {
    return chain.fact;
  }
  if (chain.kind === "root") {
    return chain.table === undefined
      ? unresolved("missing", chain.node, "write root names no table")
      : {
          kind: "resolved",
          value: [{ node: chain.node, member: chain.member, table: unwrapTarget(chain.table) }],
          trace: { origin: chain.node, declarations: [] },
        };
  }
  if (chain.kind === "empty") {
    return { kind: "resolved", value: [], trace: { origin: chain.node, declarations: [] } };
  }
  const children = [...chain.arguments, ...(chain.returns.kind === "resolved" ? chain.returns.value : [])].map(rootsOf);
  const failure = children.find((child) => child.kind === "unresolved");
  if (failure !== undefined) {
    return failure;
  }
  const roots = children.flatMap((child) => (child.kind === "resolved" ? child.value : []));
  return roots.length === 0 && chain.returns.kind === "unresolved"
    ? chain.returns
    : { kind: "resolved", value: roots, trace: { origin: chain.node, declarations: [] } };
}

/** Observed table arguments, not a claim that their invoking members belong to Drizzle. */
export function readDrizzleWriteRoots(receiver: MorphNode, verb?: DrizzleWriteRootVerb): ReferenceFact<readonly DrizzleWriteRoot[]> {
  return rootsOf(readDrizzleWriteChain(receiver, verb));
}

/** The table expression the write chain ending at `receiver` names: the argument of its drizzle `update()`/
 *  `insert()`, `null` when the chain contains none, or one refusal. */
export function readDrizzleWriteTable(receiver: MorphNode, verb?: DrizzleWriteRootVerb): TableFact {
  return declaredTable(readDrizzleWriteChain(receiver, verb));
}
