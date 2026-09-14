// Finite authored record and destructuring values used by fixture path provenance. The caller supplies the
// recursive string reader and complete helper arguments; this module owns the record grammar only.
import type { BindingElement, CallExpression, Identifier, Node as MorphNode, ObjectLiteralExpression, ParameterDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReference, referenceResolutionServices, resolveGlobalMemberOrigin, resolveStableExpression } from "../../_shared/reference-fact.ts";
import type { FixtureAuthoredStringFact, FixtureAuthoredValueUnreadable } from "../contract/fixture-path-origin.ts";

export interface FixtureAuthoredRecordReader {
  readonly arrayLiteralOf: (node: MorphNode) => import("ts-morph").ArrayLiteralExpression | undefined;
  readonly bindingElementValues: (binding: BindingElement, seen: Set<object>) => FixtureAuthoredStringFact;
  readonly propertyValue: (object: MorphNode, name: string, seen: Set<object>) => FixtureAuthoredStringFact;
}

interface FixtureAuthoredRecordServices {
  readonly parameterArguments: (parameter: ParameterDeclaration) => readonly MorphNode[] | undefined;
  readonly stringValues: (node: MorphNode, seen: Set<object>) => FixtureAuthoredStringFact;
}

const MAX_VALUES = 512;

function unreadable(carrier: MorphNode, detail: string): FixtureAuthoredValueUnreadable {
  return { kind: "unreadable", carrier, detail };
}

function unwrap(node: MorphNode): MorphNode {
  return referenceResolutionServices.unwrapExpression(node);
}

function propertyName(binding: BindingElement): string | undefined {
  const property = binding.getPropertyNameNode() ?? binding.getNameNode();
  if (Node.isIdentifier(property) || Node.isStringLiteral(property) || Node.isNoSubstitutionTemplateLiteral(property)) {
    return Node.isIdentifier(property) ? property.getText() : property.getLiteralText();
  }
  // biome-ignore lint/complexity/noUselessUndefined: tsconfig enables noImplicitReturns.
  return undefined;
}

function globalMember(call: CallExpression, globalName: string, member: string): boolean {
  const fact = resolveGlobalMemberOrigin(call.getExpression());
  if (fact.kind === "resolved") {
    return fact.value.globalName === globalName && fact.value.memberPath.length === 1 && fact.value.memberPath[0] === member;
  }
  const read = readMemberReference(call.getExpression());
  if (read.kind === "unresolved" || read.value.name !== member) {
    return false;
  }
  const receiver = unwrap(read.value.receiver);
  const declaration = Node.isIdentifier(receiver) ? referenceResolutionServices.declarationOf(receiver) : undefined;
  return Node.isIdentifier(receiver) && receiver.getText() === globalName && declaration?.kind === "unresolved" && declaration.reason === "missing";
}

function distinct(values: readonly string[]): readonly string[] | undefined {
  const out = [...new Set(values)];
  return out.length <= MAX_VALUES ? out : undefined;
}

