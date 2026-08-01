// RowToggleAction — the client-shared row STATE TOGGLE (list-pane-projection §11.2/§12, D12). The one
// element that is BOTH the marker and the affordance: a real pressable carrying `aria-pressed`, so the row
// never renders a passive glyph beside a separate control that sets it.
//
// Rest posture (owner ruling D11 — unified across every list): PRESSED is always visible (it carries state
// the eye scans for); UNPRESSED rides `ROW_REVEAL` (rest hidden, revealed on the row's hover/`focus-within`,
// always-on for coarse pointers, where hover does not exist). `rest="always"` keeps a toggle visible in both
// states for a surface that is not a hover-revealing row.
//
// The control box is `size="icon"` = `size-control-md` — 34px fine / 48px coarse BY TOKEN CONSTRUCTION
// (D62 P1), so the per-pointer touch floor needs no hand math here.
//
// Requires the row root to carry `group` (that is what `ROW_REVEAL` keys on). Two features render this
// anatomy (the character card's star, the chats row's star), which is the R2 bar for a tier-2 composite.

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { ROW_REVEAL } from "./row-reveal";

export interface RowToggleActionProps {
  readonly pressed: boolean;
  readonly onToggle: () => void;
  /** The accessible name while PRESSED — names the UN-set ("Unstar The Crimson Court"). */
  readonly labelOn: string;
  /** The accessible name while unpressed — names the set ("Star The Crimson Court"). */
  readonly labelOff: string;
  readonly icon: LucideIcon;
  /** The pressed tone (e.g. `text-warning` for a star). Applies only while pressed. */
  readonly pressedClassName?: string;
  /** `when-on` (D11, the list default) = visible at rest only while pressed; `always` = never hidden. */
  readonly rest?: "always" | "when-on";
}

/** One row state-toggle: a ghost icon button that IS the marker (`aria-pressed` carries the datum). */
export function RowToggleAction({ pressed, onToggle, labelOn, labelOff, icon, pressedClassName, rest = "when-on" }: RowToggleActionProps): ReactElement {
  const revealed = rest === "when-on" && !pressed;
  return (
    <Button
      aria-label={pressed ? labelOn : labelOff}
      aria-pressed={pressed}
      className={cn(revealed && ROW_REVEAL, pressed && pressedClassName) ?? ""}
      intent="ghost"
      onClick={onToggle}
      size="icon"
      type="button"
    >
      <Icon icon={icon} size="sm" />
    </Button>
  );
}
