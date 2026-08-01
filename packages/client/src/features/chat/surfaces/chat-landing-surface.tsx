// The chats-section no-selection state (D62 P4) — a SECTION state, not a page.
//
// It used to be the app's launcher: a hero + "Recent chats" + character quick-picks. Those MOVED to the
// HOME section's tiles (home-section-spec §4.2, owner decision H1 = D-1) and are DELETED here rather than
// kept beside them — half a migration IS the rot, and two launchers means two copies to fix every time the
// wording changes. "The app never opens on an empty room" is now satisfied by home being the born default,
// not by a hero bolted inside chats.
//
// What remains is what a section's none-selected state should be: one line that says where you are, and
// the section's OWN primary. No reads, so no suspense, no skeleton, no boundary.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Plus } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef } from "react";
import { useFocusOnMount, WeaveGlyph } from "#lib";

const WEAVE_SIZE = 48;

export interface ChatLandingSurfaceProps {
  readonly onNewChat: () => void;
}

export function ChatLandingSurface({ onNewChat }: ChatLandingSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack align="center" className="h-full min-h-0 justify-center overflow-y-auto outline-none" padding="section" ref={surfaceRef} tabIndex={-1}>
      <Stack className="w-full max-w-(--width-shell-content)" gap="section">
        <EmptyState
          action={
            <Button aria-label="Start a new chat" intent="primary" onClick={onNewChat}>
              <Icon icon={Plus} size="sm" />
              New chat
            </Button>
          }
          decoration={<WeaveGlyph size={WEAVE_SIZE} />}
          description="Pick a thread on the left, or start a new one."
          title="No chat selected"
        />
      </Stack>
    </Stack>
  );
}
