// CommandChip — the topbar's ⌘K affordance: an icon-only trail button like its neighbours, then the divider
// that splits the trail into the palette and the widget cluster. It is the trail's MODAL presentation
// (`topbar-trail.tsx`); the You sheet carries the same command modal as a row on a phone.

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon } from "@orb/ui/icons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactNode } from "react";
import type { ModalSlotId } from "#state";
import { openModal } from "#state";
import { commandShortcutLabel } from "../lib/command-shortcut-label.ts";

interface CommandChipProps {
  readonly modalId: ModalSlotId;
  /** The trigger's own label and glyph (`ModalDefinition.trigger`), carried by the chrome entry. */
  readonly label: string;
  readonly icon: LucideIcon;
}

/** Topbar buttons carry no text (owner ruling): the shortcut lives in the accessible name and the tooltip,
 *  both spelled from `commandShortcutLabel`, the platform's key hint for the accelerator. */
export function CommandChip({ modalId, label, icon }: CommandChipProps): ReactNode {
  const shortcut = commandShortcutLabel(navigator.userAgent);
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              intent="ghost"
              size="icon"
              className="shell-topbar-icon-btn"
              // The DURABLE focus return for this modal: ModalHost reads it when a keyboard-opened palette
              // captured nobody (modal-host.tsx).
              data-modal-trigger={modalId}
              aria-label={`Jump — the command menu (${shortcut})`}
              onClick={(): void => openModal(modalId)}
            >
              <Icon icon={icon} size="sm" />
            </Button>
          }
        />
        <TooltipPopup side="bottom">{`${label} ${shortcut}`}</TooltipPopup>
      </Tooltip>
      <div className="shell-topbar-divider" aria-hidden="true" />
    </>
  );
}
