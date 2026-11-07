// Which prop of an `@orb/ui` component writes a class, read from the component's own `tv()` tables: a new axis or arm owns its classes with no edit here.
import type { PropOwners } from "../eslint/index.ts";
import { classifyToken } from "./classes.ts";
import { armWriting, axisChoosing, axisWriting, kebab } from "./hand-arms.ts";
import { loadUiSources } from "./source.ts";
import { componentTables } from "./variant-tables.ts";
import type { Arm } from "./variants.ts";

const VIEWPORT_VARIANT = "tw-viewport-variant";

// A slot-keyed arm lands on a part inside the component, so a className on the root never competes with it.
const onRoot = (arm: Arm): boolean => arm.slots.length === 0 || arm.slots.includes("root");

/** Build the lookup over the ui sources once; a lint run asks it for every class on every primitive. */
export function classOwners(root: string): PropOwners {
  const components = componentTables(root, loadUiSources(root));
  return (door, component, token, siblings) => {
    const recipe = components.get(door)?.get(component);
    const found = axisWriting(recipe, token, siblings);
    const written = found === undefined ? undefined : armWriting(found[1], token, siblings);
    if (found !== undefined && written !== undefined) {
      return onRoot(written[1]) ? { axis: `${kebab(component)}.${found[0]}`, prop: found[0], arm: written[0] } : null;
    }
    // A viewport variant has its own move to a container step first, so the family's axis is not yet what it asks for.
    const choosing = classifyToken(token)?.kind === VIEWPORT_VARIANT ? undefined : axisChoosing(recipe, token);
    return choosing !== undefined && [...choosing[1].values()].some(onRoot)
      ? { axis: `${kebab(component)}.${choosing[0]}`, prop: choosing[0], arm: null }
      : null;
  };
}
