// notificationsChrome — the registered topbar.trail widget for the notifications bell
// (shell-chrome-unification.md §A). `useVisible` gates the bell on `multiHumanCapable` — which is also the
// availability of the `notifications` backend (a multi-human-only router today; single-human 404s the
// inbox query). It replaces the gate that used to live in app-root.tsx: `false` until authConfig lands, so
// the bell never flashes-then-yanks. When notifications gain a single-human source, widen this gate.

import type { ReactElement } from "react";
import { useAuthConfig } from "#data";
import type { ChromeEntry } from "#state";
import { NotificationBell } from "../components/notification-bell";

export const notificationsChrome: ChromeEntry = {
  id: "notifications-bell",
  label: "Notifications",
  zone: "topbar.trail",
  useVisible: (): boolean => useAuthConfig().data?.multiHumanCapable === true,
  // The `presentation` lens is ignored today — the bell renders identically in bar and sheet; a
  // sheet-specific projection (if any) lands §E-5.
  behavior: { kind: "widget", body: (_presentation): ReactElement => <NotificationBell /> },
};
