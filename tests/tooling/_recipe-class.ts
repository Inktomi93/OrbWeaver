// The classes an `@orb/ui` component's own `tv()` recipe writes for a prop, so a lint fixture takes the spelling from the recipe it judges and a
// respelling moves the fixture with it. The recipe is the one the lint's reader found the component applying, called as the render calls it.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadUiSources } from "../../tooling/src/eslint/ui-classes/source.ts";
import { componentTables } from "../../tooling/src/eslint/ui-classes/variant-tables.ts";

export type RecipeProps = Readonly<Record<string, string | number | boolean>>;
type Recipe = (props: RecipeProps) => string;

const ROOT = join(import.meta.dirname, "../..");
const TABLES = componentTables(ROOT, loadUiSources(ROOT));

/** The classes the recipe writes for `props` and not for `against`, which is the bare component unless a sibling arm is named. */
export async function recipeClasses(door: string, component: string, props: RecipeProps, against: RecipeProps = {}): Promise<readonly string[]> {
  const [table, ...others] = TABLES.get(door)?.get(component)?.applied ?? [];
  if (table === undefined || others.length > 0) {
    throw new TypeError(`${component} does not apply exactly one recipe table`);
  }
  const recipe = ((await import(pathToFileURL(join(ROOT, table.file)).href)) as Readonly<Record<string, Recipe | undefined>>)[table.name];
  if (recipe === undefined) {
    throw new TypeError(`${table.file} exports no ${table.name}`);
  }
  const rival = recipe(against).split(/\s+/u);
  return recipe(props)
    .split(/\s+/u)
    .filter((token) => !rival.includes(token));
}

/** The one class the recipe writes for `props`; any other count is a fixture that no longer names a single class. */
export async function recipeClass(door: string, component: string, props: RecipeProps): Promise<string> {
  const added = await recipeClasses(door, component, props);
  const [only, ...rest] = added;
  if (only === undefined || rest.length > 0) {
    throw new RangeError(`${component} ${JSON.stringify(props)} writes ${added.length} classes the bare component does not: ${added.join(" ")}`);
  }
  return only;
}
