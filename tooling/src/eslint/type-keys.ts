// The key walk the tRPC payload and output rules share: the keys a typed value carries that a target type does not
// declare, which TypeScript never excess-checks once the value comes from a spread or a variable.

import ts from "typescript";

/** The keys of a type's object members, or null when one is open (an index signature, an array, a function): an open
 *  member can carry any key. A primitive member (a skip token, a literal) holds no keys and is passed over. A promise
 *  is read as the value it resolves to, so a resolver and an async verb compare by their results. */
export function keysOf(checker: ts.TypeChecker, type: ts.Type): ReadonlySet<string> | null {
  const names = new Set<string>();
  const settled = checker.getAwaitedType(type) ?? type;
  for (const member of settled.isUnion() ? settled.types : [settled]) {
    // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
    if ((member.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) === 0) {
      continue;
    }
    const open = checker.isArrayLikeType(member) || member.getCallSignatures().length > 0;
    if (open || member.getStringIndexType() !== undefined || member.getNumberIndexType() !== undefined) {
      return null;
    }
    for (const property of checker.getPropertiesOfType(member)) {
      names.add(property.getName());
    }
  }
  return names;
}

// The element type of an array or tuple, or undefined for any other type. A union is not one array.
function elementOf(checker: ts.TypeChecker, type: ts.Type): ts.Type | undefined {
  return !type.isUnion() && checker.isArrayLikeType(type) ? checker.getIndexTypeOfType(type, ts.IndexKind.Number) : undefined;
}

// Past this many array levels the walk stops: a recursive element type (a JSON value) never reaches a leaf.
const ARRAY_DEPTH_MAX = 4;

/** The keys a carried type holds that the declared type does not; two arrays are compared by their elements. */
export function excessKeys(checker: ts.TypeChecker, carried: ts.Type, declared: ts.Type, depth = 0): readonly string[] {
  const settledCarried = checker.getNonNullableType(checker.getAwaitedType(carried) ?? carried);
  const settledDeclared = checker.getNonNullableType(checker.getAwaitedType(declared) ?? declared);
  const carriedElement = elementOf(checker, settledCarried);
  const declaredElement = elementOf(checker, settledDeclared);
  if (carriedElement !== undefined && declaredElement !== undefined) {
    return depth < ARRAY_DEPTH_MAX ? excessKeys(checker, carriedElement, declaredElement, depth + 1) : [];
  }
  const keysDeclared = keysOf(checker, settledDeclared);
  const keysCarried = keysOf(checker, settledCarried);
  if (keysDeclared === null || keysCarried === null || keysDeclared.size === 0) {
    return [];
  }
  return [...keysCarried].filter((key) => !keysDeclared.has(key));
}

function propertyType(checker: ts.TypeChecker, target: ts.Type, name: string, at: ts.Node): ts.Type | null {
  const types = (target.isUnion() ? target.types : [target]).flatMap((member) => {
    const symbol = checker.getPropertyOfType(member, name);
    return symbol === undefined ? [] : [checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(symbol, at))];
  });
  const [first] = types;
  return first ?? null;
}

/** The keys `expression` carries that `target` does not declare, walking fresh literals so a nested value is judged
 *  against its own field's type. A fresh literal's own keys are TypeScript's to refuse. With `whole` off, only a
 *  spread is judged: a variable or call result passed whole is ordinary width subtyping there. */
export function undeclaredKeys(checker: ts.TypeChecker, expression: ts.Expression, target: ts.Type, whole = true): readonly string[] {
  // A cast or a non-null assertion hides the value's own keys from tsc's excess check; the value under it is judged.
  if (ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isAsExpression(expression) || ts.isNonNullExpression(expression)) {
    return undeclaredKeys(checker, expression.expression, target, whole);
  }
  if (ts.isConditionalExpression(expression)) {
    return [...undeclaredKeys(checker, expression.whenTrue, target, whole), ...undeclaredKeys(checker, expression.whenFalse, target, whole)];
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return expression.properties.flatMap((property) => {
      if (ts.isSpreadAssignment(property)) {
        return undeclaredKeys(checker, property.expression, target);
      }
      if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
        const field = propertyType(checker, target, property.name.text, property);
        return field === null ? [] : undeclaredKeys(checker, property.initializer, field, whole).map((key) => `${property.name.getText()}.${key}`);
      }
      return [];
    });
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const element = checker.isArrayLikeType(target) ? checker.getIndexTypeOfType(target, ts.IndexKind.Number) : undefined;
    return element === undefined ? [] : expression.elements.flatMap((item) => (ts.isSpreadElement(item) ? [] : undeclaredKeys(checker, item, element, whole)));
  }
  if (!whole) {
    return [];
  }
  return excessKeys(checker, checker.getTypeAtLocation(expression), target);
}
