// Static property-name resolution for module-origin destructuring bindings.
import type { BindingElement } from "ts-morph";
import { Node } from "ts-morph";
import type { ReferenceFact, ReferenceResolutionServices } from "../contract/reference-fact.ts";
import type { ModuleState } from "./reference-fact-state.ts";
import { mergeUnresolved, resolved, unresolved } from "./reference-fact-state.ts";

export function bindingElementName(binding: BindingElement, target: ModuleState, services: ReferenceResolutionServices): ReferenceFact<string> {
  if (binding.getDotDotDotToken() !== undefined) {
    return unresolved("dynamic", binding, target, "a rest binding does not name one property");
  }
  const property = binding.getPropertyNameNode() ?? binding.getNameNode();
  if (Node.isIdentifier(property)) {
    return resolved(property.getText(), target, property);
  }
  if (Node.isStringLiteral(property) || Node.isNoSubstitutionTemplateLiteral(property)) {
    return resolved(property.getLiteralText(), target, property);
  }
  if (Node.isNumericLiteral(property)) {
    return resolved(String(property.getLiteralValue()), target, property);
  }
  if (Node.isComputedPropertyName(property)) {
    const computed = services.readComputedName(property.getExpression());
    return computed.kind === "unresolved" ? mergeUnresolved(computed, target) : resolved(computed.value, target, computed.trace.origin);
  }
  return unresolved("unsupported", property, target, `${property.getKindName()} does not name one destructured property`);
}
