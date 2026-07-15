// credentials/ front door (UI-Arch §2.1) — the ONLY entry into the credentials slice (dep-cruiser
// client-feature-front-door). Owns the Connections settings pane (client-architecture-lockdown.md
// §8/O3, M6.2 de-god move) — a real feature imports no other feature; cross-domain reads ride trpc.*.

export { connectionsPane } from "./lib/connections-pane";
