// Notifications feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The bell comes through the feature front door and wraps in the real client data layer
// (<CtDataProviders> — Query + real tRPC over the routeTrpc-stubbed network + a scripted body for the ONE
// multiplexed socket, registered per-test in the `.ct.tsx` via routeOrbSocket).
//
// `SocketHost` mirrors `routes/app-root.tsx`: since SSE-1 S3 the inbox has no subscription of its own — it
// JOINS the `notifications` ROOM on the tab's one socket, so the socket has to be mounted above the bell for
// the stream to exist at all.

import { useOrbSocket } from "@orb/client/data";
import { NotificationBell } from "@orb/client/features/notifications";
import type { ReactElement, ReactNode } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";
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
