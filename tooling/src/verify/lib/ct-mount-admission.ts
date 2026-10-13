// CT admission consumes visitor-fed returns and JSX children; canonical callable and alias readers own identity.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { inspectReferenceWrites, resolveLexicalValueDeclaration, resolveStableExpression, staticMemberAccess } from "../../floor/code-facts/reference-fact.ts";
import { resolveCallableDeclaration } from "../../floor/code-facts/reference-fact-call.ts";
import { readStringValue } from "./ast-read.ts";
import { jsxAttributeNamed } from "./query-boundary-vocabulary.ts";
import { createReactExportMatcher } from "./react-origin.ts";

function nativeMount(node: MorphNode): boolean {
  return node
    .getType()
    .getNonNullableType()
    .getCallSignatures()
    .some((signature) => {
      const declaration = signature.getDeclaration();
      return (
        declaration.getSourceFile().getFilePath().replaceAll("\\", "/").endsWith("/node_modules/@playwright/experimental-ct-react/index.d.ts") &&
        declaration.getFirstAncestorByKind(SyntaxKind.PropertySignature)?.getName() === "mount"
      );
    });
}

/** Native mount signatures survive local aliases; indirect Function wrappers refuse rather than disappear. */
export function ctMountArguments(call: CallExpression): readonly MorphNode[] | undefined {
  const callee = call.getExpression();
  if (nativeMount(callee)) {
    const first = call.getArguments()[0];
    return first === undefined ? [] : [first];
  }
  const member = staticMemberAccess(callee);
  return member !== undefined && (member.name === "call" || member.name === "apply") && nativeMount(member.receiver) ? [] : undefined;
}

export const MIN_ISOLATION_REASON_WORDS = 3;

interface DoorEnvironment {
  readonly invocation: object;
  readonly bindings: ReadonlyMap<object, readonly DoorValue[]>;
  readonly contexts: ReadonlyMap<object, DoorValue>;
}

/** Props retain their caller's environment rather than inheriting the callee's shadowing bindings. */
interface DoorValue {
  readonly node: MorphNode;
  readonly environment: DoorEnvironment;
}

interface DoorTree {
  readonly provider: boolean;
  readonly delivered: boolean;
  readonly escaped: boolean;
  readonly invalidComposition: boolean;
}

interface CompositionOrigin {
  readonly valid: boolean;
  readonly nullable: boolean;
}

const NO_DOOR_TREE: DoorTree = { provider: false, delivered: false, escaped: false, invalidComposition: false };
const UNREADABLE_COMPOSITION: CompositionOrigin = { valid: false, nullable: false };

function sameHome(left: MorphNode, right: MorphNode): boolean {
  return left.getSourceFile().getFilePath() === right.getSourceFile().getFilePath() && left.getStart() === right.getStart() && left.getEnd() === right.getEnd();
}

function functionParameters(node: MorphNode): readonly import("ts-morph").ParameterDeclaration[] {
  return Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node)
    ? node.getParameters()
    : [];
}

function jsxOpening(node: MorphNode): import("ts-morph").JsxOpeningElement | import("ts-morph").JsxSelfClosingElement | undefined {
  if (Node.isJsxElement(node)) {
    return node.getOpeningElement();
  }
  return Node.isJsxSelfClosingElement(node) ? node : undefined;
}

function jsxValue(node: MorphNode, name: string): MorphNode | undefined {
  const opening = jsxOpening(node);
  const initializer = opening === undefined ? undefined : jsxAttributeNamed(opening, name)?.getInitializer();
  return Node.isJsxExpression(initializer) ? initializer.getExpression() : initializer;
}

