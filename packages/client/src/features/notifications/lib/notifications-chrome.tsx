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
