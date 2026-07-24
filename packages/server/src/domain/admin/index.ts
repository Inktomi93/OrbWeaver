// domain/admin — front door (the only legal external import). Also re-exports the guard seam primitives
// (can/requireAdmin/requireOwner/canAgent) — NOT AdminService methods — which the entry composition root
// injects into the other domains that gate; a sibling domain never runtime-imports them sideways.

export type { Can, GlobalAction, ResourceRef, UserRole } from "@orb/contracts/identity";
export type { IsAdmin, RequireAdmin, RequireOwner } from "./contract/guard";
export type { AdminService } from "./contract/service";
export type { AdminEngineStatus, AdminUserView } from "./contract/views";
export { can, isAdmin, requireAdmin, requireOwner } from "./guard";
export { createAdminService } from "./service";