/** Only values delivered by returned JSX enter this proof; an unused helper cannot supply a witness. */
class ProductionDoorReader {
  private readonly factory: MorphNode;
  private readonly provider: MorphNode;
  private readonly returns: ReadonlyMap<object, readonly MorphNode[]>;
  private readonly children: ReadonlyMap<object, readonly MorphNode[]>;
  private readonly subject = new Set<object>();
  // Nested use of one provider at distinct JSX call sites is not recursive rendering.
  private readonly activeTrees = new Map<object, Set<object>>();
  private readonly activeValues = new Map<object, Set<string>>();
  private readonly stateHook = createReactExportMatcher("useState");
  private readonly contextHook = createReactExportMatcher("use");
  private readonly contextFactory = createReactExportMatcher("createContext");

  constructor(
    factory: MorphNode,
    provider: MorphNode,
    returns: ReadonlyMap<object, readonly MorphNode[]>,
    children: ReadonlyMap<object, readonly MorphNode[]>,
  ) {
    this.factory = factory;
    this.provider = provider;
    this.returns = returns;
    this.children = children;
  }

  read(door: MorphNode): readonly string[] {
    for (const parameter of functionParameters(door)) {
      const name = parameter.getNameNode();
      if (Node.isObjectBindingPattern(name)) {
        for (const binding of name.getElements()) {
          if ((binding.getPropertyNameNode()?.getText() ?? binding.getName()) === "children") {
            this.subject.add(binding.compilerNode);
          }
        }
      }
    }
    const environment: DoorEnvironment = { invocation: door.compilerNode, bindings: new Map(), contexts: new Map() };
    const trees = this.returned(door).map((node) => this.tree(node, environment, false));
    if (trees.some((tree) => tree.invalidComposition)) {
      return ["the returned AuthedProviders composition is not the delivered production factory result"];
    }
    return trees.length > 0 && trees.every((tree) => tree.provider && tree.delivered && !tree.escaped)
      ? []
      : ["the returned CtClientProviders subtree must deliver its children through the genuine production provider and composition"];
  }

  private returned(declaration: MorphNode): readonly MorphNode[] {
    return this.returns.get(declaration.compilerNode) ?? [];
  }

  private bound(node: MorphNode, environment: DoorEnvironment): readonly DoorValue[] | undefined {
    const declaration = resolveLexicalValueDeclaration(node);
    return declaration.kind === "resolved" ? environment.bindings.get(declaration.value.compilerNode) : undefined;
  }

  private siblingTrees(trees: readonly DoorTree[]): DoorTree {
    return {
      provider: trees.some((tree) => tree.provider),
      delivered: trees.some((tree) => tree.delivered),
      escaped: trees.some((tree) => tree.escaped),
      invalidComposition: trees.some((tree) => tree.invalidComposition),
    };
  }

  private childTrees(node: MorphNode, environment: DoorEnvironment, provided: boolean): DoorTree {
    return this.siblingTrees((this.children.get(node.compilerNode) ?? []).map((child) => this.tree(child, environment, provided)));
  }

  private props(node: MorphNode, declaration: MorphNode, environment: DoorEnvironment): DoorEnvironment {
    const bindings = new Map(environment.bindings);
    const parameter = functionParameters(declaration)[0];
    const name = parameter?.getNameNode();
    if (Node.isObjectBindingPattern(name)) {
      for (const binding of name.getElements()) {
        const key = binding.getPropertyNameNode()?.getText() ?? binding.getName();
        const value = jsxValue(node, key);
        const attributeValues = value === undefined ? [] : [value];
        const values = key === "children" ? (this.children.get(node.compilerNode) ?? []) : attributeValues;
        bindings.set(
          binding.compilerNode,
          values.map((item) => ({ node: item, environment })),
        );
      }
    }
    return { ...environment, bindings, invocation: node.compilerNode };
  }

