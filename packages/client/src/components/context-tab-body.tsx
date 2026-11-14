// A tier 2 composite (`components/`): the one column a CONTEXT pane's body lays its content in (UI-Density-Law §3.1). It renders no
// Surface, so the density tier is the host's; the body owns its reads, its gone state and its boundary. Every body a CONTEXT registration
// declares draws it at its root on every branch it returns, with any boundary inside it, so its loading, failure and gone states take the
// inset its settled state does. The `context-tab` cohort of `pnpm ui-facts` lists each registered body with the kinds its branches draw,
// and a branch with any other root is hand-built, its defect.
//
// Two kinds leave the pane's scroll to the body, each for a proven reason. `fill` is a column sized to the pane, for a body that holds its own
// scroll area (the room's Members list, the character's Chats projection) or a chart that takes the pane's height (the Corpus map). `scroll`
// is the facet inspector's box, which sits above its boundary's height-measuring wrapper so the flex chain that bounds it survives the read.
// No registered body records a reason instead of a kind.

import { Stack } from "@orb/ui/layout";
import type { ComponentProps, ReactElement } from "react";

const CONTEXT_TAB_KINDS = ["sections", "blocks", "rows", "scroll", "fill"] as const;
type ContextTabKind = (typeof CONTEXT_TAB_KINDS)[number];

export interface ContextTabBodyProps extends Omit<ComponentProps<"div">, "className"> {
  /**
   * `sections`: titled sections at the section step, inset by the block step. `blocks`: untitled blocks (a paragraph, a control, a list) at
   * the block step, inset the same. `rows`: a tight run of rows or cards the host already insets. `scroll`: sections in a box that scrolls
   * itself. `fill`: a column sized to the pane's height for a body that scrolls itself or fills the pane, so it takes no inset of its own.
   * @defaultValue "sections"
   */
  readonly kind?: ContextTabKind;
}

type StackProps = Omit<ContextTabBodyProps, "kind">;

const BODY: Record<ContextTabKind, (stack: StackProps) => ReactElement> = {
  sections: (stack) => <Stack {...stack} gap="section" padding="block" />,
  blocks: (stack) => <Stack {...stack} gap="block" padding="block" />,
  rows: (stack) => <Stack {...stack} gap="tight" />,
  scroll: (stack) => <Stack {...stack} gap="section" padding="block" scroll="y" />,
  fill: (stack) => <Stack {...stack} gap="row" height="fill" minHeight="shrinks" />,
};

export function ContextTabBody({ kind = "sections", ...stack }: ContextTabBodyProps): ReactElement {
  return BODY[kind](stack);
}
