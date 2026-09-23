// Notifications feature CT stories (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The bell comes through the feature front door and wraps in the real client data layer
// (<CtDataProviders> — Query + real tRPC over the routeTrpc-stubbed network + a scripted body for the ONE
// multiplexed socket, registered per-test in the `.ct.tsx` via routeOrbSocket).
//
// `SocketHost` mirrors `routes/app-root.tsx`: since SSE-1 S3 the inbox has no subscription of its own — it
// JOINS the `notifications` ROOM on the tab's one socket, so the socket has to be mounted above the bell for
// the stream to exist at all.

import { useOrbSocket } from "@orb/client/data";
import { NotificationBell, notificationsChrome } from "@orb/client/features/notifications";
import { useActiveConfigGroup, useActiveSection } from "@orb/client/state";
import type { ReactElement, ReactNode } from "react";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { CtToastSurface } from "../../lib/_ct-stories.tsx";

/** The app-root shape: ONE socket, above every room hook. */
function SocketHost({ children }: { readonly children: ReactNode }): ReactElement {
  useOrbSocket();
  return <>{children}</>;
}

/** The topbar bell + inbox popover over the real data layer (network stubbed in the `.ct.tsx`). */
export function NotificationBellStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        {/* A wrapper so the mount `component` locator is a stable ancestor (the popover portals out). */}
        <div style={{ width: 480, padding: 16 }}>
          <NotificationBell />
        </div>
      </SocketHost>
    </CtDataProviders>
  );
}

/** The SHEET lens — the phone's You-sheet inbox block (`ChromeEntry.mobile: "sheet"` renders `body("sheet")`
 *  inline). 320px, the real phone column: this lens has no trigger and no popover, so its "you looked" moment
 *  is the MOUNT, and its section name has to be findable as a heading in a long scrolling drawer. */
export function NotificationBellSheetStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <div style={{ width: 320, padding: 16 }}>
          <NotificationBell presentation="sheet" />
        </div>
      </SocketHost>
    </CtDataProviders>
  );
}

/** The topbar TRAIL slot exactly as the shell assembles it: the registered chrome entry decides its own
 *  visibility (`useVisible`) and renders its own `"bar"` body. The story deliberately mounts the ENTRY, not
 *  the bell — the claim under test is what the trail paints in its FIRST frame while `/api/auth/config` is
 *  still in flight, which is a property of the ENTRY's gate, not of the bell.
 *
 *  The entry declares NO `useVisible` since #1627 (the inbox has single-human sources), so the optional-call
 *  below is what the shell itself does (`app-shell.tsx`: `entry.useVisible?.() ?? true`) and reads TRUE. It
 *  stays spelled out rather than collapsed: a re-added gate must show up in this story, not be bypassed by it. */
function ChromeTrailSlot(): ReactElement {
  const visible = notificationsChrome.useVisible?.() !== false;
  const { behavior } = notificationsChrome;
  return <div style={{ width: 480, padding: 16 }}>{visible && behavior.kind === "widget" ? behavior.body("bar") : null}</div>;
}

/** The trail slot over the real data layer (`/api/auth/config` + the network stubbed in the `.ct.tsx`). */
export function NotificationsTrailStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <ChromeTrailSlot />
      </SocketHost>
    </CtDataProviders>
  );
}

/** The bell + the real toast surface — for the stream's typed `__subscriptionError` terminal-frame lane,
 *  whose whole visible consequence is a `notify.error` toast. */
export function NotificationBellToastStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <CtToastSurface>
          <div style={{ width: 480, padding: 16 }}>
            <NotificationBell />
          </div>
        </CtToastSurface>
      </SocketHost>
    </CtDataProviders>
  );
}

/** The bell BESIDE a probe of where the shell has been sent (#1041). The consent ask's whole product claim
 *  is that it BUILDS THE PATH to the consent surface, and "the path" is client-ephemeral navigation state,
 *  not a rendered thing the bell owns — so the probe reads the same `#state` the config shell reads. Appended
 *  as a new export (a `_ct-stories` module may export ONLY components; the probe is one). */
function ShellDestinationProbe(): ReactElement {
  const section = useActiveSection();
  const group = useActiveConfigGroup();
  return <output data-testid="ct-shell-destination">{`${section}/${group ?? "none"}`}</output>;
}

export function NotificationBellDestinationStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <div style={{ width: 480, padding: 16 }}>
          <NotificationBell />
          <ShellDestinationProbe />
        </div>
      </SocketHost>
    </CtDataProviders>
  );
}

/** THE PHONE'S TELL, PROBED AT ITS SOURCE (#1815). The You tab's badge is `notificationsChrome.useBadge()`
 *  rendered by app-shell's `SheetBadgeCount`, and app-shell may not import this feature — so the number
 *  reaches the tab through the registry and nothing else. This probe calls the ENTRY'S OWN hook, which is
 *  the value that projection carries: a pin over it cannot pass while the registry's contribution is wrong.
 *  Appended as a component (a `_ct-stories` module may export ONLY components; a probe is one). */
function SheetBadgeProbe(): ReactElement {
  const waiting = notificationsChrome.useBadge?.() ?? 0;
  return <output data-testid="ct-sheet-badge">{String(waiting)}</output>;
}

/** The SHEET lens beside that probe — the exact composition the ruling is about. Mounting the sheet is what
 *  fires its mark-all-read-on-mount, so this story is "the reader opened the You sheet"; the probe then says
 *  whether the tab that hosts it still has anything to show. 320px, the real phone column. */
export function NotificationsSheetBadgeStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <div style={{ width: 320, padding: 16 }}>
          <SheetBadgeProbe />
          <NotificationBell presentation="sheet" />
        </div>
      </SocketHost>
    </CtDataProviders>
  );
}
