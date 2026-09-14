// One reader for "what NAME does this object member author", across the three spellings a key can take:
// an identifier, a string/template literal, and a computed key whose expression resolves to a static
// string. `{ limit: … }`, `{ "limit": … }` and `{ ["limit"]: … }` are the same field, and a policy whose
// subject is a FIELD NAME must see all three or a computed key is a silent escape (#1506).
//
// THE REFUSAL IS THE POINT, and it is why this is a reader rather than four copies of a helper. A computed
// key the static reader cannot resolve — `{ [runtimeKey]: … }` — authors NO knowable name, and the naive
// repair is to fall back on the expression's TEXT. That text is the identifier's spelling, not the key it
// evaluates to, so a binding that happens to be named after the subject field would be accused of authoring
// it. Returning `null` keeps an unknowable key out of every consumer's subject; the falsifier for this arm
// lives in `bounded-list-limit`'s mustPass rows, once for all four consumers (§5b.7, w9 D6, #2046).
//
// Extracted 2026-09-12 from four byte-identical private copies (`bounded-list-limit`,
// `no-direct-reports-write`, `no-handwritten-wire-json-schema`, `no-hardcoded-side-gen-sampling`), whose
// refusal arm was reached by zero rows in all four.

import { readStaticString } from "@orb/tooling/_shared/reference-fact";
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";

/** The authored NAME of an object member, across identifier, string-literal and computed-literal keys.
 *  `null` means the node is not a property assignment, or its computed key authors no knowable name. */
export function propertyAssignmentName(property: MorphNode): string | null {
  if (!Node.isPropertyAssignment(property)) {
    return null;
  }
  const nameNode = property.getNameNode();
  if (Node.isIdentifier(nameNode)) {
    return nameNode.getText();
  }
  if (Node.isStringLiteral(nameNode) || Node.isNoSubstitutionTemplateLiteral(nameNode)) {
    return nameNode.getLiteralText();
  }
  if (!Node.isComputedPropertyName(nameNode)) {
    return null;
  }
  const computed = readStaticString(nameNode.getExpression());
  return computed.kind === "resolved" ? computed.value : null;
}
