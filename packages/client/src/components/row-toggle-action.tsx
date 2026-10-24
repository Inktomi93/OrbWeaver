// RowToggleAction — the client-shared row STATE TOGGLE (D12). The one
// element that is BOTH the marker and the affordance: a real pressable carrying `aria-pressed`, so the row
// never renders a passive glyph beside a separate control that sets it.
//
// Rest posture (owner ruling D11 — unified across every list): PRESSED is always visible (it carries state
// the eye scans for); UNPRESSED rides `ROW_REVEAL` (rest hidden, revealed on the row's hover/`focus-within`,
// always-on for coarse pointers, where hover does not exist). `rest="always"` keeps a toggle visible in both
// states for a surface that is not a hover-revealing row.
//
// The control box is `size="icon"` = `size-(--size-control-md)` — 36px fine / 48px coarse BY TOKEN CONSTRUCTION
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
  /** The accessible name, constant across states ("Star The Crimson Court"); `aria-pressed`/`aria-checked`
   *  carries on/off, so a name that also flipped would announce the state twice. */
  readonly label: string;
  /** The pressed tone (e.g. `text-warning` for a star). Applies only while pressed. */
  readonly pressedClassName?: string;
  /** `when-on` (D11, the list default) = visible at rest only while pressed; `always` = never hidden;
   *  `never` = always reveal-gated, for a row that shows the PRESSED state elsewhere at rest (the chats
   *  row's title-line ★ marker, `ListRow.markers` + `ROW_REVEAL_SWAP_COARSE_KEEP`). D11's invariant — pressed state is
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

// Non-filling toggles accept any sealed icon without claiming fill support.
interface RowToggleActionProps extends RowToggleActionBaseProps {
  readonly icon: LucideIcon;
  readonly pressedFill?: false;
}

// Filled toggles require the branded icon subset so multi-path outlines cannot become solid blobs.
interface RowToggleActionFillProps extends RowToggleActionBaseProps {
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
  const { pressed, onToggle, label, pressedClassName, semantics = "toggle", rest = "when-on" } = props;
  const revealed = rest === "never" || (rest === "when-on" && !pressed);
  const radio = semantics === "radio";
  return (
    <Button
      aria-checked={radio ? pressed : undefined}
      aria-label={label}
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
