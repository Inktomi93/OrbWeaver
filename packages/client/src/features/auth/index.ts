// auth/ front door — the only entry into the auth slice. Consumers: the /login route, the router's
// protected-route beforeLoad guards, and app-root.tsx. Cross-feature "who am I" reads ride
// trpc.sessions.me (data/use-viewer.ts), never this slice.

export { useAuthConfig } from "#data";
export { LoginShellAnchor } from "./anchors/login-shell-anchor.tsx";
export { accountModal } from "./lib/account-modal.tsx";
export { redirectIfAuthed, requireAuthed } from "./lib/route-guards.ts";
export { AccountSurface } from "./surfaces/account-surface.tsx";
export { LoginSurface } from "./surfaces/login-surface.tsx";
