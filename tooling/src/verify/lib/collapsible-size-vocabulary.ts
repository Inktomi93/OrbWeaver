// The collapsible trigger's SIZE vocabulary — the family reader shared by `sub-floor-disclosure` (the
// occurrence policy: a `size="text"` trigger is the sub-floor opt-out and owes a reasoned waiver) and
// `sub-floor-disclosure-health` (the tripwire: the variants home must still declare both arms), so the two
// halves of #884 C2 cannot drift on which arm is the opt-out or where the arms are declared.
//
// Pure data plus one attribute reader over a delivered JSX element: no walk, no Project, no filesystem.
import type { JsxOpeningElement, JsxSelfClosingElement, StringLiteral } from "ts-morph";
import { Node } from "ts-morph";

const COLLAPSIBLE_TRIGGER = "CollapsibleTrigger";
/** The SUB-FLOOR opt-out: no control box, no hit pseudo at all (pointer-variants.ts measured a 406×16 trigger). */
export const SUB_FLOOR_ARM = "text";
/** The default since #884 C2 inverted it: the pointer-conditional `--spacing-control-sm` floor. */
export const FLOOR_ARM = "control";
/** Where the size arms are DECLARED — the tripwire's whole population. */
export const COLLAPSIBLE_VARIANTS_HOME = "packages/ui/src/primitives/collapsible/variants.ts";

/** The `size` attribute of a `CollapsibleTrigger` element when its value is the literal sub-floor arm — the
 *  literal itself, which is the finding's anchor and the waiver's position (`"text"`, quotes included). A
 *  size reached through a variable is invisible by design (the literal-shape limit every size gate shares). */
export function subFloorSizeLiteral(element: JsxOpeningElement | JsxSelfClosingElement): StringLiteral | undefined {
  if (element.getTagNameNode().getText() !== COLLAPSIBLE_TRIGGER) {
    return;
  }
  const attribute = element.getAttribute("size");
  if (attribute === undefined || !Node.isJsxAttribute(attribute)) {
    return;
  }
  const initializer = attribute.getInitializer();
  return initializer !== undefined && Node.isStringLiteral(initializer) && initializer.getLiteralText() === SUB_FLOOR_ARM ? initializer : undefined;
}
