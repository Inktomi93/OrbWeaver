// What stays a plain class on a primitive: the whole of what a feature className may hold, read by the lint and the census. Each carries no design value, so a
// prop for it would be the class under another name (ui-and-client.md, Moving hand-written styling). Placement is design: `PLACED` owns it.
import { baseOf } from "./classes.ts";

/** Each mechanism the rule admits, with the reason it needs no owner. */
export const PLAIN_LAYOUT = [
  { pattern: /^(?:min-inline-0|min-block-0|shrink-0|shrink|grow-0)$/u, why: "a flex child's permission to shrink: only the parent's content decides it" },
  { pattern: /^(?:not-)?sr-only$/u, why: "text kept for the accessibility tree: a state of the node, not a look" },
  {
    pattern: /^(?:relative|isolate|box-content)$/u,
    why: "a containing block, a stacking context or a box model for the box's own content: no placement of its own",
  },
  { pattern: /^(?:overflow|overscroll|contain|snap|resize)-/u, why: "what the box does with its overflow or its intrinsic size: a mechanism with no step" },
  {
    pattern: /^(?:col|row)-(?:span|start|auto)|^grid-(?:cols-subgrid|flow-)/u,
    why: "where a child falls in its parent's tracks, which the parent's template owns",
  },
  { pattern: /^group(?:\/[\w-]+)?$/u, why: "a name a descendant's variant reads: no paint of its own" },
  { pattern: /^(?:invisible|truncate|text-balance|text-pretty|align-middle)$/u, why: "how a run sets within the box it has: a mechanism with no step" },
  { pattern: /^shell-/u, why: "an owner-CSS hook, part of the public owner surface and no utility" },
] as const;

/** The rule the census prints above the classes it admits. */
export const PLAIN_LAYOUT_RULE =
  "A feature className on a primitive holds only these layout mechanisms, which carry no design value. Anything else gets an owner: the feature className lint refuses it.";

/** The token's class, under any variant, is a mechanism the rule admits. */
export const plainLayout = (token: string): boolean => {
  const { base } = baseOf(token);
  return PLAIN_LAYOUT.some(({ pattern }) => pattern.test(base));
};
