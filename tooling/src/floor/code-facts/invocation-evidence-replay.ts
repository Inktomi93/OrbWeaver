// Replay one captured invocation graph into canonical syntax nodes; the inventory retains ownership.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { CallableBinding, CallableInvocation, ModuleMemberOrigin, ReferenceFact, ReferenceOrigin } from "./reference-fact-contract.ts";
import type { InventoryInvocationEvidence, InventoryInvocationReference, InventorySpan, NativeInvocationEvidence } from "./semantic-inventory-contract.ts";
import { SemanticInventoryError } from "./semantic-inventory-contract.ts";

type Profile = InventoryInvocationEvidence["profiles"][number];
type WireModule = NonNullable<Profile["module"]> extends InventoryInvocationReference<infer V> ? V : never;
type WireBinding = NonNullable<Profile["binding"]> extends InventoryInvocationReference<infer V> ? V : never;

export function replayInvocationEvidence(
  wire: InventoryInvocationEvidence,
  replay: (span: InventorySpan) => MorphNode,
  children: Pick<NativeInvocationEvidence, "declarations" | "computedName" | "globals">,
): NativeInvocationEvidence {
  const restore = <T, V>(fact: InventoryInvocationReference<T>, value: (input: T) => V): ReferenceFact<V> => {
    const trace = { origin: replay(fact.trace.origin), declarations: fact.trace.declarations.map(replay) };
    return fact.kind === "resolved"
      ? { kind: fact.kind, value: value(fact.value), trace }
      : {
          kind: fact.kind,
          reason: fact.reason,
          detail: fact.detail,
          node: replay(fact.node),
          trace,
          ...(fact.capture === undefined ? {} : { capture: fact.capture }),
        };
  };
  const module = (value: WireModule): ModuleMemberOrigin => {
    const canonical = value.canonical;
    if (canonical.kind === "external-door") {
      return { ...value, declaration: replay(value.declaration), canonical: { ...canonical, declaration: replay(canonical.declaration) } };
    }
    const sourceFile = replay(canonical.sourceFile);
    if (!Node.isSourceFile(sourceFile)) {
      throw new SemanticInventoryError("native invocation module source is not a SourceFile");
    }
    const declaration = replay(canonical.declaration);
    if (declaration.getSourceFile() !== sourceFile) {
      throw new SemanticInventoryError("native invocation canonical declaration has a foreign source");
    }
    return { ...value, declaration: replay(value.declaration), canonical: { ...canonical, sourceFile, declaration } };
  };
  const origin = (value: WireBinding["target"]): ReferenceOrigin =>
    value.kind === "module" ? module(value) : { ...value, declarations: value.declarations.map(replay) };
  const binding = (value: WireBinding): CallableBinding => {
    const fields = { target: origin(value.target), callee: replay(value.callee), arguments: restore(value.arguments, (nodes) => nodes.map(replay)) };
    const result = value.invocation === "bind" ? { invocation: "bind", ...fields } : fields;
    return result;
  };
  const modules = new Map<MorphNode, ReferenceFact<ModuleMemberOrigin>>();
  const callableBindings = new Map<MorphNode, ReferenceFact<CallableBinding>>();
  const undefinedMembers = new Map<MorphNode, boolean>();
  const namespaces = new Map<MorphNode, readonly MorphNode[]>();
  const strings = new Map<MorphNode, ReferenceFact<string>>();
  const stableValues = new Map<MorphNode, ReferenceFact<MorphNode>>();
  const canonicalValues = new Map<MorphNode, ReferenceFact<MorphNode>>();
  for (const profile of wire.profiles) {
    const node = replay(profile.node);
    if (profile.module !== undefined) {
      modules.set(node, restore(profile.module, module));
    }
    if (profile.binding !== undefined) {
      callableBindings.set(node, restore(profile.binding, binding));
    }
    if (profile.undefined !== undefined) {
      undefinedMembers.set(node, profile.undefined);
    }
    captureNamespace(namespaces, node, profile.namespace, replay);
    if (profile.string !== undefined) {
      strings.set(
        node,
        restore(profile.string, (value) => value),
      );
    }
    if (profile.stable !== undefined) {
      stableValues.set(node, restore(profile.stable, replay));
    }
    if (profile.canonicalValue !== undefined) {
      canonicalValues.set(replay(profile.canonicalValue.declaration), restore(profile.canonicalValue.fact, replay));
    }
  }
  const invocation =
    wire.invocation === null
      ? undefined
      : restore(
          wire.invocation,
          (value): CallableInvocation => ({
            invocation: value.invocation,
            target: origin(value.target),
            callee: replay(value.callee),
            arguments: restore(value.arguments, (nodes) => nodes.map(replay)),
          }),
        );
  return { invocation, modules, callableBindings, undefinedMembers, namespaces, strings, stableValues, canonicalValues, ...children };
}

function captureNamespace(
  map: Map<MorphNode, readonly MorphNode[]>,
  node: MorphNode,
  declarations: InventorySpan[] | undefined,
  replay: (span: InventorySpan) => MorphNode,
): void {
  if (declarations !== undefined) {
    map.set(node, declarations.map(replay));
  }
}
