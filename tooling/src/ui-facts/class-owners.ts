// Which prop of an `@orb/ui` component writes a class, read from the component's own `tv()` tables: a new axis or arm owns its classes with no edit here.
import type { PropOwners } from "../eslint/index.ts";
import { armWriting, axisWriting, kebab } from "./hand-arms.ts";
import { orderRefusal } from "./move-proof.ts";
import { loadUiSources } from "./source.ts";
import { componentTables } from "./variant-tables.ts";

/** Build the lookup over the ui sources once; a lint run asks it for every class on every primitive. */
export function classOwners(root: string): PropOwners {
  const components = componentTables(root, loadUiSources(root));
  return (door, component, token, element) => {
    const recipe = components.get(door)?.get(component);
    const found = axisWriting(recipe, token);
    const written = found === undefined ? undefined : armWriting(found[1], token);
    // A slot-keyed arm lands on a part inside the component, so a className on the root never competes with it.
    if (recipe === undefined || found === undefined || written === undefined || (written[1].slots.length > 0 && !written[1].slots.includes("root"))) {
      return null;
    }
    const place = { plain: true, peers: element.peers, opaque: null, column: 0 };
    const ref = { source: `@orb/ui/${door}`, name: component, carried: false, place, props: element.props };
    return orderRefusal({ token, axis: found[0], arm: written[0] }, ref, recipe) === null
      ? { axis: `${kebab(component)}.${found[0]}`, prop: found[0], arm: written[0] }
      : null;
  };
}
