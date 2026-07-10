// Ruling: prompt-config `{{user}}` (the assemble ctx's ACTIVE persona) binds to the TRIGGERING human's
// persona — whose turn drives the assemble — NOT `personaIds[0]` (the presence-order-arbitrary first present
// human). The composition root resolves `active = loadPersona(triggerPersonaId ?? personaIds.at(0))`
// (entry/compose/chat.ts); this proves the VERB half — each turn verb threads the triggering human's active
// persona as `triggerPersonaId` into `resolveForeignInputs` — by spying on the FOREIGN resolver's args.

import type { AssemblePersona } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PersonaId } from "@orb/kit/ids";
import type { ResolveForeignInputsOp } from "../../../../../packages/server/src/domain/chat/contract/foreign";
import { scenario, tape } from "../../../../support/chat";
import { expect, test } from "../../../../support/fixtures";
import { seedPersona } from "../_support";

const PERSONA: AssemblePersona = { name: "P", description: "" };

/** A FOREIGN resolver that records the `triggerPersonaId` every turn passes it. */
function spyingForeign(sink: (id: PersonaId | null | undefined) => void): ResolveForeignInputsOp {
  return (args): ReturnType<ResolveForeignInputsOp> => {
    sink(args.triggerPersonaId);
    return Promise.resolve({
      promptConfig: DEFAULT_PROMPT_CONFIG,
      personas: { anchor: PERSONA, active: PERSONA },
      globalRegexScripts: [],
      scanDepth: 6,
      injectionTokenBudget: 0,
    });
  };
}

test("send passes the sender's explicit personaId as triggerPersonaId (the active-persona subject)", async () => {
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

  // A deliberate null is preserved (the compose root then falls to `personaIds.at(0)`), never coalesced to
  // the sender's membership persona at the verb.
  expect(seen).toContain(null);
});