  private tree(input: MorphNode, environment: DoorEnvironment, provided: boolean): DoorTree {
    if (Node.isIdentifier(input) && inspectReferenceWrites(input).kind === "unresolved") {
      return NO_DOOR_TREE;
    }
    const binding = resolveLexicalValueDeclaration(input);
    if (binding.kind === "resolved" && this.subject.has(binding.value.compilerNode)) {
      return { ...NO_DOOR_TREE, delivered: provided, escaped: !provided };
    }
    const bound = this.bound(input, environment);
    if (bound !== undefined) {
      return this.siblingTrees(bound.map((value) => this.tree(value.node, value.environment, provided)));
    }
    const stable = resolveStableExpression(input);
    const node = stable.kind === "resolved" ? stable.value : stable.node;
    const active = this.activeTrees.get(node.compilerNode) ?? new Set<object>();
    if (active.has(environment.invocation)) {
      return NO_DOOR_TREE;
    }
    this.activeTrees.set(node.compilerNode, active);
    active.add(environment.invocation);
    try {
      return this.treeValue(node, environment, provided);
    } finally {
      active.delete(environment.invocation);
    }
  }

  private treeValue(node: MorphNode, environment: DoorEnvironment, provided: boolean): DoorTree {
    if (Node.isJsxExpression(node)) {
      const value = node.getExpression();
      return value === undefined ? NO_DOOR_TREE : this.tree(value, environment, provided);
    }
    if (Node.isJsxFragment(node)) {
      return this.childTrees(node, environment, provided);
    }
    if (Node.isConditionalExpression(node)) {
      const arms = [this.tree(node.getWhenTrue(), environment, provided), this.tree(node.getWhenFalse(), environment, provided)];
      return { ...this.siblingTrees(arms), provider: arms.every((arm) => arm.provider), delivered: arms.every((arm) => arm.delivered) };
    }
    const opening = jsxOpening(node);
    if (opening === undefined) {
      return NO_DOOR_TREE;
    }
    const tag = opening.getTagNameNode();
    const callable = resolveCallableDeclaration(tag);
    if (callable.kind === "resolved" && sameHome(callable.value.declaration, this.provider)) {
      const composition = jsxValue(node, "composition");
      const origin = composition === undefined ? UNREADABLE_COMPOSITION : this.origin(composition, environment, []);
      return { ...this.childTrees(node, environment, true), provider: true, invalidComposition: !origin.valid || origin.nullable };
    }
    const context = this.contextIdentity(tag);
    const value = jsxValue(node, "value");
    const next =
      context === undefined || value === undefined
        ? environment
        : {
            ...environment,
            contexts: new Map(environment.contexts).set(context, { node: value, environment }),
          };
    if (callable.kind === "resolved" && this.returns.has(callable.value.declaration.compilerNode)) {
      const props = this.props(node, callable.value.declaration, next);
      return this.siblingTrees(this.returned(callable.value.declaration).map((item) => this.tree(item, props, provided)));
    }
    return this.childTrees(node, next, provided);
  }

  private contextIdentity(node: MorphNode): object | undefined {
    const stable = resolveStableExpression(node);
    const value = stable.kind === "resolved" ? stable.value : stable.node;
    return Node.isCallExpression(value) && this.contextFactory.reference(value.getExpression()) === "react"
      ? stable.trace.declarations.findLast(Node.isVariableDeclaration)?.compilerNode
      : undefined;
  }

  private origin(input: MorphNode, environment: DoorEnvironment, path: readonly string[]): CompositionOrigin {
    if (Node.isIdentifier(input) && inspectReferenceWrites(input).kind === "unresolved") {
      return UNREADABLE_COMPOSITION;
    }
    const bound = this.bound(input, environment);
    if (bound !== undefined) {
      return this.origins(bound.map((value) => this.origin(value.node, value.environment, path)));
    }
    const stable = resolveStableExpression(input);
    if (stable.kind === "unresolved" && ["write", "cycle", "ambiguous"].includes(stable.reason)) {
      return UNREADABLE_COMPOSITION;
    }
    const node = stable.kind === "resolved" ? stable.value : stable.node;
    const key = JSON.stringify(path);
    const active = this.activeValues.get(node.compilerNode) ?? new Set<string>();
    if (active.has(key)) {
      return UNREADABLE_COMPOSITION;
    }
    this.activeValues.set(node.compilerNode, active);
    active.add(key);
    try {
      return this.originValue(node, environment, path);
    } finally {
      active.delete(key);
    }
  }

