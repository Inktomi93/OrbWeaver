// app-root.tsx — the `/` route (O7, renamed from home-page): a THIN mount of the four-region AppShell.
// The section + modal + chrome registries (assembled in main.tsx) drive rail/list/content/header/
// placeholder/context/topbar-trail + every modal; this route keeps only §7 residue (the always-on user
// bus, the aria announcer, the ?join handoff, first-run persona). The ONE sanctioned composition route —
// it may import feature front doors (G1 exempts it, like router.tsx→auth); a
// `sections={{…}}`/`modals={{…}}` god-map is RED. The notifications bell is no longer wired here — it's a
// registered `topbar.trail` chrome widget (`notificationsChrome`, gated on multiHumanCapable at the door).

import { AriaAnnouncer } from "@orb/ui/aria-announcer";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useAuthConfig, useInvalidation, useOrbSocket, useRpgBus, useUserBus } from "#data";
import { AppShell } from "#features/app-shell";
import { clearJoinParam, JoinInviteDialog, readJoinToken } from "#features/chat";
import { FirstRunPersonaDialog } from "#features/persona";
import { isCommitted, useActiveChatHandle, useActiveDraftFoundingCast, useActiveSection, useSelectedCharacterId } from "#state";

export function AppRoot(): ReactElement {
  // Single-user renders none of the three multi-human surfaces (bell, the cast bar's humans row —
  // "People" is the roster's HUMAN SUBSET, not a tab — and the /join landing);
  // `false` until the config lands so chrome never flashes-then-yanks.
  const { data: authConfig } = useAuthConfig();
  const multiHumanCapable = authConfig?.multiHumanCapable === true;
  // The one-shot `?join=<token>` handoff — captured at mount then scrubbed from the address bar (a
  // raw invite token must not linger in history).
  const [joinToken, setJoinToken] = useState(readJoinToken);
  useEffect(() => {
    if (joinToken !== null) {
      clearJoinParam();
    }
  }, [joinToken]);
  const invalidation = useInvalidation();
  // THE socket (SSE-1): one multiplexed SSE connection per tab, carrying every live room the tab attaches.
  // Mounted FIRST so the room registry's mutation channel is bound before the room hooks below join —
  // and mounted here for the same reason they are (a feature could unmount and drop every freshness driver
  // at once). Adding the next always-on room costs an attach, not a connection.
  useOrbSocket();
  // The always-on per-user entity-changed room, mounted once here (never in a feature, which could
  // unmount and drop the freshness driver).
  useUserBus({
    invalidateUser: invalidation.invalidateUser,
    invalidateAllUserRoots: invalidation.invalidateAllUserRoots,
  });

  const handle = useActiveChatHandle();
  const activeSection = useActiveSection();
  const selectedCharacterId = useSelectedCharacterId();
  const activeChatId = isCommitted(handle) ? handle.id : null;
  // The ONE founding-cast union — seed ∪ the panel's pre-send additions. A cast-less draft that gains its
  // first character from the roster panel IS a "New chat draft" to announce, which a seed-only read missed.
  const draftCharacterIds = useActiveDraftFoundingCast();

  // The per-game live event room (Context-Panel-Program §4.9), mounted here (never in a feature, which
  // could unmount and drop the freshness driver) and keyed to the active committed chat. `null` (a draft,
  // no chat, or a non-game chat) attaches nothing at all.
  useRpgBus(activeChatId, {
    invalidateRpg: invalidation.invalidateRpg,
    gapHealRpg: invalidation.gapHealRpg,
  });

  const routeAnnouncement = ((): string => {
    if (activeSection === "chats") {
      if (activeChatId !== null) {
        return "Loaded chat.";
      }
      if (draftCharacterIds.length > 0) {
        return "New chat draft.";
      }
      return "Chats list.";
    }
    if (activeSection === "characters") {
      if (selectedCharacterId !== null) {
        return "Loaded character details.";
      }
      return "Character library.";
    }
    return "App loaded.";
  })();

  return (
    <>
      <AriaAnnouncer message={routeAnnouncement} />
      <AppShell />
      {/* Renders nothing once the viewer owns a persona; forces the create flow on a fresh account. */}
      <FirstRunPersonaDialog />
      {/* The /join link landing — mounts only when a token arrived and the deployment is capable. */}
      {multiHumanCapable && joinToken !== null ? <JoinInviteDialog token={joinToken} onDone={(): void => setJoinToken(null)} /> : null}
    </>
  );
}
