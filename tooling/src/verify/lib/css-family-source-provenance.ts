// Declaration-level hook ownership. This module selects real rendering/DOM terminals; the neutral static
// class evaluator owns value flow, composer identity, wrapper transparency, spreads, and overwrite order.
import type { Project, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateRunCtx } from "../contract/gate.ts";
import type { StaticClassCandidate, StaticClassEvaluation } from "../contract/static-class-expression.ts";
import { unwrapExpression } from "./ast-read.ts";
import type { HookOwners } from "./css-family-census.ts";
import { recordClassTokens, recordOwner, sourceOwner } from "./css-family-census.ts";
import {
  evaluateStaticClassExpression,
  evaluateStaticClassProperties,
  evaluateStaticObjectProperties,
  walkStaticClassExpressions,
} from "./static-class-expression.ts";

type SourceOwner = "ui" | "client";

let passProject: Project | undefined;
let passOwners: ReadonlyMap<string, HookOwners> | undefined;

/** Reset the one-pass cache before the shared gate dispatcher begins a new project. */
export function resetHookOwnerCache(): void {
  passProject = undefined;
  passOwners = undefined;
}

const CLASS_LIST_MUTATORS = new Set(["add", "remove", "toggle", "replace"]);
const CLASS_NAME_ASSIGNMENT_OPERATORS = new Set(["=", "+=", "&&=", "||=", "??="]);
const TYPESCRIPT_DOM_LIB = "/typescript/lib/lib.dom.d.ts";

function normalizedPath(node: Node): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
}

function ownerForPath(path: string): SourceOwner | undefined {
  const packagesAt = path.indexOf("/packages/");
  return sourceOwner(packagesAt === -1 ? path : path.slice(packagesAt + 1));
}

function candidateOwners(candidate: StaticClassCandidate, terminalOwner: SourceOwner): ReadonlySet<SourceOwner> {
  const owners = new Set<SourceOwner>([terminalOwner]);
  for (const segment of candidate.segments) {
    const owner = ownerForPath(normalizedPath(segment.node));
    if (owner !== undefined) {
      owners.add(owner);
    }
  }
  return owners;
}

function recordCandidates(map: Map<string, HookOwners>, evaluation: StaticClassEvaluation, terminalOwner: SourceOwner): void {
  for (const candidate of evaluation.candidates) {
    for (const owner of candidateOwners(candidate, terminalOwner)) {
      recordClassTokens(map, candidate.value, owner);
    }
  }
}

function recordWalkedClassCarriers(map: Map<string, HookOwners>, project: Project): void {
  const walk = walkStaticClassExpressions(project, project.getSourceFiles());
  for (const candidate of walk.candidates) {
    for (const consumer of candidate.consumers) {
      if (!(Node.isCallExpression(consumer) || (Node.isJsxAttribute(consumer) && consumer.getNameNode().getText() === "className"))) {
        continue;
      }
      const owner = ownerForPath(normalizedPath(consumer));
      if (owner === undefined) {
        continue;
      }
      for (const candidateOwner of candidateOwners(candidate, owner)) {
        recordClassTokens(map, candidate.value, candidateOwner);
      }
    }
  }
}

function recordSlotCandidates(map: Map<string, HookOwners>, evaluation: StaticClassEvaluation, terminalOwner: SourceOwner): void {
  for (const candidate of evaluation.candidates) {
    for (const owner of candidateOwners(candidate, terminalOwner)) {
      recordOwner(map, `slot:${candidate.value}`, owner);
    }
  }
}

function jsxValue(attribute: import("ts-morph").JsxAttribute): Node | undefined {
  const initializer = attribute.getInitializer();
  if (initializer === undefined) {
    return;
  }
  return Node.isJsxExpression(initializer) ? initializer.getExpression() : initializer;
}

function propertyName(node: Node): string | undefined {
  if (Node.isIdentifier(node) || Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return Node.isIdentifier(node) ? node.getText() : node.getLiteralText();
  }
  if (!Node.isComputedPropertyName(node)) {
    return;
  }
  const expression = unwrapExpression(node.getExpression());
  return Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression) ? expression.getLiteralText() : undefined;
}

function dataShellPropertyNames(project: Project): readonly string[] {
  const names = new Set<string>();
  for (const source of project.getSourceFiles()) {
    for (const property of source.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
      const name = propertyName(property.getNameNode());
      if (name?.startsWith("data-shell-") === true) {
        names.add(name);
      }
    }
  }
  return [...names];
}

function recordDirectJsxAttribute(map: Map<string, HookOwners>, attribute: import("ts-morph").JsxAttribute, owner: SourceOwner): void {
  const name = attribute.getNameNode().getText();
  if (name === "class") {
    const value = jsxValue(attribute);
    if (value !== undefined) {
      recordCandidates(map, evaluateStaticClassExpression(value, attribute), owner);
    }
  } else if (name === "data-slot") {
    const value = jsxValue(attribute);
    if (value !== undefined) {
      recordSlotCandidates(map, evaluateStaticClassExpression(value, attribute), owner);
    }
  } else if (name.startsWith("data-shell-")) {
    recordOwner(map, `attr:${name}`, owner);
  }
}

