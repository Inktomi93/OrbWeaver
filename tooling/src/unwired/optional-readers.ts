// Only fields from the same receiver are alternatives. A fallback selects one value; two distinct
// attributes on one intrinsic DOM element deliver both values to separate browser-owned inputs.
import type { Identifier, Node, PropertyAccessExpression, SourceFile } from "@typescript/native/ast";
import {
  isBinaryExpression,
  isBindingElement,
  isIdentifier,
  isIfStatement,
  isJsxAttribute,
  isJsxAttributes,
  isJsxExpression,
  isJsxOpeningElement,
  isJsxSelfClosingElement,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator } from "@typescript/native/sync";
import type { Site } from "./classify.ts";
import { siteKey } from "./classify.ts";
import type { NativeWorld } from "./native.ts";
import { declarationKeys, propertiesNamed } from "./native.ts";
import type { Construction } from "./optional-contexts.ts";
import { contextIdentity, contextWrites } from "./optional-contexts.ts";
import { isProduction } from "./optional-population.ts";

interface Reader {
  readonly source: string;
  readonly context: string | undefined;
  readonly keys: readonly string[];
}

export interface ReaderEvidence {
  readonly kind: "fallback" | "dom";
  readonly context: string | undefined;
  readonly site: Site;
  readonly left: readonly string[];
  readonly right: readonly string[];
}

interface ReadGroup {
  readonly kind: ReaderEvidence["kind"];
  readonly node: Node;
  readonly values: readonly Node[];
}

const operand = (node: Node | undefined): node is Identifier | PropertyAccessExpression =>
  node !== undefined && (isIdentifier(node) || isPropertyAccessExpression(node));
const nullish = (node: Node): boolean => node.kind === SyntaxKind.NullKeyword || (isIdentifier(node) && node.text === "undefined");

function presence(node: Node): Node | undefined {
  if (operand(node)) {
    return node;
  }
  if (!isBinaryExpression(node) || node.operatorToken.kind !== SyntaxKind.ExclamationEqualsEqualsToken) {
    return;
  }
  return nullish(node.right) && operand(node.left) ? node.left : undefined;
}

function readGroup(node: Node): ReadGroup | undefined {
  if (
    isBinaryExpression(node) &&
    (node.operatorToken.kind === SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === SyntaxKind.BarBarToken) &&
    operand(node.left) &&
    operand(node.right)
  ) {
    return { kind: "fallback", node, values: [node.left, node.right] };
  }
  if (isIfStatement(node) && node.elseStatement !== undefined && isIfStatement(node.elseStatement)) {
    const left = presence(node.expression);
    const right = presence(node.elseStatement.expression);
    if (left !== undefined && right !== undefined) {
      return { kind: "fallback", node, values: [left, right] };
    }
  }
  if (
    !(
      isJsxAttributes(node) &&
      (isJsxOpeningElement(node.parent) || isJsxSelfClosingElement(node.parent)) &&
      isIdentifier(node.parent.tagName) &&
      /^[a-z]/u.test(node.parent.tagName.text)
    )
  ) {
    return;
  }
  const values = node.properties.flatMap((prop) => {
    const init = isJsxAttribute(prop) ? prop.initializer : undefined;
    return init !== undefined && isJsxExpression(init) && operand(init.expression) ? [init.expression] : [];
  });
  return values.length > 1 ? { kind: "dom", node, values } : undefined;
}

function* resolves(world: NativeWorld, node: Node, registry: Map<string, number>): APIRequestGenerator<Reader | undefined> {
  if (isPropertyAccessExpression(node) && isIdentifier(node.expression)) {
    const receiver = yield* world.checker.getSymbolAtLocation.gen(node.expression);
    const prop = yield* world.checker.getSymbolAtLocation.gen(node.name);
    const key = receiver === undefined ? undefined : declarationKeys(receiver)[0];
    const context = yield* contextIdentity(world, yield* world.checker.getTypeAtLocation.gen(node.expression), registry);
    return key === undefined || prop === undefined ? undefined : { source: key, context: context?.id, keys: declarationKeys(prop) };
  }
  if (!isIdentifier(node)) {
    return;
  }
  const symbol = yield* world.checker.getSymbolAtLocation.gen(node);
  const handle = symbol?.declarations[0];
  const binding = handle === undefined ? undefined : yield* handle.resolve.gen();
  if (binding === undefined || !isBindingElement(binding) || !isObjectBindingPattern(binding.parent)) {
    return;
  }
  const key = binding.propertyName ?? binding.name;
  if (key === undefined) {
    return;
  }
  const owner = yield* world.checker.getTypeAtLocation.gen(binding.parent);
  const context = yield* contextIdentity(world, owner, registry);
  const props = yield* propertiesNamed(world.checker, owner, key.getText());
  return {
    source: siteKey(world.siteOf(binding.parent)),
    context: context?.id,
    keys: props.flatMap((prop) => (prop === undefined ? [] : declarationKeys(prop))),
  };
}

export function optionalUsage(
  world: NativeWorld,
  files: readonly SourceFile[],
  registry: Map<string, number>,
): { readers: readonly ReaderEvidence[]; contexts: ReturnType<typeof contextWrites> } {
  const constructions: Construction[] = [];
  let production = false;
  const groups: ReadGroup[] = [];
  function visit(node: Node): void {
    if (isObjectLiteralExpression(node) || isJsxAttributes(node)) {
      constructions.push(node);
    }
    const group = production ? readGroup(node) : undefined;
    if (group !== undefined) {
      groups.push(group);
    }
    node.forEachChild(visit);
  }
  for (const file of files) {
    production = isProduction(world.siteOf(file).file);
    file.forEachChild(visit);
  }
  const names = [...new Set(groups.flatMap((group) => group.values))];
  const resolved = world.batch(names.map((node) => resolves(world, node, registry)));
  const readers = new Map(names.map((name, index) => [name, resolved[index]]));
  const evidence = groups.flatMap(({ kind, node, values }) =>
    values.flatMap((name, at) => {
      const left = readers.get(name);
      if (left === undefined) {
        return [];
      }
      return values.slice(at + 1).flatMap((other) => {
        const right = readers.get(other);
        return right === undefined || right.source !== left.source
          ? []
          : [{ kind, site: world.siteOf(node), context: left.context, left: left.keys, right: right.keys }];
      });
    }),
  );
  return { readers: evidence, contexts: contextWrites(world, constructions, registry) };
}
