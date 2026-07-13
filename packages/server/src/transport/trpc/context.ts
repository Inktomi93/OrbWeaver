// The per-request tRPC Context the procedure ladder reads. Pure packaging: it carries the entry-built
// Principal, the constructed Services bundle, the injected rate-limit gate, and the per-request edge
// signals — no db, no header parsing, no identity resolution (those are entry's concerns; transport
// carries the result). Identity is resolved once at the seam into one immutable Principal; `auth` is
// `null` for an anonymous caller.

import type { Principal } from "@orb/contracts/identity";
import type { AdminService } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import type { BuddyService } from "#domain/buddy";
import type { CharacterService } from "#domain/character";
import type { ChatService } from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { CredentialsService } from "#domain/credentials";
import type { DiscoveryService } from "#domain/discovery";
import type { HubService } from "#domain/hub";
import type { NotificationsService } from "#domain/notifications";
import type { PersonaService } from "#domain/persona";
import type { PresetService } from "#domain/preset";
import type { SearchService } from "#domain/search";
import type { SettingsService } from "#domain/settings";
import type { StatsService } from "#domain/stats";
import type { TagService } from "#domain/tag";
import type { WorkloadService } from "#domain/workloads";
import type { WorldInfoService } from "#domain/world-info";
import type { PresenceRegistry } from "./presence-registry";

/**
 * The constructed domain services, wired with their db + cross-feature deps at the entry composition root
 * and handed to each request. A router reaches a domain only through its front-door service here — never
 * \@orb/db/infra/* directly. One key per domain front door.
 */
export interface Services {
  readonly admin: AdminService;
  readonly assets: AssetsService;
  readonly buddy: BuddyService;
  readonly character: CharacterService;
  readonly chat: ChatService;
  readonly connection: ConnectionService;
  readonly credentials: CredentialsService;
  readonly discovery: DiscoveryService;
  readonly hub: HubService;
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

/** The inputs the rate-limit gate decides on. Which bucket is the injected implementation's concern;
 *  transport hands it the request facts and awaits its verdict. */
export interface RateLimitDecision {
  readonly path: string;
  readonly type: "query" | "mutation" | "subscription";
  readonly principal: Principal | null;
  readonly clientIp: string | null;
}

/** The rate-limit gate — the injected middleware seam. `enforce` rejects with `DomainRateLimitError` when
 *  over cap (mapped to TOO_MANY_REQUESTS + Retry-After downstream). */
export interface RateLimitGate {
  readonly enforce: (decision: RateLimitDecision) => Promise<void>;
}

export interface Context {
  readonly auth: Principal | null;
  readonly services: Services;
  readonly rateLimit: RateLimitGate;
  /** SSE subscriptions call presence.connect(userId, signal) to ref-count device liveness. */
  readonly presence: PresenceRegistry;
  /** Can ≥2 humans authenticate on this deployment? `multiHumanProcedure` refuses its surfaces with
   *  NOT_FOUND while false. Derived per-request (the local toggle is a runtime AppSetting). */
  readonly multiHumanCapable: boolean;
  readonly csrfHeaderPresent: boolean;
  readonly clientIp: string | null;
}

/** Pure packaging — the typed seam entry/app.ts calls per request after the auth seam has resolved the
 *  Principal. No db, no header parsing, no identity resolution. */
export function createContext(parts: {
  readonly auth: Principal | null;
  readonly services: Services;
  readonly rateLimit: RateLimitGate;
  readonly presence: PresenceRegistry;
  readonly multiHumanCapable: boolean;
  readonly csrfHeaderPresent: boolean;
  readonly clientIp: string | null;
}): Context {
  return {
    auth: parts.auth,
    services: parts.services,
    rateLimit: parts.rateLimit,
    presence: parts.presence,
    multiHumanCapable: parts.multiHumanCapable,
    csrfHeaderPresent: parts.csrfHeaderPresent,
    clientIp: parts.clientIp,
  };
}
