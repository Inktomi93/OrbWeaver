// THE AGENT-PRINCIPAL CONTAINMENT SUITE (AP1, unseated) — the named deliverable of
// agent-principal-design/07 §4: "a disabled agent principal can do NOTHING." ONE runnable module that
// proves the property end-to-end by driving the REAL cross-domain seams (sessions + admin + notifications +
// the db), so "the containment suite is green" is a SINGLE verifiable signal (re-run seated at the wave's
// close — 07 §4). Homed under admin because the ceiling (`canAgent`) + the containment verb (`setEnabled`)
// live here, but it constructs the sibling services it needs rather than pointing at their tests.
//
// EXERCISED HERE (runnable — every unseated arm 07 §4 names):
//   §4.1 Auth (wall one) — sessions can never hand back an agent Principal: `create` refuses to mint;
//                          `validate` returns null the instant a live session's user becomes an agent.
//   §4.2 Namespace       — the reserved `__agent__` handle is refused at every handle-accepting mint site
//                          (`ensureUser`, `provisionIdentity`, admin `createUser`) — no row written.
//                          (The fourth arm, targeted-invite, lives in `chat/verbs/invites.int`.)
//   §4.3 Turns           — `canAgent('speak'/'tool-propose')` gates on the agent's REAL `users.enabled`.
//   §4.6 Verbs           — `setRole`/`resetPassword` REFUSE an agent (`cannot_modify_agent`); `setEnabled`
//                          ACCEPTS it (the containment verb); `notifications.record` REFUSES an agent recipient.
//   §4.8 Reversibility   — disable → every action refused; re-enable → restored exactly (a flip, not a teardown).
//   §4.9 Cascade         — owner hard-delete removes the agent `users` row + the `agent_principals` satellite +
//                          the roster seat, SET-NULLs `messages.authorUserId`, leaves ZERO orphans
//                          (`PRAGMA foreign_key_check`).
//
// COVERED IN ITS OWN HARNESS (needs the full ChatContext — reconstructing ~40 injected ops here would be
// fragile duplication, not rigor): §4.6 `seatAgent` refuses a disabled agent → `chat/verbs/roster.int`.
// THE SEATED RE-RUN (AP4a, doc 07 §4 — a live seated topology, unbuildable pre-AP3/AP4a): the second describe
// block below EXTENDS this module with §4.7 Seats — `requireGmSeat` denies a DISABLED agent GM holder over
// REAL persisted state (`resolveGmSeat` FK-walks `users.enabled`), while the host RETAINS GM-eyes (a stuck
// campaign stays inspectable, doc 12 §6 re-key), and re-enabling restores authority (§4.8). The party-seat
// "zero schema change" proof + the party ⊆ roster verb-guard live in `rpg/verbs/join-party.int` (the agent
// rides `rpg_party.userId`). §4.4 Casts (arbitration/`{{group}}` drop after the flip) + §4.5 Tools (a proposal
// can't be confirmed) stay covered by `chat/agent-speaker.suite.int` — the AP3-2 voicing refusals. NOT
// buildable here: the agent-targeted pending-check AUTO-RESOLVE (doc 05 §1) — its `resolvePendingCheck` member
// verb was never built (only `requestCheck` exists); the delta rides that verb's future chunk (annotated in
// doc 05 §1 as DEFERRED-ON-DEPENDENCY).

import type { AgentActor, ResolvedIdentity } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import { agentPrincipals, chatParticipants, chats, messages, sessions, users } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { ChatId, ChatParticipantId, Handle, MessageId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { canAgent, createAdminService } from "@orb/server/domain/admin";
import type { NotificationsService } from "@orb/server/domain/notifications";
import { createNotificationsService } from "@orb/server/domain/notifications";
import { hasGmEyes, requireGmSeat, resolveGmSeat } from "@orb/server/domain/rpg";
import { createSessionsService } from "@orb/server/domain/sessions";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createFrozenClock } from "../../../support/clock.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { rpgRealIdentity } from "../../../support/rpg-context.ts";
import { makeHarness, principal, seedAgent, seedUser } from "./_support.ts";

