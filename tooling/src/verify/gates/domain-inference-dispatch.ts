// Domains consume runtime operation capabilities instead of dispatching on inference protocol axes.
// Singleton: inference declaration identity; canonical reference/type readers own aliases and members.
// Equality and switch decisions are judged; presence tests and unrelated API vocabularies remain legal.
// Unreadable comparisons against inference vocabulary refuse instead of claiming an unrelated origin.

import { connectionApiSchema, wireSchema } from "@orb/contracts/inference";
import type { Node as MorphNode, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ReferenceFact } from "../../floor/code-facts/reference-fact-contract.ts";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { normalizedPath } from "../../floor/code-facts/type-member-origin-core.ts";
import type { NativeTypeOriginProjection } from "../../floor/code-facts/type-origin-projection-contract.ts";
import type { NativeTypeProjection, TypeProjectionPlan } from "../../floor/code-facts/type-projection-contract.ts";
import { typeProjectionFacet } from "../../floor/code-facts/type-projection-contract.ts";
import { defineGate } from "../contract/policy.ts";
import { requiredInvocationFact } from "../lib/native-invocation.ts";
import { nativeTypeProjection, prepareNativeTypeProjection } from "../lib/native-value-projection.ts";

const AXIS_HOMES = {
  Wire: "packages/contracts/src/inference/wires.ts",
  ChatApi: "packages/contracts/src/inference/apis.ts",
  EncoderIdentityApi: "packages/contracts/src/inference/apis.ts",
  ConnectionApi: "packages/contracts/src/inference/connection.ts",
} as const;
const AXIS_FIELDS = [
  { path: "packages/contracts/src/inference/provider-schema.ts", names: ["wire", "apis"] },
  { path: "packages/contracts/src/inference/connection.ts", names: ["api"] },
  { path: "packages/contracts/src/inference/resolved.ts", names: ["wire", "api"] },
] as const;
const EQUALITY = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
]);
const MESSAGE = "a domain dispatches on an inference wire or API; ask the runtime for the operation capability";
const REFUSAL = "domain-inference-dispatch cannot establish an opaque inference comparison's origin";
const PROBE = "packages/server/src/domain/connection/verbs/probe.ts";
const TYPE_FILES = {
  "packages/contracts/src/inference/wires.ts": 'export const WIRES = ["local-light", "openai-compat"] as const; export type Wire = typeof WIRES[number];',
  "packages/contracts/src/inference/apis.ts":
    'export const CHAT_APIS = ["agent-sdk", "chat-completions"] as const; export type ChatApi = typeof CHAT_APIS[number]; export type EncoderIdentityApi = ChatApi | "none";',
  "packages/contracts/src/inference/connection.ts": 'import type { ChatApi } from "./apis.ts"; export type ConnectionApi = ChatApi | "auto";',
};
const AXIS_IMPORTS =
  'import type { Wire } from "../../../../../contracts/src/inference/wires.ts"; import type { ChatApi } from "../../../../../contracts/src/inference/apis.ts";';

const VALUE_PLAN: TypeProjectionPlan = { facets: ["scalar", "origins", "runtime-undefined"], properties: [] };
const STRING_PLAN: InventoryInvocationPlan = { mode: "value", facets: ["string"], arguments: [] };
function presence(node: MorphNode, facts: NativeTypeProjection): boolean {
  return node.getKind() === SyntaxKind.NullKeyword || typeProjectionFacet(facts, "runtime-undefined");
}

function axisLiteral(value: string): boolean {
  return wireSchema.safeParse(value).success || connectionApiSchema.safeParse(value).success;
}

function comparisonCandidate(facts: NativeTypeProjection, read: ReferenceFact<string>): boolean {
  if (read.kind === "resolved" && axisLiteral(read.value)) {
    return true;
  }
  return typeProjectionFacet(facts, "scalar").stringLiterals.some(axisLiteral);
}

function isHome(declarations: readonly MorphNode[]): boolean {
  return declarations.some(
    (declaration) =>
      Node.isTypeAliasDeclaration(declaration) &&
      Object.entries(AXIS_HOMES).some(([name, path]) => declaration.getName() === name && normalizedPath(declaration).endsWith(`/${path}`)),
  );
}

function axisAnnotation(type: TypeNode | undefined, projection: NativeTypeOriginProjection): boolean {
  if (type === undefined) {
    return false;
  }
  const capture = projection.annotations.find((origin) => origin.annotation.compilerNode === type.compilerNode);
  if (capture === undefined) {
    throw new Error("native inference annotation origin coverage is unavailable");
  }
  const direct = capture.direct;
  if (direct?.kind === "resolved" && isHome(direct.value.declarations)) {
    return true;
  }
  const origins = capture.scalar;
  if (origins.some((fact) => fact.kind === "unresolved" && isHome(fact.trace.declarations))) {
    throw new Error(REFUSAL);
  }
  return origins.some((fact) => fact.kind === "resolved" && isHome(fact.value.declarations));
}

