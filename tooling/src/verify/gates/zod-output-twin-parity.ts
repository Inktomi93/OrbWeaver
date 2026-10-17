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
// Singleton family: cast, satisfies, annotation, contextual-manifest and alias spellings express the same
// authored output-parity promise. A schema-only export does not create that promise.
import type { Expression, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { observedValueDeclarations } from "../../floor/code-facts/symbol-identity.ts";
import type { TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import type { NativeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { typeArgumentSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { memberTypeAtPath, observedTypeParameterWithin } from "../../floor/code-facts/type-slot-path.ts";
import { aggregateCallPath, contextualExpressions } from "../../floor/code-facts/type-slot-syntax.ts";
import { defineGate } from "../contract/policy.ts";
import type { ZodOutputTwinRead } from "../contract/zod-output-twin.ts";
import { typeObservationPlan, typeObservationReaders } from "../lib/type-observation-context.ts";
import {
  readAnnotatedZodOutputTwinWith as readAnnotatedZodOutputTwin,
  readContextualZodOutputTwinWith as readContextualZodOutputTwin,
  readExpressionZodOutputTwinWith as readExpressionZodOutputTwin,
  zodTypeReferenceIdentityWith as zodTypeReferenceIdentity,
} from "../lib/zod-output-twin.ts";

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
  return `${MESSAGE} ${failed.join("; ")}. Authored=${read.targetText}; output=${read.outputText}.`;
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

interface ParitySemantics {
  readonly contextualCallReads: (node: MorphNode) => readonly Exclude<ZodOutputTwinRead, { kind: "none" }>[];
  readonly contextualMemberDerivesOwnerTypeParameter: (node: MorphNode, expression: Expression) => boolean;
}
function paritySemantics(readers: TypeObservationReader): ParitySemantics {
  function info(selector: NativeTypeSelector): ReturnType<TypeObservationReader["type"]> | undefined {
    const reference = readers.select(selector);
    return reference === null ? undefined : readers.type(reference);
  }
  function isOwnerTypeParameter(type: NativeTypeSelector, declaration: MorphNode): boolean {
    return observedTypeParameterWithin(type, declaration, readers) !== undefined;
  }

  /** Whether the call argument at `index` types against the callee's OWN type parameter — either directly
   * (`schema: Schema`, the parameter type IS the type parameter) or wrapped (`schema: ZodType<T>`, T is the
   * type parameter). Either shape means Schema/T derives from THIS argument, so it creates no independent
   * authored output owner. Missing the bare-parameter shape (checking only the wrapped one) read most of
   * zod's own `array(element: T)` / `record(keyType, valueType: T)` call sites as authored contextual
   * pairs: the argument IS the callee's own bare type parameter, so the pair was comparing a schema
   * against itself. */
  function argumentDerivesOwnerTypeParameter(call: import("ts-morph").CallExpression, declaration: MorphNode, index: number): boolean {
    if (call.getTypeArguments().length > 0 || !Node.isFunctionLikeDeclaration(declaration)) {
      return false;
    }
    const parameter = declaration.getParameters()[index];
    const parameterType: NativeTypeSelector | undefined =
      parameter === undefined ? undefined : { base: { kind: "resolved-parameter", node: call, index }, steps: [], displayAt: null };
    if (parameterType === undefined) {
      return false;
    }
    if (isOwnerTypeParameter(parameterType, declaration)) {
      return true;
    }
    const output = typeArgumentSelector(parameterType);
    return info(output) !== undefined && isOwnerTypeParameter(output, declaration);
  }

  function typeDependsOnOwnerParameter(type: NativeTypeSelector, owner: MorphNode, location: MorphNode): boolean {
    return readers.depends(type, owner, location) !== null;
  }

  function contextualMemberDerivesOwnerTypeParameter(node: MorphNode, expression: Expression): boolean {
    const path = aggregateCallPath(node, expression);
    if (path === undefined || path.call.getTypeArguments().length > 0) {
      return false;
    }
    const signature = readers.signature(path.call);
    const declaration = signature?.declaration;
    if (declaration === undefined || !Node.isFunctionLikeDeclaration(declaration)) {
      return false;
    }
    const argumentIndex = path.call.getArguments().indexOf(path.argument);
    const parameter = argumentIndex < 0 ? undefined : declaration.getParameters()[argumentIndex];
    if (parameter === undefined) {
      return false;
    }
    const parameterType = signature?.parameters[argumentIndex];
    const member = parameterType === undefined ? undefined : memberTypeAtPath(parameterType, path, { owner: declaration, location: parameter, readers });
    return member !== undefined && typeDependsOnOwnerParameter(member, declaration, parameter);
  }

  interface ContextualCallCandidate {
    readonly index: number;
    readonly read: Exclude<ZodOutputTwinRead, { readonly kind: "none" }>;
  }

  function contextualCallCandidate(argument: MorphNode, index: number): ContextualCallCandidate | null {
    if (!Node.isExpression(argument)) {
      return null;
    }
    const read = readContextualZodOutputTwin(argument, argument, readers);
    return read.kind === "none" ? null : { index, read };
  }

  function contextualCallReads(node: MorphNode): readonly Exclude<ZodOutputTwinRead, { readonly kind: "none" }>[] {
    if (!Node.isCallExpression(node)) {
      return [];
    }
    const reads: Exclude<ZodOutputTwinRead, { readonly kind: "none" }>[] = [];
    let declaration: MorphNode | undefined;
    for (const [index, argument] of node.getArguments().entries()) {
      const candidate = contextualCallCandidate(argument, index);
      if (candidate === null) {
        continue;
      }
      declaration ??= readers.signature(node)?.declaration;
      if (declaration === undefined) {
        return [];
      }
      if (!argumentDerivesOwnerTypeParameter(node, declaration, candidate.index)) {
        reads.push(candidate.read);
      }
    }
    return reads;
  }

  return { contextualCallReads, contextualMemberDerivesOwnerTypeParameter };
}

const PARITY_KINDS = [
  SyntaxKind.VariableDeclaration,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.SatisfiesExpression,
  SyntaxKind.AsExpression,
  SyntaxKind.TypeAssertionExpression,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.ReturnStatement,
  SyntaxKind.ArrowFunction,
  SyntaxKind.ArrayLiteralExpression,
  SyntaxKind.BinaryExpression,
  SyntaxKind.CallExpression,
];

interface ParityQuestion {
  readonly node: MorphNode;
  readonly readers: TypeObservationReader;
}
function collectParityQuestions(
  nominees: readonly MorphNode[],
  contexts: ReadonlyMap<SourceFile, TypeObservationReader>,
  sources: readonly SourceFile[],
): readonly ParityQuestion[] {
  const sourcePaths = new Set(sources.map((source) => source.getFilePath()));
  const questions: ParityQuestion[] = [];
  const seen = new Map<TypeObservationReader, Set<MorphNode>>();
  const append = (node: MorphNode, readers: TypeObservationReader): void => {
    let nodes = seen.get(readers);
    if (nodes === undefined) {
      nodes = new Set();
      seen.set(readers, nodes);
    }
    if (!nodes.has(node)) {
      nodes.add(node);
      questions.push({ node, readers });
    }
  };
  for (const node of nominees) {
    const readers = contexts.get(node.getSourceFile());
    if (readers === undefined) {
      throw new Error("Zod parity source has no native importing owner");
    }
    append(node, readers);
  }
  for (const question of questions) {
    appendParityOwners(question, append, sourcePaths);
  }
  return questions;
}
function appendParityOwners(
  question: ParityQuestion,
  append: (node: MorphNode, readers: TypeObservationReader) => void,
  sourcePaths: ReadonlySet<string>,
): void {
  const references = [question.node, ...question.node.getDescendants()].filter((node) => Node.isIdentifier(node) || Node.isPropertyAccessExpression(node));
  for (const reference of references) {
    const declarations = observedValueDeclarations(reference, question.readers).filter((declaration) =>
      sourcePaths.has(declaration.getSourceFile().getFilePath()),
    );
    for (const declaration of declarations) {
      for (const node of [declaration, ...declaration.getDescendants()].filter((candidate) => PARITY_KINDS.includes(candidate.getKind()))) {
        append(node, question.readers);
      }
    }
  }
}
const PARITY_READ_KINDS = ["declaration", "expression", "contextual"] as const;
type ParityReadKind = (typeof PARITY_READ_KINDS)[number];
interface ParitySink {
  readonly read: (kind: ParityReadKind, node: MorphNode, read: ZodOutputTwinRead) => void;
  readonly cast: (node: MorphNode) => void;
}
function readParityDeclarations({ node, readers }: ParityQuestion, sink: ParitySink): void {
  if (Node.isVariableDeclaration(node) || Node.isPropertyDeclaration(node)) {
    sink.read("declaration", node, readAnnotatedZodOutputTwin(node, readers));
  }
  if (Node.isSatisfiesExpression(node) || Node.isAsExpression(node) || Node.isTypeAssertion(node)) {
    const target = node.getTypeNode();
    if ((Node.isAsExpression(node) || Node.isTypeAssertion(node)) && target !== undefined && zodTypeReferenceIdentity(target, readers) !== "none") {
      sink.cast(node);
    }
    sink.read("expression", node, readExpressionZodOutputTwin(node, readers));
  }
}
function readParityContexts({ node, readers }: ParityQuestion, sink: ParitySink): void {
  const { contextualCallReads, contextualMemberDerivesOwnerTypeParameter } = paritySemantics(readers);
  for (const expression of contextualExpressions(node)) {
    const read = readContextualZodOutputTwin(expression, expression, readers);
    if (read.kind === "none" || contextualMemberDerivesOwnerTypeParameter(node, expression)) {
      continue;
    }
    sink.read("contextual", read.carrier, read);
  }
  for (const read of contextualCallReads(node)) {
    sink.read("contextual", read.carrier, read);
  }
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
    const nominees: MorphNode[] = [];
    const native = ctx.nativeTypes;
    let plan: InventoryInvocationPlan | undefined;
    if (native === undefined) {
      throw new Error("native Zod output facts are unavailable");
    }
    return {
      visitors: [
        {
          kinds: PARITY_KINDS,
          visit: (node): void => {
            nominees.push(node);
          },
        },
      ],
      prepare: (): void => {
        plan = typeObservationPlan(ctx.files, nominees);
        native.request({ kind: "invocation-evidence", nodes: ctx.files, plan });
      },
      evaluate: (): void => {
        if (plan === undefined) {
          throw new Error("native Zod parity request was not prepared");
        }
        const contexts = typeObservationReaders(native.invocationEvidence(ctx.files, plan));
        let members = 0;
        let declarationSites = 0;
        let castSites = 0;
        let expressionSites = 0;
        let contextualSites = 0;
        const unresolvedSites = new Set<string>();
        const questions = collectParityQuestions(nominees, contexts, ctx.files);
        const siteKey = (node: MorphNode): string => JSON.stringify([node.getSourceFile().getFilePath(), node.getStart(), node.getEnd(), node.getKind()]);
        const counters = new Set<string>();
        const count = (kind: string, node: MorphNode): number => {
          const key = `${kind}:${siteKey(node)}`;
          if (counters.has(key)) {
            return 0;
          }
          counters.add(key);
          return 1;
        };
        const interpretations = new Map<string, Exclude<ZodOutputTwinRead, { kind: "none" }>[]>();
        const consume = (read: ZodOutputTwinRead): void => {
          if (read.kind === "none") {
            return;
          }
          const key = siteKey(read.carrier);
          const rows = interpretations.get(key) ?? [];
          rows.push(read);
          interpretations.set(key, rows);
        };
        const siteCounts = { declaration: 0, expression: 0, contextual: 0 };
        const sink: ParitySink = {
          read: (kind, node, read): void => {
            if (read.kind !== "none") {
              siteCounts[kind] += count(kind, node);
            }
            consume(read);
          },
          cast: (node): void => {
            castSites += count("cast", node);
          },
        };
        for (const question of questions) {
          readParityDeclarations(question, sink);
          readParityContexts(question, sink);
        }
        declarationSites = siteCounts.declaration;
        expressionSites = siteCounts.expression;
        contextualSites = siteCounts.contextual;
        for (const rows of interpretations.values()) {
          const unresolved = rows.find((read) => read.kind === "unresolved");
          if (unresolved !== undefined) {
            unresolvedSites.add(unresolvedIdentity(unresolved.carrier, ctx.relativePath));
            continue;
          }
          const pairs = rows.filter((read): read is Extract<ZodOutputTwinRead, { kind: "pair" }> => read.kind === "pair");
          members += 1;
          const failed = pairs.find((read) => !(read.outputToTarget && read.targetToOutput));
          if (failed !== undefined) {
            ctx.report.node(failed.carrier, { message: detail(failed) });
          }
        }
        ctx.receipt({
          kind: "population",
          source: `${RECEIPT} [declarations=${String(declarationSites)}, expression-pairs=${String(expressionSites)}, contextual-pairs=${String(contextualSites)}, raw-casts=${String(castSites)}]${unresolvedSites.size === 0 ? "" : ` ${UNRESOLVED_RECEIPT}${JSON.stringify([...unresolvedSites].sort())}`}`,
          members,
          unresolved: unresolvedSites.size,
        });
      },
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
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ndeclare function register<T>(input: { readonly schema: z.ZodType<State>; readonly metadata: T }): void;\nregister({ schema: z.object({ mode: z.literal("idle") }), metadata: { source: "probe" } });\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      expect: { count: 1, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "a generic metadata field in the same aggregate cannot suppress its concrete schema sibling's output contract",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ndeclare function register<T>(input: readonly [z.ZodType<T>, z.ZodType<State>, T]): void;\nregister([z.string(), z.object({ mode: z.literal("idle") }), "probe"]);\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      expect: { count: 1, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "a generic tuple element cannot suppress a concrete schema sibling in the same direct tuple argument",
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
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ndeclare function both<S extends z.ZodType>(a: S, b: S): void;\nboth<z.ZodType<State>>(z.object({ mode: z.literal("idle") }), z.object({ mode: z.literal("idle") }));\n',
      ),
      expect: { count: 2, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "an explicit generic call argument on a bare SHARED type parameter substitutes a concrete contextual output for every argument that binds it, the same as the wrapped ZodType<T> form",
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
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchemaBox<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\ntype RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\nfunction fakeBox<Schema extends z.ZodType>(schema: Schema): RuntimeGeneratedSchema<Schema> { return new RuntimeGeneratedSchemaBox(schema) as RuntimeGeneratedSchema<Schema>; }\ntype State = { mode: "idle" | "busy" };\nconst counterfeit = fakeBox(z.object({ mode: z.literal("idle") }));\nexport const schemas: readonly z.ZodType<State>[] = [counterfeit.schema];\n',
      ),
      expect: { count: 1, token: "counterfeit", messageIncludes: "authored type is not assignable to schema output" },
      why: "a same-named shadow wrapper using the intersected-brand shape still cannot impersonate the canonical contract from outside lift.ts",
    },
    {
      mode: "types",
      files: proofFilesAt(
        "packages/kit/src/json-schema/lift.ts",
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchemaBox<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\ntype RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\nnamespace Counterfeit {\n  export const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol = Symbol("counterfeit");\n  export class Box<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\n  export type Generated<Schema extends z.ZodType = z.ZodType> = Box<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\n  export function box<Schema extends z.ZodType>(schema: Schema): Generated<Schema> { return new Box(schema) as Generated<Schema>; }\n}\ntype State = { mode: "idle" | "busy" };\nconst counterfeit = Counterfeit.box(z.object({ mode: z.literal("idle") }));\nexport const schemas: readonly z.ZodType<State>[] = [counterfeit.schema];\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      expect: { count: 1, token: "counterfeit", messageIncludes: "authored type is not assignable to schema output" },
      why: "a namespace-scoped same-file brand and carrier cannot impersonate the module-scope runtime-generated-schema declarations by coordinates",
    },
    {
      mode: "types",
      files: proofFilesAt(
        "packages/kit/src/json-schema/lift.ts",
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchemaBox<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\ntype RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\nnamespace Counterfeit {\n  export class Box<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\n  export type Generated<Schema extends z.ZodType = z.ZodType> = Box<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\n  export function box<Schema extends z.ZodType>(schema: Schema): Generated<Schema> { return new Box(schema) as Generated<Schema>; }\n}\ntype State = { mode: "idle" | "busy" };\nconst counterfeit = Counterfeit.box(z.object({ mode: z.literal("idle") }));\nexport const schemas: readonly z.ZodType<State>[] = [counterfeit.schema];\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      expect: { count: 1, token: "counterfeit", messageIncludes: "authored type is not assignable to schema output" },
      why: "a same-file wrapper using the canonical brand with a counterfeit carrier proves carrier identity independently",
    },
    {
      mode: "types",
      files: proofFilesAt(
        "packages/kit/src/json-schema/lift.ts",
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchemaBox<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\ntype RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\nnamespace Counterfeit {\n  export const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol = Symbol("counterfeit");\n  export type Generated<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\n  export function box<Schema extends z.ZodType>(schema: Schema): Generated<Schema> { return new RuntimeGeneratedSchemaBox(schema) as Generated<Schema>; }\n}\ntype State = { mode: "idle" | "busy" };\nconst counterfeit = Counterfeit.box(z.object({ mode: z.literal("idle") }));\nexport const schemas: readonly z.ZodType<State>[] = [counterfeit.schema];\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      expect: { count: 1, token: "counterfeit", messageIncludes: "authored type is not assignable to schema output" },
      why: "a same-file wrapper using the canonical carrier with a counterfeit brand proves brand identity independently",
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
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ndeclare function register(input: Readonly<Record<string, z.ZodType<State>>>): void;\nregister({ state: z.object({ mode: z.literal("idle") }) });\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      expect: { count: 1, token: "z", messageIncludes: "authored type is not assignable to schema output" },
      why: "a concrete indexed Record schema target must still report narrowed output",
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
        'import * as z from "zod";\ndeclare function both<S extends z.ZodType>(a: S, b: S): void;\nboth(z.string(), z.string());\ntype Exact = { id: string };\nexport const exact = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      why: "a bare SHARED type parameter across two call arguments derives S from both, the same as the wrapped ZodType<T> form — neither argument creates an independent authored output owner; the exact concrete pair keeps the refusal denominator live",
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
      files: proofFiles(
        'import * as z from "zod";\ntype State = { mode: "idle" | "busy" };\ndeclare function register<T>(input: { readonly schema: z.ZodType<State>; readonly metadata: T }): void;\nregister({ schema: z.object({ mode: z.union([z.literal("idle"), z.literal("busy")]) }), metadata: { source: "probe" } });\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      why: "a concrete schema member remains counted when a sibling in the same aggregate owns the inferred generic type",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ndeclare function collect<T>(schemas: readonly z.ZodType<T>[]): void;\ndeclare function collectTuple<T>(schemas: readonly [z.ZodType<T>, z.ZodType<T>]): void;\ncollect([z.string(), z.string()]);\ncollectTuple([z.string(), z.string()]);\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      why: "direct inferred generic array and tuple arguments remain pass-through rather than independent authored output owners",
    },
    {
      mode: "types",
      files: proofFilesAt(
        "packages/kit/src/json-schema/lift.ts",
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchemaBox<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\ntype RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\nfunction boxGeneratedSchema<Schema extends z.ZodType>(schema: Schema): RuntimeGeneratedSchema<Schema> { return new RuntimeGeneratedSchemaBox(schema) as RuntimeGeneratedSchema<Schema>; }\nconst generated = boxGeneratedSchema(z.string());\nconst composed: readonly z.ZodType[] = [generated.schema];\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\nvoid composed;\n',
      ),
      why: "the canonical nominal runtime-generated-schema member is opaque by contract — the brand now lives on the intersected type alias rather than the class, since a `declare` computed class field cannot survive Playwright's Babel transform — while a healthy authored pair keeps the population live",
    },
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ndeclare function collect<T>(schemas: Readonly<Record<string, z.ZodType<T>>>): void;\ncollect({ a: z.literal("a"), b: z.literal("b") });\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\n',
      ),
      why: "inferred generic indexed Record members remain pass-through rather than independent authored output owners",
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
    {
      mode: "types",
      files: proofFiles(
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchemaBox<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\ntype RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\ndeclare const erased: z.ZodType;\nconst counterfeit = new RuntimeGeneratedSchemaBox(erased) as RuntimeGeneratedSchema;\nconst generated: readonly z.ZodType[] = [counterfeit.schema];\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\nvoid generated;\n',
      ),
      expect: { messageIncludes: RECEIPT },
      why: "a same-named counterfeit wrapper using the intersected-brand shape with erased output remains unresolved rather than inheriting the canonical exemption",
    },
    {
      mode: "types",
      files: proofFilesAt(
        "packages/kit/src/json-schema/lift.ts",
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchemaBox<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\ntype RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\nnamespace Counterfeit {\n  export const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol = Symbol("counterfeit");\n  export class Box<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\n  export type Generated<Schema extends z.ZodType = z.ZodType> = Box<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\n  export function box<Schema extends z.ZodType>(schema: Schema): Generated<Schema> { return new Box(schema) as Generated<Schema>; }\n}\ndeclare const erased: z.ZodType;\nconst counterfeit = Counterfeit.box(erased);\nconst generated: readonly z.ZodType[] = [counterfeit.schema];\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\nvoid generated;\n',
      ),
      expect: { messageIncludes: RECEIPT },
      why: "a namespace-scoped same-file brand and carrier with erased output remains unresolved rather than inheriting the module-scope exemption",
    },
    {
      mode: "types",
      files: proofFilesAt(
        "packages/kit/src/json-schema/lift.ts",
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchemaBox<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\ntype RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\nnamespace Counterfeit {\n  export class Box<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\n  export type Generated<Schema extends z.ZodType = z.ZodType> = Box<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\n  export function box<Schema extends z.ZodType>(schema: Schema): Generated<Schema> { return new Box(schema) as Generated<Schema>; }\n}\ndeclare const erased: z.ZodType;\nconst counterfeit = Counterfeit.box(erased);\nconst generated: readonly z.ZodType[] = [counterfeit.schema];\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\nvoid generated;\n',
      ),
      expect: { messageIncludes: RECEIPT },
      why: "a same-file erased wrapper using the canonical brand with a counterfeit carrier proves carrier identity independently",
    },
    {
      mode: "types",
      files: proofFilesAt(
        "packages/kit/src/json-schema/lift.ts",
        'import * as z from "zod";\ndeclare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;\nclass RuntimeGeneratedSchemaBox<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }\ntype RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\nnamespace Counterfeit {\n  export const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol = Symbol("counterfeit");\n  export type Generated<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };\n  export function box<Schema extends z.ZodType>(schema: Schema): Generated<Schema> { return new RuntimeGeneratedSchemaBox(schema) as Generated<Schema>; }\n}\ndeclare const erased: z.ZodType;\nconst counterfeit = Counterfeit.box(erased);\nconst generated: readonly z.ZodType[] = [counterfeit.schema];\ntype Exact = { id: string };\nexport const healthy = z.object({ id: z.string() }) satisfies z.ZodType<Exact>;\nvoid generated;\n',
      ),
      expect: { messageIncludes: RECEIPT },
      why: "a same-file erased wrapper using the canonical carrier with a counterfeit brand proves brand identity independently",
    },
  ],
});
