// credentials/ front door (UI-Arch §2.1) — the ONLY entry into the connections slice (dep-cruiser
// client-feature-front-door). Owns the Connections config group (client-architecture-lockdown.md
// §8/O3, M6.2 de-god move) — a `sections` skimmer whose three rows are the contributions below
// (inference program §5.3a: connections · model roles · saved keys) — a real feature imports no other
// feature; cross-domain reads ride trpc.*.

export { connectionsGroup } from "./lib/connections-group.tsx";
export { connectionsKeysSection } from "./lib/connections-keys-section.tsx";
export { connectionsListSection } from "./lib/connections-list-section.tsx";
export { connectionsRolesSection } from "./lib/connections-roles-section.tsx";
