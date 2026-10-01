// Browser History mutations belong to the router, including URL-only handoffs. Captures are judged at the read.
// Singleton: one client API boundary; shared global and type-member readers own identity and spelling.
// AST-safe. Local implementations pass; unreadable signatures fail closed. Dynamic reflection is not covered.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveGlobalMemberOrigin } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { classifyPackageMemberOrigin, readsAmbientGlobalPath, uncastPropertyDeclaredByPackage } from "../lib/project-home-origin.ts";
import { readMemberAccess, readStringConstant } from "../lib/symbol-reference.ts";
import { resolveTypeMemberOrigin, resolveTypePropertyOrigin } from "../lib/type-member-origin.ts";

const MUTATORS: ReadonlySet<string> = new Set(["pushState", "replaceState"]);
const GLOBALS: ReadonlySet<string> = new Set(["globalThis", "window", "self"]);
const DOM_PACKAGES = ["typescript"] as const;
const ROUTER_HOME = "packages/client/src/lib/use-router-url-replace.ts";
const FIX = `use router.navigate, or the router commitLocation URL scrub seam in ${ROUTER_HOME}`;
const UNREADABLE = `this history mutation capture cannot be established as browser History or a local implementation; expose its concrete receiver instead of an opaque structural signature. Router home: ${ROUTER_HOME}`;

function capturedMutation(node: MorphNode): string | undefined {
  if (!Node.isBindingElement(node)) {
    return readMemberAccess(node)?.name;
  }
  const key = node.getPropertyNameNode() ?? node.getNameNode();
  if (Node.isIdentifier(key)) {
    return key.getText();
  }
  return readStringConstant(Node.isComputedPropertyName(key) ? key.getExpression() : key);
}

function hasLocalImplementation(declaration: MorphNode): boolean {
  if (Node.isMethodDeclaration(declaration)) {
    return declaration.getBody() !== undefined;
  }
  if (Node.isPropertyAssignment(declaration) || Node.isPropertyDeclaration(declaration)) {
    const initializer = declaration.getInitializer();
    return initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer));
  }
  return false;
}

function mutationDeclarations(node: MorphNode, name: string): readonly MorphNode[] {
  if (Node.isBindingElement(node)) {
    const receiver = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
    const origin = receiver === undefined ? undefined : resolveTypePropertyOrigin(receiver, name);
    return origin?.kind === "resolved" ? origin.value : [];
  }
  const origin = resolveTypeMemberOrigin(node);
  return origin.kind === "resolved" ? origin.value.declarations : [];
}

function browserMemberOrigin(node: MorphNode, name: string): boolean {
  if (!Node.isBindingElement(node)) {
    return classifyPackageMemberOrigin(node, DOM_PACKAGES) === "home";
  }
  const receiver = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
  return receiver !== undefined && uncastPropertyDeclaredByPackage(receiver, name, DOM_PACKAGES);
}

