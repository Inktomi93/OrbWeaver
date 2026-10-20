// Call identity for the bus fact collector: which callable a call reaches, and whether it is an injected
// emitter or the one bus-channel publisher rather than a same-typed decoy.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { NativeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { nodeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import type { BusDeclarationIdentity, BusOperationIdentity, BusReadContext, EmitterSinkKind } from "../contract/bus-fact.ts";
import { busCallableMember, busMember, busStable } from "./bus-native-read.ts";
import { declarationHome } from "./declaration-home.ts";

/** The one live-fan member name. A candidate FILTER only — every candidate is proven by the declaration
 *  home of the property symbol (see {@link emitterSink}). */
export const PUBLISH_MEMBER = "publish";

/** Is a RESOLVED declaration's own home this exact repo-relative path? Read through {@link declarationHome}
 *  because the declarations reaching here come from a property symbol, not from this pass's walk: the
 *  absolute-suffix prefilter this used to carry still let `ctx.relativePath` decide, so a `bus-channel.ts`
 *  sitting in the Project but outside the effective population THREW instead of answering "not our door". */
function declaredAt(context: BusReadContext, sourceFile: import("ts-morph").SourceFile, path: string): boolean {
  return declarationHome(context, sourceFile) === path;
}

export function callName(context: BusReadContext, call: CallExpression): string | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  const member = busMember(context, expression);
  return member.kind === "resolved" ? member.value.name : undefined;
}

export function typeForParameter(context: BusReadContext, call: CallExpression, index: number): NativeTypeSelector | undefined {
  return context.types(call).callParameters(call)?.[index];
}

/** The ONE callable a call resolves to. Aliased-PREFERRED and exactly-one on purpose — see the note on
 *  `bus-fact-read.ts` `aliasResolvedDeclarations` for why this cannot use the merged helper. */
export function callableDeclaration(context: BusReadContext, call: CallExpression): MorphNode | undefined {
  const expression = call.getExpression();
  const readers = context.types(call);
  const symbol = Node.isIdentifier(expression) || busMember(context, expression).kind === "resolved" ? readers.symbol(expression) : null;
  const declarations = symbol === null ? [] : readers.symbolData(readers.symbolData(symbol).canonical).declarations;
  return declarations.length === 1 ? declarations[0] : undefined;
}

/** The one live-fan mint. A receiver handle is never the identity — `bus`, `channel` and `this.#bus` are
 *  spellings — and the MINTING CALL cannot carry it either: `defineBusChannel` is an OVERLOADED export, so
 *  `resolveModuleMemberOrigin` refuses it as `ambiguous` and every real `.publish` fell through as a
 *  non-door (measured: the live `chatsChanged` relay was invisible for exactly this reason). The canonical
 *  fact is the METHOD: `publish` is declared once, by this file's `BusChannel` interface, and every
 *  channel — firehose or not — inherits that one declaration. */
const BUS_CHANNEL_HOME = "packages/server/src/transport/trpc/bus-channel.ts";

function busChannelPublisher(context: BusReadContext, receiver: MorphNode, name: string): boolean {
  // Through the shared reader (#2097): this predicate already demanded a NON-EMPTY declaration set, so the
  // unresolved arms ("no property symbol", "a symbol with no declaration") collapse to the empty set and
  // answer false exactly as the open-coded `?? []` did.
  const readers = context.types(receiver);
  const property = readers.properties({ ...nodeTypeSelector(receiver), steps: [{ kind: "nonnullable" }] }, receiver).find((entry) => entry.name === name);
  const declarations = property === undefined ? [] : readers.symbolData(property.symbol).declarations;
  return declarations.length > 0 && declarations.every((declaration) => declaredAt(context, declaration.getSourceFile(), BUS_CHANNEL_HOME));
}

function injectedReceiver(context: BusReadContext, receiver: MorphNode): boolean {
  let root = receiver;
  for (;;) {
    const member = busMember(context, root);
    if (member.kind !== "resolved") {
      break;
    }
    root = member.value.receiver;
  }
  const stable = busStable(context, root);
  return stable.kind === "unresolved" && Node.isParameterDeclaration(stable.node);
}

/** Prove the call reaches an injected callable or the one bus-channel publisher, not a same-typed decoy. */
export function emitterSink(context: BusReadContext, call: CallExpression): EmitterSinkKind | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    const readers = context.types(expression);
    const symbol = readers.symbol(expression);
    const declarations = symbol === null ? [] : readers.symbolData(symbol).declarations;
    if (declarations.length === 1 && Node.isParameterDeclaration(declarations[0])) {
      return "injected";
    }
    // NOT a dead end: `const publish = bus.publish; publish(userId, event)` is the same door one binding
    // later, and `resolveCallableMember` follows an immutable const alias to the member it holds. Stopping
    // here would let a LOCAL NAME decide identity, which is the thing this family exists to refuse.
  }
  const member = busCallableMember(context, expression);
  if (member === undefined) {
    return;
  }
  if (injectedReceiver(context, member.receiver)) {
    const readers = context.types(member.receiver);
    const property = readers.properties(nodeTypeSelector(member.receiver), member.receiver).find((entry) => entry.name === member.name);
    const declarations = property === undefined ? [] : readers.symbolData(property.symbol).declarations;
    return declarations.some((declaration) => Node.isPropertySignature(declaration)) ? "injected" : undefined;
  }
  return member.name === PUBLISH_MEMBER && busChannelPublisher(context, member.receiver, member.name) ? "channel" : undefined;
}

export function operationIdentity(context: BusReadContext, call: CallExpression, bus: BusDeclarationIdentity): BusOperationIdentity {
  const expression = call.getExpression();
  const member = busMember(context, expression);
  const wrapper = member.kind === "resolved" && ["call", "apply", "bind"].includes(member.value.name);
  const callable = context.invocation(expression).modules.get(expression);
  if (!wrapper && callable?.kind === "resolved" && callable.value.canonical.kind === "project") {
    return {
      kind: "module",
      module: { path: declarationHome(context, callable.value.canonical.sourceFile), exportName: callable.value.canonical.exportedName },
      memberPath: callable.value.memberPath,
    };
  }
  return { kind: "injected", owner: bus, memberPath: [callName(context, call) ?? "<call>"] };
}
