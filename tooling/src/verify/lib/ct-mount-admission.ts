// CT admission consumes visitor-fed returns and JSX children; canonical callable and alias readers own identity.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveStableExpression, staticMemberAccess } from "../../floor/code-facts/reference-fact.ts";
import { resolveCallableDeclaration } from "../../floor/code-facts/reference-fact-call.ts";
import { readStringValue } from "./ast-read.ts";
import { jsxAttributeNamed } from "./query-boundary-vocabulary.ts";

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
    return home.endsWith("/tests/support/browser/ct-data-providers.tsx") && name === "CtClientProviders" ? { hasDoor: true, problems: [] } : undefined;
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
