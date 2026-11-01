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
  if (ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression)) {
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
  const declared = keysOf(checker, target);
  const carried = keysOf(checker, checker.getTypeAtLocation(expression));
  if (declared === null || carried === null || declared.size === 0) {
    return [];
  }
  return [...carried].filter((key) => !declared.has(key));
}
