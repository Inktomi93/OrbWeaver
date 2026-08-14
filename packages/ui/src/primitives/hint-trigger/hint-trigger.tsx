import type { ReactElement, ReactNode } from "react";
import { Button } from "#primitives/button";
import { Icon, Info } from "#primitives/icons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "#primitives/tooltip";

export interface HintTriggerProps {
  /** The tooltip's content. */
  readonly hint: ReactNode;
  /** The row's label/heading — used ONLY to derive the trigger's accessible name ("More info about
   *  X") when it's a non-empty string, so two hinted rows on one surface don't share one name.
   *  Anything else (a ReactNode label, an empty string) falls back to the bare "More info". */
  readonly subject?: ReactNode;
  /** Applied to the trigger button — each caller supplies its own `hintTrigger()` variant slot. */
  readonly className: string;
  /** `"inline"` costs no vertical space (field.tsx's original rationale — a full control-size box
   *  made a hinted label row taller than an unhinted sibling); `"icon"` is a full control-size box.
   *  @defaultValue "inline" */
  readonly size?: "inline" | "icon";
}

/** The hint-tooltip anatomy shared by `<Field>`'s label hint and `<Section>`'s heading hint (§16,
 *  2026-08-09 report card — was duplicated verbatim in both): an info-icon ghost button that opens a
 *  Tooltip on hover/focus. MUST be rendered as a SIBLING of the label/heading it annotates, never a
 *  descendant — nesting it inside would leak "More info" into the labeled element's accessible name
 *  via the W3C accname subtree-concatenation algorithm (both call sites' own layout enforces this;
 *  this component only owns the trigger+popup atom, not its position). */
export function HintTrigger({ hint, subject, className, size = "inline" }: HintTriggerProps): ReactElement {
  let ariaLabel = "More info";
  if (typeof subject === "string" && subject.trim().length > 0) {
    const subjectString: string = subject;
    ariaLabel = `More info about ${subjectString}`;
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label={ariaLabel} className={className} intent="ghost" size={size} type="button">
            <Icon icon={Info} size="xs" />
          </Button>
        }
      />
      <TooltipPopup side="top">{hint}</TooltipPopup>
    </Tooltip>
  );
}
