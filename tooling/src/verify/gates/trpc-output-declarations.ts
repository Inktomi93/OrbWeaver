// Mounted AppRouter queries/mutations returning service-built values require an explicit tRPC output parser.
// Native void/undefined and subscriptions carry no parser obligation. Transport-owned literal envelopes
// qualify only when every nested object/array is authored and every non-container value is scalar; spreads
// and service-owned nested values do not qualify. This judges parser PRESENCE, not the schema's adequacy.
// FAMILY: singleton — only this policy owns the mounted AppRouter population and parser-presence relation.
// POPULATION: the entire tRPC transport closure; native record types retain nested/imported/spread mounts.
// RETIRED MARKERS: none (new policy). Hard zero, not a source-derived numeric ratchet or an exemption table.
import type { Node as MorphNode, SourceFile, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReference, resolveExportedDeclarations, resolveStableExpression } from "../../_shared/reference-fact.ts";
import { resolveCallableDeclaration } from "../../_shared/reference-fact-call.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { terminalCall } from "../lib/schema-fact-value.ts";
import { declaredByPackage, resolveTypeIdentityOrigin, resolveTypeMemberOrigin } from "../lib/type-member-origin.ts";
import { symbolDeclarations } from "../lib/type-member-origin-core.ts";
import { trpcOutputProof } from "./_proof/trpc-output.ts";

const ROOT_PATH = "packages/server/src/transport/trpc/router.ts";
const ROOT_NAME = "appRouter";
const TRPC_SERVER = "@trpc/server";
const CHAIN_METHODS = ["input", "output", "use", "meta"] as const;
const MESSAGE =
  "A mounted AppRouter query/mutation returns a service-built value without .output(); declare its canonical schema beside the view type and wire it at the procedure (docs/law/Tier-4-Transport.md).";
const FIX =
  "Author or reuse the view's canonical Zod schema, bind it with satisfies z.ZodType<View>, and add .output(schema) on this procedure's own builder chain; preserve void and subscription semantics.";

function refuse(detail: string): never {
  throw new Error(`trpc-output-declarations: ${detail}`);
}
function property(type: Type, name: string, at: MorphNode): Type | undefined {
  return type.getProperty(name)?.getTypeAtLocation(at);
}
function invocation(raw: MorphNode): import("ts-morph").CallExpression {
  const fact = terminalCall(raw);
  return fact.kind === "resolved" ? fact.value : refuse(`unreadable builder (${fact.reason}): ${fact.detail}`);
}
function nativeMethod(callee: MorphNode, name: string): boolean {
  const member = readMemberReference(callee);
  if (member.kind === "unresolved" || member.value.name !== name) {
    return false;
  }
  const origin = resolveTypeMemberOrigin(callee);
  return origin.kind === "resolved" && declaredByPackage(origin.value.declarations, TRPC_SERVER);
}
function rootFactory(callee: MorphNode): boolean {
  if (nativeMethod(callee, "router")) {
    return true;
  }
  const origin = resolveTypeIdentityOrigin(callee);
  return origin.kind === "resolved" && declaredByPackage(origin.value.declarations, TRPC_SERVER);
}
function declarationValue(node: MorphNode): MorphNode {
  if (Node.isPropertyAssignment(node) || Node.isVariableDeclaration(node)) {
    return node.getInitializer() ?? refuse("mounted leaf has no initializer");
  }
  if (Node.isShorthandPropertyAssignment(node)) {
    return node.getNameNode();
  }
  return refuse(`unreadable mounted leaf declaration: ${node.getKindName()}`);
}
function declaredOutput(call: import("ts-morph").CallExpression): boolean {
  const terminal = readMemberReference(call.getExpression());
  if (terminal.kind === "unresolved") {
    return refuse(`unreadable procedure terminal: ${terminal.detail}`);
  }
  let current: MorphNode = terminal.value.receiver;
  let declared = false;
  for (;;) {
    const direct = unwrapExpression(current);
    if (nativeMethod(direct, "procedure")) {
      return declared;
    }
    const node = invocation(direct);
    const member = readMemberReference(node.getExpression());
    if (member.kind === "unresolved" || !CHAIN_METHODS.some((name) => name === member.value.name)) {
      return refuse("unsupported procedure-builder composition");
    }
    if (!nativeMethod(node.getExpression(), member.value.name)) {
      return refuse(`builder ${member.value.name} is not declared by @trpc/server`);
    }
    declared ||= member.value.name === "output";
    current = member.value.receiver;
  }
}
function scalar(type: Type): boolean {
  if (type.isUnion()) {
    return type.getUnionTypes().every(scalar);
  }
  return (
    type.isString() ||
    type.isStringLiteral() ||
    type.isNumber() ||
    type.isNumberLiteral() ||
    type.isBoolean() ||
    type.isBooleanLiteral() ||
    type.isNull() ||
    type.isUndefined()
  );
}
function authoredLiteral(raw: MorphNode, home: SourceFile): boolean {
  const direct = unwrapExpression(raw);
  const fact = resolveStableExpression(direct);
  if (fact.kind === "unresolved") {
    return false;
  }
  const node = unwrapExpression(fact.value);
  if (node.getSourceFile().compilerNode !== home.compilerNode) {
    return false;
  }
  if (Node.isObjectLiteralExpression(node)) {
    return node.getProperties().every((member) => {
      if (Node.isPropertyAssignment(member)) {
        const value = member.getInitializerOrThrow();
        const unwrapped = unwrapExpression(value);
        return Node.isObjectLiteralExpression(unwrapped) || Node.isArrayLiteralExpression(unwrapped) ? authoredLiteral(value, home) : scalar(value.getType());
      }
      if (Node.isShorthandPropertyAssignment(member)) {
        return scalar(member.getNameNode().getType());
      }
      return false;
    });
  }
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().every((element) => !Node.isSpreadElement(element) && (authoredLiteral(element, home) || scalar(element.getType())));
  }
  return (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node) ||
    Node.isNumericLiteral(node) ||
    Node.isTrueLiteral(node) ||
    Node.isFalseLiteral(node) ||
    Node.isNullLiteral(node)
  );
}

