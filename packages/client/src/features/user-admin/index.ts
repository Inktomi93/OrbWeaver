// user-admin/ front door (UI-Arch §2.1) — the ONLY entry into the admin slice (dep-cruiser
// client-feature-front-door). Owns the Admin settings pane (client-architecture-lockdown.md §8/O3,
// M6.2 de-god move) — a real feature imports no other feature; cross-domain reads ride trpc.*.

export { adminPane } from "./lib/admin-pane";
