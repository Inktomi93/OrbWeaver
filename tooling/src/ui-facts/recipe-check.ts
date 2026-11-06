// The render decides what the rule picks: each element a rewrite changed goes through the door's real `tv()` recipes, before and after,
// and any class-set difference, any change outside a planned element and anything the check cannot evaluate fails the apply.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cn } from "@orb/ui/lib";
import ts from "typescript";
import type { ClassExpression } from "./class-expression.ts";
import { classesWhen, guardsIn, opaqueIn } from "./class-expression.ts";
import { attributeClasses } from "./classes.ts";
import { attributeValue } from "./hand-arms.ts";
import type { MigrationPlan } from "./migration.ts";
import { readPlan } from "./migration.ts";
import type { Elem } from "./source.ts";
import { doorOf, elementsOf, loadSources, visit } from "./source.ts";
import type { ComponentRecipe, ComponentTables } from "./variant-tables.ts";
import { componentTables } from "./variant-tables.ts";

const MAX_STATES = 64;
const CLASS_NAME = "className";
const NO_PROP = undefined;

type Recipe = (props: Readonly<Record<string, string | undefined>>) => unknown;
type Choice = readonly [string, readonly (string | undefined)[]];

/** One planned file: its text from the snapshot and from the tree. */
export interface RewrittenFile {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

const parsed = (path: string, text: string): ts.SourceFile => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Biome can reflow a rewritten line, so layout and its punctuation are not a change.
const layoutFree = (text: string): string => text.replaceAll(/[\s(),;]/gu, "");

function holdsJsx(node: ts.Node): boolean {
  let found = false;
  visit(node, (inner) => {
    found ||= ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner);
  });
  return found;
}

// A nested element is judged by itself, so an attribute that holds one counts by name alone.
const attributesOf = ({ opening }: Elem): string =>
  opening.attributes.properties.map((attribute) => (holdsJsx(attribute) ? (attribute.name?.getText() ?? "") : layoutFree(attribute.getText()))).join("|");

/** The text with every given element's attributes cut out: what must not change at all. */
function outsideElements(sf: ts.SourceFile, elems: readonly Elem[]): string {
  const ranges = elems.map(({ opening }) => [opening.attributes.getStart(sf), opening.attributes.end] as const).toSorted(([left], [right]) => left - right);
  let cursor = 0;
  let kept = "";
  for (const [start, end] of ranges) {
    kept += sf.text.slice(cursor, Math.max(cursor, start));
    cursor = Math.max(cursor, end);
  }
  return layoutFree(kept + sf.text.slice(cursor));
}

const isPlanned = (elem: Elem, sf: ts.SourceFile, plan: MigrationPlan): boolean =>
  plan.sites.some((site) => {
    const position = site.path === sf.fileName ? sf.getPositionOfLineAndCharacter(site.line - 1, site.column) : -1;
    return position >= elem.opening.attributes.pos && position < elem.opening.attributes.end;
  });

function classesOf(elem: Elem): ClassExpression {
  const value = elem.attrs.get(CLASS_NAME)?.initializer;
  return value === undefined ? { kind: "classes", tokens: [] } : attributeClasses(value);
}

/** The axis props an element sets: the door's literal choices, then each forwarded axis it writes, null where the syntax cannot read the value. */
function axisProps(elem: Elem, recipe: ComponentRecipe): ReadonlyMap<string, string | null> {
  const written = [...elem.attrs].flatMap(([name, attribute]) => (recipe.axes.has(name) ? [[name, attributeValue(attribute)] as const] : []));
  return new Map([...recipe.chosen, ...written]);
}

/** Every value a non-literal prop or a guard can take; a literal prop is one fixed state. */
function choicesOf(recipe: ComponentRecipe, props: readonly ReadonlyMap<string, string | null>[], classes: readonly ClassExpression[]): readonly Choice[] {
  const open = [...new Set(props.flatMap((one) => [...one].flatMap(([axis, value]) => (value === null ? [axis] : []))))];
  const armsOf = (axis: string): Choice => [axis, [...(recipe.declared.get(axis)?.keys() ?? []), NO_PROP]];
  const guards = [...new Set(classes.flatMap(guardsIn))].map((guard): Choice => [guard, [guard, NO_PROP]]);
  return [...open.map(armsOf), ...guards];
}

const statesOf = (choices: readonly Choice[]): readonly ReadonlyMap<string, string | undefined>[] =>
  choices.reduce<readonly ReadonlyMap<string, string | undefined>[]>(
    (states, [name, values]) => states.flatMap((state) => values.map((value) => new Map([...state, [name, value]]))),
    [new Map()],
  );