function mountedRoot(ctx: GatePolicyContext): readonly [MorphNode, Type] {
  const rootFile = ctx.files.find((file) => ctx.relativePath(file) === ROOT_PATH) ?? refuse("AppRouter root is missing from the admitted population");
  const exported = resolveExportedDeclarations(rootFile, ROOT_NAME);
  if (exported.kind === "unresolved" || exported.value.length !== 1) {
    refuse("AppRouter export cannot be resolved uniquely");
  }
  const root = exported.value[0];
  if (root === undefined || !Node.isVariableDeclaration(root)) {
    refuse("AppRouter export is not an authored variable");
  }
  const rootCall = invocation(root.getNameNode());
  if (!rootFactory(rootCall.getExpression())) {
    refuse("AppRouter factory is not declared by @trpc/server");
  }
  const def = property(root.getType(), "_def", root);
  const record = def === undefined ? undefined : property(def, "record", root);
  if (record === undefined || record.isAny() || record.isUnknown()) {
    refuse("AppRouter mounted record is unreadable");
  }
  return [root, record];
}

function memberDeclaration(symbol: import("ts-morph").Symbol, root: MorphNode, path: string): MorphNode {
  const declarations = symbolDeclarations(symbol, root, path);
  if (declarations.kind === "unresolved" || declarations.value.length !== 1) {
    refuse(`unreadable mounted leaf origin at ${path}`);
  }
  return declarations.value[0] ?? refuse("mounted member origin disappeared");
}
function leafOutput(member: Type, declaration: MorphNode, path: string): Type | undefined {
  const def = property(member, "_def", declaration);
  if (def === undefined) {
    return;
  }
  const types = property(def, "$types", declaration) ?? refuse(`unreadable procedure output at ${path}`);
  return property(types, "output", declaration) ?? refuse(`unreadable procedure output at ${path}`);
}
function procedureCall(member: Type, declaration: MorphNode, path: string, admitted: ReadonlySet<object>): import("ts-morph").CallExpression | undefined {
  const def = property(member, "_def", declaration) ?? refuse("procedure definition disappeared");
  const kind = property(def, "type", declaration)?.getLiteralValue();
  if (kind === "subscription") {
    return;
  }
  if (kind !== "query" && kind !== "mutation") {
    refuse(`unreadable procedure kind at ${path}`);
  }
  if (!admitted.has(declaration.getSourceFile().compilerNode)) {
    refuse(`mounted procedure source is outside the transport population: ${path}`);
  }
  const call = invocation(declarationValue(declaration));
  if (!nativeMethod(call.getExpression(), kind)) {
    refuse(`mounted ${kind} builder is unreadable at ${path}`);
  }
  return call;
}

function readableRecord(type: Type, active: ReadonlySet<Type>): boolean {
  return !(type.isAny() || type.isUnknown() || type.isNever()) && type.isObject() && !active.has(type);
}

