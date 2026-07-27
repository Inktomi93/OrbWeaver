// rpg takeover CT stories (Spine-Testing §7 — CT mounts ONLY from a non-test module). The takeover is the
// rpg feature's SELF-CONTAINED contributor (`makeRpgContextTabs`) rendered through the REAL chats
// `SectionContextHost` (the shell's one CONTEXT consumer) via `CtChatContributorSectionRegistry` — the same
// door→factory→mint→resolve path main.tsx wires, driven over the stubbed network (routeTrpc supplies
// `chat.getChat` with the rpg pointer + the `rpg.getGame`/`getTrackerView` reads). This proves the 4 game
// tabs render + `when`-gate on `chat.rpg !== null` (a CACHE-FIRST getChat read), a tab body renders real
// tracker data, an editable block fires its mutation, and the read-only pill shows + disables edits.
//
// The contributor registry is built INSIDE the data providers (via `useTRPC`/`useQueryClient`) because
// `makeRpgContextTabs` is injected the cross-domain read channel `{ trpc, queryClient }` at the door — the
// story mirrors that door assembly with the CT's own singletons.

import { useTRPC } from "@orb/client/data";
import { makeRpgContextTabs } from "@orb/client/features/rpg";
import type { ChatContextState, ContextTabDef } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import { selectChat, useSectionRegistry } from "@orb/client/state";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useMemo } from "react";
import { SectionContextHeader, SectionContextHost } from "../../../../packages/client/src/features/app-shell/components/section-context-host";
import { RpgFreshnessIndicator } from "../../../../packages/client/src/features/rpg/components/rpg-freshness-indicator";
import { CtChatContributorSectionRegistry, CtDataProviders } from "../../../support/ct/ct-data-providers";
import { CHAT_ID } from "../chat/fixtures";

/** Mounts the chats section's CONTEXT through the real host, with the rpg contributor merged in — built here
 *  with the CT's own trpc/queryClient (the door-injection the factory takes). Bounded height so the two-strip
 *  bracket + viewport have real room. */
function RpgTakeoverHarness(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const contributors = useMemo(
    () => createContributorRegistry<ContextTabDef<ChatContextState>>("chat-context", makeRpgContextTabs({ trpc, queryClient })),
    [trpc, queryClient],
  );
  return (
    <CtChatContributorSectionRegistry contextContributors={contributors}>
      <RpgTakeoverInner />
    </CtChatContributorSectionRegistry>
  );
}

function RpgTakeoverInner(): ReactElement {
  const registry = useSectionRegistry();
  const definition = registry.get("chats");
  // Mirror the shell's TWO CONTEXT consumers (app-shell.tsx): the BAND (`SectionContextHeader` → the scene
  // banner + orbs via the W3c header-contributor seam) above, the BODY (`SectionContextHost` → the strips +
  // viewport) below. The header rides the `.shell-panel-header` band slot, NOT a tab body (§4.2/§4.11 #3).
  return (
    <div style={{ height: 640, width: 320, display: "flex", flexDirection: "column" }}>
      <header className="shell-panel-header">
        <SectionContextHeader key="chats-header" definition={definition} />
      </header>
      <SectionContextHost key="chats" definition={definition} />
    </div>
  );
}

/** The rpg takeover via the real host + the real self-contained rpg contributor, over the stubbed network.
 *  The `.ct.tsx` sets the routeTrpc stubs (`chat.getChat` with the rpg pointer, `rpg.getGame`, `getTrackerView`). */
export function RpgTakeoverStory(): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  return (
    <CtDataProviders>
      <RpgTakeoverHarness />
    </CtDataProviders>
  );
}

// The freshness indicator in isolation — a pure component (no providers/network), so its three honest states
// mount directly. This proves the label datum + a11y model per state without driving a live turn over SSE.

/** Reliable mode, idle — the accepted one-beat lag surfaced ("As of last beat"). */
export function RpgFreshnessReliableIdleStory(): ReactElement {
  return <RpgFreshnessIndicator extractionMode="reliable" pending={false} />;
}

/** Reliable mode, extraction window open — the transient "Updating…" (the pulse is aria-hidden). */
export function RpgFreshnessReliablePendingStory(): ReactElement {
  return <RpgFreshnessIndicator extractionMode="reliable" pending={true} />;
}

/** Cheap mode — current-beat fresh at commit; a minimal "Live" affordance, never a fake lag label. `pending`
 *  is ignored in cheap mode, so it is set true to prove it does NOT flip the label to "Updating…". */
export function RpgFreshnessCheapStory(): ReactElement {
  return <RpgFreshnessIndicator extractionMode="cheap" pending={true} />;
}
