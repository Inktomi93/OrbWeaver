// credentials/ front door (UI-Arch §2.1) — the ONLY entry into the credentials slice (dep-cruiser
// client-feature-front-door). Owns the Connections config group (client-architecture-lockdown.md
// §8/O3, M6.2 de-god move) — a `sections` skimmer whose three rows are the contributions below
// (config-revamp-design.md §6.8) — a real feature imports no other feature; cross-domain reads ride trpc.*.

export { connectionsGroup } from "./lib/connections-group.tsx";
export { connectionsHostClaudeSection } from "./lib/connections-host-claude-section.tsx";
export { connectionsKeysSection } from "./lib/connections-keys-section.tsx";
export { connectionsRolesSection } from "./lib/connections-roles-section.tsx";
