import type { ComponentProps, ReactElement, ReactNode } from "react";
import { useState } from "react";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the icons subpath; tsc + vite resolve Eye/EyeOff/Icon/Lock fine.
import { Eye, EyeOff, Icon, Lock } from "#primitives/icons";
import { revealGateVariants } from "./variants";

export interface RevealGateProps extends Omit<ComponentProps<"div">, "children"> {
  /** The reveal trigger's label. Default `"Reveal"`. */
  label?: string;
  /**
   * The gated content. NOT rendered until revealed — a CSS-hidden secret is still present in the
   * DOM (readable via devtools or a screen reader), which defeats the shared-screen privacy
   * contract this primitive exists for. So this is conditionally MOUNTED, never `hidden`/
   * `display:none` (ui-package-design work-order #17, dictated decision).
   */
  children: ReactNode;
  /** Controlled reveal state. Omit to run uncontrolled off `defaultRevealed`. */
  revealed?: boolean;
  /** Uncontrolled initial reveal state. Default `false` (hidden). */
  defaultRevealed?: boolean;
  /** Fires on every reveal/hide toggle, controlled or uncontrolled. */
  onReveal?: (revealed: boolean) => void;
  /** Render a "Hide" trigger once revealed that unmounts the children again. Default `true`. */
  hideable?: boolean;
}

/**
 * RevealGate — a shared-screen PRIVACY primitive: content stays entirely unmounted until an
 * explicit Reveal click, then (optionally) can be re-hidden. This is NOT a disclosure/density
 * control (`@orb/ui/collapsible` is that job) — the point is that a CSS-hidden secret is still
 * present in the DOM, so pre-reveal the children are conditionally mounted behind a neutral masked
 * placeholder, never CSS-hidden.
 *
 * Usage: `<RevealGate label="API key">{secretValue}</RevealGate>` — controlled via
 * `revealed`/`onReveal`, uncontrolled via `defaultRevealed`.
 */
export function RevealGate({
  className,
  label = "Reveal",
  children,
  revealed: controlledRevealed,
  defaultRevealed = false,
  onReveal,
  hideable = true,
  ...rest
}: RevealGateProps): ReactElement {
  const [uncontrolledRevealed, setUncontrolledRevealed] = useState(defaultRevealed);
  const isControlled = controlledRevealed !== undefined;
  const revealed = isControlled ? controlledRevealed : uncontrolledRevealed;
  const slots = revealGateVariants();

  function setRevealed(next: boolean): void {
    if (!isControlled) {
      setUncontrolledRevealed(next);
    }
    onReveal?.(next);
  }

  return (
    <div className={slots.root({ className })} data-slot="reveal-gate" {...rest}>
      {revealed ? (
        <div className={slots.content()} data-slot="reveal-gate-content">
          {children}
          {hideable ? (
            <button
              className={slots.hideTrigger()}
              data-slot="reveal-gate-hide"
              onClick={(): void => setRevealed(false)}
              type="button"
            >
              <Icon icon={EyeOff} size="sm" />
              Hide
            </button>
          ) : null}
        </div>
      ) : (
        <div className={slots.placeholder()} data-slot="reveal-gate-placeholder">
          <Icon icon={Lock} size="sm" />
          <button
            className={slots.trigger()}
            data-slot="reveal-gate-trigger"
            onClick={(): void => setRevealed(true)}
            type="button"
          >
            <Icon icon={Eye} size="sm" />
            {label}
          </button>
        </div>
      )}
    </div>
  );
}
