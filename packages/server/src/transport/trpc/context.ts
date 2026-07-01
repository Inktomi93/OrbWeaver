// transport/trpc/context — the per-request tRPC Context the procedure ladder reads (core/Tier-4-Transport.md
// §"context.ts"). PURE PACKAGING: it carries the entry-built `Principal`, the constructed `Services`
// bundle, the injected rate-limit gate, and the per-request edge signals — NO db, NO header parsing, NO
// identity resolution (those are the `entry/auth/seam.ts` + `entry/app.ts` concerns; transport CARRIES
// the result). Identity is resolved ONCE at the seam into one immutable `Principal` (spine
// identity-auth-permission §0/§1); `auth` is `null` for an anonymous caller.
//
// Type-home note: these are `interface`s, the sanctioned shape outside `domain/**` (the no-inline-types
// grit flags `export type`/`z.object` outside a type home, and `export interface` only INSIDE a domain
// feature — transport is neither). The DI bundle is an explicit interface, never a `ReturnType<>`.

import type { Principal } from "@orb/contracts/identity";
import type { AdminService } from "#domain/admin";
import type { BuddyService } from "#domain/buddy";
import type { CharacterService } from "#domain/character";
import type { ChatService } from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { CredentialsService } from "#domain/credentials";
import type { DiscoveryService } from "#domain/discovery";
import type { NotificationsService } from "#domain/notifications";
import type { PersonaService } from "#domain/persona";
import type { PresetService } from "#domain/preset";
import type { SearchService } from "#domain/search";
import type { SettingsService } from "#domain/settings";
import type { StatsService } from "#domain/stats";
import type { TagService } from "#domain/tag";
import type { WorkloadService } from "#domain/workloads";
import type { WorldInfoService } from "#domain/world-info";

/**
 * The constructed domain services, wired with their db + cross-feature deps at the `entry/` composition
 * root and handed to each request. A router reaches a domain ONLY through its front-door service here —
 * never `@orb/db`/`infra/*` directly (the `drivers-through-domain` rule). One key per domain front door.
 *
 * FLAG[PD-46]: `chat` — the chat service is now CONSTRUCTED + wired at the composition root (entry/compose/
 * chat.ts) and carried here. Its tRPC ROUTER (`chat.send`/`swipe`/`start`/`streamMessages`) is the remaining
 * PD-46 piece — the SSE `streamMessages` resume needs the chat bus replay-ring handle surfaced from compose
 * (the bus is currently held internally; see the integration report's hand-off). `embeddings` (the admin
 * inline `embed` write) is FLAG[PD-90] — see `routers/` DEFER notes.
 */
export interface Services {
  readonly admin: AdminService;
  readonly buddy: BuddyService;
  readonly character: CharacterService;
  readonly chat: ChatService;
  readonly connection: ConnectionService;
  readonly credentials: CredentialsService;
  readonly discovery: DiscoveryService;
  readonly notifications: NotificationsService;
  readonly persona: PersonaService;
  readonly preset: PresetService;
  readonly search: SearchService;
  readonly settings: SettingsService;
  readonly stats: StatsService;
  readonly tag: TagService;
  readonly workloads: WorkloadService;
  readonly worldInfo: WorldInfoService;
}

/**
 * The inputs the rate-limit gate decides on. The gate body (which bucket — anonymous per-IP vs authed
 * per-user vs the $/GPU `aiTurn` bucket vs the per-member COUNT budget) is the INJECTED implementation's
 * concern; transport hands it the request facts and awaits its verdict. `principal` is `null` for an
 * anonymous caller (the gate keys the tight per-IP bucket); `type` selects the query/mutation split.
 */
export interface RateLimitDecision {
  readonly path: string;
  readonly type: "query" | "mutation" | "subscription";
  readonly principal: Principal | null;
  readonly clientIp: string | null;
}

/**
 * The rate-limit gate — the injected middleware seam (core/Tier-4-Transport.md §"rate-limit"). The DB-backed
 * limiter PRIMITIVE (`transport/rate-limit.ts`) and the bucket policy are constructed at `entry/` (db is
 * required at construction) and threaded onto `ctx`; transport declares only this port and calls
 * `enforce` from the ladder. `enforce` rejects with `DomainRateLimitError` when over cap (mapped to
 * `TOO_MANY_REQUESTS` + `Retry-After` downstream). FLAG(entry): wire this from the limiter primitive.
 */
export interface RateLimitGate {
  readonly enforce: (decision: RateLimitDecision) => Promise<void>;
}

/**
 * The per-request tRPC context. `auth` is the immutable seam-built `Principal` (or `null` when
 * anonymous); the ladder gates on plain fields (no db round-trip). `csrfHeaderPresent` is the custom
 * CSRF header signal the `entry/` mount reads off the request (transport does no header parsing) — the
 * auth gate keys CSRF on `Principal.via === "cookie"` + this flag. `clientIp` (peer + XFF, derived at the
 * seam) lets `publicProcedure` key its per-IP bucket even without an identity.
 */
export interface Context {
  readonly auth: Principal | null;
  readonly services: Services;
  readonly rateLimit: RateLimitGate;
  readonly csrfHeaderPresent: boolean;
  readonly clientIp: string | null;
}

/**
 * Pure packaging — the typed seam `entry/app.ts` calls per request after the `entry/auth/seam.ts` has
 * resolved the `Principal`. No db, no header parsing, no identity resolution: it only assembles the
 * already-resolved parts into the `Context` the ladder reads.
 */
export function createContext(parts: {
  readonly auth: Principal | null;
  readonly services: Services;
  readonly rateLimit: RateLimitGate;
  readonly csrfHeaderPresent: boolean;
  readonly clientIp: string | null;
}): Context {
  return {
    auth: parts.auth,
    services: parts.services,
    rateLimit: parts.rateLimit,
    csrfHeaderPresent: parts.csrfHeaderPresent,
    clientIp: parts.clientIp,
  };
}
