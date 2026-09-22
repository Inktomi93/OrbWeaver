// Exact two-way OUTPUT parity for the deliberately type-first Zod twins in product source.
//
// Schema-derived `z.infer` / `z.output` remains the default and is outside this policy's subject. A
// hand-authored type may still lead for recursive/lazy schemas, canonical types owned elsewhere, brands,
// generated schemas, or compiler reachability/exhaustiveness constraints. The promise at every such seam is
// narrower: schema OUTPUT and the authored type are mutually assignable. One-way `ZodType<T>` assignment is
// insufficient because it admits both a schema that silently narrows T and an output carrying extra required
// fields. Input equality is deliberately not asserted: defaults, coercions and preprocessors legitimately
// change input while preserving output.
//
// FAMILY: `zod-output-twin-parity` has two distinct predicates over one shared semantic reader. This policy
// proves exact bidirectional output parity once an authored twin exists; `zod-export-membership` proves that
// every exported concrete schema has an explicit output owner in the first place. Cast, satisfies, annotation,
// contextual-manifest and alias spellings remain one parity predicate rather than separate policy families.
import type { Expression, Node as MorphNode, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ZodOutputTwinRead } from "../lib/zod-output-twin.ts";
import { readAnnotatedZodOutputTwin, readContextualZodOutputTwin, readExpressionZodOutputTwin, zodTypeReferenceIdentity } from "../lib/zod-output-twin.ts";

const MESSAGE =
  "a hand-authored ZodType twin disagrees with the schema's exact output. Keep intentional type-first ownership, but make the authored type and schema output mutually assignable; input parity is not required. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const RECEIPT = "zod-output-twin-parity concrete authored pairs";
const UNRESOLVED_RECEIPT = "unresolved-sites=";
const UNRESOLVED_LABEL_MAX = 80;

const ZOD_PROOF_MODULE = `
export interface ZodType<Output = unknown, Input = unknown> {
  readonly _output: Output;
  readonly _input: Input;
  transform<Next>(map: (value: Output) => Next): ZodType<Next, Input>;
  default(value: Output): ZodType<Output, Input | undefined>;
}
export type output<T extends ZodType> = T["_output"];
export type infer<T extends ZodType> = output<T>;
export declare function string(): ZodType<string>;
export declare function number(): ZodType<number>;
export declare function literal<const Value extends string>(value: Value): ZodType<Value>;
export declare function array<Element extends ZodType>(element: Element): ZodType<readonly output<Element>[]>;
export declare function object<const Shape extends Readonly<Record<string, ZodType>>>(shape: Shape): ZodType<{ [Key in keyof Shape]: output<Shape[Key]> }>;
export declare function union<const Members extends readonly [ZodType, ...ZodType[]]>(members: Members): ZodType<output<Members[number]>>;
export declare function lazy<Output, Input = Output>(get: () => ZodType<Output, Input>): ZodType<Output, Input>;
`;

function proofFiles(source: string, extra: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return { "node_modules/zod/index.d.ts": ZOD_PROOF_MODULE, ...extra, "packages/contracts/src/x.ts": source };
}

function proofFilesAt(path: string, source: string, extra: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return { "node_modules/zod/index.d.ts": ZOD_PROOF_MODULE, ...extra, [path]: source };
}

function detail(read: Extract<ZodOutputTwinRead, { readonly kind: "pair" }>): string {
  const failed = [
    ...(read.outputToTarget ? [] : ["schema output is not assignable to the authored type"]),
    ...(read.targetToOutput ? [] : ["authored type is not assignable to schema output"]),
  ];
  return `${MESSAGE} ${failed.join("; ")}. Authored=${read.target.getText(read.carrier)}; output=${read.output.getText(read.carrier)}.`;
}

