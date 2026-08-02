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
import type { FillableIcon } from "@orb/ui/icons";
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
  /** A {@link FillableIcon} — the branded, gallery-checked subset — because `pressedFill` paints the glyph
   *  through the seal's own fill axis, which renders as a blob on a multi-path outline. Typing the prop is
   *  what makes that a compile error instead of an ugly pressed state. */
  readonly icon: FillableIcon;
  /** The pressed tone (e.g. `text-warning` for a star). Applies only while pressed. */
  readonly pressedClassName?: string;
  /** `when-on` (D11, the list default) = visible at rest only while pressed; `always` = never hidden;
   *  `never` = always reveal-gated, for a row that shows the PRESSED state elsewhere at rest (the chats
   *  row's title-line ★ marker, `ListRow.markers` + `ROW_REVEAL_SWAP`). D11's invariant — pressed state is
   *  visible at rest — is still met there, in the marker slot; this control is then purely the affordance,
   *  and reveal-gating it is what keeps the row from painting two stars at once. */
  readonly rest?: "always" | "never" | "when-on";
  /**
   * FILLS the glyph while pressed (through the seal's `fill="solid"` axis), so the pressed state carries a
   * SHAPE delta and not only a color one. WCAG 1.4.1: the preset list's activate control differed from its
   * rest state by stroke color alone (side-eye F-06). A filled disc vs a hollow ring is legible in
   * greyscale — and on the preset row it is the WHOLE state readout (owner ruling O-1, 2026-08-02: the
   * separate "Active" text badge is gone, so this control is both the state and the affordance).
   */
  readonly pressedFill?: boolean;
  /**
   * ONE-OF-N semantics: `radio` renders `role="radio"` + `aria-checked` instead of `aria-pressed`, for a
   * control that can only ever be SET (activating another row is the only way to unset this one, so a
   * toggle's "press to release" contract is a promise it refuses to keep — side-eye F-19 / ARIA rec 3).
   * The caller owns the `role="radiogroup"` container. @defaultValue "toggle"
   */
  readonly semantics?: "toggle" | "radio";
}

/** One row state-toggle: a ghost icon button that IS the marker (`aria-pressed`/`aria-checked` carries the
 *  datum). */
export function RowToggleAction({
  pressed,
  onToggle,
  labelOn,
  labelOff,
  icon,
  pressedClassName,
  pressedFill = false,
  semantics = "toggle",
  rest = "when-on",
}: RowToggleActionProps): ReactElement {
  const revealed = rest === "never" || (rest === "when-on" && !pressed);
  const radio = semantics === "radio";
  return (
    <Button
      aria-checked={radio ? pressed : undefined}
      aria-label={pressed ? labelOn : labelOff}
      aria-pressed={radio ? undefined : pressed}
      className={cn(revealed && ROW_REVEAL, pressed && pressedClassName) ?? ""}
      intent="ghost"
      onClick={onToggle}
      role={radio ? "radio" : undefined}
      size="icon"
      type="button"
    >
      <Icon fill={pressed && pressedFill ? "solid" : "none"} icon={icon} size="sm" />
    </Button>
  );
}
