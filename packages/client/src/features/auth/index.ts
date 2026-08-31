// auth/ front door — the only entry into the auth slice. Consumers: the /login route, the router's
// protected-route beforeLoad guards, and app-root.tsx. Cross-feature "who am I" reads ride
// trpc.sessions.me directly, never this slice.

// The `account` modal RETIRED with #866 S4 (owner-ruled F-3): its facts + sign-out live in the persona
// switcher's foot now (`PersonaAccountFoot`), over the `useAuthMe`/`signOut` seams that moved to `#data`.
export { useAuthConfig } from "#data";
export { LoginShellAnchor } from "./anchors/login-shell-anchor.tsx";
export { reauthModal } from "./lib/reauth-modal.tsx";
export { redirectIfAuthed, requireAuthed } from "./lib/route-guards.ts";
export { LoginSurface } from "./surfaces/login-surface.tsx";
