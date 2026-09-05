// B11 (interaction-direction-spec §7 B11) — the room ACTIVITY tab as an automation CONTRIBUTION to the chat
// CONTEXT strip. It is a CONTRIBUTION, not a native chat tab, because `client-features-no-cross` forbids the
// chat feature from importing automation, and the fire-outcome COPY (`fireOutcomeView`/`fireDetailLine`) has
// its one home in automation — so a chat-owned tab could not render a fire row without re-spelling that
// vocabulary. automation OWNS the tab and grafts it exactly as `automationRulesSection` grafts the Rules
// SECTION: the door assembles this def into the `chat-context` contributor registry (compose/authed-app.tsx),
// which chat merges at `defineContextTabs`'s `contributors` arm. automation never imports chat.
//
// It is a READY def (not a factory like rpg's): the body reads through `useTRPC` at render, so it needs no
// injected cross-domain read channel. HOST-ONLY: `when: isHost` is the real gate (PERMISSION-omit — a member
// never sees the tab, mirroring the fire log's host authority), and `crown` paints the host-only glyph at rest
// exactly as the Preview tab does.

import { History } from "@orb/ui/icons";
import type { ReactNode } from "react";
import { QueryBoundary, SkeletonRows } from "#data";
import type { ChatContextState, ContextTabDef } from "#lib";
import { RoomActivityLog } from "../components/room-activity-log.tsx";

/** The room Activity tab — a host-only CONTEXT-strip sibling of Members/"This chat"/Preview (B11). */
export const automationActivityTab: ContextTabDef<ChatContextState> = {
  id: "automation.activity",
  label: "Activity",
  icon: History,
  // HOST-ONLY — the fire log is the host's hidden hand (a member off the stream sees only quickReplySurfaced),
  // so the tab omits for a member. `crown` is only how the strip paints that fact; `when` is the real gate.
  crown: true,
  when: (s): boolean => s.isHost,
  body: (s): ReactNode => (
    // RESERVED (#1098) — a context-tab body that settles into a run-activity list; the sentence it replaced
    // was one line where the log is many, so the tab resized under the reader the moment the read landed.
    <QueryBoundary fallback={<SkeletonRows count={4} />} reserveKey="automation.activityTab">
      <RoomActivityLog chatId={s.chatId} />
    </QueryBoundary>
  ),
};