type FreshDb = Awaited<ReturnType<typeof freshDb>>;

const PEPPER = "test-session-secret-at-least-32-chars-long";
// canAgent takes the present roster row as the room (a kicked/absent seat never reaches the gate).
const ROOM = { role: "member" } as const;
const AGENT_REFUSAL = /agent principal/iu;

const clock = createFrozenClock();
let db: FreshDb;
let owner: UserId;
let agent: UserId;

beforeEach(async () => {
  db = await freshDb();
  owner = await seedUser(db, { id: "user_owner", role: "user", handle: "owner" });
  agent = await seedAgent(db, owner); // handle `__agent__buddy__user_owner`, kind='agent', owned, loginless
});

/** Build the runtime `AgentActor` from the agent's ACTUAL persisted state (so the kill switch is proven
 *  against the real `users.enabled`, not an asserted literal). */
async function actorFromDb(agentId: UserId): Promise<AgentActor> {
  const row = (await db.select({ enabled: users.enabled, ownerUserId: users.ownerUserId }).from(users).where(eq(users.id, agentId)))[0];
  if (row === undefined || row.ownerUserId === null) {
    throw new Error("expected a seeded agent row with an owner");
  }
  return { kind: "agent", userId: agentId, ownerUserId: row.ownerUserId, enabled: row.enabled };
}

/** The notifications service wired with the REAL `users.kind` read (the entry root's D60 belt). */
function makeNotifications(): NotificationsService {
  return createNotificationsService({
    db,
    now: clock.now,
    isAgentRecipient: async (userId) => {
      const rows = await db.select({ kind: users.kind }).from(users).where(eq(users.id, userId)).limit(1);
      return rows[0]?.kind === "agent";
    },
  });
}

function agentInvite(recipientUserId: UserId): NotificationEvent {
  return {
    type: "invite",
    recipientUserId,
    chatId: mintTypeId(ID_PREFIX.chat),
    inviteId: mintTypeId(ID_PREFIX.chatInvite),
    invitedByHandle: castId<Handle>("host"),
  };
}

