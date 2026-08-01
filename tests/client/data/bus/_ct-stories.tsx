// Story module for the bus/socket CTs (core/Spine-Testing.md §7: CT only mounts from a non-test module).
// The stories mount the REAL socket + the REAL room hooks over the REAL tRPC client — routeOrbSocket stubs
// only the NETWORK, so what runs is the production path: EventSource → httpSubscriptionLink → useOrbSocket →
// the room registry → useRpgBus/useUserBus → the invalidation callbacks.
//
// `SocketHost` mirrors `routes/app-root.tsx`: the socket is mounted ONCE, above every room hook. That
// placement is the thing under test in the two-room story — N rooms, one connect.
//
// The probes render what they RECEIVED (one line per routed event) so a CT can assert delivery without
// reaching into module state — the `OnlineStatusProbeStory` posture.

import { useOrbSocket, useRpgBus, useUserBus } from "@orb/client/data";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ChatId } from "@orb/kit/ids";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

/** The app-root shape: ONE socket, above every room hook. */
function SocketHost({ children }: { readonly children: ReactNode }): ReactElement {
  useOrbSocket();
  return <>{children}</>;
}

function RpgBusProbe({ chatId }: { readonly chatId: ChatId | null }): ReactElement {
  const [seen, setSeen] = useState<string[]>([]);
  const [heals, setHeals] = useState(0);
  useRpgBus(chatId, {
    invalidateRpg: (event: RpgBusEvent): void => {
      setSeen((prev) => [...prev, event.type]);
    },
    gapHealRpg: (): void => {
      setHeals((prev) => prev + 1);
    },
  });
  return (
    <>
      <output data-testid="rpg-events">{seen.join(",")}</output>
      <output data-testid="rpg-heals">{String(heals)}</output>
    </>
  );
}

function UserBusProbe(): ReactElement {
  const [seen, setSeen] = useState<string[]>([]);
  const [heals, setHeals] = useState(0);
  useUserBus({
    invalidateUser: (event: UserBusEvent): void => {
      setSeen((prev) => [...prev, event.type]);
    },
    invalidateAllUserRoots: (): void => {
      setHeals((prev) => prev + 1);
    },
  });
  return (
    <>
      <output data-testid="user-events">{seen.join(",")}</output>
      <output data-testid="user-heals">{String(heals)}</output>
    </>
  );
}

/** The rpg room's ATTACH GATE under test: a null chatId (landing) and a chat whose `getChat.rpg` is null
 *  (a non-game room) must both attach NOTHING. */
export function RpgBusStory({ chatId }: { readonly chatId: ChatId | null }): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <RpgBusProbe chatId={chatId} />
      </SocketHost>
    </CtDataProviders>
  );
}

/** The always-on user room — the one room that attaches unconditionally. */
export function UserBusStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <UserBusProbe />
      </SocketHost>
    </CtDataProviders>
  );
}

/** BOTH rooms under ONE socket — the multiplex claim: two rooms, one connect. */
export function TwoRoomStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <UserBusProbe />
        <RpgBusProbe chatId={chatId} />
      </SocketHost>
    </CtDataProviders>
  );
}