function unresolvedIdentity(node: MorphNode, relativePath: (sourceFile: import("ts-morph").SourceFile) => string): string {
  const sourceFile = node.getSourceFile();
  const line = node.getStartLineNumber();
  const column = node.getStart() - node.getStartLinePos() + 1;
  const declaration = [node, ...node.getAncestors()].find(
    (candidate) => Node.isVariableDeclaration(candidate) || Node.isPropertyDeclaration(candidate) || Node.isPropertyAssignment(candidate),
  );
  const authored =
    declaration !== undefined && (Node.isVariableDeclaration(declaration) || Node.isPropertyDeclaration(declaration) || Node.isPropertyAssignment(declaration))
      ? declaration.getNameNode().getText()
      : node.getText().replaceAll(/\s+/gu, " ").slice(0, UNRESOLVED_LABEL_MAX);
  return `${relativePath(sourceFile)}:${String(line)}:${String(column)}:${authored}`;
}

function contextualPropertyInitializer(node: import("ts-morph").PropertyAssignment): readonly Expression[] {
  const initializer = node.getInitializer();
  return initializer === undefined ? [] : [initializer];
}

function contextualExpressions(node: MorphNode): readonly Expression[] {
  if (Node.isPropertyAssignment(node)) {
    return contextualPropertyInitializer(node);
  }
  if (Node.isReturnStatement(node)) {
    const expression = node.getExpression();
    return expression === undefined ? [] : [expression];
  }
  if (Node.isArrowFunction(node)) {
    const body = node.getBody();
    return Node.isExpression(body) ? [body] : [];
  }
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().filter((element): element is Expression => Node.isExpression(element) && !Node.isSpreadElement(element));
  }
  if (Node.isBinaryExpression(node) && node.getOperatorToken().isKind(SyntaxKind.EqualsToken)) {
    return [node.getRight()];
  }
  return [];
}

function argumentDerivesOwnerTypeParameter(call: import("ts-morph").CallExpression, declaration: MorphNode, index: number): boolean {
  if (call.getTypeArguments().length > 0 || !Node.isFunctionLikeDeclaration(declaration)) {
    return false;
  }
  const output = declaration.getParameters()[index]?.getType().getTypeArguments()[0];
  return (
    output
      ?.getSymbol()
      ?.getDeclarations()
      .some((candidate) => Node.isTypeParameterDeclaration(candidate) && candidate.getAncestors().includes(declaration)) ?? false
  );
}

function typeDependsOnOwnerParameter(type: Type, owner: MorphNode, location: MorphNode): boolean {
  const seen = new Set<unknown>();
  const visit = (candidateType: Type): boolean => {
    if (seen.has(candidateType.compilerType)) {
      return false;
    }
    seen.add(candidateType.compilerType);
    if (
      candidateType
        .getSymbol()
        ?.getDeclarations()
        .some((candidate) => Node.isTypeParameterDeclaration(candidate) && candidate.getAncestors().includes(owner)) === true
    ) {
      return true;
    }
    const children = [
      ...candidateType.getTypeArguments(),
      ...candidateType.getAliasTypeArguments(),
      ...candidateType.getUnionTypes(),
      ...candidateType.getIntersectionTypes(),
    ];
    return children.some(visit) || candidateType.getProperties().some((property) => visit(property.getTypeAtLocation(location)));
  };
  return visit(type);
}

function belongsToInferredGenericCallShape(node: MorphNode, ctx: { checker: () => import("ts-morph").TypeChecker }): boolean {
  let aggregate: import("ts-morph").ObjectLiteralExpression | import("ts-morph").ArrayLiteralExpression | undefined;
  if (Node.isPropertyAssignment(node)) {
    aggregate = node.getParentIfKind(SyntaxKind.ObjectLiteralExpression);
  } else if (Node.isArrayLiteralExpression(node)) {
    aggregate = node;
  }
  if (aggregate === undefined) {
    return false;
  }
  const call = aggregate.getParentIfKind(SyntaxKind.CallExpression);
  if (call === undefined || call.getTypeArguments().length > 0) {
    return false;
  }
  const declaration = ctx.checker().getResolvedSignature(call)?.getDeclaration();
  if (declaration === undefined || !Node.isFunctionLikeDeclaration(declaration)) {
    return false;
  }
  const argumentIndex = call.getArguments().indexOf(aggregate);
  const parameter = argumentIndex < 0 ? undefined : declaration.getParameters()[argumentIndex];
  return parameter !== undefined && typeDependsOnOwnerParameter(parameter.getType(), declaration, parameter);
}

