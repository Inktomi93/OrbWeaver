// notifications/ front door (UI-Arch §2.1) — the ONLY entry into the notifications slice (dep-cruiser
// client-feature-front-door). Mirrors the server `domain/notifications` (the per-user durable inbox,
// D16/PD-23). One consumer: home-page.tsx mounts `<NotificationBell/>` into the shell's `topbarTrail`
// slot while the deployment is multi-human capable (`/api/auth/config.multiHumanCapable`); the hooks
// stay internal (the bell IS the inbox surface).

export { NotificationBell } from "./components/notification-bell";
