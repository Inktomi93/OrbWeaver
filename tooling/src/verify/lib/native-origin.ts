// Retained member/global policies nominate exact syntax and consume native raw facts after seal.
import { computedNameNeedsBindings, readMemberReferenceWithName, referenceResolutionServices } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { InventoryInvocationPlan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { MAX_RECEIVER_HOPS, observedTypePropertyOrigin, resolved, unresolved } from "../../floor/code-facts/type-member-origin-core.ts";
import { mapTypeObservationDemand } from "../../floor/code-facts/type-observations-codec.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../floor/code-facts/type-observations-read.ts";
import type { GlobalOriginServices, MemberOriginServices, NativeOriginPass } from "../contract/origin-verdict.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { requiredInvocationFact } from "./native-invocation.ts";

export function nativeOriginPass(ctx: Pick<GatePolicyContext, "nativeTypes">, properties: readonly string[]): NativeOriginPass {
  const roots = new Set<MorphNode>();
  const keys = new Set<MorphNode>();
  let plan: InventoryInvocationPlan | undefined;
  let evidence: ReadonlyMap<MorphNode, NativeInvocationEvidence> | undefined;
  const native = (): NonNullable<GatePolicyContext["nativeTypes"]> => {
    if (ctx.nativeTypes === undefined) {
      throw new Error("native retained origin facts are unavailable");
    }
    return ctx.nativeTypes;
  };
  const key = (node: MorphNode): void => {
    if (computedNameNeedsBindings(node)) {
      keys.add(node);
    }
  };
  const registerBinding = (node: MorphNode): void => {
    if (!Node.isBindingElement(node)) {
      return;
    }
    roots.add(node.getNameNode());
    const named = node.getPropertyNameNode();
    if (named !== undefined && Node.isComputedPropertyName(named)) {
      key(named.getExpression());
    }
    const receiver = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
    if (receiver !== undefined) {
      roots.add(receiver);
    }
  };
  const registerMember = (node: MorphNode): MorphNode | undefined => {
    let receiver: MorphNode | undefined;
    if (Node.isPropertyAccessExpression(node)) {
      roots.add(node.getNameNode());
      receiver = node.getExpression();
    }
    if (Node.isElementAccessExpression(node)) {
      const argument = node.getArgumentExpression();
      if (argument !== undefined) {
        key(argument);
      }
      receiver = node.getExpression();
    }
    return receiver;
  };
  return {
    register: (node): void => {
      roots.add(node);
      registerBinding(node);
      let current = referenceResolutionServices.unwrapExpression(node);
      for (let hop = 0; hop < MAX_RECEIVER_HOPS; hop += 1) {
        roots.add(current);
        const receiver = registerMember(current);
        if (receiver === undefined) {
          break;
        }
        roots.add(receiver);
        current = referenceResolutionServices.unwrapExpression(receiver);
      }
      roots.add(current);
    },
    prepare: (): void => {
      if (roots.size === 0) {
        return;
      }
      const files = [...new Set([...roots].map((node) => node.getSourceFile()))];
      plan = {
        mode: "types",
        facets: [],
        arguments: [],
        typeObservations: mapTypeObservationDemand(
          {
            profile: TYPE_OBSERVATION_PROFILE,
            sources: files,
            nodes: [],
            questions: [{ kind: "const-initializers", nodes: [...roots], properties: [...properties], valueFacets: ["module", "global"] }],
          },
          (node) => ({ file: node.getSourceFile().getFilePath().replaceAll("\\", "/"), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
        ),
      };
      native().request({ kind: "invocation-evidence", nodes: files, plan });
      if (keys.size > 0) {
        native().request({ kind: "computed-names", nodes: [...keys] });
      }
    },
    at: (node): MemberOriginServices & GlobalOriginServices => {
      if (plan === undefined) {
        throw new Error("native retained origin demand was not prepared");
      }
      const files = [...new Set([...roots].map((root) => root.getSourceFile()))];
      evidence ??= native().invocationEvidence(files, plan);
      const facts = requiredInvocationFact(evidence, node.getSourceFile());
      const observed = facts.typeObservations;
      if (observed === undefined) {
        throw new Error("native retained origin source has no importing owner");
      }
      const types = readTypeObservations(observed);
      const names = native().computedNames([...keys]);
      const readComputedName: GlobalOriginServices["readComputedName"] = (value) =>
        computedNameNeedsBindings(value) ? requiredInvocationFact(names, value) : referenceResolutionServices.readComputedName(value);
      const propertyOrigin: MemberOriginServices["propertyOrigin"] = (receiver, name) => observedTypePropertyOrigin(receiver, name, types);
      return {
        readComputedName,
        declarations: (value): readonly MorphNode[] => {
          const symbol = types.symbol(value);
          return symbol === null ? [] : types.symbolData(symbol).declarations;
        },
        globalOrigin: (value): ReturnType<GlobalOriginServices["globalOrigin"]> => {
          observed.assertNode(value);
          return requiredInvocationFact(facts.globals, value);
        },
        moduleOrigin: (value): ReturnType<GlobalOriginServices["moduleOrigin"]> => {
          observed.assertNode(value);
          return requiredInvocationFact(facts.modules, value);
        },
        propertyOrigin,
        memberOrigin: (value): ReturnType<MemberOriginServices["memberOrigin"]> => {
          const read = readMemberReferenceWithName(value, readComputedName);
          if (read.kind === "unresolved") {
            return read;
          }
          const origin = propertyOrigin(read.value.receiver, read.value.name);
          return origin.kind === "unresolved"
            ? unresolved(origin.reason, read.value.nameNode, origin.detail)
            : resolved(origin.value, read.value.nameNode, origin.value);
        },
      };
    },
  };
}
