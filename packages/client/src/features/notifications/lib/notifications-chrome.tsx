// notificationsChrome — the registered topbar.trail widget for the notifications bell
// (shell-chrome-unification.md §A). `useVisible` is the multi-human gate that used to live in
// app-root.tsx: `false` until authConfig lands, so the bell never flashes-then-yanks.

import type { ReactElement } from "react";
import { useAuthConfig } from "#data";
import type { ChromeEntry } from "#state";
import { NotificationBell } from "../components/notification-bell";

export const notificationsChrome: ChromeEntry = {
  id: "notifications-bell",
  label: "Notifications",
  zone: "topbar.trail",
  useVisible: (): boolean => useAuthConfig().data?.multiHumanCapable === true,
  body: (): ReactElement => <NotificationBell />,
};
