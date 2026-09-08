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
import { WeaveGlyph } from "#components";
import { useFocusOnMount } from "#lib";
import { LIST_OFF_SCREEN_HINT, useSectionListMode } from "#state";

const WEAVE_SIZE = 48;

/** The instruction, side-agnostic since the N-10 sweep: it names the COLLECTION, not a side. */
const PICK_A_THREAD = "Pick a thread from your chats, or start a new one.";

export interface ChatLandingSurfaceProps {
  readonly onNewChat: () => void;
}

export function ChatLandingSurface({ onNewChat }: ChatLandingSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  // #446 — "Pick a thread from your chats" is an act the reader cannot perform while the roster is off
  // screen (the narrow-desktop auto-collapse of this section's docked default, focus mode, a hand collapse).
  // Naming the shell affordance is the same fix the Presets welcome carries, on the same signal; this pane
  // also keeps its own primary in both arms, so neither is a dead end and no second door is minted.
  const listMode = useSectionListMode("chats");
  useFocusOnMount(surfaceRef);

  return (
    <Stack
      align="center"
      className="relative h-full min-h-0 justify-center overflow-y-auto overscroll-contain outline-none"
      padding="section"
      ref={surfaceRef}
      tabIndex={-1}
    >
      <Stack className="w-full max-w-(--width-shell-content)" gap="section">
        <EmptyState
          action={
            <Button aria-label="Start a new chat" intent="primary" onClick={onNewChat}>
              <Icon icon={Plus} size="sm" />
              New chat
            </Button>
          }
          decoration={<WeaveGlyph size={WEAVE_SIZE} />}
          // SIDE-AGNOSTIC: the list pane is a docked column on wide, a slide-over on narrow/mobile, and
          // collapsed in focus mode — "on the left" is wrong in three of the four states. And in the state
          // where it is COLLAPSED, the footnote names the door back to it (#446).
          description={listMode === "collapsed" ? `${PICK_A_THREAD}${LIST_OFF_SCREEN_HINT}` : PICK_A_THREAD}
          title="No chat selected"
        />
      </Stack>
    </Stack>
  );
}
