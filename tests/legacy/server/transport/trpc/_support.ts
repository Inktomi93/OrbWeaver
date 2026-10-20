// Shared substrate for the transport/trpc tests (NOT a test file — the test-layout gate collects only
// *.test kinds; this is imported, never run). Transport is a THIN driver, so the unit tests inject a FAKE
// `Services` bundle (only the verbs under test, as typed `vi.fn`s) + a row-resolved `Principal` + a no-op
// rate-limit gate, and drive the real `appRouter` through `createCaller` — exercising the real middleware
// ladder + router wiring without HTTP. The only database is the testkit in-memory one the caller's row lives in.

import type { CreateInviteResult, InvitePreview, ParticipantView, RedeemInviteResult } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { Handle, SessionId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { createRpgEventBus } from "@orb/server/domain/rpg";
import { createWorkloadProgressBus } from "@orb/server/domain/workloads";
import type { Context, LiveBuses, PresenceRegistry, RateLimitGate, Services, SocketRegistry } from "@orb/server/transport/trpc";
import { createCaller, createLiveBuses, createSocketRegistry } from "@orb/server/transport/trpc";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { onTestFinished } from "vitest";
import { principal as makePrincipal } from "../../../db/schema/_support.ts";
import type { seatRoles } from "../../domain/chat/_support.ts";

/** The caller for a role, resolved from its seeded row. `userId` and `handle` are written onto that row first.
 *  @throws Error for any other override (`via`, `externalId`): a row-resolved caller is always `via: "fallback"`, so a
 *  case that needs a request credential fails here instead of silently passing as a fallback caller. */
export async function principal(db: Db, role: UserRole, overrides: { readonly userId?: UserId; readonly handle?: Handle } = {}): Promise<Principal> {
  const unhonored = Object.keys(overrides).filter((key) => key !== "userId" && key !== "handle");
  if (unhonored.length > 0) {
    throw new Error(`principal(): a row-resolved caller cannot carry ${unhonored.join(", ")}; this case needs a request credential`);
  }
  const userId = overrides.userId ?? castId<UserId>(`user_${role}`);
  return await makePrincipal({ db }, userId, { role, handle: overrides.handle ?? castId<Handle>(userId) });
}

/** The production live channels of one application graph, released when the calling test finishes. */
export function testLiveBuses(): LiveBuses {
  const owner = new DisposableStack();
  onTestFinished(() => {
    owner.dispose();
  });
  // biome-ignore lint/nursery/useDisposables: the test-scoped owner stack above disposes this bus when the test finishes.
  const rpg = owner.use(createRpgEventBus());
  // biome-ignore lint/nursery/useDisposables: the test-scoped owner stack above disposes this bus when the test finishes.
  const workloads = owner.use(createWorkloadProgressBus());
  return owner.use(createLiveBuses({ rpg, workloads }));
}

type RedeemInviteData = Awaited<ReturnType<ChatService["redeemInvite"]>>;
type ParticipantData = RedeemInviteData["participant"];
type SeatRoleStates = Awaited<ReturnType<typeof seatRoles>>;

/** The domain twin of a wire roster row: the same fields, the seat role as captured row data. */
export function participantData(view: ParticipantView, roles: SeatRoleStates): ParticipantData {
  return { ...view, role: roles[view.role] };
}

/** The domain twin of a wire redeem result, the shape the chat service hands the router. */
export function redeemedData(wire: RedeemInviteResult, roles: SeatRoleStates): RedeemInviteData {
  return {
    ...wire,
    participant: participantData(wire.participant, roles),
    chat: { ...wire.chat, participants: wire.chat.participants.map((row) => participantData(row, roles)) },
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
  /** The application graph's live channels; the production set, owned by the calling test, unless supplied. */
  liveBuses?: LiveBuses;
}): Context {
  return {
    auth: parts.auth ?? null,
    liveBuses: parts.liveBuses ?? testLiveBuses(),
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

/** Fresh minted ids per call; `joiner` is the member the join results seat. */
export function inviteResults(joiner: UserId): InviteResults {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const inviteView: CreateInviteResult["invite"] = {
    id: mintTypeId(ID_PREFIX.chatInvite),
    chatId,
    status: "pending",
    maxUses: 1,
    remainingUses: 1,
    expiresAt: FROZEN_AT_MS + 1,
    invitedUserId: null,
    allowSignup: false,
    createdAt: FROZEN_AT_MS,
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
    joinedAt: FROZEN_AT_MS,
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
        anchorState: "none",
        participants: [joinerRow],
        viewerActivePersonaId: joinerRow.activePersonaId,
        viewerIsHost: false,
        viewerUserId: joiner,
        viewerOwnedCharacterIds: [],
        viewerGalleryCharacterId: null,
        pendingHostUserId: null,
        group: DEFAULT_GROUP_CONFIG,
        roomOverrides: DEFAULT_ROOM_OVERRIDES,
        toolRecurseLimit: null,
        hostDisplayScripts: false,
        offerChoices: null,
        charactersCanReact: null,
        reactionsEnabled: null,
        memberPersonaLore: true,
        background: null,
        rpg: null,
        opening: null,
        compactSummary: null,
        compactedAtSeq: null,
        createdAt: FROZEN_AT_MS,
        updatedAt: FROZEN_AT_MS,
        identities: [{ kind: "character", id: mintTypeId(ID_PREFIX.character), name: "Aria", avatarHash: null }],
      },
      participant: joinerRow,
    },
  };
}