export const gate = defineGate({
  id: "zod-output-twin-parity",
  family: "zod-output-twin-parity",
  authority: "hard",
  severity: "error",
  population: "@product",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  create: (ctx) => {
    let members = 0;
    let declarationSites = 0;
    let castSites = 0;
    let expressionSites = 0;
    let contextualSites = 0;
    const unresolvedSites = new Set<string>();
    const consume = (read: ZodOutputTwinRead): void => {
      if (read.kind === "none") {
        return;
      }
      if (read.kind === "unresolved") {
        unresolvedSites.add(unresolvedIdentity(read.carrier, ctx.relativePath));
        return;
      }
      members += 1;
      if (!(read.outputToTarget && read.targetToOutput)) {
        ctx.report.node(read.carrier, { message: detail(read) });
      }
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration, SyntaxKind.PropertyDeclaration],
          visit: (node) => {
            if (Node.isVariableDeclaration(node) || Node.isPropertyDeclaration(node)) {
              const read = readAnnotatedZodOutputTwin(node);
              if (read.kind !== "none") {
                declarationSites += 1;
              }
              consume(read);
            }
          },
        },
        {
          kinds: [SyntaxKind.SatisfiesExpression, SyntaxKind.AsExpression, SyntaxKind.TypeAssertionExpression],
          visit: (node) => {
            if (!(Node.isSatisfiesExpression(node) || Node.isAsExpression(node) || Node.isTypeAssertion(node))) {
              return;
            }
            const target = node.getTypeNode();
            if (
              (node.isKind(SyntaxKind.AsExpression) || node.isKind(SyntaxKind.TypeAssertionExpression)) &&
              target !== undefined &&
              zodTypeReferenceIdentity(target) !== "none"
            ) {
              castSites += 1;
            }
            const read = readExpressionZodOutputTwin(node);
            if (read.kind !== "none") {
              expressionSites += 1;
            }
            consume(read);
          },
        },
        {
          kinds: [
            SyntaxKind.PropertyAssignment,
            SyntaxKind.ReturnStatement,
            SyntaxKind.ArrowFunction,
            SyntaxKind.ArrayLiteralExpression,
            SyntaxKind.BinaryExpression,
          ],
          visit: (node) => {
            const inferredGenericShape = belongsToInferredGenericCallShape(node, ctx);
            for (const expression of contextualExpressions(node)) {
              const read = readContextualZodOutputTwin(expression);
              // An exact contextual type inferred from the same schema expression is generic construction
              // plumbing, not a second owner. Any mismatch remains visible, as does every explicit generic
              // instantiation whose type argument supplies a concrete independent target.
              if (inferredGenericShape) {
                continue;
              }
              if (read.kind !== "none") {
                contextualSites += 1;
              }
              consume(read);
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const declaration = ctx.checker().getResolvedSignature(node)?.getDeclaration();
            if (declaration === undefined) {
              return;
            }
            for (const [index, argument] of node.getArguments().entries()) {
              if (!Node.isExpression(argument)) {
                continue;
              }
              const read = readContextualZodOutputTwin(argument);
              if (argumentDerivesOwnerTypeParameter(node, declaration, index)) {
                continue;
              }
              if (read.kind !== "none") {
                contextualSites += 1;
              }
              consume(read);
            }
          },
        },
      ],
      evaluate: () =>
        ctx.receipt({
          kind: "population",
          source: `${RECEIPT} [declarations=${String(declarationSites)}, expression-pairs=${String(expressionSites)}, contextual-pairs=${String(contextualSites)}, raw-casts=${String(castSites)}]${
            unresolvedSites.size === 0 ? "" : ` ${UNRESOLVED_RECEIPT}${JSON.stringify([...unresolvedSites].sort())}`
          }`,
          members,
          unresolved: unresolvedSites.size,
        }),
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\nexport const stateSchema = z.object({ mode: z.literal("idle") }) satisfies z.ZodType<State>;\n',
      ),
      expect: { count: 1, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "a schema may silently narrow a union while its output remains assignable one-way to the authored type",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype PublicRow = { id: string };\nexport const rowSchema: z.ZodType<PublicRow> = z.object({ id: z.string(), secret: z.string() });\n',
      ),
      expect: { count: 1, token: "rowSchema", messageIncludes: "authored type is not assignable to schema output" },
      why: "a schema may add a required output field while remaining assignable one-way to the smaller authored type",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype Canonical = { kind: "a" | "b" };\nexport const schema = z.object({ kind: z.literal("a") }) as unknown as z.ZodType<Canonical>;\n',
      ),
      expect: { count: 1, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "an `as unknown as ZodType<T>` pair is compared from the pre-cast schema output, so the double cast cannot erase a narrowing mismatch",
    },
    {
      mode: "types",
      files: proofFilesAt(
        "packages/inference/src/unrelated/deep/schema.ts",
        'import * as z from "zod";\nimport type { ZodType as Schema } from "zod";\ntype State = { mode: "idle" | "busy" };\nexport class Registry { static readonly schema: Schema<State> = z.object({ mode: z.literal("idle") }); }\n',
      ),
      expect: { count: 1, token: "schema", messageIncludes: "authored type is not assignable to schema output" },
      why: "a class/static property using an aliased ZodType import in an unrelated product path remains part of the semantic population",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ninterface Registry { readonly schema: z.ZodType<State>; }\nexport const registry: Registry = { schema: z.object({ mode: z.literal("idle") }) };\n',
      ),
      expect: { count: 1, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "an object property context is an independently authored schema/type pair even without a ZodType wrapper on the initializer",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\nexport function stateSchema(): z.ZodType<State> { return z.object({ mode: z.literal("idle") }); }\n',
      ),
      expect: { count: 1, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "an exported return declaration owns the output promise at every returned concrete schema expression",
    },
    {
      mode: "types",
      files: proofFilesAt(
        "packages/showcase-plugins/src/schema-surfaces.ts",
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\nexport const arrow = (): z.ZodType<State> => z.object({ mode: z.literal("idle") });\nexport const list: readonly z.ZodType<State>[] = [z.object({ mode: z.literal("idle") })];\nconst slots: Record<string, z.ZodType<State>> = {};\nslots["state"] = z.object({ mode: z.literal("idle") });\n',
      ),
      expect: { count: 3, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "expression-bodied returns, array manifest entries and assignment RHS slots are three distinct contextual pair carriers, all caught outside the original contracts paths",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ndeclare function register(schema: z.ZodType<State>): void;\nregister(z.object({ mode: z.literal("idle") }));\n',
      ),
      expect: { count: 1, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "a non-generic concrete schema parameter owns an output contract at the call boundary and cannot admit a one-way narrowing",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ndeclare function register<T>(schema: z.ZodType<State>, metadata: T): void;\nregister(z.object({ mode: z.literal("idle") }), { source: "probe" });\n',
      ),
      expect: { count: 1, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "an unrelated generic metadata parameter cannot suppress the concrete schema argument output contract",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ndeclare function register<T>(input: { readonly schema: z.ZodType<State> }, metadata: T): void;\nregister({ schema: z.object({ mode: z.literal("idle") }) }, { source: "probe" });\n',
      ),
      expect: { count: 1, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "an unrelated generic metadata parameter cannot suppress a concrete schema pair nested in the aggregate argument",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ndeclare function register(input: { readonly schema: z.ZodType<State>; readonly schemas: readonly z.ZodType<State>[] }): void;\nregister({ schema: z.object({ mode: z.literal("idle") }), schemas: [z.object({ mode: z.literal("idle") })] });\n',
      ),
      expect: { count: 2, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "object properties and array elements retain their concrete contextual output contracts when their manifest is constructed inline as a call argument",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype Idle = { mode: "idle" };\ntype State = { mode: "idle" | "busy" };\nexport function widen(schema: z.ZodType<Idle>): z.ZodType<State> { return schema; }\n',
      ),
      expect: { count: 1, token: "schema", messageIncludes: "authored type is not assignable to schema output" },
      why: "a concrete parameter returned through a wider ZodType output is an independently authored pair rather than generic same-owner plumbing",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype Idle = { mode: "idle" };\ntype State = { mode: "idle" | "busy" };\nexport function widen<T>(schema: z.ZodType<Idle>, meta: T): z.ZodType<State> { void meta; return schema; }\n',
      ),
      expect: { count: 1, token: "schema", messageIncludes: "authored type is not assignable to schema output" },
      why: "an unrelated function type parameter does not turn a concrete parameter/return output mismatch into generic plumbing",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ndeclare function register<T>(input: { readonly schema: z.ZodType<T> }): void;\nregister<State>({ schema: z.object({ mode: z.literal("idle") }) });\n',
      ),
      expect: { count: 1, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "an explicit generic call argument substitutes a concrete contextual output and remains subject to parity",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> { declare readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true; readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\ntype State = { mode: "idle" | "busy" };\nconst counterfeit = new RuntimeGeneratedSchema(z.object({ mode: z.literal("idle") }));\nexport const schemas: readonly z.ZodType<State>[] = [counterfeit.schema];\n',
      ),
      expect: { count: 1, token: "counterfeit", messageIncludes: "authored type is not assignable to schema output" },
      why: "a same-named shadow wrapper with its own unique-symbol brand cannot impersonate the canonical runtime-generated-schema contract",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\nconst holder: { readonly schema: z.ZodType<{ mode: "idle" }> } = { schema: z.object({ mode: z.literal("idle") }) };\nexport const schemas: readonly z.ZodType<State>[] = [holder.schema];\n',
      ),
      expect: { count: 1, token: "holder", messageIncludes: "authored type is not assignable to schema output" },
      why: "a bare ZodType member has no generated-schema brand and remains an authored contextual pair",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\nconst fixed = z.object({ mode: z.literal("idle") });\nexport const schemas: readonly z.ZodType<State>[] = [fixed];\n',
      ),
      expect: { count: 1, token: "fixed", messageIncludes: "authored type is not assignable to schema output" },
      why: "an authored fixed schema remains visible beside the generated-schema exception",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\nexport const derivedSchema = z.object({ id: z.string() });\nexport type Derived = z.output<typeof derivedSchema>;\ntype Exact = { id: string };\nexport const exactSchema = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      why: "the schema-derived default is ignored, while an exact type-first pair keeps the authored corpus nonempty and passes",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype Trimmed = { length: number };\nexport const transformed = z.string().transform((value) => ({ length: value.length })) satisfies z.ZodType<Trimmed>;\n',
      ),
      why: "output-changing transforms are judged by their post-transform `_output`, not by the pre-transform input",
    },
    {
      mode: "types",
      files: proofFiles('import * as z from "zod";\nexport const withDefault = z.string().default("fallback") satisfies z.ZodType<string>;\n'),
      why: "a default widens accepted input with undefined but keeps string output, and input inequality is intentionally outside this policy",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\nimport type { CanonicalNode } from "./canonical";\nexport const recursiveNodeSchema: z.ZodType<CanonicalNode> = z.lazy(() => z.object({ name: z.string(), children: z.array(recursiveNodeSchema) }));\n',
        { "packages/contracts/src/canonical.ts": "export interface CanonicalNode { readonly name: string; readonly children: readonly CanonicalNode[]; }\n" },
      ),
      why: "a recursive lazy schema may intentionally follow an externally owned canonical type when exact output parity still holds",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\nimport type { Canonical } from "./canonical";\nexport const castSchema = z.object({ kind: z.literal("x") }) as unknown as z.ZodType<Canonical>;\n',
        { "packages/contracts/src/canonical.ts": 'export interface Canonical { readonly kind: "x"; }\n' },
      ),
      why: "a double cast is admissible only when the schema expression before the cast has exact output parity",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ninterface Holder<T> { readonly schema: z.ZodType<T>; }\nexport function accepts<T>(schema: z.ZodType<T>): Holder<T> { return { schema }; }\nconst exact = z.string() satisfies z.ZodType<string>;\n',
      ),
      why: "ordinary generic parameter, return and interface slots are plumbing rather than concrete authored twin declarations",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype LocalSchema<T> = z.ZodType<T>;\nexport interface Holder<T> { readonly schema: LocalSchema<T>; }\nexport function passThrough<T>(schema: LocalSchema<T>): LocalSchema<T> { return schema; }\ntype Exact = { id: string };\nexport const exact: LocalSchema<Exact> = z.object({ id: z.string() });\n',
      ),
      why: "type aliases resolve to canonical ZodType identity, while signatures and a bare generic parameter pass-through create no independent schema output; the exact concrete alias keeps the corpus live",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ndeclare function consume<T>(schema: z.ZodType<T>): T;\nconsume(z.string());\ntype Exact = { id: string };\nexport const exact = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      why: "a generic schema parameter derives T from its argument and creates no independent authored output twin; the exact concrete pair keeps the refusal denominator live",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ndeclare function register<T>(input: { readonly schema: z.ZodType<T> }): void;\nregister({ schema: z.string() });\ntype Exact = { id: string };\nexport const exact = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      why: "an aggregate parameter whose schema target is the callee-owned inferred type parameter is derived plumbing; the healthy concrete sibling keeps the corpus live",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ndeclare function register<T>(input: { readonly schema: z.ZodType<State> }, metadata: T): void;\nregister({ schema: z.object({ mode: z.union([z.literal("idle"), z.literal("busy")]) }) }, { source: "probe" });\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      why: "a concrete aggregate schema target remains a counted pair when a different call parameter owns the generic type; the healthy sibling makes omission observable",
    },
    {
      mode: "types",
      files: proofFilesAt(
        "packages/kit/src/json-schema/lift.ts",
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> { declare readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true; readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\nconst generated = new RuntimeGeneratedSchema(z.string());\nconst composed: readonly z.ZodType[] = [generated.schema];\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\nvoid composed;\n',
      ),
      why: "the canonical nominal runtime-generated-schema member is opaque by contract while a healthy authored pair keeps the population live",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: { "packages/contracts/src/x.ts": "export const unrelated = true;\n" },
      expect: { messageIncludes: RECEIPT },
      why: "a corpus that resolves zero concrete authored pairs refuses rather than returning a placebo clean verdict",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype Row = { id: string };\ndeclare const erased: unknown;\nexport const rowSchema: z.ZodType<Row> = erased as never;\n',
      ),
      expect: { messageIncludes: RECEIPT },
      why: "a concrete authored pair whose schema output is erased is unresolved and withholds the owner instead of passing",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\nexport const anyErased: z.ZodType<any> = z.string();\nexport const unknownErased: z.ZodType<unknown> = z.string();\n',
      ),
      expect: { messageIncludes: RECEIPT },
      why: "explicit any/unknown output erasure remains unresolved even when a healthy sibling makes the concrete-pair population nonzero",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype Exact = { id: string };\ninterface Registry { readonly anySchema: z.ZodType<any>; readonly unknownSchema: z.ZodType<unknown>; }\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\nexport const registry: Registry = { anySchema: z.string(), unknownSchema: z.string() };\n',
      ),
      expect: { messageIncludes: RECEIPT },
      why: "contextual any/unknown output erasure remains unresolved beside a healthy pair rather than disappearing from the population",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> { declare readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true; readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\ndeclare const erased: z.ZodType;\nconst counterfeit = new RuntimeGeneratedSchema(erased);\nconst generated: readonly z.ZodType[] = [counterfeit.schema];\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\nvoid generated;\n',
      ),
      expect: { messageIncludes: RECEIPT },
      why: "a same-named counterfeit generated-schema wrapper with erased output remains unresolved rather than inheriting the canonical brand exemption",
    },
  ],
});
