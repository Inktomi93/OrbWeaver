// The markdown seal's element maps, plugins and root classes, shared by the transcript renderer (`markdown.tsx`)
// and the frame-document render (`frame-markdown.tsx`) so a framed reply draws the same elements in the same
// classes the transcript does.

import type { StreamdownProps } from "streamdown";
import { cn } from "#lib";
import { MARKDOWN_BLOCKQUOTE_COMPONENTS } from "./blockquote-component.tsx";
import { DIALOGUE_COMPONENTS } from "./dialogue-paragraph.tsx";
import { DICE_COMPONENTS, remarkInlineDice } from "./dice-inline.tsx";
import { MARKDOWN_INLINE_CODE_COMPONENTS } from "./inline-code-component.tsx";
import { MARKDOWN_LIST_COMPONENTS } from "./list-components.tsx";
import { MARKDOWN_REMARK_PLUGINS } from "./policy.ts";
import { MARKDOWN_RULE_COMPONENTS } from "./rule-component.tsx";

// The two stable `components` maps. Both are module-level constants because Streamdown's Block memo
// reference-compares the map key by key — a per-render object would re-render every settled block.
// The seal OWNS six elements: the three list elements (#1085), the thematic break (H19, `rule-component.tsx`),
// the blockquote (`blockquote-component.tsx`) and inline code (`inline-code-component.tsx`) — each a vendor `jsx`
// call with an uncompiled class string, which is the test #1085 set for taking an element over rather than
// out-painting it.
const SEAL_COMPONENTS: NonNullable<StreamdownProps["components"]> = {
  ...MARKDOWN_LIST_COMPONENTS,
  ...MARKDOWN_RULE_COMPONENTS,
  ...MARKDOWN_BLOCKQUOTE_COMPONENTS,
  ...MARKDOWN_INLINE_CODE_COMPONENTS,
};
const SEAL_COMPONENTS_WITH_DIALOGUE: NonNullable<StreamdownProps["components"]> = { ...SEAL_COMPONENTS, ...DIALOGUE_COMPONENTS };
const DICE_SEAL_COMPONENTS = { ...SEAL_COMPONENTS, ...DICE_COMPONENTS };
const DICE_SEAL_COMPONENTS_WITH_DIALOGUE = { ...SEAL_COMPONENTS_WITH_DIALOGUE, ...DICE_COMPONENTS };

/** The remark plugins with the chat-only inline dice stamp grammar added. */
export const DICE_REMARK_PLUGINS: NonNullable<StreamdownProps["remarkPlugins"]> = [...MARKDOWN_REMARK_PLUGINS, remarkInlineDice];

/** The seal's element map for the two chat switches. */
export function sealComponents(inlineDice: boolean, colorQuotes: boolean): NonNullable<StreamdownProps["components"]> {
  if (inlineDice) {
    return colorQuotes ? DICE_SEAL_COMPONENTS_WITH_DIALOGUE : DICE_SEAL_COMPONENTS;
  }
  return colorQuotes ? SEAL_COMPONENTS_WITH_DIALOGUE : SEAL_COMPONENTS;
}

/** The seal's root classes over a caller's own. */
export function markdownRootClass(className?: string): string {
  return (
    cn(
      "space-y-0 wrap-break-word whitespace-normal [&_em]:text-narration [&>*:first-child]:mbs-0 [&>*:last-child]:mbe-0",
      // The thematic break's SEPARATION (H19). The element itself is ours now (`rule-component.tsx`
      // owns its ink), but the gap is spelled HERE, as a descendant variant: the root's own `space-y-0`
      // trim governs a direct child's block margins, and a rule is the one owned element whose
      // separation cannot be padding (preflight draws the line
      // as its border-top, so padding puts the whole gap on one side of it). House token, never the
      // vendor's `my-6`.
      "[&_hr]:my-row",
      // inline code INSIDE prose — the line's box is the surrounding paragraph's strut (a smaller inline box never grows an integer line), so pairing a leading here would be inert. Ends if this selector stops targeting inline (non-pre) code.
      "[&_:not(pre)>code]:p-tight [&_:not(pre)>code]:text-code",
      className,
    ) ?? ""
  );
}
