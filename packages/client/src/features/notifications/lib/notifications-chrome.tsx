// notificationsChrome — the registered topbar.trail widget for the notifications bell
// (shell-chrome-unification.md §A). `useVisible` gates the bell on `multiHumanCapable` — which is also the
// availability of the `notifications` backend (a multi-human-only router today; single-human 404s the
// inbox query). It replaces the gate that used to live in app-root.tsx, and it asks ONE read
// (`useMultiHumanCapable`, #data) that answers from this device's remembered answer while `/api/auth/config`
// is in flight and from the server the instant it lands — so the bell neither flashes-then-yanks nor shifts
// the trail in from nothing (see `useVisible` below for the whole ruling).

import type { ReactElement } from "react";
import { useMultiHumanCapable } from "#data";
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
  // THE NO-FLASH RULING SURVIVES — ITS INPUT CHANGED (#476 took the escalation #465 priced and declined).
  // #465, measured 2026-08-22 on the live stack at 1280x800: `/api/auth/config` is fetched at app-root
  // MOUNT, so a raw `data?.multiHumanCapable === true` gate is `false` for the first ~90ms of shell life and
  // the bell then MOUNTS INTO the topbar trail — `.shell-topbar-trail` 1169,8,99,32 → 1127,7,141,34
  // (x -42px), a layout-shift value of **0.00015**, on every boot including boots 2-4. (It was mis-diagnosed
  // as an appearance/type-ramp reflow landing after `settings.getUserSettings`; it is neither — three
  // appearance arms leave this entry BYTE-identical, and the appearance boot hint carries no key that
  // touches it.) The value sits an order of magnitude under the flagger's own 0.002 reporting floor
  // (`lib/motion-stats.ts` MIN_REPORTED_SHIFT), which is why no `[cls]` console line ever named it and why
  // only a buffered `PerformanceObserver({type:"layout-shift"})` replay can see it.
  // #465 declined the fix because both no-hint arms are wrong (reserve a control a SINGLE-human deployment
  // never renders, or ship this shift on the multi-human arm) and a new persisted store was not worth it.
  // #476 is the condition change: `useMultiHumanCapable` is now the ONE read of this capability, and it
  // answers from this DEVICE's remembered value while the config is in flight (`#state`
  // deployment-boot-hint — the `appearance-boot-hint` pattern, same store class). From the second visit on,
  // the trail paints the RIGHT arm in its first frame and neither the gap nor the shift exists; a
  // first-EVER visit still falls back to FALSE, i.e. exactly today's behavior, which is the honest arm for a
  // device that has been told nothing. The no-flash ruling itself is untouched: the gate still never
  // flashes-then-yanks, because the server's answer — the instant it lands — is both what renders and what
  // the device remembers, so a capability FLIP corrects rather than being masked. The hint is a RENDER hint
  // and nothing else: the inbox query, the invite verbs, and their permissions still answer to the real
  // config and the server's own gates.
  // When notifications gain a single-human source, widen this gate (and the file header's note).
  useVisible: (): boolean => useMultiHumanCapable(),
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