function classSet(
  recipes: readonly Recipe[],
  props: ReadonlyMap<string, string | null>,
  classes: ClassExpression,
  state: ReadonlyMap<string, string | undefined>,
): string {
  const input = Object.fromEntries([...props].map(([axis, value]) => [axis, value ?? state.get(axis)]));
  const held = new Set([...state.values()].filter((value) => value !== undefined));
  const written = recipes.map((recipe) => recipe(input));
  if (written.some((one) => typeof one !== "string")) {
    throw new TypeError("a table with slots returns no class string");
  }
  return [...new Set((cn(...written.map(String), classesWhen(classes, held)) ?? "").split(/\s+/u))].toSorted().join(" ");
}

async function loadRecipes(root: string, recipe: ComponentRecipe): Promise<readonly Recipe[]> {
  const loaded = await Promise.all(
    recipe.applied.map(async ({ file, name }) => ((await import(pathToFileURL(join(root, file)).href)) as Readonly<Record<string, Recipe | undefined>>)[name]),
  );
  return loaded.flatMap((one) => one ?? []);
}

/** Why this changed element fails the check, or null when every state writes one class set. */
async function elementFailure(root: string, before: Elem, after: Elem, tables: ComponentTables): Promise<string | null> {
  const recipe = tables.get(doorOf(before.imported?.source ?? "") ?? "")?.get(before.imported?.name ?? "");
  if (recipe === undefined || before.hasSpread || after.hasSpread) {
    return `${before.tag} has no recipe the check can call, or carries a spread`;
  }
  const classes = [classesOf(before), classesOf(after)] as const;
  const opaque = opaqueIn(classes[0]) ?? opaqueIn(classes[1]);
  if (opaque !== null) {
    return `${opaque} cannot be evaluated`;
  }
  const props = [axisProps(before, recipe), axisProps(after, recipe)] as const;
  const choices = choicesOf(recipe, props, classes);
  if (choices.reduce((states, [, values]) => states * values.length, 1) > MAX_STATES) {
    return `its non-literal props and guards exceed ${MAX_STATES} states`;
  }
  const recipes = await loadRecipes(root, recipe);
  if (recipes.length !== recipe.applied.length) {
    return `a table of ${before.tag} is not exported`;
  }
  for (const state of statesOf(choices)) {
    const [was, is] = [classSet(recipes, props[0], classes[0], state), classSet(recipes, props[1], classes[1], state)];
    if (was !== is) {
      return `wrote "${was}" and now writes "${is}"`;
    }
  }
  return null;
}

async function fileFailures(root: string, { path, before, after }: RewrittenFile, plan: MigrationPlan, tables: ComponentTables): Promise<readonly string[]> {
  const [was, is] = [parsed(path, before), parsed(path, after)];
  const [wasElems, isElems] = [elementsOf(was), elementsOf(is)];
  if (wasElems.length !== isElems.length) {
    return [`${path}: the rewrite changed how many elements the file holds`];
  }
  const changed = wasElems.flatMap((elem, index) => {
    const now = isElems[index];
    return now === undefined || attributesOf(elem) === attributesOf(now) ? [] : [[elem, now] as const];
  });
  const failures: string[] = [];
  if (
    outsideElements(
      was,
      changed.map(([elem]) => elem),
    ) !==
    outsideElements(
      is,
      changed.map(([, elem]) => elem),
    )
  ) {
    failures.push(`${path}: text outside the planned elements changed`);
  }
  for (const [elem, now] of changed) {
    const failure = isPlanned(elem, was, plan)
      ? await elementFailure(root, elem, now, tables).catch((error: unknown) => String(error))
      : "the plan does not list this element";
    if (failure !== null) {
      failures.push(`${path}:${elem.line} ${elem.tag}: ${failure}`);
    }
  }
  return failures;
}

export async function recipeFailures(root: string, plan: MigrationPlan, files: readonly RewrittenFile[], tables: ComponentTables): Promise<readonly string[]> {
  const failures = await Promise.all(files.map((file) => fileFailures(root, file, plan, tables)));
  return failures.flat();
}

/** Check a finished rewrite against the snapshot taken before it. */
export function checkRewrite(root: string, map: string, snapshot: ReadonlyMap<string, string>): Promise<readonly string[]> {
  const files = [...snapshot].map(([path, before]) => ({ path, before, after: readFileSync(join(root, path), "utf8") }));
  return recipeFailures(root, readPlan(root, map), files, componentTables(root, loadSources(root)));
}