  private origins(values: readonly CompositionOrigin[]): CompositionOrigin {
    return { valid: values.length > 0 && values.every((value) => value.valid), nullable: values.some((value) => value.nullable) };
  }

  private originValue(node: MorphNode, environment: DoorEnvironment, path: readonly string[]): CompositionOrigin {
    if (Node.isBindingElement(node)) {
      return this.bindingOrigin(node, environment, path);
    }
    if (node.getKind() === SyntaxKind.NullKeyword) {
      return { valid: path.length === 0, nullable: true };
    }
    if (Node.isBinaryExpression(node) && node.getOperatorToken().getKind() === SyntaxKind.QuestionQuestionToken) {
      const left = this.origin(node.getLeft(), environment, path);
      return !(left.valid && left.nullable) ? left : this.origin(node.getRight(), environment, path);
    }
    if (Node.isConditionalExpression(node)) {
      return this.origins([this.origin(node.getWhenTrue(), environment, path), this.origin(node.getWhenFalse(), environment, path)]);
    }
    const member = staticMemberAccess(node);
    if (member !== undefined) {
      return this.origin(member.receiver, environment, [member.name, ...path]);
    }
    if (Node.isObjectLiteralExpression(node)) {
      return this.objectOrigin(node, environment, path);
    }
    return Node.isCallExpression(node) ? this.callOrigin(node, environment, path) : UNREADABLE_COMPOSITION;
  }

  private objectOrigin(node: import("ts-morph").ObjectLiteralExpression, environment: DoorEnvironment, path: readonly string[]): CompositionOrigin {
    const [name, ...rest] = path;
    if (node.getProperties().some(Node.isSpreadAssignment)) {
      return UNREADABLE_COMPOSITION;
    }
    const property = name === undefined ? undefined : node.getProperty(name);
    let value: MorphNode | undefined;
    if (Node.isPropertyAssignment(property)) {
      value = property.getInitializer();
    } else if (Node.isShorthandPropertyAssignment(property)) {
      value = property.getNameNode();
    }
    return value === undefined ? UNREADABLE_COMPOSITION : this.origin(value, environment, rest);
  }

  private bindingOrigin(binding: import("ts-morph").BindingElement, environment: DoorEnvironment, path: readonly string[]): CompositionOrigin {
    if (binding.getDotDotDotToken() !== undefined || binding.getInitializer() !== undefined) {
      return UNREADABLE_COMPOSITION;
    }
    const pattern = binding.getParent();
    const variable = pattern.getParentIfKind(SyntaxKind.VariableDeclaration);
    const value = variable?.getInitializer();
    if (value === undefined) {
      return UNREADABLE_COMPOSITION;
    }
    const key = Node.isArrayBindingPattern(pattern)
      ? String(pattern.getElements().indexOf(binding))
      : (binding.getPropertyNameNode()?.getText() ?? binding.getName());
    return this.origin(value, environment, [key, ...path]);
  }

  private callOrigin(call: CallExpression, environment: DoorEnvironment, path: readonly string[]): CompositionOrigin {
    const callable = resolveCallableDeclaration(call);
    if (callable.kind === "resolved" && sameHome(callable.value.declaration, this.factory)) {
      return { valid: path.length === 0, nullable: false };
    }
    if (this.stateHook.reference(call.getExpression()) === "react" && path[0] === "0") {
      return this.stateOrigin(call, environment, path.slice(1));
    }
    if (this.contextHook.reference(call.getExpression()) === "react") {
      return this.contextOrigin(call, environment, path);
    }
    if (callable.kind !== "resolved") {
      return UNREADABLE_COMPOSITION;
    }
    return this.callableOrigin(call, callable.value.declaration, environment, path);
  }

