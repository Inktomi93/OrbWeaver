// notifications/ front door (UI-Arch §2.1) — the ONLY entry into the notifications slice (dep-cruiser
// client-feature-front-door). Mirrors the server `domain/notifications` (the per-user durable inbox,
// D16/PD-23). notifications OWNS a registered `topbar.trail` chrome widget (`notificationsChrome`,
// assembled at the main.tsx door) gated on `/api/auth/config.multiHumanCapable`; the hooks stay
// internal (the bell IS the inbox surface).

export { NotificationBell } from "./components/notification-bell";
export { notificationsChrome } from "./lib/notifications-chrome";
