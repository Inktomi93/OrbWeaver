// user-admin/ front door (UI-Arch §2.1) — the ONLY entry into the admin slice (dep-cruiser
// client-feature-front-door). Owns the Admin settings pane (client-architecture-lockdown.md §8/O3,
// M6.2 de-god move) — a real feature imports no other feature; cross-domain reads ride trpc.*.

export { adminEnginesSection } from "./lib/admin-engines-section.tsx";
export { adminCatalogSection, adminEmbeddingsSection } from "./lib/admin-ops-sections.tsx";
export { adminPane } from "./lib/admin-pane.tsx";
export { adminUsersSection } from "./lib/admin-users-section.tsx";
export { memoryTuningSection } from "./lib/memory-tuning-section.tsx";
export { rateLimitsSection } from "./lib/rate-limits-section.tsx";
export { structuredOutputSection } from "./lib/structured-output-section.tsx";
export { computeSection, mediaTrustSection, multiUserSection, operationsSection, sharedAccessSection } from "./lib/system-config-sections.tsx";
export { systemTuningSection } from "./lib/system-tuning-section.tsx";