export function createFixtureAuthoredRecordReader(services: FixtureAuthoredRecordServices): FixtureAuthoredRecordReader {
  function entryValues(position: number, entries: MorphNode, binding: BindingElement, seen: Set<object>): FixtureAuthoredStringFact {
    if (position === 0) {
      return recordKeys(entries, seen);
    }
    if (position === 1) {
      return recordValues(entries, seen);
    }
    return unreadable(binding, "record entry has no such field");
  }

  function arrayLiteralOf(node: MorphNode): import("ts-morph").ArrayLiteralExpression | undefined {
    const current = unwrap(node);
    if (Node.isArrayLiteralExpression(current)) {
      return current;
    }
    if (!Node.isIdentifier(current)) {
      // biome-ignore lint/complexity/noUselessUndefined: tsconfig enables noImplicitReturns.
      return undefined;
    }
    const stable = resolveStableExpression(current);
    if (stable.kind === "resolved") {
      return arrayLiteralOf(stable.value);
    }
    return stable.reason === "dynamic" ? arrayLiteralOf(stable.node) : undefined;
  }

  function tupleColumnValues(iterable: MorphNode, position: number, carrier: MorphNode, seen: Set<object>): FixtureAuthoredStringFact {
    const array = arrayLiteralOf(iterable);
    if (array === undefined) {
      return unreadable(carrier, "iterable producer is not a finite authored tuple array");
    }
    const values: string[] = [];
    for (const element of array.getElements()) {
      const tuple = arrayLiteralOf(element);
      const value = tuple?.getElements()[position];
      if (value === undefined) {
        return unreadable(carrier, "iterable tuple is missing the selected field");
      }
      const fact = services.stringValues(value, new Set(seen));
      if (fact.kind === "unreadable") {
        return fact;
      }
      values.push(...fact.values);
    }
    const unique = distinct(values);
    return unique === undefined ? unreadable(carrier, "iterable string set exceeds the reader bound") : { kind: "values", values: unique };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: finite destructuring grammar.
  function bindingElementValues(binding: BindingElement, seen: Set<object>): FixtureAuthoredStringFact {
    const arrayPattern = binding.getParentIfKind(SyntaxKind.ArrayBindingPattern);
    if (arrayPattern === undefined) {
      const objectPattern = binding.getParentIfKind(SyntaxKind.ObjectBindingPattern);
      const owner = objectPattern?.getParentIfKind(SyntaxKind.VariableDeclaration);
      const loop = owner?.getFirstAncestorByKind(SyntaxKind.ForOfStatement);
      const array = loop === undefined ? undefined : arrayLiteralOf(loop.getExpression());
      const name = propertyName(binding);
      if (array === undefined || name === undefined) {
        return unreadable(binding, "destructured value is not a proven record or iterable entry");
      }
      const facts = array.getElements().map((element) => propertyValue(element, name, new Set(seen)));
      const refusal = facts.find((item): item is FixtureAuthoredValueUnreadable => item.kind === "unreadable");
      if (refusal !== undefined) {
        return refusal;
      }
      const values = distinct(facts.flatMap((item) => (item as { readonly kind: "values"; readonly values: readonly string[] }).values));
      return values === undefined ? unreadable(binding, "iterable property set exceeds the reader bound") : { kind: "values", values };
    }
    const position = arrayPattern.getElements().findIndex((element) => element.compilerNode === binding.compilerNode);
    const owner = arrayPattern.getParent();
    if (Node.isVariableDeclaration(owner)) {
      const loop = owner.getFirstAncestorByKind(SyntaxKind.ForOfStatement);
      const entries = loop === undefined ? undefined : entriesSource(loop.getExpression());
      if (entries !== undefined) {
        return entryValues(position, entries, binding, seen);
      }
      if (loop !== undefined) {
        return tupleColumnValues(loop.getExpression(), position, binding, seen);
      }
    }
    const parameter = arrayPattern.getParentIfKind(SyntaxKind.Parameter);
    const fn = parameter?.getParent();
    const mapCall = fn?.getFirstAncestorByKind(SyntaxKind.CallExpression);
    const entries = mapCall === undefined ? undefined : mapSource(mapCall);
    if (entries !== undefined) {
      return entryValues(position, entries, binding, seen);
    }
    return unreadable(binding, "record entry producer is not statically complete");
  }

  function entriesSource(node: MorphNode): MorphNode | undefined {
    const expression = unwrap(node);
    if (!(Node.isCallExpression(expression) && globalMember(expression, "Object", "entries"))) {
      return;
    }
    return expression.getArguments()[0];
  }

  function mapSource(call: CallExpression): MorphNode | undefined {
    const member = readMemberReference(call.getExpression());
    if (member.kind === "unresolved" || member.value.name !== "map") {
      return;
    }
    return entriesSource(member.value.receiver);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: finite object-origin grammar.
  function propertyValue(object: MorphNode, name: string, seen: Set<object>): FixtureAuthoredStringFact {
    const current = unwrap(object);
    if (Node.isIdentifier(current)) {
      const declaration = referenceResolutionServices.declarationOf(current);
      if (declaration.kind === "resolved" && Node.isParameterDeclaration(declaration.value)) {
        const args = services.parameterArguments(declaration.value);
        if (args === undefined) {
          return unreadable(current, `object parameter carrying ${name} has no complete authored call set`);
        }
        const facts = args.map((argument) => propertyValue(argument, name, new Set(seen)));
        const refusal = facts.find((item): item is FixtureAuthoredValueUnreadable => item.kind === "unreadable");
        if (refusal !== undefined) {
          return refusal;
        }
        const values = distinct(facts.flatMap((item) => (item as { readonly kind: "values"; readonly values: readonly string[] }).values));
        return values === undefined ? unreadable(current, "object property value set exceeds the reader bound") : { kind: "values", values };
      }
      if (declaration.kind === "resolved" && Node.isVariableDeclaration(declaration.value) && declaration.value.getInitializer() === undefined) {
        const loop = declaration.value.getFirstAncestorByKind(SyntaxKind.ForOfStatement);
        const array = loop === undefined ? undefined : arrayLiteralOf(loop.getExpression());
        if (array !== undefined) {
          const facts = array.getElements().map((element) => propertyValue(element, name, new Set(seen)));
          const refusal = facts.find((item): item is FixtureAuthoredValueUnreadable => item.kind === "unreadable");
          if (refusal !== undefined) {
            return refusal;
          }
          const values = distinct(facts.flatMap((item) => (item as { readonly kind: "values"; readonly values: readonly string[] }).values));
          return values === undefined ? unreadable(current, "iterable property set exceeds the reader bound") : { kind: "values", values };
        }
      }
      const stable = resolveStableExpression(current);
      if (stable.kind === "unresolved") {
        return unreadable(current, stable.detail);
      }
      return propertyValue(stable.value, name, seen);
    }
    if (!Node.isObjectLiteralExpression(current)) {
      return unreadable(current, "property receiver is not a statically authored object");
    }
    const direct = current.getProperty(name);
    if (direct !== undefined && Node.isPropertyAssignment(direct)) {
      const initializer = direct.getInitializer();
      return initializer === undefined ? unreadable(direct, `property ${name} has no value`) : services.stringValues(initializer, seen);
    }
    const fromSpreads = current.getProperties().flatMap((property) => {
      if (!Node.isSpreadAssignment(property)) {
        return [];
      }
      const fact = propertyValue(property.getExpression(), name, new Set(seen));
      return fact.kind === "values" ? fact.values : [];
    });
    const values = distinct(fromSpreads);
    return values === undefined || values.length === 0 ? unreadable(current, `property ${name} has no single authored value`) : { kind: "values", values };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one closed object-literal grammar.
  function propertyNames(object: ObjectLiteralExpression, mode: "keys" | "values", seen: Set<object>): FixtureAuthoredStringFact {
    const values: string[] = [];
    for (const property of object.getProperties()) {
      if (Node.isSpreadAssignment(property)) {
        const spread = mode === "keys" ? recordKeys(property.getExpression(), new Set(seen)) : recordValues(property.getExpression(), new Set(seen));
        if (spread.kind === "unreadable") {
          return spread;
        }
        values.push(...spread.values);
        continue;
      }
      if (mode === "keys") {
        const nameNode =
          Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property) || Node.isMethodDeclaration(property)
            ? property.getNameNode()
            : undefined;
        if (nameNode === undefined) {
          return unreadable(property, "object key is not statically readable");
        }
        const name = Node.isComputedPropertyName(nameNode)
          ? services.stringValues(nameNode.getExpression(), new Set(seen))
          : services.stringValues(nameNode, new Set(seen));
        if (name.kind === "unreadable") {
          return name;
        }
        values.push(...name.values);
      } else if (Node.isPropertyAssignment(property)) {
        const initializer = property.getInitializer();
        if (initializer === undefined) {
          return unreadable(property, "object value is absent");
        }
        const value = services.stringValues(initializer, new Set(seen));
        if (value.kind === "unreadable") {
          return value;
        }
        values.push(...value.values);
      } else {
        return unreadable(property, "object value is not a static string");
      }
    }
    const unique = distinct(values);
    return unique === undefined ? unreadable(object, "authored string set exceeds the reader bound") : { kind: "values", values: unique };
  }

  function objectRestSource(identifier: Identifier): { readonly source: MorphNode; readonly excluded: readonly string[] } | undefined {
    const declaration = referenceResolutionServices.declarationOf(identifier);
    if (declaration.kind === "unresolved" || !Node.isBindingElement(declaration.value) || declaration.value.getDotDotDotToken() === undefined) {
      return;
    }
    const pattern = declaration.value.getParentIfKind(SyntaxKind.ObjectBindingPattern);
    const owner = pattern?.getParentIfKind(SyntaxKind.VariableDeclaration);
    const source = owner?.getInitializer();
    if (pattern === undefined || source === undefined) {
      return;
    }
    const excluded = pattern.getElements().flatMap((element) => {
      if (element.getDotDotDotToken() !== undefined) {
        return [];
      }
      const name = element.getPropertyNameNode() ?? element.getNameNode();
      const fact = Node.isComputedPropertyName(name) ? services.stringValues(name.getExpression(), new Set()) : services.stringValues(name, new Set());
      return fact.kind === "values" ? fact.values : [];
    });
    return { source, excluded };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: finite Object.fromEntries grammar.
  function fromEntriesKeys(call: CallExpression, seen: Set<object>): FixtureAuthoredStringFact {
    const source = call.getArguments()[0];
    if (source === undefined) {
      return unreadable(call, "Object.fromEntries has no entries");
    }
    const direct = entriesSource(source);
    if (direct !== undefined) {
      return recordKeys(direct, seen);
    }
    const mapCall = unwrap(source);
    if (!Node.isCallExpression(mapCall) || mapSource(mapCall) === undefined) {
      return unreadable(source, "Object.fromEntries producer is not a complete authored entries map");
    }
    const callback = mapCall.getArguments()[0];
    const body = callback !== undefined && (Node.isArrowFunction(callback) || Node.isFunctionExpression(callback)) ? callback.getBody() : undefined;
    const returned = body !== undefined && Node.isArrayLiteralExpression(body) ? body.getElements()[0] : undefined;
    return returned === undefined ? unreadable(source, "entries mapper does not return a tuple expression") : services.stringValues(returned, seen);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: finite record-key grammar.
  function recordKeys(node: MorphNode, seen: Set<object>): FixtureAuthoredStringFact {
    const current = unwrap(node);
    if (seen.has(current.compilerNode)) {
      return unreadable(current, "record-key provenance cycle");
    }
    seen.add(current.compilerNode);
    if (Node.isObjectLiteralExpression(current)) {
      return propertyNames(current, "keys", seen);
    }
    if (Node.isIdentifier(current)) {
      const rest = objectRestSource(current);
      if (rest !== undefined) {
        const source = recordKeys(rest.source, new Set(seen));
        return source.kind === "unreadable" ? source : { kind: "values", values: source.values.filter((value) => !rest.excluded.includes(value)) };
      }
      const declaration = referenceResolutionServices.declarationOf(current);
      if (declaration.kind === "resolved" && Node.isParameterDeclaration(declaration.value)) {
        const args = services.parameterArguments(declaration.value);
        if (args === undefined) {
          return unreadable(current, "record parameter has no complete, non-escaping authored call set");
        }
        const facts = args.map((argument) => recordKeys(argument, new Set(seen)));
        const refusal = facts.find((fact): fact is FixtureAuthoredValueUnreadable => fact.kind === "unreadable");
        if (refusal !== undefined) {
          return refusal;
        }
        const values = distinct(facts.flatMap((fact) => (fact as { readonly kind: "values"; readonly values: readonly string[] }).values));
        return values === undefined ? unreadable(current, "record-key set exceeds the reader bound") : { kind: "values", values };
      }
      const stable = resolveStableExpression(current);
      if (stable.kind === "resolved") {
        return recordKeys(stable.value, seen);
      }
      return stable.reason === "dynamic" ? recordKeys(stable.node, seen) : unreadable(current, stable.detail);
    }
    if (Node.isCallExpression(current) && globalMember(current, "Object", "fromEntries")) {
      return fromEntriesKeys(current, seen);
    }
    return unreadable(current, "record keys are not statically enumerable");
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: finite record-value grammar.
  function recordValues(node: MorphNode, seen: Set<object>): FixtureAuthoredStringFact {
    const current = unwrap(node);
    if (seen.has(current.compilerNode)) {
      return unreadable(current, "record-value provenance cycle");
    }
    seen.add(current.compilerNode);
    if (Node.isObjectLiteralExpression(current)) {
      return propertyNames(current, "values", seen);
    }
    if (Node.isIdentifier(current)) {
      const declaration = referenceResolutionServices.declarationOf(current);
      if (declaration.kind === "resolved" && Node.isParameterDeclaration(declaration.value)) {
        const args = services.parameterArguments(declaration.value);
        if (args === undefined) {
          return unreadable(current, "record parameter has no complete, non-escaping authored call set");
        }
        const facts = args.map((argument) => recordValues(argument, new Set(seen)));
        const refusal = facts.find((fact): fact is FixtureAuthoredValueUnreadable => fact.kind === "unreadable");
        if (refusal !== undefined) {
          return refusal;
        }
        const values = distinct(facts.flatMap((fact) => (fact as { readonly kind: "values"; readonly values: readonly string[] }).values));
        return values === undefined ? unreadable(current, "record-value set exceeds the reader bound") : { kind: "values", values };
      }
      const stable = resolveStableExpression(current);
      if (stable.kind === "resolved") {
        return recordValues(stable.value, seen);
      }
      return stable.reason === "dynamic" ? recordValues(stable.node, seen) : unreadable(current, stable.detail);
    }
    return unreadable(current, "record values are not statically enumerable");
  }

  return { arrayLiteralOf, bindingElementValues, propertyValue };
}
