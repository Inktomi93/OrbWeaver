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

  // One race: `first` starts, then the other starts `turns` microtasks later. `firstSettled` says the first had
  // already finished by then, so a longer lead cannot interleave the two any further.
  const raceOnce = async (first: "remove" | "switch", turns: number, name: string): Promise<{ readonly outcome: Outcome; readonly firstSettled: boolean }> => {
    await root.services.persona.setActivePersona({ principal, chatId: chat.id, targetUserId: root.ownerId, personaId: worn });
    const doomed = await mint(root, name);
    const startRemove = (): Promise<void> => root.services.persona.remove({ principal, personaId: doomed });
    const startSwitch = (): Promise<unknown> =>
      root.services.persona.setActivePersona({ principal, chatId: chat.id, targetUserId: root.ownerId, personaId: doomed });
    let firstSettled = false;
    const leading = (first === "remove" ? startRemove() : startSwitch()).finally(() => {
      firstSettled = true;
    });
    await yieldTurns(turns);
    const settledAtStart = firstSettled;
    const trailing = first === "remove" ? startSwitch() : startRemove();
    const [lead, trail] = await Promise.allSettled([leading, trailing]);
    const switched = first === "remove" ? trail : lead;
    return {
      outcome: {
        landed: switched.status === "fulfilled",
        refusedForTheDelete: switched.status === "rejected" && refusedForTheDelete(switched.reason, doomed),
        seat: (await seatOf(root, chat.id)).seat,
      },
      firstSettled: settledAtStart,
    };
  };

  const outcomes: Outcome[] = [];
  // Sweep each lead one microtask at a time, from both sides, until the leader has finished before the other starts.
  for (const first of ["switch", "remove"] as const) {
    for (let turns = 0, settled = false; !settled; turns += 1) {
      const race = await raceOnce(first, turns, `Doomed ${first} ${String(turns)}`);
      outcomes.push(race.outcome);
      settled = race.firstSettled;
    }
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
