// domain/admin — front door (the only legal external import). Also re-exports the guard seam primitives
// (can/isAdmin/requireAdmin/requireOwner) — NOT AdminService methods — which the entry composition root
// injects into the other domains that gate; a sibling domain never runtime-imports them sideways.

export type { Can, GlobalAction, ResourceRef, UserRole } from "@orb/contracts/identity";
export type { IsAdmin, RequireAdmin, RequireOwner } from "./contract/guard.ts";
export type { AdminService } from "./contract/service.ts";
export type { AdminUserView } from "./contract/views.ts";
export { can, isAdmin, requireAdmin, requireOwner } from "./guard.ts";
export { createAdminService } from "./service.ts";
