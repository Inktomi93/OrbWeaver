// auth/ front door (UI-Arch §2.1) — the ONLY entry into the auth slice (dep-cruiser
// client-feature-front-door). Consumers: the /login route (shell anchor + surface + reverse-gate), the
// router's protected-route `beforeLoad` guards, and home-page.tsx (the `account` modal body + the
// deployment-config read below). The bootstrap fetchers/hooks otherwise stay internal — cross-feature
// "who am I" reads ride `trpc.sessions.me` (`data/use-viewer.ts`), never this slice.

export { LoginShellAnchor } from "./anchors/login-shell-anchor";
// The deployment-CONFIG read for the COMPOSITION ROOT (home-page.tsx): the route reads
// `multiHumanCapable` and conditionally mounts / prop-threads the multi-human surfaces (the
// notifications bell, the People tab, the /join landing). Config, not identity — the "who am I"
// carve-out above still holds.
export { useAuthConfig } from "./hooks/use-auth-meta";
export { redirectIfAuthed, requireAuthed } from "./lib/route-guards";
export { AccountSurface } from "./surfaces/account-surface";
export { LoginSurface } from "./surfaces/login-surface";