function annotationOwnsAxis(declaration: MorphNode, projection: NativeTypeOriginProjection): boolean {
  if (
    (Node.isPropertyAssignment(declaration) || Node.isPropertySignature(declaration)) &&
    AXIS_FIELDS.some(({ path, names }) => normalizedPath(declaration).endsWith(`/${path}`) && names.includes(declaration.getName()))
  ) {
    return true;
  }
  if (
    !(
      Node.isPropertySignature(declaration) ||
      Node.isPropertyDeclaration(declaration) ||
      Node.isParameterDeclaration(declaration) ||
      Node.isVariableDeclaration(declaration)
    )
  ) {
    return false;
  }
  return axisAnnotation(declaration.getTypeNode(), projection);
}

function returnedAxis(node: MorphNode, projection: NativeTypeOriginProjection): boolean {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const target = projection.callable;
  if (target === null) {
    throw new Error("native inference callable origin coverage is unavailable");
  }
  if (target.kind === "unresolved") {
    throw new Error(REFUSAL);
  }
  const declaration = target.value;
  if (
    !(
      Node.isFunctionDeclaration(declaration) ||
      Node.isArrowFunction(declaration) ||
      Node.isFunctionExpression(declaration) ||
      Node.isMethodDeclaration(declaration)
    )
  ) {
    throw new Error(REFUSAL);
  }
  const annotation = declaration.getReturnTypeNode();
  if (annotation === undefined) {
    throw new Error(REFUSAL);
  }
  return axisAnnotation(annotation, projection);
}

function bindingOwnsAxis(projection: NativeTypeOriginProjection): boolean {
  const binding = projection.binding;
  if (binding.kind !== "resolved") {
    return false;
  }
  if (annotationOwnsAxis(binding.value, projection)) {
    return true;
  }
  if (!Node.isBindingElement(binding.value)) {
    return false;
  }
  const property = projection.bindingProperty?.declarations;
  return property?.kind === "resolved" && property.value.some((declaration) => annotationOwnsAxis(declaration, projection));
}

function nativeAxisOrigin(node: MorphNode, projection: NativeTypeOriginProjection): boolean {
  const value = projection.values.find((candidate) => candidate.node.compilerNode === node.compilerNode);
  if (value === undefined) {
    throw new Error("native inference value origin coverage is unavailable");
  }
  const chain = value.identities;
  if (chain.kind === "resolved" && chain.value.some((origin) => isHome(origin.declarations))) {
    return true;
  }
  const member = value.member;
  return member.kind === "resolved" && member.value.some((declaration) => annotationOwnsAxis(declaration, projection));
}

function inferenceAxis(node: MorphNode, facts: NativeTypeProjection): boolean {
  if (typeProjectionFacet(facts, "scalar").nonNullableObject) {
    return false;
  }
  const projection = typeProjectionFacet(facts, "origins");
  const stable = projection.stable;
  const source = stable.kind === "resolved" ? stable.value : stable.node;
  return (
    bindingOwnsAxis(projection) ||
    annotationOwnsAxis(source, projection) ||
    [node, source].some((value) => nativeAxisOrigin(value, projection)) ||
    returnedAxis(source, projection)
  );
}

