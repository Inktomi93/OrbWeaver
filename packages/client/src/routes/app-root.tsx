// app-root.tsx — the `/` route (O7, renamed from home-page): a THIN mount of the four-region AppShell.
// The section + modal + chrome registries (assembled in main.tsx) drive rail/list/content/header/
// placeholder/context/topbar-trail + every modal; this route keeps only §7 residue (the always-on user
// bus, the aria announcer, the ?join handoff, first-run persona). The ONE sanctioned composition route —
// it may import feature front doors (G1 exempts it, like router.tsx→auth); a
// `sections={{…}}`/`modals={{…}}` god-map is RED. The notifications bell is no longer wired here — it's a
// registered `topbar.trail` chrome widget (`notificationsChrome`), and since #1627 it carries no capability
// gate at all: the inbox has single-human sources.

import { AriaAnnouncer } from "@orb/ui/aria-announcer";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useHuskReaper, useInvalidation, useMultiHumanCapable, useOrbSocket, useRpgBus, useSessionRecovery, useUserBus } from "#data";
import { AppShell } from "#features/app-shell";
import { clearJoinParam, JoinInviteDialog, readJoinToken } from "#features/chat";
import { FirstRunPersonaDialog } from "#features/persona";
import { announceStatus, useActiveChatId, useActiveSection, useSelectedCharacterId, useStatusAnnouncement } from "#state";
import { AppRootSessionBoundary } from "./app-root-session-boundary/index.ts";

export function AppRoot(): ReactElement {
  // Single-user renders neither remaining multi-human surface: the character bar's humans row ("People" is the
  // roster's HUMAN SUBSET, not a tab) and the /join landing below. The BELL left this list with #1627 — its
  // inbox has single-human sources — so the capability now gates only those two, and both read it through
  // `useMultiHumanCapable` (#476's ONE hint-backed read, adopted here when the bell stopped being its
  // consumer). A device that has never been told still answers FALSE while the config is in flight, so
  // chrome never flashes-then-yanks; a device that HAS been told paints the right arm in its first frame.
  const multiHumanCapable = useMultiHumanCapable();
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
  // The session-freshness machinery: the durable-local per-user
  // rebind, the recovery ladder's host, and the visibility probe. Mounted HERE for the same reason the bus
  // hooks are — a feature could unmount and take the whole belt with it — and AFTER the socket so a
  // resume's forced re-announce has a bound transport to announce on.
  const sessionRecovery = useSessionRecovery();

  return (
    <AppRootSessionBoundary recovery={sessionRecovery}>
      <HydratedAppRoot multiHumanCapable={multiHumanCapable} joinToken={joinToken} setJoinToken={setJoinToken} />
    </AppRootSessionBoundary>
  );
}

interface HydratedAppRootProps {
  readonly multiHumanCapable: boolean;
  readonly joinToken: string | null;
  readonly setJoinToken: (token: string | null) => void;
}

/** Everything that can read or act on durable-local state mounts only after the verified user owns it. */
function HydratedAppRoot({ multiHumanCapable, joinToken, setJoinToken }: HydratedAppRootProps): ReactElement {
  const invalidation = useInvalidation();

  const activeSection = useActiveSection();
  const selectedCharacterId = useSelectedCharacterId();
  const activeChatId = useActiveChatId();

  // The best-effort husk reap (D166): a room created here and left
  // without ever being used tells the server on the way out. Mounted at the root for the same reason the bus
  // hooks are — a feature unmount must not take it with it — and it never blocks or surfaces anything.
  useHuskReaper();

  // The per-game live event room (Context-Panel-Program §4.9), mounted here (never in a feature, which
  // could unmount and drop the freshness driver) and keyed to the active chat. `null` (no chat, or a
  // non-game chat) attaches nothing at all.
  useRpgBus(activeChatId, {
    invalidateRpg: invalidation.invalidateRpg,
    gapHealRpg: invalidation.gapHealRpg,
  });

  const routeAnnouncement = ((): string => {
    if (activeSection === "chats") {
      if (activeChatId !== null) {
        return "Loaded chat.";
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

  // ONE LIVE REGION, TWO SOURCES, ONE CHANNEL (#863 P1). The route string above is AMBIENT — it changes
  // only when the section/selection does, so a user-initiated MUTATION whose result lands off-screen (game
  // mode on/off, measured) announced NOTHING at all. Both now speak through `announceStatus`: the route
  // line re-announces on every navigation exactly as before, and an EVENT announcement holds the region
  // until the next navigation replaces it. A second live region was the alternative and is the worse one —
  // the same drive found an empty one already sitting in the tree.
  const statusAnnouncement = useStatusAnnouncement();
  useEffect(() => {
    announceStatus(routeAnnouncement);
  }, [routeAnnouncement]);

  return (
    <>
      <AriaAnnouncer message={statusAnnouncement} />
      <AppShell />
      {/* Renders nothing once the viewer owns a persona; forces the create flow on a fresh account. */}
      <FirstRunPersonaDialog />
      {/* The /join link landing — mounts only when a token arrived and the deployment is capable. */}
      {multiHumanCapable && joinToken !== null ? <JoinInviteDialog token={joinToken} onDone={(): void => setJoinToken(null)} /> : null}
    </>
  );
}
