// Ruling: prompt-config `{{user}}` (the assemble ctx's ACTIVE persona) binds to the TRIGGERING human's
// persona — whose turn drives the assemble — NOT `personaIds[0]` (the presence-order-arbitrary first present
// human) and NOT the chat anchor. The composition root dispatches over the `TurnTrigger` union
// (entry/compose/chat.ts `activePersonaIdFor`); this proves the VERB half — each turn verb threads the
// triggering human's identity + seat persona as `trigger` into `resolveForeignInputs` — by spying on the
// FOREIGN resolver's args.

import type { AssemblePersona } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PersonaId } from "@orb/kit/ids";
import type { ResolveForeignInputsOp, TurnTrigger } from "../../../../../packages/server/src/domain/chat/contract/foreign.ts";
import { scenario, tape } from "../../../../support/chat/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedPersona } from "../_support.ts";

const PERSONA: AssemblePersona = { name: "P", description: "" };

/** The seat persona a `human` trigger carried; `undefined` for any non-human/absent trigger. */
function triggerPersonaOf(trigger: TurnTrigger | undefined): PersonaId | null | undefined {
  return trigger?.kind === "human" ? trigger.personaId : undefined;
}

/** A FOREIGN resolver that records the `trigger` every turn passes it. */
function spyingForeign(sink: (id: PersonaId | null | undefined) => void): ResolveForeignInputsOp {
  return (args): ReturnType<ResolveForeignInputsOp> => {
    sink(triggerPersonaOf(args.trigger));
    return Promise.resolve({
      promptConfig: DEFAULT_PROMPT_CONFIG,
      personas: { anchor: PERSONA, active: PERSONA },
      globalRegexScripts: [],
      scanDepth: 6,
      injectionTokenBudget: 0,
    });
  };
}

test("send passes the sender's explicit personaId on the human trigger (the active-persona subject)", async () => {
  const seen: (PersonaId | null | undefined)[] = [];
  const scn = await scenario.chat(tape().reply("ok"), {
    characters: ["aria"],
    resolveForeignInputs: spyingForeign((id) => seen.push(id)),
  });

  // Seed the persona the row will stamp (the user-row `personaId` FK-references `personas`).
  const vex = await seedPersona(scn.db, scn.host, "vex_trigger");
  await scn.send("hi", { personaId: vex });

  // The triggering human's persona (not `personaIds[0]`) is what the assemble binds `active` to.
  expect(seen).toContain(vex);
});

test("an explicit null personaId on send threads null (the triggerer chose 'no persona'), not a fallback", async () => {
  const seen: (PersonaId | null | undefined)[] = [];
  const scn = await scenario.chat(tape().reply("ok"), {
    characters: ["aria"],
    resolveForeignInputs: spyingForeign((id) => seen.push(id)),
  });

  await scn.send("hi", { personaId: null });

  // A deliberate null is preserved on the HUMAN arm — the trigger is still a live human, they just hold no
  // persona, so `{{user}}` floors to "User". Never coalesced to the sender's membership persona at the verb,
  // and (post INVITE-JOIN-NULL-PERSONA) never to the chat anchor at the resolver.
  expect(seen).toContain(null);
});
