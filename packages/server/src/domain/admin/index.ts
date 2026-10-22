// domain/admin — front door (the only legal external import). Also re-exports the guard seam primitives
// (can/isAdmin/isOwner/requireAdmin/requireOwner) — NOT AdminService methods — which the entry composition
// injects into the other domains that gate; a sibling domain never runtime-imports them sideways.

export type { Can, GlobalAction, ResourceRef, UserRole } from "@orb/contracts/identity";
export type { IsAdmin, IsOwner, RequireAdmin, RequireOwner } from "./contract/guard.ts";
export type { AdminCardEmbedDeps, AdminSessionPolicyDeps } from "./contract/ops.ts";
export { revokeUserSessionsResultSchema } from "./contract/results.ts";
export type { AdminService, ServerRestartPort } from "./contract/service.ts";
export { can, isAdmin, isOwner, requireAdmin, requireOwner } from "./guard.ts";
export { createAdminService } from "./service.ts";
export { createAdminCardEmbed } from "./verbs/card-embed.ts";
export { createPluginDistributionRecipients } from "./verbs/plugin-recipients.ts";
export { createAdminSessionPort } from "./verbs/session-policy.ts";
export { createSignupMinterCheck } from "./verbs/signup-minter-check.ts";
