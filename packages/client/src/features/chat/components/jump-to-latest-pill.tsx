// The "jump to latest" pill — dumb chrome shown only while the reader has scrolled away from the tail
// and >=1 message has landed below since (message-list-surface.tsx owns the visibility/count logic). A
// centered pill pinned above the composer, anchored to the surface's own relative box, not fixed to the
// viewport. The shadow lives on the pill Card, not the Button, because Base UI Button's ring
// utilities own box-shadow and eat it. Fully inert (tabIndex=-1, aria-hidden, pointer-events-none) while
// hidden so it never becomes a phantom tab-stop.

import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
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

  return (
    <Row
      justify="center"
      aria-hidden={visible ? undefined : true}
      className="pointer-events-none absolute inset-x-0 inset-be-block z-(--z-overlay)"
      data-slot="jump-to-latest"
    >
      <Card className="flex items-center inline-fit" padding="none" presence={visible ? "shown" : "hidden"} shadow="overlay" shape="pill" tone="popover">
        <Button
          type="button"
          intent="ghost"
          size="sm"
          onClick={onJump}
          aria-label={`Jump to latest, ${label}`}
          tabIndex={visible ? 0 : -1}
          shape="pill"
          className="gap-field"
          tone="foreground"
        >
          <Icon icon={ChevronDown} size="sm" />
          {label}
        </Button>
      </Card>
    </Row>
  );
}
