// The "jump to latest" pill — dumb chrome shown only while the reader has scrolled away from the tail
// and >=1 message has landed below since (message-list-surface.tsx owns the visibility/count logic). A
// centered pill pinned above the composer, anchored to the surface's own relative box, not fixed to the
// viewport. The shadow lives on the plain inner Row, not the Button, because Base UI Button's ring
// utilities own box-shadow and eat it. Fully inert (tabIndex=-1, aria-hidden, pointer-events-none) while
// hidden so it never becomes a phantom tab-stop.

import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve ChevronDown/Icon fine (same as selection-bar.tsx).
import { ChevronDown, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

export interface JumpToLatestPillProps {
  readonly count: number;
  readonly visible: boolean;
  readonly onJump: () => void;
}

export function JumpToLatestPill({ count, visible, onJump }: JumpToLatestPillProps): ReactElement {
  // Hold the last non-zero count so the fade-out never flashes "0 new messages" as it disappears.
  const [held, setHeld] = useState(count);
  if (count > 0 && count !== held) {
    setHeld(count);
  }
  const label = held === 1 ? "1 new message" : `${held} new messages`;

  const stateClasses = visible
    ? "pointer-events-auto translate-y-0 opacity-100"
    : "pointer-events-none translate-y-2 opacity-0";
  const pillClasses = `w-fit rounded-full border border-border bg-popover shadow-overlay transition-[opacity,translate] duration-(--motion-base) ease-out-expo ${stateClasses}`;

  return (
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
