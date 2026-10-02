import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterPicker } from "#components";
import { useOpenRefinery } from "#data";

/**
 * The START DOOR, as one anatomy for the two chromes this file draws: the chrome band's `+` glyph and the
 * empty state's worded CTA. Both are an anchored Popover around the shared `CharacterPicker` firing the
 * shared `useOpenRefinery` flow — the ONE resume-or-mint rule behind all three of the product's doors
 * (#157) — so the only thing a caller supplies is the control the user actually sees.
 *
 * IT EXISTS BECAUSE THE EMPTY STATE'S CTA WAS DEAD (side-eye 2026-08-19 P1-1). "Pick a character" called
 * `clearRefinerySelection()` — in the arm where it renders, no selection can exist, so the press was an
 * unconditional no-op and the shell was byte-identical before and after it. That is the SAME defect the
 * owner ruled on for the `+` (#157, recorded 60 lines below: "the primary action must not be a visible dead
 * control while the real affordance hides below the fold") — the fix landed on the `+` and left its twin
 * standing in the same file. On a phone it was worse than a no-op: the list IS the screen there, the
 * copy pointed at a "main pane" the viewport does not have, and the only working door was a 24px glyph in
 * the worst thumb corner. One door, two chromes, no dead arm.
 *
 * …EXCEPT THE EMPTY STATE'S CTA IS NOT THIS DOOR ON A DESKTOP LANDING (#307, the #284 duplicate-door's last
 * mouth). With nothing selected on a desktop, CONTENT already mounts the full-library landing picker, so a
 * SECOND anchored one over it is two identical 100-row pickers on one plane. There the CTA is a plain button
 * that FOCUSES the mounted picker (`requestRefineryLandingFocus`) rather than a `StartSessionDoor` — the
 * P1-1 ruling ("the CTA must be a live door") survives, its input changed. This door still draws the `+`
 * glyph in every regime and the worded CTA on a PHONE (where CONTENT is not rendered) and with a session
 * open (where CONTENT shows the pipeline) — the arms where it is genuinely the only picker on screen.
 */
export function StartSessionDoor({ trigger }: { readonly trigger: (busy: boolean) => ReactElement }): ReactElement {
  const { openRefinery, isPending } = useOpenRefinery();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <Popover modal={true} onOpenChange={setPickerOpen} open={pickerOpen}>
      {/* `modal` — this popover carries INPUT; the rule + its receipt live on `Popover` in @orb/ui's popover.tsx (#2444). */}
      {/* The trigger is a FUNCTION of the in-flight state, not a fixed element: a start is a real await
          (the flow resolves resume-vs-mint against the list at CLICK time), and the control the user
          pressed is the honest place to say so — which only the caller's own chrome can spell. */}
      <PopoverTrigger render={trigger(isPending)} />
      <PopoverPopup>
        <CharacterPicker
          autoFocusSearch={true}
          emptyText="No characters match."
          label="Start a refinery session"
          onEscape={(): void => setPickerOpen(false)}
          onSelect={(id): void => {
            setPickerOpen(false);
            // @orb-waive caught-failure-ownership(openRefinery): useOpenRefinery's own errorToast
            // surfaces the failure. Ends if useOpenRefinery drops its errorToast.
            void openRefinery(id).catch(() => undefined);
          }}
          placeholder="Search characters…"
          reserveKey="refinery.startSessionPicker"
        />
      </PopoverPopup>
    </Popover>
  );
}
