// Shared substrate for the transport/trpc tests (NOT a test file — the test-layout gate collects only
// *.test kinds; this is imported, never run). Transport is a THIN driver, so the unit tests inject a FAKE
// `Services` bundle (only the verbs under test, as typed `vi.fn`s) + a constructed `Principal` + a no-op
// rate-limit gate, and drive the real `appRouter` through `createCaller` — exercising the real middleware
// ladder + router wiring without a db or HTTP. (No determinism seam needed: transport reads no clock.)

import type { CreateInviteResult, InvitePreview, RedeemInviteResult } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { Handle, SessionId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
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

type TestServices = { [K in keyof Services]?: Partial<Services[K]> };

/** Complete the production-derived partial service map with a loud runtime boundary. The single assertion
 * licenses only omitted, unreachable domains; every supplied domain and verb remains checked against the
 * real `Services` contract, and an accidental unstubbed read throws at the point of use. */
function testServices(parts: TestServices): Services {
  const supplied: TestServices = { ...parts };
  return new Proxy(supplied, {
    get: (target, property, receiver): unknown => {
      if (!Reflect.has(target, property)) {
        throw new Error(`transport test reached unstubbed service ${String(property)}`);
      }
      return Reflect.get(target, property, receiver);
    },
  }) as Services;
}

/** Build a transport Context from only the parts a test cares about. */
export function makeContext(parts: {
  auth?: Principal | null;
  services?: TestServices;
  rateLimit?: RateLimitGate;
  presence?: PresenceRegistry;
  /** The multiplexed-socket cells; a fresh isolated registry per context unless the test supplies one. */
  sockets?: SocketRegistry;
  /** W7a — WHICH cookie session this request came in on. Defaults to `null` (the sessionless admission arms);
   *  the per-SESSION socket-eviction tests set it, because it is what `stream.connect` stamps on the cell. */
  sessionId?: SessionId | null;
  /** Defaults TRUE (multi-human capable) so the multi-human surfaces stay reachable; the belt
   *  tests set it FALSE to exercise the 404 refusal. */
  multiHumanCapable?: boolean;
  csrfHeaderPresent?: boolean;
  clientIp?: string | null;
}): Context {
  return {
    auth: parts.auth ?? null,
    sessionId: parts.sessionId ?? null,
    services: testServices(parts.services ?? {}),
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

/** Well-formed results for the invite verbs whose procedures carry a strict output parser
 *  (`createInvite`, `previewInvite`, `redeemInvite`/`acceptInvite`, `listInvites`). A fabricated result
 *  fails those parsers, so a test that only needs the procedure to REACH its verb returns one of these. */
export interface InviteResults {
  readonly inviteView: CreateInviteResult["invite"];
  readonly created: CreateInviteResult;
  readonly preview: InvitePreview;
  readonly joinerRow: RedeemInviteResult["participant"];
  readonly redeemed: RedeemInviteResult;
}

const INVITE_FIXTURE_AT = 1_750_000_000_000;

/** Fresh minted ids per call; `joiner` is the member the join results seat. */
export function inviteResults(joiner: UserId): InviteResults {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const inviteView: CreateInviteResult["invite"] = {
    id: mintTypeId(ID_PREFIX.chatInvite),
    chatId,
    status: "pending",
    maxUses: 1,
    remainingUses: 1,
    expiresAt: INVITE_FIXTURE_AT + 1,
    invitedUserId: null,
    allowSignup: false,
    createdAt: INVITE_FIXTURE_AT,
  };
  const joinerRow: RedeemInviteResult["participant"] = {
    id: mintTypeId(ID_PREFIX.chatParticipant),
    chatId,
    kind: "human",
    userId: joiner,
    characterId: null,
    role: "member",
    activePersonaId: mintTypeId(ID_PREFIX.persona),
    talkativeness: 0.5,
    disabled: false,
    joinedAt: INVITE_FIXTURE_AT,
    joinSeq: 12,
    leftSeq: null,
    joinHistoryVisibility: "from-join",
    displayName: "Joiner",
    handle: castId<Handle>("joiner"),
    avatarAssetId: null,
    avatarHash: null,
    renderPolicy: { htmlTrust: "untrusted", forbidExternalMedia: true },
    themeOverride: null,
    backgroundOverride: null,
  };
  return {
    inviteView,
    created: { invite: inviteView, token: "raw-invite-token-returned-exactly-once-7Qx2" },
    preview: { chatId, roomName: "The Ruins", hostHandle: castId<Handle>("host"), memberCount: 2, modeLabel: "per-speaker · natural" },
    joinerRow,
    redeemed: {
      chat: {
        id: chatId,
        title: "The Ruins",
        starred: false,
        archived: false,
        temporary: false,
        parentChatId: null,
        forkedAt: null,
        anchorPersonaId: null,
        participants: [joinerRow],
        viewerActivePersonaId: joinerRow.activePersonaId,
        viewerIsHost: false,
        viewerUserId: joiner,
        pendingHostUserId: null,
        group: DEFAULT_GROUP_CONFIG,
        roomOverrides: DEFAULT_ROOM_OVERRIDES,
        toolRecurseLimit: null,
        hostDisplayScripts: false,
        offerChoices: null,
        charactersCanReact: null,
        reactionsEnabled: null,
        background: null,
        rpg: null,
        opening: null,
        compactSummary: null,
        compactedAtSeq: null,
        createdAt: INVITE_FIXTURE_AT,
        updatedAt: INVITE_FIXTURE_AT,
        identities: [{ kind: "character", id: mintTypeId(ID_PREFIX.character), name: "Aria", avatarHash: null }],
      },
      participant: joinerRow,
    },
  };
}
