// notifications/ front door (UI-Arch §2.1) — the ONLY entry into the notifications slice (dep-cruiser
// client-feature-front-door). Mirrors the server `domain/notifications` (the per-user durable inbox,
// D16). notifications OWNS a registered `topbar.trail` chrome widget (`notificationsChrome`,
// assembled at the main.tsx door) with NO visibility gate — the inbox has single-human sources, so the bell
// mounts for every authed principal (#1627; the entry file states the whole ruling). The hooks stay
// internal (the bell IS the inbox surface).

export { NotificationBell } from "./components/notification-bell.tsx";
export { notificationsChrome } from "./lib/notifications-chrome.tsx";