function recordSpreadPropertyOwner(map: Map<string, HookOwners>, property: { readonly name: string; readonly node: Node }, owner: SourceOwner): void {
  const producer = ownerForPath(normalizedPath(property.node));
  recordOwner(map, `attr:${property.name}`, owner);
  if (producer !== undefined) {
    recordOwner(map, `attr:${property.name}`, producer);
  }
}

function recordJsxSpread(
  map: Map<string, HookOwners>,
  spread: import("ts-morph").JsxSpreadAttribute,
  owner: SourceOwner,
  dataShellNames: readonly string[],
): void {
  recordCandidates(map, evaluateStaticClassProperties(spread.getExpression(), spread), owner);
  const properties = evaluateStaticObjectProperties(spread.getExpression(), spread, ["data-slot", ...dataShellNames]).properties;
  for (const property of properties) {
    if (property.name === "data-slot") {
      recordSlotCandidates(map, evaluateStaticClassExpression(property.value, spread), owner);
    } else if (property.name.startsWith("data-shell-")) {
      recordSpreadPropertyOwner(map, property, owner);
    }
  }
}

function accessedPropertyName(node: Node): string | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    return node.getName();
  }
  if (!Node.isElementAccessExpression(node)) {
    return;
  }
  const argument = node.getArgumentExpression();
  const unwrapped = argument === undefined ? undefined : unwrapExpression(argument);
  return unwrapped !== undefined && (Node.isStringLiteral(unwrapped) || Node.isNoSubstitutionTemplateLiteral(unwrapped))
    ? unwrapped.getLiteralText()
    : undefined;
}

function accessReceiver(node: Node): Node | undefined {
  return Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node) ? node.getExpression() : undefined;
}

function meaningfulTypes(type: Type): readonly Type[] {
  const candidates = type.isUnion() ? type.getUnionTypes() : [type];
  return candidates.filter((candidate) => !(candidate.isNull() || candidate.isUndefined()));
}

function isDomDeclaration(node: Node): boolean {
  return normalizedPath(node).endsWith(TYPESCRIPT_DOM_LIB);
}

function isDomTokenListExpression(node: Node): boolean {
  const types = meaningfulTypes(node.getType());
  return (
    types.length > 0 &&
    types.every((type) => {
      const symbol = type.getAliasSymbol() ?? type.getSymbol();
      return symbol?.getName() === "DOMTokenList" && symbol.getDeclarations().some(isDomDeclaration);
    })
  );
}

function isDomClassNameReceiver(node: Node): boolean {
  const types = meaningfulTypes(node.getType());
  return types.length > 0 && types.every((type) => type.getProperty("className")?.getDeclarations().some(isDomDeclaration) === true);
}

function recordCall(map: Map<string, HookOwners>, call: import("ts-morph").CallExpression, owner: SourceOwner): void {
  const receiver = accessReceiver(call.getExpression());
  if (receiver === undefined || !CLASS_LIST_MUTATORS.has(accessedPropertyName(call.getExpression()) ?? "") || !isDomTokenListExpression(receiver)) {
    return;
  }
  for (const argument of call.getArguments()) {
    recordCandidates(map, evaluateStaticClassExpression(argument, call), owner);
  }
}

function recordAssignment(map: Map<string, HookOwners>, binary: import("ts-morph").BinaryExpression, owner: SourceOwner): void {
  const left = unwrapExpression(binary.getLeft());
  const receiver = accessReceiver(left);
  if (
    accessedPropertyName(left) === "className" &&
    receiver !== undefined &&
    isDomClassNameReceiver(receiver) &&
    CLASS_NAME_ASSIGNMENT_OPERATORS.has(binary.getOperatorToken().getText())
  ) {
    recordCandidates(map, evaluateStaticClassExpression(binary.getRight(), binary), owner);
  }
}

/** Collect only hooks that reach JSX, a declaration-proven class composer, or a DOM class terminal. */
export function collectHookOwners(ctx: GateRunCtx): ReadonlyMap<string, HookOwners> {
  if (passProject === ctx.project && passOwners !== undefined) {
    return passOwners;
  }
  const owners = new Map<string, HookOwners>();
  const dataShellNames = dataShellPropertyNames(ctx.project);
  recordWalkedClassCarriers(owners, ctx.project);
  for (const source of ctx.project.getSourceFiles()) {
    const owner = ownerForPath(normalizedPath(source));
    if (owner === undefined) {
      continue;
    }
    for (const attribute of source.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
      recordDirectJsxAttribute(owners, attribute, owner);
    }
    for (const spread of source.getDescendantsOfKind(SyntaxKind.JsxSpreadAttribute)) {
      recordJsxSpread(owners, spread, owner, dataShellNames);
    }
    for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      recordCall(owners, call, owner);
    }
    for (const binary of source.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
      recordAssignment(owners, binary, owner);
    }
  }
  passProject = ctx.project;
  passOwners = owners;
  return owners;
}
