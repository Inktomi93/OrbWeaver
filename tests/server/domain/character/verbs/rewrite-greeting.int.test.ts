// verb: rewriteGreeting — greeting studio (audit §3). Owner-gated bounded completion that RETURNS text and
// NEVER writes. Pins: owner ok (ONE completion, prompt carries the resolved template + neutralized base +
// steer), non-owner → leak-free CharacterNotFoundError BEFORE any template read / completion, and no DB write.

import { ZWSP } from "@orb/kit/guided";
import type { CharacterHandle, CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

/** Two `preset.greetingTransform.*` shipped defaults the ARM B parity proofs quote — the EXACT bytes the
 *  studio used to join in the browser before the fork. Literals on purpose (see the chat-side twin). */
const PARITY_SECOND_PERSON = "Rewrite the greeting in second person, addressing the user directly as 'you' and referring to the character accordingly";
const PARITY_PRESENT_TENSE = "Rewrite the greeting in present tense, making it feel immediate and ongoing";

describe("rewriteGreeting", () => {
  test("owner: runs ONE bounded completion and returns its text", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" } });

    const result = await svc.rewriteGreeting({ principal: principal(owner), characterId: created.id, greeting: "hey there", steer: "make it formal" });

    // Exactly ONE completion; the template was resolved for the CALLER + the rewrite kind.
    expect(harness.greetingTextCalls).toHaveLength(1);
    expect(harness.greetingTemplateCalls).toEqual([{ caller: principal(owner), kind: "greeting_rewrite" }]);
    // The default fake echoes the prompt; assert the returned text is the completion's.
    const promptSeen = harness.greetingTextCalls[0]?.prompt;
    expect(result.text).toBe(`GEN(${promptSeen})`);
    expect(result.costUsd).toBeNull();
  });

  test("owner: the completion prompt carries the resolved template with base + steer spliced (base neutralized)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    harness.setGreetingTemplate("Revise {{base}} per {{input}} for {{char}}");
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" } });

    // The base greeting carries a macro — it MUST be ZWSP-neutralized (other-author content), never resolved.
    await svc.rewriteGreeting({ principal: principal(owner), characterId: created.id, greeting: "{{user}} waves", steer: "warmer" });

    const prompt = harness.greetingTextCalls[0]?.prompt;
    // {{char}} (template) resolves to the card name; {{input}} = steer; {{base}} = neutralized greeting.
    expect(prompt).toBe(`Revise {${ZWSP}{user}${ZWSP}} waves per warmer for Nyx`);
    expect(prompt).not.toContain("{{user}} waves"); // proof the base did not re-trigger macro eval
  });

  // ── ARM B: the transform KINDS compose SERVER-side (the templating fork, owner 2026-08-09) ────────────
  // The studio used to join `GREETING_TRANSFORMS[].fragment` in the browser and send the composed steer. It
  // now sends the picked ids; the verb resolves each id's `preset.greetingTransform.*` slot against the
  // CALLER's preset prose and runs the same pure join. Byte parity + catalog order + the override reaching
  // the prompt are the three properties that make the move honest.
  test("ARM B byte parity: the verb composes the transform slots + free text in CATALOG order, as the browser did", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    harness.setGreetingTemplate("{{input}}"); // the prompt IS the steer — the bytes under test, undiluted
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" } });

    await svc.rewriteGreeting({
      principal: principal(owner),
      characterId: created.id,
      greeting: "hey there",
      steer: "keep it short",
      // WIRE ORDER reversed on purpose — the composed order is the CATALOG's.
      transforms: ["present-tense", "second-person"],
    });

    expect(harness.greetingTextCalls[0]?.prompt).toBe(`${PARITY_SECOND_PERSON}. ${PARITY_PRESENT_TENSE}. keep it short.`);
  });

  test("ARM B: a preset's prose OVERRIDE of a transform slot reaches the prompt; no picks rides the free text verbatim", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    harness.setGreetingTemplate("{{input}}");
    harness.setGreetingProse({ "preset.greetingTransform.secondPerson": { text: "Talk straight at the reader", baseVersion: 1 } });
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" } });

    await svc.rewriteGreeting({ principal: principal(owner), characterId: created.id, greeting: "g", steer: "", transforms: ["second-person"] });
    expect(harness.greetingTextCalls[0]?.prompt).toBe("Talk straight at the reader.");

    // No picks ⇒ the pre-fork path: the host's own text, unjoined and untouched.
    await svc.rewriteGreeting({ principal: principal(owner), characterId: created.id, greeting: "g", steer: "warmer" });
    expect(harness.greetingTextCalls[1]?.prompt).toBe("warmer");
  });

  test("non-owner: throws leak-free CharacterNotFoundError BEFORE any template read or completion", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const created = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" } });

    await expect(svc.rewriteGreeting({ principal: principal(stranger), characterId: created.id, greeting: "hey", steer: "x" })).rejects.toBeInstanceOf(
      CharacterNotFoundError,
    );
    // The owner gate fired FIRST — neither the template read nor the completion ran (no LLM spend on a stranger).
    expect(harness.greetingTemplateCalls).toHaveLength(0);
    expect(harness.greetingTextCalls).toHaveLength(0);
  });

  test("missing id: throws CharacterNotFoundError (never a completion)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await expect(
      svc.rewriteGreeting({ principal: principal(owner), characterId: castId<CharacterId>("character_ghost"), greeting: "h", steer: "s" }),
    ).rejects.toBeInstanceOf(CharacterNotFoundError);
    expect(harness.greetingTextCalls).toHaveLength(0);
  });

  test("NEVER writes: the card's greetings are unchanged after a rewrite", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d", greetings: [{ text: "original" }] },
    });
    const emitsBefore = harness.events.length;

    await svc.rewriteGreeting({ principal: principal(owner), characterId: created.id, greeting: "original", steer: "make it grand" });

    const after = await svc.getCard({ principal: principal(owner), characterId: created.id });
    expect(after?.greetings).toEqual([{ text: "original" }]);
    // The verb writes nothing — it emits no NEW domain event beyond what create already fired.
    expect(harness.events.length).toBe(emitsBefore);
  });
});
