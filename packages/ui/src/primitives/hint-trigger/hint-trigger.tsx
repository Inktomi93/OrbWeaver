import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { Button } from "#primitives/button";
import { Icon, Info } from "#primitives/icons";
import { Popover, PopoverPopup, PopoverTrigger } from "#primitives/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "#primitives/tooltip";
import { hintTriggerVariants } from "./variants.ts";

export interface HintTriggerProps {
  /** The hint's content — shown in the tooltip (hover/focus) AND in the press-opened popover. */
  readonly hint: ReactNode;
  /** The row's label/heading — used ONLY to derive the trigger's accessible name ("More info about
   *  X") when it's a non-empty string, so two hinted rows on one surface don't share one name.
   *  Anything else (a ReactNode label, an empty string) falls back to the bare "More info". */
  readonly subject?: ReactNode;
  /** Applied to the trigger button — each caller supplies its own `hintTrigger()` variant slot. */
  readonly className: string;
  /** `"inline"` costs no vertical space at a fine pointer (field.tsx's original rationale — a full
   *  control-size box made a hinted label row taller than an unhinted sibling); coarse pointers promote
   *  the real button box to the touch floor. `"icon"` is a full control-size box.
   *  @defaultValue "inline" */
  readonly size?: "inline" | "icon";
  /** An OPTIONAL activation that REPLACES the built-in popover door (the config teacher's `i` opens the
   *  context pane). A caller that supplies one already owns a richer
   *  disclosure than this atom's own popup, so the two must not both answer the same press. */
  readonly onClick?: () => void;
}

/** The hint-tooltip anatomy shared by `<Field>`'s label hint and `<Section>`'s heading hint (§16,
 *  2026-08-09 report card — was duplicated verbatim in both): an info-icon ghost button that discloses
 *  its hint.
 *
 *  THE PRESS IS A REAL DOOR, NOT AN OPTIONAL ONE (#2443, side-eye 2026-09-19). Base UI 1.7.0 builds the
 *  tooltip's hover interaction with `mouseOnly: true` (`tooltip/trigger/TooltipTrigger.js:147`) and its
 *  focus fallback returns early unless the trigger matches `:focus-visible`
 *  (`floating-ui-react/hooks/useFocus.js:104`) — a tap produces neither, so at 92 `hint=` call sites this
 *  was a correctly-sized 55x55 button that did nothing on a phone, and a mouse CLICK delivered nothing
 *  either. The hint therefore ALSO lives in a Popover opened by press at EVERY pointer (Base UI's own
 *  recommended substitute for a touch-reachable tooltip): hover/`:focus-visible` still open the tooltip on
 *  a fine pointer, and the tooltip's `closeOnClick` default dismisses it as the popover opens, so the two
 *  surfaces never stack. The `onClick` escape hatch takes the press instead, because its caller's own pane
 *  is the richer disclosure.
 *
 *  AND THE HINT IS A DESCRIPTION AT REST — owned by the TOOLTIP SEAL since #2455, not by this atom. #2443
 *  fixed the dangling `aria-describedby` here with a second, always-resolving `sr-only` id of its own,
 *  because the seal's id named a popup that is unmounted while closed. The seal now renders that node
 *  itself for every `<Tooltip>` in the app, so this component's private copy is gone: keeping it would put
 *  the same sentence in the trigger's description list TWICE.
 *
 *  MUST be rendered as a SIBLING of the label/heading it annotates, never a descendant — nesting it
 *  inside would leak "More info" into the labeled element's accessible name via the W3C accname
 *  subtree-concatenation algorithm (both call sites' own layout enforces this; this component only owns
 *  the trigger+popup atom, not its position). The seal's `sr-only` description is `position:absolute`, so
 *  it is not a flex item and costs the label row no gap. */
export function HintTrigger({ hint, subject, className, size = "inline", onClick }: HintTriggerProps): ReactElement {
  const slots = hintTriggerVariants();
  let ariaLabel = "More info";
  if (typeof subject === "string" && subject.trim().length > 0) {
    const subjectString: string = subject;
    ariaLabel = `More info about ${subjectString}`;
  }
  const button = (
    <Button
      aria-label={ariaLabel}
      className={cn(slots.trigger(), className) ?? ""}
      data-slot="hint-trigger"
      intent="ghost"
      {...(onClick === undefined ? {} : { onClick })}
      size={size}
      type="button"
    >
      <Icon icon={Info} size="xs" />
    </Button>
  );
  if (onClick !== undefined) {
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipPopup side="top">{hint}</TooltipPopup>
      </Tooltip>
    );
  }
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger render={<PopoverTrigger render={button} />} />
        <TooltipPopup side="top">{hint}</TooltipPopup>
      </Tooltip>
      {/* The popup is a `role="dialog"` with no visible title (its whole body IS the hint), so it takes the
          trigger's own derived name rather than announcing as a nameless dialog. */}
      <PopoverPopup aria-label={ariaLabel} data-slot="hint-popup" side="top">
        {hint}
      </PopoverPopup>
    </Popover>
  );
}
