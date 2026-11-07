// Which prop of an `@orb/ui` component writes a class, read from the component's own `tv()` tables: a new axis or arm owns its classes with no edit here.
import type { PropOwner, PropOwners } from "../eslint/index.ts";
import { classifyToken } from "./classes.ts";
import type { Wearer } from "./hand-arms.ts";
import { armWriting, axisChoosing, axisWriting, kebab, onRoot, ownerRow } from "./hand-arms.ts";
import { loadUiSources } from "./source.ts";
import type { ComponentTables } from "./variant-tables.ts";
import { componentTables } from "./variant-tables.ts";

const VIEWPORT_VARIANT = "tw-viewport-variant";

/** The owner of a class no arm writes: the axis that chooses its family, else the row the tables name. */
function askedOwner(wearer: Wearer, token: string, siblings: readonly string[], components: ComponentTables): PropOwner | null {
  const fact = classifyToken(token);
  // A viewport variant has its own move to a container step first, so the family's axis is not yet what it asks for.
  if (fact?.kind === VIEWPORT_VARIANT) {
    return null;
  }
  const choosing = axisChoosing(components.get(wearer.door)?.get(wearer.component), token);
  if (choosing !== undefined) {
    return { axis: `${kebab(wearer.component)}.${choosing[0]}`, prop: choosing[0], arm: null };
  }
  const row = fact === null ? ownerRow(wearer, { token, guarded: false, siblings }, components) : null;
  return row === null || row.verdict === "keep" ? null : { axis: row.owner, prop: null, arm: null, reason: row.reason };
}

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
    return askedOwner({ door, component }, token, siblings, components);
  };
}