  private stateOrigin(call: CallExpression, environment: DoorEnvironment, path: readonly string[]): CompositionOrigin {
    const initializer = call.getArguments()[0];
    if (initializer === undefined) {
      return UNREADABLE_COMPOSITION;
    }
    const callback = resolveCallableDeclaration(initializer);
    const values = callback.kind === "resolved" ? this.returned(callback.value.declaration) : [initializer];
    return this.origins(values.map((value) => this.origin(value, environment, path)));
  }

  private contextOrigin(call: CallExpression, environment: DoorEnvironment, path: readonly string[]): CompositionOrigin {
    const context = call.getArguments()[0];
    const identity = context === undefined ? undefined : this.contextIdentity(context);
    const bound = identity === undefined ? undefined : environment.contexts.get(identity);
    if (bound !== undefined) {
      return this.origin(bound.node, bound.environment, path);
    }
    const stable = context === undefined ? undefined : resolveStableExpression(context);
    const creation = stable?.kind === "resolved" ? stable.value : stable?.node;
    const initial = identity !== undefined && Node.isCallExpression(creation) ? creation.getArguments()[0] : undefined;
    return initial === undefined ? UNREADABLE_COMPOSITION : this.origin(initial, environment, path);
  }

  private callableOrigin(call: CallExpression, declaration: MorphNode, environment: DoorEnvironment, path: readonly string[]): CompositionOrigin {
    const bindings = new Map(environment.bindings);
    functionParameters(declaration).forEach((parameter, index) => {
      const value = call.getArguments()[index];
      if (value !== undefined) {
        bindings.set(parameter.compilerNode, [{ node: value, environment }]);
      }
    });
    const next = { ...environment, bindings };
    return this.origins(this.returned(declaration).map((value) => this.origin(value, next, path)));
  }
}

/** Prove the canonical mounting declaration, its returned provider and the factory value that provider receives. */
export function readCtProductionDoor(
  targets: { readonly door: MorphNode; readonly factory: MorphNode; readonly provider: MorphNode },
  returns: ReadonlyMap<object, readonly MorphNode[]>,
  children: ReadonlyMap<object, readonly MorphNode[]>,
): readonly string[] {
  return new ProductionDoorReader(targets.factory, targets.provider, returns, children).read(targets.door);
}

interface ViewAdmission {
  readonly hasDoor: boolean;
  readonly problems: readonly string[];
}

function combine(views: readonly ViewAdmission[]): ViewAdmission {
  return { hasDoor: views.some((view) => view.hasDoor), problems: views.flatMap((view) => view.problems) };
}

function textAttribute(element: MorphNode, name: string): string | undefined {
  if (!(Node.isJsxOpeningElement(element) || Node.isJsxSelfClosingElement(element))) {
    return;
  }
  const initializer = jsxAttributeNamed(element, name)?.getInitializer();
  if (initializer === undefined) {
    return;
  }
  const value = Node.isJsxExpression(initializer) ? initializer.getExpression() : initializer;
  return value === undefined ? undefined : readStringValue(value);
}

