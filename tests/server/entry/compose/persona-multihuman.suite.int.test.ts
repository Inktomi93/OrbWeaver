// persona-multihuman — the MULTI-HUMAN persona-resolution invariant suite, run over the REAL composition
// root (`services` fixture ⇒ the real `resolveForeignInputs` in entry/compose/chat.ts). Cross-cutting
// (compose resolver ⋈ chat read verbs ⋈ the persona domain), so it is a mirror-exempt `.suite.int.test.ts`.
//
// WHY IT EXISTS: the owner-sacred assembly suite (tests/server/domain/chat/persona-resolution.suite.int.test.ts)
// pins the MODEL given already-resolved personas — every fixture single-human, `personas` injected directly.
// The RESOLUTION layer had no behavioral contract, which is why a multi-human keyhole survived: every persona
// read ran under `hostPrincipal(runAsUserId)` through the owner-scoped `persona.get`, so in a room with two
// humans, the NON-HOST member's active persona (and a member-owned anchor the host legitimately pinned)
// resolved NULL — prompt `{{user}}` fell to the kit floor "User" and card `{{user}}` drifted to the speaker.
// FINAL-Persona §A.1 (PROMPT `{{user}}` = "who's speaking right now") + Chat-Macro-Resolution §3 (the
// TRIGGERING human's persona) + Spine-Identity's "multi-human native" are the law these arms enforce.
//
// The gate is MEMBERSHIP, not the reader: a persona resolves for the room iff its OWNER is a PRESENT human
// participant (`leftSeq IS NULL`). The departed-member arm is the cross-tenant refusal pin — it must keep
// HEAL's semantics (an unreadable anchor falls to the active persona), and it is what forbids the widening
// from becoming an unscoped persona read.
//
// The two observables are the host's own honesty instruments over the REAL resolver: `peekPrompt` (the bytes
// the next turn ships) and `getMemberCard` (the card-context render). Neither runs a turn.

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { characters, chatParticipants } from "@orb/db";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { Services } from "@orb/server/transport/trpc";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures";
import { seedCharacter, seedChat, seedParticipant, seedPersona, seedUser } from "../../domain/chat/_support.ts";

/** The card whose own description carries the CARD-context probe (§A.2's "{{user}} is my brother" shape). */
const CARD_DESCRIPTION = "{{user}} is my brother";

function principal(userId: UserId): Principal {
  return makePrincipal(userId);
}

interface Room {
  readonly host: UserId;
  readonly member: UserId;
  readonly chatId: ChatId;
  readonly memberPersona: PersonaId;
  readonly hostPersona: PersonaId;
}

/** A two-human room: host + one member + one character seat whose card description probes card `{{user}}`.
 *  `hostActive`/`anchor` pick which persona each pointer starts on. */
async function seedRoom(db: Db, opts: { readonly hostActive: boolean; readonly anchor: "member" | "host" | null }): Promise<Room> {
  const host = await seedUser(db, "mh_host");
  const member = await seedUser(db, "mh_member");
  const hostPersona = await seedPersona(db, host, "Hostina", { description: "the host's own persona" });
  const memberPersona = await seedPersona(db, member, "Zara", { description: "a wandering cartographer" });
  const characterId = await seedCharacter(db, host, "mary");
  await db.update(characters).set({ description: CARD_DESCRIPTION }).where(eq(characters.id, characterId));

  const anchorByArm = { member: memberPersona, host: hostPersona } as const;
  const anchorPersonaId = opts.anchor === null ? null : anchorByArm[opts.anchor];
  const chatId = await seedChat(db, "mh", { anchorPersonaId });
  await seedParticipant(db, {
    chatId,
    key: "mh_h",
    userId: host,
    role: "host",
    activePersonaId: opts.hostActive ? hostPersona : null,
  });
  await seedParticipant(db, { chatId, key: "mh_m", userId: member, role: "member", joinSeq: 1, activePersonaId: memberPersona });
  await seedParticipant(db, { chatId, key: "mh_c", characterId, joinSeq: 2 });
  return { host, member, chatId, memberPersona, hostPersona };
}

/** The bytes the next real turn would ship, flattened (the host's `peekPrompt` instrument). */
async function promptText(services: Services, host: UserId, chatId: ChatId): Promise<string> {
  const prompt = await services.chat.peekPrompt({ principal: principal(host), chatId });
  return `${prompt.static}\n${prompt.dynamic}`;
}

describe("multi-human persona resolution — the composed resolver (F1/F2)", () => {
  test("a member-owned ANCHOR actually pins card {{user}} (the host's sanctioned re-pin is not a dead pin)", async ({ db, services }) => {
    const room = await seedRoom(db, { hostActive: true, anchor: "member" });

    const text = await promptText(services, room.host, room.chatId);

    // CARD context resolves against the ANCHOR (§A.1) — the member's persona the host pinned.
    expect(text).toContain("Zara is my brother");
    expect(text).not.toContain("Hostina is my brother");
  });

  test("a non-host member's active persona resolves for PROMPT {{user}} (never the 'User' kit floor)", async ({ db, services }) => {
    // The host holds no chat persona, so the resolver's own fallback chain lands on the present member's
    // active persona — the id the keyhole used to drop on the floor.
    const room = await seedRoom(db, { hostActive: false, anchor: null });

    const text = await promptText(services, room.host, room.chatId);

    // The default `main_prompt` marker frames the roleplay "with {{user}}" — the PROMPT context.
    expect(text).toContain("roleplay with Zara");
    expect(text).not.toContain("roleplay with User");
  });

  test("REFUSAL: a DEPARTED member's persona stops resolving — the anchor falls to the active persona (HEAL semantics)", async ({ db, services }) => {
    const room = await seedRoom(db, { hostActive: true, anchor: "member" });
    // The member leaves (kick/leave stamps `leftSeq`); their persona is no longer consented to this room.
    await db
      .update(chatParticipants)
      .set({ leftSeq: 5 })
      .where(and(eq(chatParticipants.chatId, room.chatId), eq(chatParticipants.userId, room.member)));

    const text = await promptText(services, room.host, room.chatId);

    expect(text).not.toContain("Zara is my brother");
    expect(text).not.toContain("a wandering cartographer");
    // The pointer heals downward exactly as HEAL chose: card {{user}} falls to the host's active persona.
    expect(text).toContain("Hostina is my brother");
  });

  test("the member CARD read renders card {{user}} against a member-owned anchor too (same resolver, display side)", async ({ db, services }) => {
    const room = await seedRoom(db, { hostActive: true, anchor: "member" });
    const characterId = (await db.select({ id: characters.id }).from(characters).limit(1))[0]?.id;
    expect(characterId).toBeDefined();

    const card = await services.chat.getMemberCard({
      principal: principal(room.member),
      chatId: room.chatId,
      characterId: characterId as never,
    });

    expect(card.description).toBe("Zara is my brother");
  });
});
