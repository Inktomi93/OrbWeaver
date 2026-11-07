// What stays a plain class on a primitive: a class that states a layout mechanism and carries no design value, so a prop for it would be the class
// under another name (ui-and-client.md, Moving hand-written styling). A class that names a spacing step, a size token or a ramp is a design decision and gets an owner.
import { baseOf } from "./classes.ts";

/** Each mechanism the rule admits, with the reason it needs no owner. */
export const PLAIN_LAYOUT = [
  { pattern: /^(?:min-inline-0|min-block-0|shrink-0|shrink|grow-0)$/u, why: "a flex child's permission to shrink: only the parent's content decides it" },
  { pattern: /^(?:not-)?sr-only$/u, why: "text kept for the accessibility tree: a state of the node, not a look" },
  { pattern: /^(?:absolute|sticky|fixed|isolate|inset(?:-[a-z]+)?-0|box-content)$/u, why: "how the box takes part in flow: a mechanism with no step" },
  { pattern: /^(?:overflow|overscroll|contain|snap|resize)-/u, why: "what the box does with its overflow or its intrinsic size: a mechanism with no step" },
  {
    pattern: /^(?:col|row)-(?:span|start|auto)|^grid-(?:cols-subgrid|flow-)/u,
    why: "where a child falls in its parent's tracks, which the parent's template owns",
  },
  { pattern: /^group(?:\/[\w-]+)?$/u, why: "a name a descendant's variant reads: no paint of its own" },
  { pattern: /^(?:invisible|truncate|text-balance|text-pretty|align-middle)$/u, why: "how a run sets within the box it has: a mechanism with no step" },
  { pattern: /^shell-/u, why: "an owner-CSS hook, part of the public owner surface and no utility" },
  { pattern: /(?:^|-)0$/u, why: "a zero step is structure, not a design number" },
] as const;

/** The rule the census prints above the classes it admits. */
export const PLAIN_LAYOUT_RULE =
  "A plain class on a primitive states a layout mechanism and carries no design value. Any class that names a spacing step, a size token or a ramp gets an owner.";

/** The token's class, under any variant, is a mechanism the rule admits. */
export const plainLayout = (token: string): boolean => {
  const { base } = baseOf(token);
  return PLAIN_LAYOUT.some(({ pattern }) => pattern.test(base));
};
