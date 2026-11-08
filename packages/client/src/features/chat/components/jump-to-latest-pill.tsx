// The "jump to latest" pill — dumb chrome shown only while the reader has scrolled away from the tail
// and >=1 message has landed below since (message-list-surface.tsx owns the visibility/count logic). A
// centered pill pinned above the composer, anchored to the surface's own relative box, not fixed to the
// viewport. The shadow lives on the FloatingChip, not the Button, because Base UI Button's ring
// utilities own box-shadow and eat it. Fully inert (tabIndex=-1, aria-hidden, pointer-events-none) while
// hidden so it never becomes a phantom tab-stop.

import { Button } from "@orb/ui/button";
import { FloatingChip } from "@orb/ui/floating-chip";
import { ChevronDown, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { jumpToLatestCountLabel, jumpToLatestName } from "../lib/transcript-copy.ts";

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

  return (
    <Row justify="center" aria-hidden={visible ? undefined : true} placed="footBand" passThrough={true} layer="overlay" data-slot="jump-to-latest">
      <FloatingChip presence={visible ? "shown" : "hidden"}>
        <Button
          type="button"
          variant="ghost"
          ink="foreground"
          size="sm"
          wrap={true}
          onClick={onJump}
          aria-label={jumpToLatestName(held)}
          tabIndex={visible ? 0 : -1}
          shape="pill"
        >
          <Icon icon={ChevronDown} size="sm" />
          {jumpToLatestCountLabel(held)}
        </Button>
      </FloatingChip>
    </Row>
  );
}
