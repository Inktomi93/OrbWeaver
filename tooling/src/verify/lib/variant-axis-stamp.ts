// The ONE reader behind the `ui-variant-axes-stamped` family (#1080; #1584 split of the legacy mixed-hook
// descriptor): which @orb/ui `tv()` recipes declare a STAMPED axis, and which recipe names reach the DOM
// through the stamp seam.
//
// Two consumers, one reader: `ui-variant-axes-stamped` (A1 unstamped recipe · A2 unreadable `tv()`
// fail-closed · A3 duplicate exported NAME) and `ui-variant-axes-stamped-health` (A5, the axis-vocabulary
// blindness tripwire). The tripwire proves READABLE exactly the vocabulary the recipe policy judges
// against, so a tripwire cannot report healthy about a shape its sibling cannot read.
//
// The axis VOCABULARY is derived from `packages/ui/src/lib/variant-attrs.ts`, never re-spelled here: it is
// the emitter's own list, and a copy in a gate would be a third home for it (the walker's copy is the
// second, and it is pinned by tests/tooling/ui-audit/ops/walker/target-identity.test.ts because raw
// browser JS in a template literal cannot import anything).
//
// EVERY READER HERE IS NODE-LEVEL. The legacy shape was per-SourceFile (`scanRecipes`, `stampedNames`) plus
// a `scanUiPackage` that opened its own ts-morph workspace for the baseline generator; both retired with the
// #1584 conversion — the policies subscribe `VariableDeclaration` and `CallExpression` through the shared
// kind-indexed walk, and the generator was deleted with the drained ratchet (#1097).
import type { CallExpression, Node, SourceFile, VariableDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { readStringValue, unwrapExpression } from "./ast-read.ts";

/** The emitter's own axis list — read, not re-spelled. Also the health policy's ENTIRE population. */
export const AXIS_HOME_REL = "packages/ui/src/lib/variant-attrs.ts";
export const AXIS_TUPLE_NAME = "STAMPED_VARIANT_AXES";
/** The preferred seam door, and the function the tripwire proves the home still exports. */
export const STAMP_DOOR = "variantProps";
export const UI_SRC = "packages/ui/src/";
/** The two doors of the seam. `variantProps` returns the className AND the stamp from one selection object;
 *  `variantAttrs` is the slot-recipe / hand-composed-className door. */
const STAMP_DOORS: ReadonlySet<string> = new Set([STAMP_DOOR, "variantAttrs"]);
/** The `tv()` mint — only a `tv()` initializer is a recipe (a DECLARED LIMIT, carried from the legacy). */
const RECIPE_MINT = "tv";

/** The stamped axis names, read out of the emitter's `as const` tuple. Empty means "I could not read it" —
 *  the tripwire's verdict, never "there are no axes". */
export function readStampedAxes(sf: SourceFile): readonly string[] {
  const initializer = sf.getVariableDeclaration(AXIS_TUPLE_NAME)?.getInitializer();
  const array = initializer === undefined ? undefined : unwrapExpression(initializer).asKind(SyntaxKind.ArrayLiteralExpression);
  if (array === undefined) {
    return [];
  }
  return array.getElements().flatMap((element) => {
    const value = readStringValue(element);
    return value === undefined ? [] : [value];
  });
}

/** Does the axis home still export the seam's own door? The second half of what the tripwire guards: a
 *  readable tuple over a home that no longer emits anything is the same silent green. */
export function stampDoorPresent(sf: SourceFile): boolean {
  return sf.getFunction(STAMP_DOOR) !== undefined;
}

/** `unwrapExpression`, tolerant of an absent node — every read here is of an OPTIONAL child. */
function argAt(node: Node | undefined): ReturnType<typeof unwrapExpression> | undefined {
  return node === undefined ? undefined : unwrapExpression(node);
}

/** The axis names one `tv({ … })` config declares.
 *
 *  `undefined` = a `tv()` whose config this reader cannot resolve (an imported config, a spread, a builder):
 *  the FAIL-CLOSED answer (#944's third answer), never a silent skip — unknowable axes make compliance
 *  unknowable. `[]` = not a `tv()` at all, or a `tv()` declaring no variants. */
export function declaredAxes(declaration: VariableDeclaration): readonly string[] | undefined {
  const initializer = declaration.getInitializer();
  const call = initializer === undefined ? undefined : unwrapExpression(initializer).asKind(SyntaxKind.CallExpression);
  if (call === undefined || call.getExpression().getText() !== RECIPE_MINT) {
    return [];
  }
  const config = argAt(call.getArguments()[0])?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (config === undefined) {
    return;
  }
  const variants = config.getProperty("variants")?.asKind(SyntaxKind.PropertyAssignment);
  if (variants === undefined) {
    return [];
  }
  const literal = argAt(variants.getInitializer())?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (literal === undefined) {
    return;
  }
  return literal.getProperties().flatMap((property) => {
    const assignment = property.asKind(SyntaxKind.PropertyAssignment);
    if (assignment === undefined) {
      return [];
    }
    const name = assignment.getNameNode();
    const text = readStringValue(name) ?? name.asKind(SyntaxKind.Identifier)?.getText() ?? "";
    return text === "" ? [] : [text];
  });
}

/** The recipe identifier handed to a stamp door — the CONSUMPTION half, one call at a time.
 *
 *  The CALLER excludes the axis home: `variantProps` calls `variantAttrs(recipe, selection)` internally, so
 *  the seam would otherwise credit a recipe that happened to be named after that parameter. A gate crediting
 *  itself is the permissive direction, which is the one that reports OK forever. */
export function stampDoorRecipeName(call: CallExpression): string | undefined {
  if (!STAMP_DOORS.has(call.getExpression().getText())) {
    return;
  }
  return argAt(call.getArguments()[0])?.asKind(SyntaxKind.Identifier)?.getText();
}

/** `<repo-relative file>::<exported name>` — the recipe's stable identity across the two arms. */
export function recipeKey(rel: string, name: string): string {
  return `${rel}::${name}`;
}