describe("agent-principal containment (AP1, unseated) — a disabled agent can do NOTHING", () => {
  test("§4.1 auth (wall one): no auth path ever yields an agent Principal", async () => {
    const sess = createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });

    // create REFUSES to mint a session for an agent — structurally sessionless; no row lands.
    await expect(sess.create({ userId: agent })).rejects.toThrow();
    expect(await db.select().from(sessions).where(eq(sessions.userId, agent))).toHaveLength(0);

    // validate can never hand back an agent Principal: a session live for a HUMAN stops resolving the instant
    // that row becomes a valid agent (the `kind='human'` JOIN belt).
    const human = await seedUser(db, { id: "user_h", role: "user", handle: "human" });
    const { token } = await sess.create({ userId: human });
    expect(await sess.validate(token)).not.toBeNull();
    await db
      .update(users)
      .set({
        kind: "agent",
        role: "user",
        passwordHash: null,
        externalId: null,
        ownerUserId: owner,
      })
      .where(eq(users.id, human));
    expect(await sess.validate(token)).toBeNull();
  });

  test("§4.2 namespace: the __agent__ handle is refused at every handle-accepting mint site — no row", async () => {
    const sess = createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });
    const adminSvc = createAdminService(makeHarness(db).ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    const before = (await db.select().from(users)).length;

    await expect(sess.ensureUser("__agent__buddy__deadbeef")).rejects.toThrow();
    const identity: ResolvedIdentity = {
      externalId: null,
      handle: castId<Handle>("__agent__buddy__x"),
      groups: [],
      email: null,
    };
    await expect(sess.provisionIdentity(identity)).rejects.toThrow();

    // The fourth belt arm: an admin cannot squat a deterministic buddy handle (doc 06 §1/§8 inv 3). Refused
    // with the same `invalid_handle` reason the empty-handle floor throws — the honest handle-validity code.
    await expect(
      adminSvc.createUser({ principal: principal(admin, "admin"), handle: "__agent__buddy__user_owner", password: "correct-horse" }),
    ).rejects.toMatchObject({ code: "invalid_handle" });

    expect((await db.select().from(users)).length).toBe(before); // no rows minted at any site
  });

  test("§4.3/§4.8 kill switch + reversibility: canAgent gates on the REAL principal state", async () => {
    const svc = createAdminService(makeHarness(db).ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    const p = principal(admin, "admin");

    // Enabled ⇒ may speak + propose.
    const enabled = await actorFromDb(agent);
    expect(() => canAgent(enabled, "speak", ROOM)).not.toThrow();
    expect(() => canAgent(enabled, "tool-propose", ROOM)).not.toThrow();

    // Disable the principal (the ONE-flip containment verb) ⇒ every action refused.
    await svc.setEnabled({ principal: p, userId: agent, enabled: false });
    const disabled = await actorFromDb(agent);
    expect(() => canAgent(disabled, "speak", ROOM)).toThrow(DomainForbiddenError);
    expect(() => canAgent(disabled, "tool-propose", ROOM)).toThrow(DomainForbiddenError);

    // Re-enable ⇒ restored EXACTLY (containment is a flip, not a teardown — §4.8).
    await svc.setEnabled({ principal: p, userId: agent, enabled: true });
    const restored = await actorFromDb(agent);
    expect(restored.enabled).toBe(true);
    expect(() => canAgent(restored, "speak", ROOM)).not.toThrow();
    expect(() => canAgent(restored, "tool-propose", ROOM)).not.toThrow();
  });

  test("§4.6 admin verb matrix: setRole/resetPassword REFUSE an agent; setEnabled ACCEPTS it", async () => {
    const svc = createAdminService(makeHarness(db).ctx);
    // setRole is OWNER-only (requireOwner, D17) — reach the agent-kind refusal with an owner caller (owner
    // ⊇ admin, so resetPassword/setEnabled pass too). The refusal fires on the TARGET's kind, not the tier.
    const root = await seedUser(db, { id: "user_root", role: "owner", handle: "root" });
    const p = principal(root, "owner");

    await expect(svc.setRole({ principal: p, userId: agent, role: "admin" })).rejects.toMatchObject({
      code: "cannot_modify_agent",
    });
    // A strong password so the refusal is reached AFTER the weak-password floor (not masked by it).
    await expect(svc.resetPassword({ principal: p, userId: agent, password: "a-strong-password-123" })).rejects.toMatchObject({ code: "cannot_modify_agent" });

    const updated = await svc.setEnabled({ principal: p, userId: agent, enabled: false });
    expect(updated.enabled).toBe(false);

    // The agent's role never moved — the `users_agent_shape` CHECK floor + the verb refusals, both intact.
    const row = (await db.select().from(users).where(eq(users.id, agent)))[0];
    expect(row?.role).toBe("user");
    expect(row?.kind).toBe("agent");
  });

  test("§4.6 notifications: record REFUSES an agent recipient — no durable row", async () => {
    const notifs = makeNotifications();
    await expect(notifs.record({ event: agentInvite(agent) })).rejects.toThrow(AGENT_REFUSAL);
    // Nothing landed in the agent's (non-)inbox — the refusal ran before the write.
    const page = await notifs.list({ principal: principal(agent, "user") });
    expect(page.items).toHaveLength(0);
  });

  test("§4.9 cascade: owner hard-delete removes the agent + SET-NULLs its canon, zero orphans", async () => {
    await db.insert(agentPrincipals).values({ userId: agent, sourceKind: "buddy" });

    // A room the agent is seated in + a message it AUTHORED (self-attributed: authorUserId=agent,
    // characterId null — D60 doc 02 §2).
    const chatId = castId<ChatId>("chat_containment");
    await db.insert(chats).values({ id: chatId });
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_agent"),
      chatId,
      kind: "agent",
      userId: agent,
      role: "member",
      joinSeq: 0,
    });
    const msgId = castId<MessageId>("message_agent");
    await db.insert(messages).values({ id: msgId, chatId, seq: 1, role: "assistant", authorUserId: agent });

    // Delete the OWNER → referential physics (agent-principal-design/01 §1, 03 §5 #4 — no reaper).
    await db.delete(users).where(eq(users.id, owner));

    // The agent principal is GONE: the users row, the satellite, and the roster seat all cascade.
    expect(await db.select().from(users).where(eq(users.id, agent))).toHaveLength(0);
    expect(await db.select().from(agentPrincipals).where(eq(agentPrincipals.userId, agent))).toHaveLength(0);
    expect(await db.select().from(chatParticipants).where(eq(chatParticipants.userId, agent))).toHaveLength(0);

    // Its authored message SURVIVES with authorUserId SET NULL (the D26 slot; attribution degrades — doc 02 §2,
    // the same shape `import` produces for an agent-authored row — doc 06 §6).
    const msg = (await db.select().from(messages).where(eq(messages.id, msgId)))[0];
    expect(msg).toBeDefined();
    expect(msg?.authorUserId).toBeNull();

    // And NOTHING dangles — the referential web is whole.
    const orphans = await db.all(sql`PRAGMA foreign_key_check`);
    expect(orphans).toHaveLength(0);
  });
});

