// D254 — the signup-invite ops over a real libSQL db: the pre-check, the one gated batch, and the minter
// re-check at redeem. The minter check is the composition root's own factory over the real sessions service,
// so a demoted or disabled minter is proven against the rows, not a stub.

import type { Db } from "@orb/db";
import { auditLogs, chatInvites, chatParticipants, personas, users } from "@orb/db";
import type { ChatId, ChatInviteId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { SignupInviteCapability } from "../../../../../packages/server/src/domain/chat/contract/signup.ts";
import { countPresentMembers, findInviteByTokenHash } from "../../../../../packages/server/src/domain/chat/persistence/invites.ts";
import { createInvitePreview } from "../../../../../packages/server/src/domain/chat/verbs/invite-preview.ts";
import { createSignupInvite } from "../../../../../packages/server/src/domain/chat/verbs/signup-invite.ts";
import { createJoinerPersonaStatement } from "../../../../../packages/server/src/domain/persona/verbs/joiner-persona-statement.ts";
import { createSessionsService } from "../../../../../packages/server/src/domain/sessions/service.ts";
import { createHostPrincipalResolver } from "../../../../../packages/server/src/entry/auth/seam.ts";
import { createSignupMinterCheck } from "../../../../../packages/server/src/entry/compose/chat.ts";
import { buildAuditStatementIfPrecedingWrote } from "../../../../../packages/server/src/foundation/observability/audit.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, makeLoadParticipantViews, seedChat, seedParticipant, seedUser } from "../_support.ts";

const DAY_MS = 86_400_000;
const TOKEN = "tok_signup";
const LOCAL: SignupInviteCapability = { mode: "local", mintable: true };

let db: Db;
let chatId: ChatId;
let minter: UserId;
let announced: ChatId[];
let adopted: { readonly userId: UserId; readonly personaId: PersonaId }[];

beforeEach(async () => {
  db = await freshDb();
  announced = [];
  adopted = [];
  minter = await seedUser(db, castId<Handle>("minter"));
  await db.update(users).set({ role: "admin" }).where(eq(users.id, minter));
  chatId = await seedChat(db, "signup-room");
  await seedParticipant(db, { chatId, key: "host", userId: minter, role: "host" });
  await db.insert(chatInvites).values({
    id: castId<ChatInviteId>("chat_invite_signup"),
    chatId,
    tokenHash: `h:${TOKEN}`,
    maxUses: 2,
    expiresAt: FROZEN_AT + DAY_MS,
    allowSignup: true,
    createdByUserId: minter,
    mintMode: "local",
    createdAt: FROZEN_AT,
  });
});

function ops(capability: SignupInviteCapability = LOCAL): ReturnType<typeof createSignupInvite> {
  const sessions = createSessionsService({ db, now: () => FROZEN_AT, sessionSecret: "s".repeat(32), seedUserConnections: () => Promise.resolve() });
  return createSignupInvite(makeChatContext(db, { signupInvites: capability }), {
    signupUserStatement: sessions.signupUserStatement,
    signupPersonaStatement: createJoinerPersonaStatement({ db, newPersonaId: () => castId<PersonaId>(`persona_joiner_${adopted.length}`) }),
    adoptJoinerPersona: (userId, personaId) => {
      adopted.push({ userId, personaId });
      return Promise.resolve();
    },
    minterMayMintSignup: createSignupMinterCheck(sessions, createHostPrincipalResolver(sessions)),
    auditStatementAfterWrite: (entry, at) => buildAuditStatementIfPrecedingWrote(db, entry, at),
    assemblePreview: createInvitePreview({ db }, { loadParticipantViews: makeLoadParticipantViews(db) }),
    emit: (event) => {
      announced.push(event.chatId);
      return Promise.resolve();
    },
  });
}

const PERSONA = { name: "Mira", description: "A cartographer." } as const;

async function signupAuditRows(): Promise<number> {
  return (await db.select().from(auditLogs).where(eq(auditLogs.action, "invites.signup"))).length;
}

describe("signup-invite ops — the minter re-check at redeem", () => {
  test("an admin minter admits: the redeem joins with one account, one seat, one use and one audit row", async () => {
    const signup = ops();
    expect(await signup.admits(TOKEN)).toBe("chat_invite_signup");
    const outcome = await signup.redeem({ token: TOKEN, handle: castId<Handle>("friend"), passwordHash: "scrypt$fake", persona: PERSONA });
    expect(outcome).toMatchObject({ outcome: "joined", chatId });
    expect((await findInviteByTokenHash(db, `h:${TOKEN}`))?.uses).toBe(1);
    expect(await countPresentMembers(db, chatId)).toBe(2);
    expect(await signupAuditRows()).toBe(1);
    await signup.announceJoined(chatId);
    expect(announced).toEqual([chatId]);
  });

  test("after the minter is demoted, the pre-check and the redeem both refuse and nothing is written", async () => {
    await db.update(users).set({ role: "user" }).where(eq(users.id, minter));
    const signup = ops();
    const usersBefore = (await db.select().from(users)).length;
    expect(await signup.admits(TOKEN)).toBeNull();
    expect(await signup.redeem({ token: TOKEN, handle: castId<Handle>("friend"), passwordHash: "scrypt$fake", persona: PERSONA })).toEqual({
      outcome: "refused",
      reason: "invite",
    });
    expect((await db.select().from(users)).length).toBe(usersBefore);
    expect((await findInviteByTokenHash(db, `h:${TOKEN}`))?.uses).toBe(0);
    expect(await signupAuditRows()).toBe(0);
  });

  test("a disabled minter refuses too", async () => {
    await db.update(users).set({ enabled: false }).where(eq(users.id, minter));
    expect(await ops().redeem({ token: TOKEN, handle: castId<Handle>("friend"), passwordHash: "scrypt$fake", persona: PERSONA })).toEqual({
      outcome: "refused",
      reason: "invite",
    });
  });

  test("a signup invite minted under another mode refuses", async () => {
    const signup = ops({ mode: "oidc", mintable: false });
    expect(await signup.admits(TOKEN)).toBeNull();
    expect(await signup.redeem({ token: TOKEN, handle: castId<Handle>("friend"), passwordHash: "scrypt$fake", persona: PERSONA })).toEqual({
      outcome: "refused",
      reason: "invite",
    });
  });

  test("a handle taken case-insensitively refuses as handle-taken and spends no use", async () => {
    await seedUser(db, castId<Handle>("Friend"));
    expect(await ops().redeem({ token: TOKEN, handle: castId<Handle>("friend"), passwordHash: "scrypt$fake", persona: PERSONA })).toEqual({
      outcome: "refused",
      reason: "handle-taken",
    });
    expect((await findInviteByTokenHash(db, `h:${TOKEN}`))?.uses).toBe(0);
  });

  test("a plain share link from the same admin creates no account, even with a live token and uses left", async () => {
    await db.insert(chatInvites).values({
      id: castId<ChatInviteId>("chat_invite_plain"),
      chatId,
      tokenHash: "h:tok_plain",
      maxUses: 5,
      expiresAt: FROZEN_AT + DAY_MS,
      createdByUserId: minter,
      mintMode: "local",
      createdAt: FROZEN_AT,
    });
    const signup = ops();
    const usersBefore = (await db.select().from(users)).length;
    expect(await signup.admits("tok_plain")).toBeNull();
    expect(await signup.redeem({ token: "tok_plain", handle: castId<Handle>("friend"), passwordHash: "scrypt$fake", persona: PERSONA })).toEqual({
      outcome: "refused",
      reason: "invite",
    });
    expect((await db.select().from(users)).length).toBe(usersBefore);
    expect((await findInviteByTokenHash(db, "h:tok_plain"))?.uses).toBe(0);
  });
});

describe("signup-invite ops — the joiner's persona", () => {
  test("a sign-up join seats the new account as the persona it named, created in the same batch", async () => {
    const outcome = await ops().redeem({ token: TOKEN, handle: castId<Handle>("friend"), passwordHash: "scrypt$fake", persona: PERSONA });
    if (outcome.outcome !== "joined") {
      throw new Error(`expected a join, got ${JSON.stringify(outcome)}`);
    }
    const [seat] = await db
      .select({ activePersonaId: chatParticipants.activePersonaId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, outcome.userId)));
    expect(seat?.activePersonaId).not.toBeNull();
    const owned = await db.select().from(personas).where(eq(personas.ownerId, outcome.userId));
    expect(owned).toHaveLength(1);
    expect(owned[0]).toMatchObject({ id: seat?.activePersonaId, name: PERSONA.name, description: PERSONA.description });
    // After the commit, the new account's pointers are aimed at that persona, so it is the one it speaks as.
    expect(adopted).toEqual([{ userId: outcome.userId, personaId: seat?.activePersonaId }]);
  });

  test("a refused sign-up creates no persona", async () => {
    await seedUser(db, castId<Handle>("Friend"));
    const before = (await db.select().from(personas)).length;
    expect(await ops().redeem({ token: TOKEN, handle: castId<Handle>("friend"), passwordHash: "scrypt$fake", persona: PERSONA })).toMatchObject({
      outcome: "refused",
    });
    expect((await db.select().from(personas)).length).toBe(before);
    expect(adopted).toEqual([]);
  });
});