export const gate = defineGate({
  id: "trpc-output-declarations",
  family: "trpc-output-declarations",
  authority: "hard",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/transport/trpc/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const returns = new Map<object, MorphNode[]>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ReturnStatement],
          visit: (node) => {
            if (!Node.isReturnStatement(node)) {
              return;
            }
            const fn = node.getFirstAncestor(Node.isFunctionLikeDeclaration);
            const expression = node.getExpression();
            if (fn === undefined || expression === undefined) {
              return;
            }
            const key: object = fn.compilerNode;
            const values = returns.get(key) ?? [];
            values.push(expression);
            returns.set(key, values);
          },
        },
      ],
      evaluate: () => {
        ctx.checker();
        const [root, record] = mountedRoot(ctx);
        const admitted = new Set(ctx.files.map((file) => file.compilerNode));
        const active = new Set<Type>();
        const missing = new Map<object, { node: MorphNode; paths: string[] }>();
        let members = 0;
        const literalHandler = (handler: MorphNode | undefined): boolean => {
          if (handler === undefined) {
            return false;
          }
          const callable = resolveCallableDeclaration(handler);
          if (callable.kind === "unresolved" || callable.value.body === undefined || !admitted.has(callable.value.sourceFile.compilerNode)) {
            return false;
          }
          const { declaration, body, sourceFile } = callable.value;
          const values = Node.isBlock(body) ? (returns.get(declaration.compilerNode) ?? []) : [body];
          return values.length > 0 && values.every((value) => authoredLiteral(value, sourceFile));
        };
        const inspectLeaf = (declaration: MorphNode, member: Type, path: readonly string[]): boolean => {
          const output = leafOutput(member, declaration, path.join("."));
          if (output === undefined) {
            return false;
          }
          members++;
          const call = procedureCall(member, declaration, path.join("."), admitted);
          if (call === undefined) {
            return true;
          }
          const declared = declaredOutput(call);
          const noValue = output.isUnion()
            ? output.getUnionTypes().every((part) => part.isVoid() || part.isUndefined())
            : output.isVoid() || output.isUndefined();
          if (declared || noValue || literalHandler(call.getArguments()[0])) {
            return true;
          }
          const key: object = declaration.compilerNode;
          const finding = missing.get(key) ?? { node: declaration, paths: [] };
          finding.paths.push(path.join("."));
          missing.set(key, finding);
          return true;
        };
        const walk = (type: Type, parts: readonly string[]): void => {
          if (!readableRecord(type, active)) {
            refuse(`unreadable mounted record at ${parts.join(".") || ROOT_NAME}`);
          }
          active.add(type);
          for (const symbol of type.getProperties()) {
            const path = [...parts, symbol.getName()];
            const declaration = memberDeclaration(symbol, root, path.join("."));
            const member = symbol.getTypeAtLocation(declaration);
            if (!inspectLeaf(declaration, member, path)) {
              walk(member, path);
            }
          }
          active.delete(type);
        };
        walk(record, []);
        if (members === 0) {
          return refuse("AppRouter mounted procedure population is empty");
        }
        ctx.receipt({ kind: "population", source: "mounted AppRouter procedures", members });
        for (const finding of missing.values()) {
          ctx.report.node(finding.node, { message: `${MESSAGE} Mounted: ${finding.paths.join(", ")}.` });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import * as transport from "./trpc.ts"; declare function service():{id:string}; export const appRouter=transport.t.router({read:transport.authedProcedure.query(()=>service())});',
      },
      expect: { count: 1, messageIncludes: "Mounted: read" },
      why: "A namespace-qualified transport builder denotes the same mounted service DTO and cannot hide its missing parser",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; declare function service():{id:string}; const child=t.router({read:authedProcedure.query(()=>service())}); export const appRouter=t.router({a:child,b:child});',
      },
      expect: { count: 1, messageIncludes: "Mounted: a.read, b.read" },
      why: "Repeated mounts report every mounted coordinate under one authored procedure finding",
    },

    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; declare function service():{id:string}; export const appRouter=t.router({read:authedProcedure.query(()=>{const helper=()=>({ok:true}); return service();})});',
      },
      expect: { count: 1, messageIncludes: "Mounted: read" },
      why: "A nested function literal return cannot license its enclosing service resolver",
    },

    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; declare function service():{id:string}; export const appRouter=t.router({read:authedProcedure.query(()=>[service()])});',
      },
      expect: { count: 1, messageIncludes: "Mounted: read" },
      why: "An authored array cannot hide a service-owned nested object",
    },

    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():{id:string}; export const appRouter=t.router({read:authedProcedure.query(()=>service())});\n',
      },
      expect: { count: 1, messageIncludes: "Mounted: read" },
      why: "service-built DTO without parser is the founding widening defect",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():Promise<{id:string}>; export const appRouter=t.router({write:authedProcedure.mutation(async()=>service())});\n',
      },
      expect: { count: 1, messageIncludes: "Mounted: write" },
      why: "async service results are valued native outputs, not void",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():{id:string}; const parsed=authedProcedure.output(schema); export const appRouter=t.router({read:authedProcedure.query(()=>service())});\n',
      },
      expect: { count: 1, messageIncludes: "Mounted: read" },
      why: "a parser on a different builder does not license this mounted procedure",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():{id:string}; export const appRouter=t.router({read:authedProcedure.query(()=>{authedProcedure.output(schema); return service();})});\n',
      },
      expect: { count: 1, messageIncludes: "Mounted: read" },
      why: "output calls inside a handler are not members of its builder chain",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():{id:string}; export const appRouter=t.router({read:authedProcedure /* .output(schema) */.query(()=>service())});\n',
      },
      expect: { count: 1, messageIncludes: "Mounted: read" },
      why: "comments cannot supply parser permission",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():{id:string}; export const appRouter=t.router({read:authedProcedure.query(()=>({...service()}))});\n',
      },
      expect: { count: 1, messageIncludes: "Mounted: read" },
      why: "a spread service DTO is not a router-owned literal envelope",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():{id:string}; export const appRouter=t.router({read:authedProcedure.query(()=>({profile:service()}))});\n',
      },
      expect: { count: 1, messageIncludes: "Mounted: read" },
      why: "an explicitly named nested service object can still silently widen",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():{id:string}; const result=()=>service(); const query=authedProcedure; export const appRouter=t.router({read:query.query(result)});\n',
      },
      expect: { count: 1, messageIncludes: "Mounted: read" },
      why: "immutable builder and resolver aliases preserve the missing-parser finding",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/routers/a.ts":
          'import {t,authedProcedure} from "../trpc.ts"; declare function service():{id:string}; export const child=t.router({read:authedProcedure.query(()=>service())});',
        "packages/server/src/transport/trpc/router.ts":
          'import {t} from "./trpc.ts"; import {child as renamed} from "./routers/a.ts"; const mounts={child:renamed}; export const appRouter=t.router({...mounts});',
      },
      expect: { count: 1, messageIncludes: "Mounted: child.read" },
      why: "the native mounted record carries nested imported/spread mounts; their declarations retain the child procedure coordinate",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import * as transport from "./trpc.ts"; import * as native from "@trpc/server"; declare function service():{id:string}; export const appRouter=transport.t.router({read:transport.authedProcedure.output(native.schema).query(()=>service())});',
      },
      why: "The parser belongs to the mounted namespace-qualified builder's own native output chain",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import * as transport from "./trpc.ts"; declare function service():void; export const appRouter=transport.t.router({write:transport.authedProcedure.mutation(()=>service()),literal:transport.authedProcedure.query(()=>({ok:true})),feed:transport.authedProcedure.subscription(function*(){yield {id:"x"};})});',
      },
      why: "Namespace qualification preserves native void, subscription, and visibly transport-owned literal exemptions",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; export const appRouter=t.router({read:authedProcedure.query(()=>{const helper=()=>({private:true}); return {ok:true};})});',
      },
      why: "Only nearest-function returns belong to an authored literal resolver",
    },

    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():{id:string}; export const appRouter=t.router({read:authedProcedure.output(schema).query(()=>service())});\n',
      },
      why: "a parser on the mounted own chain discharges the obligation",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():{id:string}; const parsed=authedProcedure["output"](schema); const alias=parsed; export const appRouter=t.router({read:alias.input({}).query(()=>service())});\n',
      },
      why: "bracket output and immutable chained builder aliases preserve the declaration",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():void; export const appRouter=t.router({sync:authedProcedure.mutation(()=>service()),async:authedProcedure.mutation(async()=>{service();})});\n',
      },
      why: "native void and async void outputs remain untouched",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; export const appRouter=t.router({sync:authedProcedure.query(()=>({ok:true})),async:authedProcedure.query(async()=>({ok:true})),echo:authedProcedure.query(()=>({name:String(1)}))});\n',
      },
      why: "authored scalar-only envelopes cannot widen through a service-owned object",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; export const appRouter=t.router({literal:authedProcedure.query(()=>({nested:{ok:true},list:[{id:"x"}]}))});\n',
      },
      why: "authored nested literal envelopes remain visibly owned at every object boundary",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; declare function service():{id:string}; const unused=authedProcedure.query(()=>service()); export const appRouter=t.router({health:authedProcedure.query(()=>({ok:true}))});\n',
      },
      why: "unmounted procedures are outside AppRouter, not a filename-based accusation",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; export const appRouter=t.router({feed:authedProcedure.subscription(function*(){yield {id:"x"};})});\n',
      },
      why: "subscription outputs retain their streaming semantics and parser exemption",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; import {schema} from "@trpc/server"; const resolver=()=>({ok:true}); export const appRouter=t.router({health:authedProcedure.query(resolver)});\n',
      },
      why: "same-transport immutable resolver aliases preserve authored literal provenance",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/trpc.ts": 'import {t} from "@trpc/server"; export {t}; export let authedProcedure=t.procedure.use({});',
        "packages/server/src/transport/trpc/router.ts":
          'import * as transport from "./trpc.ts"; declare function service():{id:string}; export const appRouter=transport.t.router({read:transport.authedProcedure.query(()=>service())});',
      },
      expect: { messageIncludes: "unreadable builder (write)" },
      why: "A namespace-exported mutable builder cannot borrow its initial native chain as proof of the mounted runtime value",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/trpc.ts":
          'import {t} from "@trpc/server"; export {t}; export const first:typeof t.procedure=second; export const second:typeof t.procedure=first;',
        "packages/server/src/transport/trpc/router.ts":
          'import * as transport from "./trpc.ts"; declare function service():{id:string}; export const appRouter=transport.t.router({read:transport.first.query(()=>service())});',
      },
      expect: { messageIncludes: "unreadable builder (dynamic)" },
      why: "Namespace-qualified cyclic exports retain native procedure types but their unproven binding aliases still refuse",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; declare const broken:never; export const appRouter=t.router({health:authedProcedure.query(()=>({ok:true})),broken});',
      },
      expect: { messageIncludes: "unreadable mounted record at broken" },
      why: "An opaque mounted child cannot vanish beside an otherwise readable procedure",
    },

    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; export const appRouter:{_def:{record:{read:{_def:{$types:{output:string};type:"other"}}}}}=t.router({});',
      },
      expect: { messageIncludes: "unreadable procedure kind" },
      why: "Unreadable procedure kinds cannot become parser exemptions",
    },

    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; export const appRouter:{_def:{record:{read:{_def:{$types:{};type:"query"}}}}}=t.router({});',
      },
      expect: { messageIncludes: "unreadable procedure output" },
      why: "A procedure-shaped native member without output refuses rather than disappearing",
    },

    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; const fake={router:(record:object)=>({_def:{record}})}; export const appRouter=fake.router({});',
      },
      expect: { messageIncludes: "factory is not declared" },
      why: "A counterfeit router cannot establish native factory identity",
    },

    {
      mode: "types",
      files: { ...trpcOutputProof(), "packages/server/src/transport/trpc/router.ts": 'import {t,authedProcedure} from "./trpc.ts"; export const wrong={};\n' },
      expect: { messageIncludes: "AppRouter export cannot be resolved uniquely" },
      why: "a renamed-away root must refuse, never report a zero census",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts": 'import {t,authedProcedure} from "./trpc.ts"; export const appRouter=t.router({});\n',
      },
      expect: { messageIncludes: "population is empty" },
      why: "an empty native record is not a clean proof of declaration coverage",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; declare const broken:unknown; export const appRouter=broken;\n',
      },
      expect: { messageIncludes: "unreadable builder (missing)" },
      why: "an unreadable root expression cannot produce a trustworthy member population",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; declare function service():{id:string}; const wrap=(value:typeof authedProcedure)=>value; export const appRouter=t.router({read:wrap(authedProcedure).query(()=>service())});\n',
      },
      expect: { messageIncludes: "unsupported procedure-builder composition" },
      why: "an unsupported runtime wrapper cannot hide a builder declaration or produce false clean",
    },
    {
      mode: "types",
      files: {
        ...trpcOutputProof(),
        "packages/server/src/transport/trpc/router.ts":
          'import {t,authedProcedure} from "./trpc.ts"; declare function service():{id:string}; let builder=authedProcedure; export const appRouter=t.router({read:builder.query(()=>service())});\n',
      },
      expect: { messageIncludes: "unreadable builder (write)" },
      why: "mutable builder bindings must refuse rather than assume a stable chain",
    },
  ],
});
