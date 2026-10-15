// Domains consume runtime operation capabilities instead of dispatching on inference protocol axes.
// Singleton: inference declaration identity; canonical reference/type readers own aliases and members.
// Equality and switch decisions are judged; presence tests and unrelated API vocabularies remain legal.
// Unreadable comparisons against inference vocabulary refuse instead of claiming an unrelated origin.

import { connectionApiSchema, wireSchema } from "@orb/contracts/inference";
import type { Node as MorphNode, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { runtimeUndefinedValue } from "../../floor/code-facts/call-supplied.ts";
import { readStaticString, resolveLexicalValueDeclaration, resolveStableExpression } from "../../floor/code-facts/reference-fact.ts";
import { resolveCallableDeclaration } from "../../floor/code-facts/reference-fact-call.ts";
import { resolveTypeIdentityChain, resolveTypeMemberOrigin } from "../../floor/code-facts/type-member-origin.ts";
import { annotationReferenceOrigin, normalizedPath } from "../../floor/code-facts/type-member-origin-core.ts";
import { defineGate } from "../contract/policy.ts";
import { resolveScalarTypeOrigins, resolveTypePropertyOrigin } from "../lib/type-member-origin.ts";

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

function presence(node: MorphNode): boolean {
  return node.getKind() === SyntaxKind.NullKeyword || runtimeUndefinedValue(node);
}

function axisLiteral(value: string): boolean {
  return wireSchema.safeParse(value).success || connectionApiSchema.safeParse(value).success;
}

function comparisonCandidate(node: MorphNode): boolean {
  const read = readStaticString(node);
  if (read.kind === "resolved" && axisLiteral(read.value)) {
    return true;
  }
  const type = node.getType();
  return [type, ...type.getUnionTypes()].some((part) => {
    const literal = part.isStringLiteral() ? part.getLiteralValue() : undefined;
    return typeof literal === "string" && axisLiteral(literal);
  });
}

function isHome(declarations: readonly MorphNode[]): boolean {
  return declarations.some(
    (declaration) =>
      Node.isTypeAliasDeclaration(declaration) &&
      Object.entries(AXIS_HOMES).some(([name, path]) => declaration.getName() === name && normalizedPath(declaration).endsWith(`/${path}`)),
  );
}

function axisAnnotation(type: TypeNode | undefined): boolean {
  if (type === undefined) {
    return false;
  }
  const direct = Node.isTypeReference(type) ? annotationReferenceOrigin(type.getTypeName()) : undefined;
  if (direct?.kind === "resolved" && isHome(direct.value.declarations)) {
    return true;
  }
  const origins = resolveScalarTypeOrigins(type);
  if (origins.some((fact) => fact.kind === "unresolved" && isHome(fact.trace.declarations))) {
    throw new Error(REFUSAL);
  }
  return origins.some((fact) => fact.kind === "resolved" && isHome(fact.value.declarations));
}

function annotationOwnsAxis(declaration: MorphNode): boolean {
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
  return axisAnnotation(declaration.getTypeNode());
}

function returnedAxis(node: MorphNode): boolean {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const target = resolveCallableDeclaration(node);
  if (target.kind === "unresolved") {
    throw new Error(REFUSAL);
  }
  const declaration = target.value.declaration;
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
  return axisAnnotation(annotation);
}

function bindingOwnsAxis(node: MorphNode): boolean {
  const binding = resolveLexicalValueDeclaration(node);
  if (binding.kind !== "resolved") {
    return false;
  }
  if (annotationOwnsAxis(binding.value)) {
    return true;
  }
  if (!Node.isBindingElement(binding.value)) {
    return false;
  }
  const key = binding.value.getPropertyNameNode() ?? binding.value.getNameNode();
  let name: string | undefined;
  if (Node.isIdentifier(key)) {
    name = key.getText();
  } else {
    const read = readStaticString(Node.isComputedPropertyName(key) ? key.getExpression() : key);
    if (read.kind === "resolved") {
      name = read.value;
    }
  }
  const receiver = binding.value.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
  if (receiver === undefined || name === undefined) {
    return false;
  }
  const property = resolveTypePropertyOrigin(receiver, name);
  return property.kind === "resolved" && property.value.some(annotationOwnsAxis);
}

function nativeAxisOrigin(node: MorphNode): boolean {
  const chain = resolveTypeIdentityChain(node);
  if (chain.kind === "resolved" && chain.value.some((origin) => isHome(origin.declarations))) {
    return true;
  }
  const member = resolveTypeMemberOrigin(node);
  return member.kind === "resolved" && member.value.declarations.some(annotationOwnsAxis);
}

function inferenceAxis(node: MorphNode): boolean {
  if (node.getType().getNonNullableType().isObject()) {
    return false;
  }
  const stable = resolveStableExpression(node);
  const source = stable.kind === "resolved" ? stable.value : stable.node;
  return bindingOwnsAxis(node) || annotationOwnsAxis(source) || [node, source].some(nativeAxisOrigin) || returnedAxis(source);
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
    const judge = (carrier: MorphNode, values: readonly MorphNode[]): void => {
      if (!values.some(comparisonCandidate)) {
        return;
      }
      if (values.some(inferenceAxis)) {
        ctx.report.node(carrier);
        return;
      }
      const vocabulary = values.some((value) => {
        const read = readStaticString(value);
        return read.kind === "resolved" && axisLiteral(read.value);
      });
      if (vocabulary && values.some((value) => value.getType().isAny() || value.getType().isUnknown())) {
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
            const values = [node.getLeft(), node.getRight()];
            if (!values.some(presence)) {
              judge(node, values);
            }
          },
        },
        {
          kinds: [SyntaxKind.SwitchStatement],
          visit: (node) => {
            if (Node.isSwitchStatement(node)) {
              judge(node, [
                node.getExpression(),
                ...node
                  .getCaseBlock()
                  .getClauses()
                  .flatMap((clause) => (Node.isCaseClause(clause) ? [clause.getExpression()] : [])),
              ]);
            }
          },
        },
      ],
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
