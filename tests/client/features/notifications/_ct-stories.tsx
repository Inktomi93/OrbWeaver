// Notifications feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The bell comes through the feature front door and wraps in the real client data layer
// (<CtDataProviders> — Query + real tRPC over the routeTrpc-stubbed network + a scripted SSE body for
// the `notifications.notifications` subscription, registered per-test in the `.ct.tsx`).

import { NotificationBell } from "@orb/client/features/notifications";
import type { ReactElement } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";
import { CtToastSurface } from "../../lib/_ct-stories";

/** The topbar bell + inbox popover over the real data layer (network stubbed in the `.ct.tsx`). */
export function NotificationBellStory(): ReactElement {
  return (
    <CtDataProviders>
      {/* A wrapper so the mount `component` locator is a stable ancestor (the popover portals out). */}
      <div style={{ width: 480, padding: 16 }}>
        <NotificationBell />
      </div>
    </CtDataProviders>
  );
}

/** The bell + the real toast surface — for the stream's typed `__subscriptionError` terminal-frame lane,
 *  whose whole visible consequence is a `notify.error` toast. */
export function NotificationBellToastStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtToastSurface>
        <div style={{ width: 480, padding: 16 }}>
          <NotificationBell />
        </div>
      </CtToastSurface>
    </CtDataProviders>
  );
}
