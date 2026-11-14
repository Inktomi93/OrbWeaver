// A persona delete and a switch onto that persona race from two devices. Whichever order they land in, the seat ends
// on a live persona: a switch that lands first is re-seated with the owner's default, one that lands after fails, and
// the seat is never left empty. A pin on the deleted persona is cleared (D315), and its seat takes the default too.
// @subject packages/server/src/domain/persona/verbs/remove.ts
// @subject packages/server/src/domain/chat/verbs/reseat-persona-seats-statement.ts

import { createPersonaSchema } from "@orb/contracts/persona";
import { isConstraintViolation } from "@orb/db/query";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, PersonaId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

async function mint(root: ServerTestHarness, name: string): Promise<PersonaId> {
  const principal = await root.principalFor(root.ownerId);
  return (await root.services.persona.create({ principal, input: createPersonaSchema.parse({ name, description: `${name} description.` }) })).id;
}

async function seatOf(root: ServerTestHarness, chatId: ChatId): Promise<{ readonly seat: PersonaId | null; readonly pin: PersonaId | null }> {
  const detail = await (await root.internalCallerFor(root.ownerId)).chat.getChat({ chatId });
  return { seat: detail.viewerActivePersonaId, pin: detail.anchorPersonaId };
}

async function yieldTurns(turns: number): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}

// A refused switch names the deleted persona: its own existence check missed it, or, once the delete has committed,
// its write met the deleted row on the seat's foreign key.
function refusedForTheDelete(reason: unknown, doomed: PersonaId): boolean {
  return (reason instanceof DomainNotFoundError && reason.message.includes(doomed)) || isConstraintViolation(reason)?.kind === "foreign-key";
}

interface Outcome {
  readonly landed: boolean;
  readonly refusedForTheDelete: boolean;
  readonly seat: PersonaId | null;
}

test("a switch onto a persona racing its delete never leaves the seat empty, at any interleaving", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const crown = await mint(root, "Crown");
  const worn = await mint(root, "Worn");
  await root.services.settings.updateUserSettingsSection({
    principal,
    input: { section: "seeds", patch: { defaultPersonaId: crown, currentPersonaId: worn } },
  });
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });

  const outcomes: Outcome[] = [];
  // Each offset starts the switch one microtask later, until the switch starts after the delete has settled.
  for (let offset = 0, settledFirst = false; !settledFirst; offset += 1) {
    await root.services.persona.setActivePersona({ principal, chatId: chat.id, targetUserId: root.ownerId, personaId: worn });
    const doomed = await mint(root, `Doomed ${String(offset)}`);
    let removed = false;
    const removal = root.services.persona.remove({ principal, personaId: doomed }).then(() => {
      removed = true;
    });
    await yieldTurns(offset);
    settledFirst = removed;
    const [switched] = await Promise.allSettled([
      root.services.persona.setActivePersona({ principal, chatId: chat.id, targetUserId: root.ownerId, personaId: doomed }),
      removal,
    ]);
    outcomes.push({
      landed: switched.status === "fulfilled",
      refusedForTheDelete: switched.status === "rejected" && refusedForTheDelete(switched.reason, doomed),
      seat: (await seatOf(root, chat.id)).seat,
    });
  }

  // A switch that committed first is re-seated with the owner's default; a refused one leaves the seat it found.
  expect(outcomes.map(({ seat }) => seat)).toEqual(outcomes.map(({ landed }) => (landed ? crown : worn)));
  expect(outcomes.map(({ landed, refusedForTheDelete: refused }) => landed || refused)).not.toContain(false);
  // Both orders occurred, so the sweep reached the window between the delete's reads and its commit.
  expect(outcomes.map(({ landed }) => landed)).toContain(true);
  expect(outcomes.map(({ landed }) => landed)).toContain(false);
});

test("deleting the pinned persona clears the pin and seats the owner's default", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const crown = await mint(root, "Crown");
  const pinned = await mint(root, "Pinned");
  await root.services.settings.updateUserSettingsSection({
    principal,
    input: { section: "seeds", patch: { defaultPersonaId: crown, currentPersonaId: pinned } },
  });
  const { chat } = await (await root.internalCallerFor(root.ownerId)).chat.startChat({ characterIds: [], opening: "none", anchorPersonaId: pinned });
  expect(await seatOf(root, chat.id)).toEqual({ seat: pinned, pin: pinned });

  await root.services.persona.remove({ principal, personaId: pinned });

  expect(await seatOf(root, chat.id)).toEqual({ seat: crown, pin: null });
});