/** Inspect mounted trees without a second walk or a separate binding resolver. Opaque trees require an explicit isolation. */
export function readCtMountAdmission(
  expression: MorphNode,
  returns: ReadonlyMap<object, readonly MorphNode[]>,
  children: ReadonlyMap<object, readonly MorphNode[]>,
  productionDoor: MorphNode,
): readonly string[] {
  const active = new Set<object>();
  const neutral: ViewAdmission = { hasDoor: false, problems: [] };
  const failed = (message: string): ViewAdmission => ({ hasDoor: false, problems: [message] });
  const childViews = (node: MorphNode): ViewAdmission => combine((children.get(node.compilerNode) ?? []).map(view));
  const atoms = (node: MorphNode): ViewAdmission | undefined => {
    if (Node.isJsxExpression(node)) {
      const inner = node.getExpression();
      return inner === undefined ? neutral : view(inner);
    }
    if (Node.isConditionalExpression(node)) {
      return combine([view(node.getWhenTrue()), view(node.getWhenFalse())]);
    }
    if (
      Node.isBinaryExpression(node) &&
      [SyntaxKind.AmpersandAmpersandToken, SyntaxKind.BarBarToken, SyntaxKind.QuestionQuestionToken].includes(node.getOperatorToken().getKind())
    ) {
      return combine([view(node.getLeft()), view(node.getRight())]);
    }
    if (
      Node.isStringLiteral(node) ||
      Node.isNumericLiteral(node) ||
      node.getKind() === SyntaxKind.NullKeyword ||
      node.getKind() === SyntaxKind.TrueKeyword ||
      node.getKind() === SyntaxKind.FalseKeyword
    ) {
      return neutral;
    }
    if (Node.isJsxFragment(node)) {
      return childViews(node);
    }
    return undefined;
  };
  const isolation = (isolatedElement: MorphNode): ViewAdmission => {
    const subject = textAttribute(isolatedElement, "subject");
    const reason = textAttribute(isolatedElement, "isolates");
    return subject !== undefined && subject.trim().length > 0 && reason !== undefined && reason.trim().split(/\s+/u).length >= MIN_ISOLATION_REASON_WORDS
      ? { hasDoor: true, problems: [] }
      : failed("CtIsolation requires an authored subject and a reason naming what the mount keeps apart");
  };
  const component = (node: MorphNode, tag: MorphNode): ViewAdmission => {
    if (Node.isIdentifier(tag) && /^[a-z]/u.test(tag.getText())) {
      return childViews(node);
    }
    const callable = resolveCallableDeclaration(tag);
    if (callable.kind === "unresolved") {
      return failed(`mounted component ${tag.getText()} has unresolved identity (${callable.reason})`);
    }
    return declaredComponent(node, tag, callable.value.declaration, callable.value.sourceFile.getFilePath().replaceAll("\\", "/"));
  };
  const canonicalDoor = (node: MorphNode, declaration: MorphNode, home: string): ViewAdmission | undefined => {
    const name = Node.isFunctionDeclaration(declaration) ? declaration.getName() : undefined;
    if (home.endsWith("/tests/support/browser/ct-isolated-subject.tsx") && name === "CtIsolation") {
      return isolation(Node.isJsxElement(node) ? node.getOpeningElement() : node);
    }
    return sameHome(declaration, productionDoor) ? { hasDoor: true, problems: [] } : undefined;
  };
  const declaredComponent = (node: MorphNode, tag: MorphNode, declaration: MorphNode, home: string): ViewAdmission => {
    const door = canonicalDoor(node, declaration, home);
    if (door !== undefined) {
      return door;
    }
    if (home.includes("/packages/client/src/")) {
      return failed(`${tag.getText()} mounts client implementation outside the production door or a named isolation`);
    }
    if (home.includes("/tests/")) {
      const ownReturns = returns.get(declaration.compilerNode);
      return ownReturns === undefined || ownReturns.length === 0
        ? failed(`mounted helper ${tag.getText()} exposes no readable return tree`)
        : combine(ownReturns.map(view));
    }
    return childViews(node);
  };
  const element = (node: MorphNode): ViewAdmission => {
    if (Node.isJsxElement(node)) {
      return component(node, node.getOpeningElement().getTagNameNode());
    }
    if (Node.isJsxSelfClosingElement(node)) {
      return component(node, node.getTagNameNode());
    }
    return failed(`the mounted ${node.getKindName()} tree is unreadable; mount the production door or name its isolation`);
  };
  const view = (input: MorphNode): ViewAdmission => {
    const stable = resolveStableExpression(input);
    const node = stable.kind === "resolved" ? stable.value : stable.node;
    if (active.has(node.compilerNode)) {
      return failed("the mounted component graph is cyclic");
    }
    active.add(node.compilerNode);
    try {
      return atoms(node) ?? element(node);
    } finally {
      active.delete(node.compilerNode);
    }
  };
  const result = view(expression);
  if (result.problems.length > 0) {
    return result.problems;
  }
  return result.hasDoor ? [] : ["the mounted tree enters neither CtClientProviders nor a named CtIsolation"];
}
