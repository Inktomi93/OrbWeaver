// notificationsChrome — the registered topbar.trail widget for the notifications bell
// (shell-chrome-unification.md §A). `useVisible` gates the bell on `multiHumanCapable` — which is also the
// availability of the `notifications` backend (a multi-human-only router today; single-human 404s the
// inbox query). It replaces the gate that used to live in app-root.tsx: `false` until authConfig lands, so
// the bell never flashes-then-yanks. When notifications gain a single-human source, widen this gate.

import type { ReactElement } from "react";
import { useAuthConfig } from "#data";
import type { ChromeEntry } from "#state";
import { NotificationBell } from "../components/notification-bell.tsx";
import { useInbox } from "../hooks/use-inbox.ts";

export const notificationsChrome: ChromeEntry = {
  id: "notifications-bell",
  label: "Notifications",
  zone: "topbar.trail",
  // THE PHONE ROW IS NOT THE INBOX'S HOME (side-eye leg-4 P2, the topbar budget). At 320px a 48px bell sat
  // beside three other controls and left the room's own name 25% of the row. `mobile: "sheet"` is the
  // curation axis every rail entry already declares — consumed for `topbar.trail` now: the widget leaves
  // the phone topbar and renders its `body("sheet")` lens INLINE in the You sheet, which is where every
  // other phone-overflow affordance lives. Nothing becomes unreachable; the inbox gets more room, not less.
  mobile: "sheet",
  // THE NO-FLASH RULING SURVIVES AND IS NOW PRICED (#465, measured 2026-08-22 on the live stack at
  // 1280x800). `/api/auth/config` is fetched at app-root MOUNT, so on a multi-human deployment this gate
  // is `false` for the first ~90ms of shell life and the bell then MOUNTS INTO the topbar trail:
  // `.shell-topbar-trail` goes 1169,8,99,32 → 1127,7,141,34 (x -42px), a layout-shift value of
  // **0.00015**, on every boot including boots 2-4. It was mis-diagnosed as an appearance/type-ramp
  // reflow landing after `settings.getUserSettings` (#465's premise); it is neither — three appearance
  // arms (`--appearance chatWidthPct 60|100`, `density compact + fontScale 1.25`) leave this entry
  // BYTE-identical, and the appearance boot hint carries no key that touches it.
  // NOT FIXED, deliberately: while the capability is unknown the trail can either reserve a control it may
  // never render (a gap that collapses on every SINGLE-human deployment — the majority arm) or render
  // nothing (this shift, on the multi-human arm only). The cost is an order of magnitude under the
  // flagger's own 0.002 reporting floor (`lib/motion-stats.ts` MIN_REPORTED_SHIFT), which is why no `[cls]`
  // console line ever named it. A device-local remembered answer (the `appearance-boot-hint` pattern) would
  // close it and is the escalation if this ever grows teeth; it is not worth a new persisted store today.
  useVisible: (): boolean => useAuthConfig().data?.multiHumanCapable === true,
  // THE PHONE'S UNREAD SIGNAL (side-eye home re-score 2026-08-18, #214 residue). Curating this widget into
  // the You sheet gave the inbox room, and cost it its only phone-side TELL: the desktop bell badges the
  // unread count, and a phone showed nothing anywhere until the user opened the sheet and scrolled to it.
  // The mobile bar's You tab — the sheet's own door — badges this number. It is the SAME read the bell
  // makes (one producer; react-query dedupes the key, so this is a second reader, not a second source).
  useBadge: (): number => useInbox().unreadCount,
  // BOTH LENSES ARE REAL now: `"bar"` is the badged bell + popover, `"sheet"` is the inline inbox block
  // the mobile You sheet renders (see `NotificationBell`).
  behavior: { kind: "widget", body: (presentation): ReactElement => <NotificationBell presentation={presentation} /> },
};
