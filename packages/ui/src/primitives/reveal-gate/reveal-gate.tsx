import type { ComponentProps, ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
  /** Disables both the Reveal and Hide triggers — the gate cannot be toggled while true. */
  disabled?: boolean;
}

/**
 * RevealGate — a shared-screen PRIVACY primitive: content stays entirely unmounted until an
 * explicit Reveal click, then (optionally) can be re-hidden. This is NOT a disclosure/density
 * control (`@orb/ui/collapsible` is that job) — the point is that a CSS-hidden secret is still
 * present in the DOM, so pre-reveal the children are conditionally mounted behind a neutral masked
 * placeholder, never CSS-hidden.
 *
 * On reveal, focus moves INTO the revealed content — the Hide trigger when `hideable`, otherwise
 * the content wrapper itself (`tabIndex={-1}`) — so a keyboard/AT user isn't left focused on a
 * button that just unmounted out from under them. An `aria-live="polite"` sr-only region announces
 * every reveal/hide transition, and the currently-rendered trigger carries `aria-expanded`
 * (`false` on Reveal, `true` on Hide) since the two buttons are one logical disclosure control.
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
  disabled = false,
  ...rest
}: RevealGateProps): ReactElement {
  const [uncontrolledRevealed, setUncontrolledRevealed] = useState(defaultRevealed);
  const [announcement, setAnnouncement] = useState("");
  const isControlled = controlledRevealed !== undefined;
  const revealed = isControlled ? controlledRevealed : uncontrolledRevealed;
  const slots = revealGateVariants();
  const hideButtonRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  function setRevealed(next: boolean): void {
    if (!isControlled) {
      setUncontrolledRevealed(next);
    }
    setAnnouncement(next ? `${label} revealed` : `${label} hidden`);
    onReveal?.(next);
  }

  // Focus follows the reveal — never left stranded on the Reveal button after it unmounts.
  useEffect(() => {
    if (!revealed) {
      return;
    }
    (hideable ? hideButtonRef.current : contentRef.current)?.focus();
  }, [revealed, hideable]);

  return (
    <div className={slots.root({ className })} data-slot="reveal-gate" {...rest}>
      <span aria-live="polite" className={slots.srOnly()} data-slot="reveal-gate-announcement">
        {announcement}
      </span>
      {revealed ? (
        <div
          ref={contentRef}
          className={slots.content()}
          data-slot="reveal-gate-content"
          tabIndex={-1}
        >
          {children}
          {hideable ? (
            <button
              ref={hideButtonRef}
              aria-expanded={true}
              className={slots.hideTrigger()}
              data-slot="reveal-gate-hide"
              disabled={disabled}
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
            aria-expanded={false}
            className={slots.trigger()}
            data-slot="reveal-gate-trigger"
            disabled={disabled}
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
