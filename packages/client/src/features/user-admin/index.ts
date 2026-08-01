// user-admin/ front door (UI-Arch §2.1) — the ONLY entry into the admin slice (dep-cruiser
// client-feature-front-door). Owns the Admin settings pane (client-architecture-lockdown.md §8/O3,
// M6.2 de-god move) — a real feature imports no other feature; cross-domain reads ride trpc.*.

export { adminEnginesSection } from "./lib/admin-engines-section";
export { adminCatalogSection, adminEmbeddingsSection } from "./lib/admin-ops-sections";
export { adminPane } from "./lib/admin-pane";
export { adminUsersSection } from "./lib/admin-users-section";
export { memoryTuningSection } from "./lib/memory-tuning-section";
export { rateLimitsSection } from "./lib/rate-limits-section";
export { computeSection, mediaTrustSection, multiUserSection, operationsSection, sharedAccessSection } from "./lib/system-config-sections";
export { systemTuningSection } from "./lib/system-tuning-section";
