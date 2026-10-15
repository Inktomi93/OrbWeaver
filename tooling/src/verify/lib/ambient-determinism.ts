// Shared ambient clock/entropy classification and closed native demand for its two consumers.
// Candidate-source binding/key syntax closes the canonical name/refusal algorithms before seal.
// Native facts establish ambient identity; policy judgments remain in the verifier.

import { computedNameNeedsBindings, referenceResolutionServices, resolveGlobalMemberOrigin } from "@orb/tooling/floor/code-facts/reference-fact";
import { descendantsOfKind } from "@orb/tooling/floor/compiler/ts-workspace";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { AmbientInvocationVerdict, AmbientReferencePass, AmbientReferenceServices, AmbientSource } from "../contract/ambient-determinism.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

/** The callee of a call/construct expression, or `undefined` when the node is neither. */
export function invocationCallee(node: MorphNode): MorphNode | undefined {
  return Node.isCallExpression(node) || Node.isNewExpression(node) ? node.getExpression() : undefined;
}

/** A conservative preparation filter keeps binding-dependent keys without resolving syntax symbols. */
export function possibleAmbientCall(node: MorphNode, name: string): boolean {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const callee = node.getExpression();
  if (Node.isIdentifier(callee)) {
    return callee.getText() === name;
  }
  if (!(Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))) {
    return false;
  }
  if (Node.isElementAccessExpression(callee)) {
    const key = callee.getArgumentExpression();
    if (key !== undefined && computedNameNeedsBindings(key)) {
      return true;
    }
  }
  const member = referenceResolutionServices.readMemberReference(callee);
  return member.kind === "resolved" && member.value.name === name;
}

/** Resolve one invocation's callee against a closed set of ambient sources. */
export function readAmbientInvocation(node: MorphNode, sources: readonly AmbientSource[], services?: AmbientReferenceServices): AmbientInvocationVerdict {
  const callee = invocationCallee(node);
  if (callee === undefined) {
    return { kind: "unreadable", reason: "unsupported", detail: `${node.getKindName()} is not a call or construct expression` };
  }
  const origin = services === undefined ? resolveGlobalMemberOrigin(callee) : services.globalOrigin(callee);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, callee, services?.declarations) === "other"
      ? { kind: "other" }
      : { kind: "unreadable", reason: origin.reason, detail: origin.detail };
  }
  const match = sources.find((source) => source.globalName === origin.value.globalName && samePath(source.memberPath, origin.value.memberPath));
  return match === undefined ? { kind: "other" } : { kind: "ambient", source: match };
}

/** Candidate-source syntax closes const-name/key lookups before the shared native generation is sealed. */
export function ambientReferencePass(ctx: GatePolicyContext): AmbientReferencePass {
  const sources = new Set<SourceFile>();
  const origins = new Set<MorphNode>();
  const bindings = new Set<MorphNode>();
  const keys = new Set<MorphNode>();
  return {
    register: (callee): void => {
      const native = ctx.nativeTypes;
      if (native === undefined) {
        throw new Error("native ambient origin context is unavailable");
      }
      origins.add(callee);
      native.request({ kind: "global-origins", nodes: [callee] });
      const source = callee.getSourceFile();
      if (sources.has(source)) {
        return;
      }
      sources.add(source);
      const identifiers = descendantsOfKind(source, SyntaxKind.Identifier);
      for (const node of identifiers) {
        bindings.add(node);
      }
      native.request({ kind: "global-bindings", nodes: identifiers });
      const inputs = descendantsOfKind(source, SyntaxKind.ElementAccessExpression)
        .map((node) => node.getArgumentExpression())
        .filter((node) => node !== undefined)
        .filter(computedNameNeedsBindings);
      for (const key of inputs) {
        keys.add(key);
      }
      native.request({ kind: "computed-names", nodes: inputs });
    },
    read: (): AmbientReferenceServices => {
      const native = ctx.nativeTypes;
      if (native === undefined) {
        throw new Error("native ambient origin context is unavailable");
      }
      const global = native.globalOrigins([...origins]);
      const declarations = native.globalBindings([...bindings]);
      const names = native.computedNames([...keys]);
      return {
        globalOrigin: (node): ReturnType<AmbientReferenceServices["globalOrigin"]> => {
          const fact = global.get(node);
          if (fact === undefined) {
            throw new Error("native ambient origin is unavailable");
          }
          return fact;
        },
        declarations: (node): readonly MorphNode[] => {
          const fact = declarations.get(node);
          if (fact === undefined) {
            throw new Error("native ambient binding is unavailable");
          }
          return fact;
        },
        readComputedName: (node): ReturnType<AmbientReferenceServices["readComputedName"]> => {
          if (!computedNameNeedsBindings(node)) {
            return referenceResolutionServices.readComputedName(node);
          }
          const fact = names.get(node);
          if (fact === undefined) {
            throw new Error("native ambient computed name is unavailable");
          }
          return fact;
        },
      };
    },
  };
}