export const gate = defineGate({
  id: "no-raw-history-writes",
  family: "no-raw-history-writes",
  authority: "hard",
  severity: "error",
  population: ["@client"],
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: `client code captures a browser History mutation directly; route pushState and replaceState through router navigation. Router home: ${ROUTER_HOME}`,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression, SyntaxKind.BindingElement],
        visit: (node): void => {
          const name = capturedMutation(node);
          if (name === undefined || !MUTATORS.has(name)) {
            return;
          }
          const reference = Node.isBindingElement(node) ? node.getNameNode() : node;
          const global = resolveGlobalMemberOrigin(reference);
          const ambient =
            global.kind === "resolved" && global.value.globalName === "history" && global.value.memberPath.length === 1 && global.value.memberPath[0] === name;
          const declarations = mutationDeclarations(node, name);
          const browser = ambient || readsAmbientGlobalPath(reference, GLOBALS, ["history", name]) || browserMemberOrigin(node, name);
          if (!browser && declarations.length > 0 && declarations.every(hasLocalImplementation)) {
            return;
          }
          ctx.report.node(Node.isPropertyAccessExpression(node) ? node.getNameNode() : node, browser ? {} : { message: UNREADABLE });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/data/x.ts":
          "export class Store { replaceState(): void {} } declare const native: History; (native as unknown as Store).replaceState();",
      },
      expect: { count: 1, messageIncludes: "browser History mutation directly" },
      why: "casting an injected native History to a concrete local class cannot erase its uncast member identity",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/x.ts":
          "export class Store { replaceState(): void {} } declare const native: History; const {replaceState: replace} = native as unknown as Store; replace();",
      },
      expect: { count: 1, messageIncludes: "browser History mutation directly" },
      why: "destructuring from a cast native History must judge the same uncast property origin as direct reads",
    },
    {
      mode: "types",
      files: { "packages/client/src/data/x.ts": 'history.replaceState(null, "", "/");' },
      expect: { count: 1, token: "replaceState" },
      why: "a raw URL scrub reaches the same history mutation as route navigation",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/x/components/x.tsx": 'window.history.pushState(null, "", "/login");' },
      expect: { count: 1, token: "pushState" },
      why: "the client feature population and push mutation are held independently",
    },
    {
      mode: "types",
      files: { "packages/client/src/data/x.ts": 'const key = "replaceState"; globalThis.history?.[key](null, "", "/");' },
      expect: { count: 1 },
      why: "optional computed constant members use the shared member reader",
    },
    {
      mode: "types",
      files: { "packages/client/src/data/x.ts": 'const replace = globalThis.history.replaceState.bind(globalThis.history); replace(null, "", "/");' },
      expect: { count: 1, token: "replaceState" },
      why: "a stored bound alias is refused at capture, so calls and apply need no second resolver",
    },
    {
      mode: "types",
      files: { "packages/client/src/data/x.ts": 'const { replaceState: replace } = history; replace.call(history, null, "", "/");' },
      expect: { count: 1 },
      why: "destructuring aliases capture the native member without a property access expression",
    },
    {
      mode: "types",
      files: { "packages/client/src/data/x.ts": 'const { ["pushState"]: push } = history; push(null, "", "/");' },
      expect: { count: 1 },
      why: "computed destructuring captures the same native mutation",
    },
    {
      mode: "types",
      files: { "packages/client/src/routes/x.ts": 'declare const native: History; native.replaceState(null, "", "/");' },
      expect: { count: 1, token: "replaceState", messageIncludes: "browser History mutation directly" },
      why: "an injected History still declares its mutation on the shipped DOM interface",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/x.ts":
          'const browser = globalThis as { history: { replaceState(data: null, unused: string, url: string): void } }; browser.history.replaceState(null, "", "/");',
      },
      expect: { count: 1, messageIncludes: "browser History mutation directly" },
      why: "a structural cast cannot hide the ambient global receiver",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/x.ts":
          'function addressBar(): {history: {replaceState(data: null, unused: string, url: string): void}} { return globalThis as typeof globalThis & {history: {replaceState(data: null, unused: string, url: string): void}}; } addressBar().history.replaceState(null, "", "/");',
      },
      expect: { count: 1, messageIncludes: "cannot be established" },
      why: "the DOM-less structural getter has no concrete local implementation of the mutation and fails closed",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/client/src/routes/x.ts": 'router.navigate({ to: "/login", replace: true }); router.commitLocation(next);' },
      why: "both public router navigation doors avoid native history mutation names",
    },
    {
      mode: "types",
      files: { "packages/client/src/data/x.ts": 'const text = "history.replaceState"; // history.pushState(null, "", "/");\nhistory.back();' },
      why: "comments and strings are not member reads, and unrelated history APIs are admitted",
    },
    {
      mode: "types",
      files: { "packages/client/src/data/x.ts": 'router.navigate({ to: "/" });', "tests/client/x.ts": 'history.replaceState(null, "", "/");' },
      why: "browser fixture setup is outside the product client source population",
    },
    {
      mode: "types",
      files: { "packages/client/src/data/x.ts": "Reflect.get(history, incomingKey);" },
      why: "declared limit: runtime reflection names no static mutation member",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/x.ts":
          'const local = { replaceState() {} }; local.replaceState(); local["replaceState"](); const { replaceState: replace } = local; replace();',
      },
      why: "an unrelated object owns a concrete local method; dot, computed and destructured reads preserve that identity",
    },
    {
      mode: "types",
      files: { "packages/client/src/data/x.ts": "export class Store { pushState(): void {} } const history = new Store(); history.pushState();" },
      why: "a local class method and a shadowed history binding are different from native History",
    },
  ],
});
