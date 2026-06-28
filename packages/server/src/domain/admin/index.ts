// domain/admin — FRONT DOOR (the only legal external import). Re-exports the public surface:
//   • the AdminService contract + AdminUserView (client consumes via tRPC service-method-signature
//     inference) + the UserRole union (canonical home @orb/contracts/identity, re-exported for ergonomics)
//   • createAdminService (the factory the entry root wires)
//   • the GUARD SEAM primitives — `can`/`requireAdmin`/`requireOwner` (NOT AdminService methods): the entry
//     composition root imports these here and INJECTS them into the other domains that gate (settings ←
//     requireAdmin, credentials ← requireOwner, transport ← can). A sibling domain NEVER runtime-imports
//     them sideways (domain-no-cross-feature) — it declares the injected dep with the op TYPES (the
//     type-only cross-feature edge is sanctioned) and receives the runtime op at the root.

// The privilege union (canonical home is @orb/contracts; re-exported for ergonomics).
export type { UserRole } from "@orb/contracts/identity";
// The guard seam — the op types the gating domains inject (type-only) at the composition root.
export type { Can, GlobalAction, RequireAdmin, RequireOwner, ResourceRef } from "./contract/guard";
// Service contract (client consumes AdminUserView via tRPC service-method-signature inference).
export type { AdminService } from "./contract/service";
export type { AdminUserView } from "./contract/views";
// The guard seam primitives — injected at the root into the other domains that gate.
export { can, requireAdmin, requireOwner } from "./guard";
// Factory.
export { createAdminService } from "./service";
