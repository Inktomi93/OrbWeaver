// The ONE reader behind the `ui-variant-axes-stamped` gate and its baseline generator (#1080): which
// @orb/ui `tv()` recipes declare a STAMPED axis, and which of them reach the DOM through the stamp seam.
//
// Two drivers, one reader — the gate rides the harness's shared walk, the generator asks `getWorkspace`
// for a ui-only fileset — because a generator that re-derives the population its own way writes a ledger
// the gate disagrees with, and a ledger nobody can reproduce is a ledger nobody can shrink.
//
// The axis VOCABULARY is derived from `packages/ui/src/lib/variant-attrs.ts`, never re-spelled here: it is
// the emitter's own list, and a copy in the gate would be a third home for it (the walker's copy is the
// second, and it is pinned by tests/tooling/ui-audit/ops/walker/target-identity.test.ts because raw
// browser JS in a template literal cannot import anything).
import type { Node, SourceFile, VariableDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { getWorkspace } from "../../_shared/ts-workspace.ts";
import { readStringValue, unwrapExpression } from "./ast-read.ts";

/** The emitter's own axis list — read, not re-spelled. */
export const AXIS_HOME_REL = "packages/ui/src/lib/variant-attrs.ts";
export const AXIS_TUPLE_NAME = "STAMPED_VARIANT_AXES";
/** A real-tree ANCHOR that no conformance example creates, for the stale/blindness arms (GATE-AUTHORING
 *  §4 rule 5). Deliberately NOT the axis home itself: the arm that reds when the axis home stops
 *  resolving cannot be guarded on the axis home resolving. */
export const AXIS_ANCHOR_REL = "packages/ui/src/lib/class-merge.ts";
export const UI_SRC = "packages/ui/src/";
/** The two doors of the seam. `variantProps` is the preferred one (className + stamp from one selection
 *  object); `variantAttrs` is the slot-recipe / hand-composed-className door. */
const STAMP_DOORS: ReadonlySet<string> = new Set(["variantProps", "variantAttrs"]);

/** One `tv()` recipe that declares at least one stamped axis — the gate's judged member. */
export interface StampedRecipe {
  /** `<repo-relative file>::<exported name>` — the baseline row key. */
  readonly key: string;
  readonly name: string;
  readonly rel: string;
  readonly declaration: VariableDeclaration;
  readonly axes: readonly string[];
}

/** A `tv()` call whose config this reader cannot resolve into axes — never skipped silently. */
export interface UnreadableRecipe {
  readonly rel: string;
  readonly declaration: VariableDeclaration;
}

export interface RecipeScan {
  readonly recipes: readonly StampedRecipe[];
  readonly unreadable: readonly UnreadableRecipe[];
}

export function repoRel(absPath: string): string {
  const at = absPath.indexOf("/packages/");
  return at === -1 ? absPath : absPath.slice(at + 1);
}

/** The stamped axis names, read out of the emitter's `as const` tuple. Empty means "I could not read it" —
 *  the caller's blindness arm, never "there are no axes". */
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

/** The axis names one `tv({ … })` config declares. `undefined` = a `tv()` whose config this reader cannot
 *  resolve (an imported config, a spread, a builder) — the FAIL-CLOSED answer, never a silent skip. */
function declaredAxes(declaration: VariableDeclaration): readonly string[] | undefined {
  const initializer = declaration.getInitializer();
  const call = initializer === undefined ? undefined : unwrapExpression(initializer).asKind(SyntaxKind.CallExpression);
  if (call === undefined || call.getExpression().getText() !== "tv") {
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

/** `unwrapExpression`, tolerant of an absent node — every read here is of an OPTIONAL child. */
function argAt(node: Node | undefined): ReturnType<typeof unwrapExpression> | undefined {
  return node === undefined ? undefined : unwrapExpression(node);
}

/** Every stamped-axis recipe in one file, plus every `tv()` whose config this reader could not resolve. */
export function scanRecipes(sf: SourceFile, axes: readonly string[]): RecipeScan {
  const rel = repoRel(sf.getFilePath());
  const recipes: StampedRecipe[] = [];
  const unreadable: UnreadableRecipe[] = [];
  for (const declaration of sf.getVariableDeclarations()) {
    const declared = declaredAxes(declaration);
    if (declared === undefined) {
      unreadable.push({ rel, declaration });
      continue;
    }
    const stamped = declared.filter((axis) => axes.includes(axis));
    if (stamped.length > 0) {
      const name = declaration.getName();
      recipes.push({ key: `${rel}::${name}`, name, rel, declaration, axes: stamped });
    }
  }
  return { recipes, unreadable };
}

/** Every recipe identifier handed to a stamp door in one file — the CONSUMPTION half.
 *
 *  The axis home is EXCLUDED: `variantProps` calls `variantAttrs(recipe, selection)` internally, so the
 *  seam would otherwise credit a recipe that happened to be named after that parameter. A gate crediting
 *  itself is the permissive direction, which is the one that reports ✓ forever. */
export function stampedNames(sf: SourceFile): readonly string[] {
  if (repoRel(sf.getFilePath()) === AXIS_HOME_REL) {
    return [];
  }
  return sf.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    if (!STAMP_DOORS.has(call.getExpression().getText())) {
      return [];
    }
    const first = argAt(call.getArguments()[0])?.asKind(SyntaxKind.Identifier);
    return first === undefined ? [] : [first.getText()];
  });
}

/** The whole `@orb/ui` population, derived OUTSIDE the harness — the baseline generator's driver. */
export function scanUiPackage(root: string): { readonly recipes: readonly StampedRecipe[]; readonly stamped: ReadonlySet<string> } {
  // Through the ONE ts-morph bootstrap (`tooling-shared-plumbing` — a second `new Project(` site is the
  // duplication class the tooling package was minted to end), narrowed to the package this reads.
  const project = getWorkspace({ root, globs: [`${root}/${UI_SRC}**/*.ts`, `${root}/${UI_SRC}**/*.tsx`] });
  const axisHome = project.getSourceFile(`${root}/${AXIS_HOME_REL}`);
  const axes = axisHome === undefined ? [] : readStampedAxes(axisHome);
  const recipes: StampedRecipe[] = [];
  const stamped = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    recipes.push(...scanRecipes(sf, axes).recipes);
    for (const name of stampedNames(sf)) {
      stamped.add(name);
    }
  }
  return { recipes, stamped };
}
