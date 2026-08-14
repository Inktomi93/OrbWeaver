// Shared substrate for the transport/trpc tests (NOT a test file — the test-layout gate collects only
// *.test kinds; this is imported, never run). Transport is a THIN driver, so the unit tests inject a FAKE
// `Services` bundle (only the verbs under test, as typed `vi.fn`s) + a constructed `Principal` + a no-op
// rate-limit gate, and drive the real `appRouter` through `createCaller` — exercising the real middleware
// ladder + router wiring without a db or HTTP. (No determinism seam needed: transport reads no clock.)

import type { Principal, UserRole } from "@orb/contracts/identity";
import type { Handle, SessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Context, PresenceRegistry, RateLimitGate, Services, SocketRegistry } from "@orb/server/transport/trpc";
import { createCaller, createSocketRegistry } from "@orb/server/transport/trpc";

/** A minimal Principal carrying the given role; `via` defaults to header (no CSRF surface). */
export function principal(role: UserRole, overrides: Partial<Principal> = {}): Principal {
  const userId = overrides.userId ?? castId<UserId>(`user_${role}`);
  return {
    userId,
    role,
    handle: castId<Handle>(userId),
    externalId: null,
    via: "header",
    ...overrides,
  };
}

/** A rate-limit gate that always allows (the default; the rate-limit primitive is a separate slice). */
const allowAll: RateLimitGate = { enforce: () => Promise.resolve() };

/** An inert presence registry (the default; presence's ref-count is exercised in its own slice test). */
export const inertPresence: PresenceRegistry = {
  connect: (): void => {
    // inert: the ref-count is exercised in the presence-registry slice test, not the router tests.
  },
  read: (userId) => ({ userId, online: true, lastSeenAt: null }),
};

/** A FRESH socket registry per context (SSE-1) — the multiplexed-socket cells. Per-context so a router test
 *  drives an isolated socket world; the clock is fixed because reap is the only time-sensitive behavior and
 *  it has its own slice test. */
function inertSockets(): SocketRegistry {
  return createSocketRegistry(() => 0);
}

/** A rate-limit gate that rejects with the given error (to prove the middleware wires the injected gate). */
export function denyRateLimit(error: Error): RateLimitGate {
  return { enforce: () => Promise.reject(error) };
}

/** Build a transport Context from only the parts a test cares about; the fake services are a partial cast
 *  (a thin router calls exactly one verb, so the unstubbed remainder is never reached). */
export function makeContext(parts: {
  auth?: Principal | null;
  services?: { [K in keyof Services]?: Partial<Services[K]> };
  rateLimit?: RateLimitGate;
  presence?: PresenceRegistry;
  /** The multiplexed-socket cells; a fresh isolated registry per context unless the test supplies one. */
  sockets?: SocketRegistry;
  /** W7a — WHICH cookie session this request came in on. Defaults to `null` (the sessionless admission arms);
   *  the per-SESSION socket-eviction tests set it, because it is what `stream.connect` stamps on the cell. */
  sessionId?: SessionId | null;
  /** Defaults TRUE (multi-human capable) so the multi-human surfaces stay reachable; the PD-106 belt
   *  tests set it FALSE to exercise the 404 refusal. */
  multiHumanCapable?: boolean;
  csrfHeaderPresent?: boolean;
  clientIp?: string | null;
}): Context {
  return {
    auth: parts.auth ?? null,
    sessionId: parts.sessionId ?? null,
    // biome-ignore lint/suspicious/noExplicitAny: a thin router reaches exactly one verb; the rest of the partial Services is never read.
    services: (parts.services ?? {}) as any as Services,
    rateLimit: parts.rateLimit ?? allowAll,
    presence: parts.presence ?? inertPresence,
    sockets: parts.sockets ?? inertSockets(),
    multiHumanCapable: parts.multiHumanCapable ?? true,
    csrfHeaderPresent: parts.csrfHeaderPresent ?? false,
    clientIp: parts.clientIp ?? "127.0.0.1",
  };
}

/** The server-side caller through the full middleware ladder. */
export function caller(ctx: Context): ReturnType<typeof createCaller> {
  return createCaller(ctx);
}
