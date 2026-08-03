// End-to-end proof of ruling A through the REAL turn engine + wire (Task #79): a seeded card greeting is a
// canon assistant row (personaId=null), so on the FIRST user turn it (1) freezes its VOLATILE macros
// (`freezeGreetingVolatiles`, verbs/turn.ts — Task #77 / D51) while its IDENTITY macros stay RAW, and (2)
// resolves those identity macros to the chat ANCHOR (not the per-viewer active persona) in the history the
// model actually receives. Driven with the N4 scenario/tape harness (real verbs + real db + scripted
// provider), asserting the captured wire `TurnRequest.history` — "what the AI was told".

import type { AssemblePersona } from "@orb/contracts/chat";
import { scenario, tape } from "../../../../support/chat/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedMessage } from "../_support.ts";

/** anchor = Nyx (the pinned card POV); active = Vera (a present human). Ruling A: a greeting/AI `{{user}}`
 *  resolves to the ANCHOR, so the wire must show "Nyx" and NEVER "Vera". */
const PERSONAS: { anchor: AssemblePersona; active: AssemblePersona } = {
  anchor: { name: "Nyx", description: "the pinned host POV" },
  active: { name: "Vera", description: "a present human" },
};

/** Join a captured wire history's text parts into one searchable string. */
function historyText(requests: ReturnType<typeof asRequests>): string {
  return requests
    .flatMap((r) => r.history)
    .flatMap((m) => m.content)
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("\n");
}
// Local alias so the helper's param type reads cleanly (the scenario's `requests` field type).
function asRequests(s: Awaited<ReturnType<typeof scenario.chat>>): typeof s.requests {
  return s.requests;
}

test("a greeting freezes its {{roll}} at the first user turn while {{user}} stays RAW in canon", async () => {
  const scn = await scenario.chat(tape().reply("ok"), {
    characters: ["aria"],
    personas: PERSONAS,
  });
  const greeting = await seedMessage(scn.db, scn.chatId, 1, {
    role: "assistant",
    characterId: scn.chars[0] ?? null,
    content: "You rolled {{roll::1d1}} and I greet {{user}}",
  });

  await scn.send("hello");

  const canon = await scn.loadCanon();
  const frozen = canon.find((m) => m.id === greeting.messageId);
  // The nondeterministic {{roll::1d1}} baked to its value (1); the IDENTITY {{user}} stays raw (per-view).
  expect(frozen?.content).toBe("You rolled 1 and I greet {{user}}");
});

test("the greeting freeze is idempotent — a SECOND send leaves the (already-frozen) greeting untouched", async () => {
  const scn = await scenario.chat(tape().reply("a").reply("b"), {
    characters: ["aria"],
    personas: PERSONAS,
  });
  const greeting = await seedMessage(scn.db, scn.chatId, 1, {
    role: "assistant",
    characterId: scn.chars[0] ?? null,
    content: "rolled {{roll::1d1}}",
  });

  await scn.send("first");
  const afterFirst = (await scn.loadCanon()).find((m) => m.id === greeting.messageId)?.content;
  await scn.send("second");
  const afterSecond = (await scn.loadCanon()).find((m) => m.id === greeting.messageId)?.content;

  expect(afterFirst).toBe("rolled 1");
  // The second turn is NOT the first user turn (and a frozen row has no volatiles left) → unchanged.
  expect(afterSecond).toBe("rolled 1");
});

test("the greeting's {{user}} reaches the MODEL as the ANCHOR (Nyx), never the active persona (Vera)", async () => {
  const scn = await scenario.chat(tape().reply("ok"), {
    characters: ["aria"],
    personas: PERSONAS,
  });
  await seedMessage(scn.db, scn.chatId, 1, {
    role: "assistant",
    characterId: scn.chars[0] ?? null,
    content: "Aria greets {{user}}",
  });

  await scn.send("hello");

  const wire = historyText(asRequests(scn));
  expect(wire).toContain("Aria greets Nyx");
  expect(wire).not.toContain("Vera");
  expect(wire).not.toContain("{{user}}");
});