export const gate = defineGate({
  id: "domain-inference-dispatch",
  family: "domain-inference-dispatch",
  authority: "hard",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/domain/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "Expose the runtime-owned operation capability through its public door; keep the domain's application policy and data local.",
  create: (ctx) => {
    const comparisons = new Map<MorphNode, { readonly values: readonly MorphNode[]; readonly presenceExempt: boolean }>();
    const captures = new Map<MorphNode, NativeTypeProjection>();
    const strings = new Map<MorphNode, ReferenceFact<string>>();
    const prepare = (carrier: MorphNode, values: readonly MorphNode[], presenceExempt: boolean): void => {
      if (ctx.nativeTypes === undefined) {
        throw new Error("native inference value context is unavailable");
      }
      for (const value of values) {
        prepareNativeTypeProjection(ctx, value, VALUE_PLAN);
        ctx.nativeTypes.request({ kind: "invocation-evidence", nodes: [value], plan: STRING_PLAN });
      }
      comparisons.set(carrier, { values, presenceExempt });
    };
    const judge = (carrier: MorphNode, values: readonly MorphNode[]): void => {
      if (!values.some((value) => comparisonCandidate(requiredInvocationFact(captures, value), requiredInvocationFact(strings, value)))) {
        return;
      }
      if (values.some((value) => inferenceAxis(value, requiredInvocationFact(captures, value)))) {
        ctx.report.node(carrier);
        return;
      }
      const vocabulary = values.some((value) => {
        const read = requiredInvocationFact(strings, value);
        return read.kind === "resolved" && axisLiteral(read.value);
      });
      if (
        vocabulary &&
        values.some((value) => {
          const scalar = typeProjectionFacet(requiredInvocationFact(captures, value), "scalar");
          return scalar.any || scalar.unknown;
        })
      ) {
        throw new Error(REFUSAL);
      }
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.BinaryExpression],
          visit: (node) => {
            if (!(Node.isBinaryExpression(node) && EQUALITY.has(node.getOperatorToken().getKind()))) {
              return;
            }
            prepare(node, [node.getLeft(), node.getRight()], true);
          },
        },
        {
          kinds: [SyntaxKind.SwitchStatement],
          visit: (node) => {
            if (Node.isSwitchStatement(node)) {
              prepare(
                node,
                [
                  node.getExpression(),
                  ...node
                    .getCaseBlock()
                    .getClauses()
                    .flatMap((clause) => (Node.isCaseClause(clause) ? [clause.getExpression()] : [])),
                ],
                false,
              );
            }
          },
        },
      ],
      evaluate: () => {
        const values = [...new Set([...comparisons.values()].flatMap((comparison) => comparison.values))];
        if (values.length === 0) {
          return;
        }
        if (ctx.nativeTypes === undefined) {
          throw new Error("native inference value context is unavailable");
        }
        const evidence = ctx.nativeTypes.invocationEvidence(values, STRING_PLAN);
        for (const value of values) {
          captures.set(value, nativeTypeProjection(ctx, value, VALUE_PLAN));
          strings.set(value, requiredInvocationFact(requiredInvocationFact(evidence, value).strings, value));
        }
        for (const [carrier, comparison] of comparisons) {
          if (!(comparison.presenceExempt && comparison.values.some((value) => presence(value, requiredInvocationFact(captures, value))))) {
            judge(carrier, comparison.values);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { ...TYPE_FILES, [PROBE]: AXIS_IMPORTS + 'declare const row: { wire: Wire; api: ChatApi }; if (row.wire === "local-light") {}' },
      expect: { count: 1, messageIncludes: "domain dispatches" },
      why: "the direct comparison resolves the actual inference wire declaration",
    },
    {
      mode: "types",
      files: { ...TYPE_FILES, [PROBE]: AXIS_IMPORTS + 'declare const row: { wire: Wire }; const renamed = row.wire; if (renamed === "local-light") {}' },
      expect: { count: 1, messageIncludes: "domain dispatches" },
      why: "a renamed immutable scalar retains its inference type origin",
    },
    {
      mode: "types",
      files: { ...TYPE_FILES, [PROBE]: AXIS_IMPORTS + 'declare const row: { api: ChatApi }; const { api: route } = row; if (route !== "agent-sdk") {}' },
      expect: { count: 1, messageIncludes: "domain dispatches" },
      why: "renamed destructuring retains the canonical API rather than its local spelling",
    },
    {
      mode: "types",
      files: {
        ...TYPE_FILES,
        [PROBE]: AXIS_IMPORTS + 'declare const row: { wire: Wire }; const key = "wire"; if ((row?.[key] as string) === "local-light") {}',
      },
      expect: { count: 1, messageIncludes: "domain dispatches" },
      why: "constant computed keys, optional access and wrappers retain native member provenance",
    },
    {
      mode: "types",
      files: { ...TYPE_FILES, [PROBE]: AXIS_IMPORTS + 'declare const route: ChatApi; switch (route) { case "agent-sdk": break; }' },
      expect: { count: 1, messageIncludes: "domain dispatches" },
      why: "a switch selects the same protocol axis as an equality",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { ...TYPE_FILES, [PROBE]: AXIS_IMPORTS + "declare const first: { wire: Wire }; declare const second: { wire: Wire }; if (first === second) {}" },
      why: "object identity is not a comparison of a nested inference axis",
    },
    {
      mode: "types",
      files: {
        ...TYPE_FILES,
        [PROBE]: 'const row = { api: "agent-sdk", wire: "local-light" }; if (row.api === "agent-sdk") {} if (row.wire === "local-light") {}',
      },
      why: "a concrete unrelated API vocabulary is not an inference contract by spelling or literal overlap",
    },
    {
      mode: "types",
      files: {
        ...TYPE_FILES,
        [PROBE]: AXIS_IMPORTS + "declare const row: { api: ChatApi | undefined }; if (row.api !== undefined) {} const projection = { api: row.api };",
      },
      why: "presence and data projection select no protocol behavior",
    },
    {
      mode: "types",
      files: {
        ...TYPE_FILES,
        [PROBE]: 'const row = { api: "rest" }; if (row.api === "rest") {}',
        "packages/inference/src/resolve/probe.ts": 'declare const wire: string; if (wire === "local-light") {}',
      },
      why: "runtime protocol ownership and unrelated domain comparisons remain outside the ban",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: { ...TYPE_FILES, [PROBE]: 'declare const opaque: unknown; if (opaque === "agent-sdk") {}' },
      expect: { messageIncludes: REFUSAL },
      why: "an opaque protocol comparison cannot establish either inference authority or a concrete unrelated type",
    },
  ],
});