// The REAL FK-walk the seat re-keys use — the SHARED compose factory (via `rpgRealIdentity`), not a hand-copied
// mirror (audit F6): `resolveGmSeat` consumes it, reading the holder's ACTUAL persisted `users.kind`/`enabled` so
// the ceiling is proven against real state through the exact production op.
function gmSeatIdentity(): ReturnType<typeof rpgRealIdentity> {
  return rpgRealIdentity(db);
}

describe("agent-principal containment (AP4a, SEATED) — the GM seat holds the ceiling (07 §4.7)", () => {
  test("§4.7/§4.8 GM seat: an ENABLED agent GM has AI tool authority; DISABLING revokes it (host keeps eyes); re-enable restores", async () => {
    const svc = createAdminService(makeHarness(db).ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    const p = principal(admin, "admin");
    const identity = gmSeatIdentity();

    // The agent HOLDS the GM seat (rpg_games.gmUserId = the agent's userId). Enabled ⇒ the AI tool path fires
    // (the agent GM narrates + fires rpg tools under requireGmSeat — the wave-close demo).
    const enabledSeat = await resolveGmSeat(identity, agent);
    expect(enabledSeat).toEqual({ kind: "agent", userId: agent, enabled: true });
    expect(() => requireGmSeat(enabledSeat, { kind: "gm-model" })).not.toThrow();

    // Disable the principal (the ONE-flip containment verb) ⇒ requireGmSeat DENIES the tool path: a disabled
    // agent GM writes NO game state. But the human host RETAINS GM-eyes — a stuck (disabled-GM) campaign must
    // stay inspectable/reassignable (doc 12 §6 re-key #3, extended to the agent seat).
    await svc.setEnabled({ principal: p, userId: agent, enabled: false });
    const disabledSeat = await resolveGmSeat(identity, agent);
    expect(disabledSeat).toEqual({ kind: "agent", userId: agent, enabled: false });
    expect(() => requireGmSeat(disabledSeat, { kind: "gm-model" })).toThrow(DomainForbiddenError);
    expect(hasGmEyes(disabledSeat, { kind: "user", userId: owner }, "host")).toBe(true);

    // Re-enable ⇒ authority restored EXACTLY (§4.8 — containment is a flip, not a teardown).
    await svc.setEnabled({ principal: p, userId: agent, enabled: true });
    const restoredSeat = await resolveGmSeat(identity, agent);
    expect(() => requireGmSeat(restoredSeat, { kind: "gm-model" })).not.toThrow();
  });

  test("§4.7 GM seat: a HUMAN GM holder denies the AI tool path (the seat is not AI-held — a human writes narration)", async () => {
    const human = await seedUser(db, { id: "user_humangm", role: "user", handle: "humangm" });
    const seat = await resolveGmSeat(gmSeatIdentity(), human);
    expect(seat).toEqual({ kind: "human", userId: human });
    expect(() => requireGmSeat(seat, { kind: "gm-model" })).toThrow(DomainForbiddenError);
    // And a human holder means the host is (usually) a PLAYER — no ambient GM-eyes (the spoiler-free host).
    expect(hasGmEyes(seat, { kind: "user", userId: owner }, "host")).toBe(false);
  });
});
