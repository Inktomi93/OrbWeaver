// CommandChip — the topbar's ⌘K affordance (chip + "jump" label + divider), extracted from app-shell
// when that file crossed the component-size cap. Desktop-shaped by ruling (see the doc comment below);
// the You sheet carries the same command modal on a phone.
//
// IT IS NOW THE TRAIL'S MODAL PRESENTATION, not a sibling of the trail (#1789): `topbar-trail.tsx` renders
// it for a `topbar.trail` chrome entry whose behavior is `modal`, so the chip's PRESENCE and its POSITION
// are the registry's answers. Both props it used to need died with the lookup that fed them — the modal id
// is the entry's, and the desktop-only `show` is the entry's own `mobile: "sheet"` curation, applied by the
// zone's one filter instead of a second viewport read here.

import { Button } from "@orb/ui/button";
import { Kbd } from "@orb/ui/kbd";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactNode } from "react";
import type { ModalSlotId } from "#state";
import { openModal } from "#state";

/** The ⌘K chip — DESKTOP-SHAPED (side-eye P1's budget): a phone has no ⌘K key, and at 320px this chip plus
 *  its divider was ~60px of a row that had none to give. Nothing is lost: the You sheet carries the same
 *  command modal as a named row (you-sheet.tsx), which is where every other overflow affordance lives. */
export function CommandChip({ modalId }: { readonly modalId: ModalSlotId }): ReactNode {
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              intent="secondary"
              size="sm"
              // The DURABLE focus return for this modal (#890). ModalHost reads it when a keyboard-opened
              // palette captured nobody, which is what replaced the old pre-focus race (modal-host.tsx).
              data-modal-trigger={modalId}
              // WCAG 2.5.3 Label in Name (UI-Primitives-and-Reuse §13.10): the button READS "⌘K jump", so
              // "jump" must be in the name — "Command menu" alone made the one word on the button
              // unspeakable. Both vocabularies are carried, so `getByRole("button", { name: /command
              // menu/ })` still resolves it.
              //
              // THE VISIBLE TEXT IS NOW THE NAME'S PREFIX, VERBATIM (axe `label-content-name-mismatch`,
              // Lighthouse 2026-08-18). "Jump to… — the command menu" carried the WORD but not the STRING:
              // 2.5.3 is satisfied only when the whole visible label is contained in the name, and this
              // button's visible label is the chip AND the word ("⌘K jump"). A voice-control user reading
              // the chip out loud gets a match either way now, and the trailing clause still says what
              // activating it does.
              aria-label="⌘K jump — the command menu"
              onClick={(): void => openModal(modalId)}
            >
              <Kbd>⌘K</Kbd>
              {/* THE SEPARATING TEXT NODE (side-eye rail-home P3-3, 2026-08-22) — and it is not cosmetic.
                  axe's `label-content-name-mismatch` reads the VISIBLE LABEL by concatenating the button's
                  own text nodes, which is `textContent`, not `innerText`: with the chip and the word as two
                  adjacent ELEMENTS and no text node between them, that concatenation was the literal string
                  "⌘Kjump" (measured on the live landing), which is not a substring of the name "⌘K jump —
                  the command menu" — so WCAG 2.5.3 failed in letter on both the desktop and the mobile
                  Lighthouse run while the aria-label looked right. The ruling above (the name must CONTAIN
                  the rendered string) survives untouched; what changed is that the rendered string now has
                  the space the name always claimed it had.
                  It costs NOTHING in layout: a whitespace-only anonymous child of a flex container is not
                  rendered as a flex item, so the chip-to-word distance is still the Button's own `gap`.
                  The prior CT read this through `innerText`, which inserts a line break between two flex
                  items and therefore normalised to "⌘K jump" whichever way the DOM was built — it passed for
                  the wrong reason. Its replacement reads `textContent`, the way axe does. */}{" "}
              {/* THE LABEL STEP, not micro (side-eye rail sweep P3-13, 2026-08-17). This word is the only
                  prose on a CONTROL, and it rendered at 10.5px — under the 11px functional floor a control
                  label owes, on the topbar affordance a first-time visitor is most likely to squint at. The
                  `label` voice IS that step; the muted ink is a className because `tone` is declared BEFORE
                  `voice` and loses the merge (the voice grammar's own ordering law). It also drops two A3
                  findings from this file — `size`/`tone` at a feature call site are exactly what the voice
                  API exists to replace. */}
              <Text as="span" className="shell-topbar-jump-label text-muted-foreground" voice="label">
                jump
              </Text>
            </Button>
          }
        />
        <TooltipPopup side="bottom">Jump to…</TooltipPopup>
      </Tooltip>
      <div className="shell-topbar-divider" aria-hidden="true" />
    </>
  );
}
