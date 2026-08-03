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
import type { FillableIcon, LucideIcon } from "@orb/ui/icons";
import { Icon } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { ROW_REVEAL } from "./row-reveal.ts";

interface RowToggleActionBaseProps {
  readonly pressed: boolean;
  readonly onToggle: () => void;
  /** The accessible name while PRESSED — names the UN-set ("Unstar The Crimson Court"). */
  readonly labelOn: string;
  /** The accessible name while unpressed — names the set ("Star The Crimson Court"). */
  readonly labelOff: string;
  /** The pressed tone (e.g. `text-warning` for a star). Applies only while pressed. */
  readonly pressedClassName?: string;
  /** `when-on` (D11, the list default) = visible at rest only while pressed; `always` = never hidden;
   *  `never` = always reveal-gated, for a row that shows the PRESSED state elsewhere at rest (the chats
   *  row's title-line ★ marker, `ListRow.markers` + `ROW_REVEAL_SWAP`). D11's invariant — pressed state is
   *  visible at rest — is still met there, in the marker slot; this control is then purely the affordance,
   *  and reveal-gating it is what keeps the row from painting two stars at once. */
  readonly rest?: "always" | "never" | "when-on";
  /**
   * ONE-OF-N semantics: `radio` renders `role="radio"` + `aria-checked` instead of `aria-pressed`, for a
   * control that can only ever be SET (activating another row is the only way to unset this one, so a
   * toggle's "press to release" contract is a promise it refuses to keep — side-eye F-19 / ARIA rec 3).
   * The caller owns the `role="radiogroup"` container. @defaultValue "toggle"
   */
  readonly semantics?: "toggle" | "radio";
}

/**
 * The NON-FILLING arm — any sealed glyph, the mirror of `IconProps`' own two-armed shape one level down.
 *
 * Minted for databank's `Everywhere` toggle (§6.1): `Globe` is a multi-path outline, so it is deliberately
 * NOT in the fillable seal — and demanding a `FillableIcon` on a toggle that never fills would have forced
 * either the wrong glyph or a wrong seal entry. The pressed state is still a non-color delta here: at
 * `rest:"when-on"` an unpressed toggle does not render at all, so what changes at rest is PRESENCE, not hue.
 */
export interface RowToggleActionProps extends RowToggleActionBaseProps {
  readonly icon: LucideIcon;
  readonly pressedFill?: false;
}

/**
 * The FILLING arm — `pressedFill` paints the glyph through the seal's `fill="solid"` axis while pressed, so
 * the pressed state carries a SHAPE delta and not only a color one. WCAG 1.4.1: the preset list's activate
 * control differed from its rest state by stroke color alone (side-eye F-06); a filled disc vs a hollow ring
 * is legible in greyscale, and on the preset row it is the WHOLE state readout (owner ruling O-1).
 *
 * It requires a {@link FillableIcon} — the branded, gallery-checked subset — because a fill renders as an
 * unreadable blob on a multi-path outline. TYPING that is what makes the mistake a compile error instead of
 * an ugly pressed state, which is the entire reason the brand exists.
 */
export interface RowToggleActionFillProps extends RowToggleActionBaseProps {
  readonly icon: FillableIcon;
  readonly pressedFill: true;
}

/** Either arm — declared inline at the two consumption points (a component parameter and the glyph's), so
 *  the union needs no exported alias of its own. */
type RowToggleFillArm = RowToggleActionProps | RowToggleActionFillProps;

/** The glyph, dispatched on the FILL ARM — narrowing the whole props object (not a destructured `icon`) is
 *  what keeps `fill` typed against a `FillableIcon` with no cast: the non-filling arm never spells `fill`. */
function RowToggleGlyph(props: RowToggleFillArm): ReactElement {
  if (props.pressedFill === true) {
    return <Icon fill={props.pressed ? "solid" : "none"} icon={props.icon} size="sm" />;
  }
  return <Icon icon={props.icon} size="sm" />;
}

/** One row state-toggle: a ghost icon button that IS the marker (`aria-pressed`/`aria-checked` carries the
 *  datum). */
export function RowToggleAction(props: RowToggleFillArm): ReactElement {
  const { pressed, onToggle, labelOn, labelOff, pressedClassName, semantics = "toggle", rest = "when-on" } = props;
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
      <RowToggleGlyph {...props} />
    </Button>
  );
}
