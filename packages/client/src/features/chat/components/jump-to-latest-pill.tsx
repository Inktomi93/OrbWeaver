// The "jump to latest" pill — a floating affordance the transcript shows ONLY while the reader has
// scrolled away from the tail AND ≥1 message has landed below since (message-list-surface.tsx owns
// that visibility + count logic; this is dumb chrome). It closes the visibility gap the scroll-guard
// fix opened: a scrolled-up reader is correctly NOT yanked, so they need a signal + a one-click return.
//
// PLACEMENT (owner-decided): a centered pill pinned to the BOTTOM of the transcript region, just above
// the composer — the same floating recipe the `selection-bar` primitive uses (`bottom` spacing +
// `z-(--z-overlay)` + `bg-popover`/`border`/`shadow-overlay`), anchored to the surface's own relative
// box, NOT `fixed` to the viewport. Compose-only: an outer `Row` positions it, an INNER `Row` carries
// the elevation (bg + border + `shadow-overlay`, house §11 floating-chrome law) + the motion — the
// shadow lives on the plain Row, NOT the Button, because Base UI Button's ring utilities own
// `box-shadow` and eat it. The `@orb/ui` `Button` inside is the real, focusable control (a transparent
// ghost) — never a div-with-onClick.
//
// MOTION: a subtle fade + rise between the hidden and shown states (`opacity`/`translate`, compositor-
// only) at `--motion-base`/`ease-out-expo`, no bounce. It is a class-state toggle (not a mount flip),
// so the globals.css reduced-motion floor zeroes its `transition-duration` automatically — REMOVED,
// not shortened, under reduced motion, with no JS hook.
//
// A11Y: a real `<button>` (the `Button` primitive) with an `aria-label` naming the action + count; it
// is Tab-reachable and Enter/Space-activatable while shown, and fully inert (`tabIndex=-1`,
// `aria-hidden`, `pointer-events-none`) while hidden so it never becomes a phantom tab-stop.

import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve ChevronDown/Icon fine (same as selection-bar.tsx).
import { ChevronDown, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

export interface JumpToLatestPillProps {
  /** New messages that landed below the fold since the reader scrolled away (≥1 when shown). */
  readonly count: number;
  /** Show the pill — the surface computes `!following && count > 0`; hidden keeps it inert. */
  readonly visible: boolean;
  /** Scroll to the tail (the seal's `scrollToEnd`, which also re-enables follow). */
  readonly onJump: () => void;
}

/** The floating "↓ N new messages · jump to latest" pill. */
export function JumpToLatestPill({ count, visible, onJump }: JumpToLatestPillProps): ReactElement {
  // Hold the last non-zero count so the fade-OUT never flashes "0 new messages" as it disappears
  // (on hide the surface's count resets to 0 a frame before the exit transition finishes). The
  // setState-during-render pattern (React "adjusting state on prop change"; the new-arrivals.ts
  // precedent) — compiler-clean, no refs-during-render.
  const [held, setHeld] = useState(count);
  if (count > 0 && count !== held) {
    setHeld(count);
  }
  const label = held === 1 ? "1 new message" : `${held} new messages`;

  // The pill's visual + motion live on the inner `Row` (a plain div — `shadow-overlay` composites here,
  // unlike on the Button). `w-fit` shrink-wraps the Button; the state group toggles the fade/rise.
  const stateClasses = visible
    ? "pointer-events-auto translate-y-0 opacity-100"
    : "pointer-events-none translate-y-2 opacity-0";
  const pillClasses = `w-fit rounded-full border border-border bg-popover shadow-overlay transition-[opacity,translate] duration-(--motion-base) ease-out-expo ${stateClasses}`;

  return (
    // `aria-hidden` lives on the OUTER wrapper (a plain div — React's aria types accept it) so the whole
    // pill subtree drops out of the AT tree while hidden. `pointer-events-none`; the shown pill Row
    // re-enables its own.
    <Row
      justify="center"
      aria-hidden={visible ? undefined : true}
      className="pointer-events-none absolute inset-x-0 bottom-block z-(--z-overlay)"
      data-slot="jump-to-latest"
    >
      <Row align="center" className={pillClasses}>
        <Button
          type="button"
          intent="ghost"
          size="sm"
          onClick={onJump}
          aria-label={`Jump to latest, ${label}`}
          tabIndex={visible ? 0 : -1}
          className="gap-field rounded-full text-foreground"
        >
          <Icon icon={ChevronDown} size="sm" />
          {label}
        </Button>
      </Row>
    </Row>
  );
}
