// verb: remove — owner-scoped delete. Load-bearing: the junction CASCADEs (a connected persona's
// character_personas rows vanish with it); a not-owned/missing target throws (no cross-user delete); a
// real delete audits; the caller's LAST persona is refused (`last_persona` — the always-one belt).

import type { LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import { characterPersonas, personas } from "@orb/db";
import type { Handle, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService, LastPersonaError, PersonaNotFoundError } from "@orb/server/domain/persona";
import { createDeleteReachCapture } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../../chat/_support.ts";
import { makeHarness, principal, seedCharacter, seedUser } from "../_support.ts";

const PERSONA_DELETE = /delete from "personas"/iu;

describe("remove", () => {
  test("deletes an owned persona and CASCADEs its character_personas links (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner });
    // A second persona keeps the delete legal (the last-persona belt refuses deleting the sole one).
    await svc.create({ principal: principal(owner), input: { name: "Keeper", description: "k" } });
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Doomed", description: "d" },
    });
    await svc.connectToCharacter({
      principal: principal(owner),
      characterId: character,
      personaId: created.id,
    });

    const result = await svc.remove({ principal: principal(owner), personaId: created.id });

    expect(result).toEqual({ deleted: true });
    expect(await db.select().from(personas).where(eq(personas.id, created.id))).toHaveLength(0);
    expect(await db.select().from(characterPersonas).where(eq(characterPersonas.personaId, created.id))).toHaveLength(0);
    expect(h.audits.map((a) => a.entry.action)).toContain("persona.remove");
    // The seed re-point fires with the deleted id (owner invariant "never NO current persona while you own
    // one" — the injected settings write itself is exercised at the composed-service level).
    expect(h.repointCalls).toContainEqual({ ownerId: owner, deletedId: created.id });
  });

  test("a refused (last-persona) delete does NOT re-point the seeds", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const only = await svc.create({
      principal: principal(owner),
      input: { name: "Sole", description: "s" },
    });
    await svc.remove({ principal: principal(owner), personaId: only.id }).catch(() => undefined);
    // No delete committed ⇒ no re-point (the pointer still resolves to the surviving sole persona).
    expect(h.repointCalls).toHaveLength(0);
  });

  test("a not-owned persona throws PersonaNotFoundError (no delete)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Mine", description: "d" },
    });
    await expect(svc.remove({ principal: principal(other), personaId: created.id })).rejects.toThrow(PersonaNotFoundError);
    expect(await db.select().from(personas).where(eq(personas.id, created.id))).toHaveLength(1);
    expect(h.audits.some((a) => a.entry.action === "persona.remove")).toBe(false);
  });

  test("a missing id throws PersonaNotFoundError", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await expect(svc.remove({ principal: principal(owner), personaId: castId<PersonaId>("persona_ghost") })).rejects.toThrow(PersonaNotFoundError);
  });

  test("the LAST persona is refused with last_persona (the always-one belt); a second persona unblocks it", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const only = await svc.create({
      principal: principal(owner),
      input: { name: "Sole", description: "s" },
    });

    const err = await svc.remove({ principal: principal(owner), personaId: only.id }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LastPersonaError);
    expect((err as LastPersonaError).code).toBe("last_persona");
    // The refusal is a no-op: the row survives and nothing audited.
    expect(await db.select().from(personas).where(eq(personas.id, only.id))).toHaveLength(1);
    expect(h.audits.some((a) => a.entry.action === "persona.remove")).toBe(false);

    // A second persona makes the original deletable again.
    await svc.create({ principal: principal(owner), input: { name: "Spare", description: "x" } });
    await expect(svc.remove({ principal: principal(owner), personaId: only.id })).resolves.toEqual({
      deleted: true,
    });
  });

  test("two removals of the final pair leave one persona and type the loser as last_persona", async () => {
    const { db, hold } = await freshHeldDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await svc.create({ principal: principal(owner), input: { name: "A", description: "a" } });
    const b = await svc.create({ principal: principal(owner), input: { name: "B", description: "b" } });
    const deletes = hold(PERSONA_DELETE, 2);

    const removals = [svc.remove({ principal: principal(owner), personaId: a.id }), svc.remove({ principal: principal(owner), personaId: b.id })];
    await deletes.reached;
    deletes.release();
    const settled = await Promise.allSettled(removals);

    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(LastPersonaError);
    expect(await db.select({ id: personas.id }).from(personas).where(eq(personas.ownerId, owner))).toHaveLength(1);
    expect(h.repointCalls).toHaveLength(1);
  });

  // The entity→room bridge's DELETE residual (design §3.6): deleting a SEATED persona NULLs the seat, so a
  // post-write reach would reach no member (stale until reload). The verb captures the reach PRE-write and fans
  // the captured set past its own success guard. The room fan is wired here with the REAL composed capture over
  // a live spy — an affordance a member's device actually receives.
  test("a SEATED persona delete fans roomEntityChanged to the room it was live in", async () => {
    const db = await freshDb();
    const captured: LiveOnlyChatBusEvent[] = [];
    const capture = createDeleteReachCapture(db, (event) => captured.push(event));
    const h = makeHarness(db, { captureRoomReachForDelete: capture.persona });
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // A second persona keeps the delete legal (the last-persona belt).
    await svc.create({ principal: principal(owner), input: { name: "Keeper", description: "k" } });
    const doomed = await svc.create({ principal: principal(owner), input: { name: "Doomed", description: "d" } });
    const room = await seedChat(db, "seat");
    await seedParticipant(db, { chatId: room, key: "del_seat", userId: owner, activePersonaId: doomed.id });

    await svc.remove({ principal: principal(owner), personaId: doomed.id });

    const fanned = captured.filter((e) => e.type === "roomEntityChanged" && e.entity === "persona").map((e) => e.chatId);
    expect(fanned).toEqual([room]);
    // The row is gone AND the room still heard it — proof the reach was snapshotted before the seat was NULLed.
    expect(await db.select().from(personas).where(eq(personas.id, doomed.id))).toHaveLength(0);
  });

  test("a refused (NotFound) delete of a SEATED foreign persona fans NO room event — the thunk is past the guard", async () => {
    const db = await freshDb();
    const captured: LiveOnlyChatBusEvent[] = [];
    const capture = createDeleteReachCapture(db, (event) => captured.push(event));
    const h = makeHarness(db, { captureRoomReachForDelete: capture.persona });
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.create({ principal: principal(other), input: { name: "Theirs", description: "d" } });
    const room = await seedChat(db, "seat");
    await seedParticipant(db, { chatId: room, key: "del_foreign_seat", userId: other, activePersonaId: theirs.id });

    await expect(svc.remove({ principal: principal(owner), personaId: theirs.id })).rejects.toThrow(PersonaNotFoundError);
    expect(captured).toEqual([]);
  });
});
