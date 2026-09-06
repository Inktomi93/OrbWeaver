// notificationsChrome — the registered topbar.trail widget for the notifications bell
// (shell-chrome-unification.md §A). IT HAS NO VISIBILITY GATE: the bell mounts for every authed principal.
//
// #1627 (2026-09-05) retired the gate this entry was born with. `useVisible` read `multiHumanCapable`
// because the inbox backend was multi-human-only (PD-106 — every notification SOURCE was
// invite/kick/host-handoff, and the router 404'd on a single-user deployment). That premise is dead:
// `plugin-disabled` (a plugin the crash policy auto-disabled) and `automation-notice` (a rule that
// auto-disabled itself) write durable rows on a single-user box, and the plugin CONSENT prompt (#924/#1041)
// rides this bell too — so the trio widened to `authedProcedure` and the inbox room's attach belt came off.
// PD-106's ruling survives where it still applies: `notifications.presence` and the invites router are still
// belted, which is why the character bar's People section and the /join landing still consult the capability.
//
// The #476 no-flash machinery went with the gate. An unconditional widget cannot flash-then-yank and cannot
// shift the trail in from nothing, so this entry no longer reads the capability at all; the hint itself
// (`#state` deployment-boot-hint → `useMultiHumanCapable`, `#data`) moved to the two surfaces that are still
// gated — `routes/app-root.tsx`'s /join dialog and the character bar's People section — which read it RAW before
// and carried the first-paint defect #476 measured here. Nothing about the inbox's authorization moved:
// every read and verb behind this bell still answers to the server's gates.

import type { ReactElement } from "react";
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
  // THE PHONE'S UNREAD SIGNAL (side-eye home re-score 2026-08-18, #214 residue). Curating this widget into
  // the You sheet gave the inbox room, and cost it its only phone-side TELL: the desktop bell badges the
  // unread count, and a phone showed nothing anywhere until the user opened the sheet and scrolled to it.
  // The mobile bar's You tab — the sheet's own door — carries this signal. It is the SAME read the bell
  // makes (one producer; react-query dedupes the key, so this is a second reader, not a second source).
  //
  // IT IS THE UNION, NOT THE UNREAD COUNT (#1815, owner ruling ARM A — mirror the bell on the phone).
  // `waitingCount` is `unread || actionable`, exactly the predicate behind the desktop dot (#1799), and the
  // reason the phone specifically needs the second half is the SHEET LENS: opening the sheet marks every row
  // read on mount, so an unread-only tell went dark the first time a reader looked and never came back —
  // even with an invite still sitting there undecided. The pending half is server-derived
  // (`InboxView.actionable`) and never re-derived here, so an invite settled from a share link stops
  // lighting the tab without the reader touching anything.
  useBadge: (): number => useInbox().waitingCount,
  // BOTH LENSES ARE REAL now: `"bar"` is the badged bell + popover, `"sheet"` is the inline inbox block
  // the mobile You sheet renders (see `NotificationBell`).
  behavior: { kind: "widget", body: (presentation): ReactElement => <NotificationBell presentation={presentation} /> },
};
