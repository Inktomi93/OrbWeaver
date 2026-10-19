// compose-wiring-only nominates exact syntax during the walk and reads its importing world's sealed answers.
// Every question goes to an existing native family; nothing here falls back to the syntax carrier's checker.
import { computedNameNeedsBindings, readMemberReferenceWithName, referenceResolutionServices } from "@orb/tooling/floor/code-facts/reference-fact";
import type { CallExpression, Identifier, Node } from "ts-morph";
import type { ReferenceFact } from "../../floor/code-facts/reference-fact-contract.ts";
import { readSymbolMemberValue } from "../../floor/code-facts/reference-fact-symbol-member.ts";
import type { InventoryInvocationPlan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { resolved, unresolved } from "../../floor/code-facts/type-member-origin-core.ts";
import type { ComposeNativeReads, ComposeReads } from "../contract/compose-wiring.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { requiredInvocationFact } from "./native-invocation.ts";

const MODULE_PLAN: InventoryInvocationPlan = { mode: "value", facets: ["module"], arguments: [] };
const WRITES_PLAN: InventoryInvocationPlan = { mode: "value", facets: ["reference-writes"], arguments: [] };
const STABLE_PLAN: InventoryInvocationPlan = { mode: "value", facets: ["stable"], arguments: [] };
const STRING_PLAN: InventoryInvocationPlan = { mode: "value", facets: ["string"], arguments: [] };

type NativeContext = NonNullable<GatePolicyContext["nativeTypes"]>;

function refuse(node: Node, question: string): ReferenceFact<never> {
  return unresolved("unsupported", node, `native compose demand did not nominate this ${question} question`);
}

/** One batched native read per family, acquired on first use after seal. */
function answers<K extends Node, T>(nominated: ReadonlySet<K>, read: (nodes: readonly K[]) => ReadonlyMap<Node, T>): (node: Node) => T | undefined {
  let cached: ReadonlyMap<Node, T> | undefined;
  const members: ReadonlySet<Node> = nominated;
  return (node: Node): T | undefined => {
    if (!members.has(node)) {
      return;
    }
    cached ??= read([...nominated]);
    return requiredInvocationFact(cached, node);
  };
}

function facet<T>(
  evidence: NativeInvocationEvidence | undefined,
  select: (evidence: NativeInvocationEvidence) => ReadonlyMap<Node, T> | undefined,
  node: Node,
): T | undefined {
  if (evidence === undefined) {
    return;
  }
  const values = select(evidence);
  if (values === undefined) {
    throw new Error("native compose facet was not captured for its requested value");
  }
  return requiredInvocationFact(values, node);
}

/** The compose walk's native demand and its sealed readers; an absent native context refuses the policy. */
export function composeNativeReads(ctx: Pick<GatePolicyContext, "nativeTypes">): ComposeNativeReads {
  const nativeTypes = ctx.nativeTypes;
  if (nativeTypes === undefined) {
    throw new Error("native compose read context is unavailable");
  }
  const native: NativeContext = nativeTypes;
  const callables = new Set<Node>();
  const globals = new Set<Node>();
  const modules = new Set<Node>();
  const members = new Set<CallExpression>();
  const keys = new Set<Node>();
  const bindings = new Set<Identifier>();
  const writes = new Set<Identifier>();
  const stables = new Set<Node>();
  const strings = new Set<Node>();
  let prepared = false;
  let sealed: ComposeReads | undefined;
  const assertOpen = (): void => {
    if (prepared) {
      throw new Error("native compose demand is closed after prepare");
    }
  };
  const read = (): ComposeReads => {
    const callable = answers(callables, (nodes): ReturnType<NativeContext["callableDeclarations"]> => native.callableDeclarations(nodes));
    const globalOrigin = answers(globals, (nodes): ReturnType<NativeContext["globalOrigins"]> => native.globalOrigins(nodes));
    const binding = answers(bindings, (nodes): ReturnType<NativeContext["globalBindings"]> => native.globalBindings(nodes));
    const calledMember = answers(members, (nodes): ReturnType<NativeContext["callMemberOrigins"]> => native.callMemberOrigins(nodes));
    const computed = answers(keys, (nodes): ReturnType<NativeContext["computedNames"]> => native.computedNames(nodes));
    const evidence = (nominated: ReadonlySet<Node>, plan: InventoryInvocationPlan): ((node: Node) => NativeInvocationEvidence | undefined) =>
      answers(nominated, (nodes): ReturnType<NativeContext["invocationEvidence"]> => native.invocationEvidence(nodes, plan));
    const module = evidence(modules, MODULE_PLAN);
    const written = evidence(writes, WRITES_PLAN);
    const stable = evidence(stables, STABLE_PLAN);
    const string = evidence(strings, STRING_PLAN);
    const globalFact = (node: Node): ReturnType<ComposeReads["globalOrigin"]> => globalOrigin(node) ?? refuse(node, "global origin");
    const writeFact = (identifier: Identifier): ReturnType<ComposeReads["writes"]> =>
      facet(written(identifier), (captured) => captured.referenceWrites, identifier) ?? refuse(identifier, "reference write");
    const readComputedName = (key: Node): ReferenceFact<string> =>
      computedNameNeedsBindings(key) ? (computed(key) ?? refuse(key, "computed name")) : referenceResolutionServices.readComputedName(key);
    return {
      callable: (node): ReturnType<ComposeReads["callable"]> => callable(node) ?? refuse(node, "callable"),
      globalOrigin: globalFact,
      moduleOrigin: (node): ReturnType<ComposeReads["moduleOrigin"]> =>
        facet(module(node), (captured) => captured.modules, node) ?? refuse(node, "module origin"),
      calledMember: (call): ReturnType<ComposeReads["calledMember"]> => calledMember(call)?.origin ?? refuse(call, "called member"),
      member: (node): ReturnType<ComposeReads["member"]> => readMemberReferenceWithName(node, readComputedName),
      binding: (node): ReturnType<ComposeReads["binding"]> => {
        const declarations = binding(node);
        if (declarations === undefined) {
          return refuse(node, "lexical binding");
        }
        const [declaration] = declarations;
        return declarations.length === 1 && declaration !== undefined
          ? resolved(declaration, declaration, [declaration])
          : unresolved(declarations.length === 0 ? "missing" : "ambiguous", node, `the lexical binding has ${String(declarations.length)} declarations`);
      },
      writes: writeFact,
      symbolMember: (access): ReturnType<ComposeReads["symbolMember"]> =>
        readSymbolMemberValue(access, {
          globalOrigin: globalFact,
          stable: (node) => facet(stable(node), (captured) => captured.stableValues, node) ?? refuse(node, "stable source"),
          writes: writeFact,
          staticString: (node) => facet(string(node), (captured) => captured.strings, node) ?? refuse(node, "static key"),
        }),
    };
  };
  const nominate =
    <K extends Node>(nominated: Set<K>) =>
    (node: K): void => {
      assertOpen();
      nominated.add(node);
    };
  return {
    demand: {
      callable: nominate(callables),
      globalOrigin: nominate(globals),
      moduleOrigin: nominate(modules),
      calledMember: nominate(members),
      computedName: (key): void => {
        if (computedNameNeedsBindings(key)) {
          nominate(keys)(key);
        }
      },
      binding: nominate(bindings),
      writes: nominate(writes),
      stable: nominate(stables),
      staticString: nominate(strings),
    },
    prepare: (): void => {
      assertOpen();
      prepared = true;
      const requests = [
        { kind: "callable-declarations", nodes: [...callables] },
        { kind: "global-origins", nodes: [...globals] },
        { kind: "global-bindings", nodes: [...bindings] },
        { kind: "type-member-origins", nodes: [...members] },
        { kind: "computed-names", nodes: [...keys] },
        { kind: "invocation-evidence", nodes: [...modules], plan: MODULE_PLAN },
        { kind: "invocation-evidence", nodes: [...writes], plan: WRITES_PLAN },
        { kind: "invocation-evidence", nodes: [...stables], plan: STABLE_PLAN },
        { kind: "invocation-evidence", nodes: [...strings], plan: STRING_PLAN },
      ] as const;
      for (const request of requests) {
        if (request.nodes.length > 0) {
          native.request(request);
        }
      }
    },
    reads: (): ComposeReads => {
      if (!prepared) {
        throw new Error("native compose demand was not prepared");
      }
      sealed ??= read();
      return sealed;
    },
  };
}
