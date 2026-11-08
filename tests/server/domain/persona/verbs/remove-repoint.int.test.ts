// Removing a persona never leaves its owner with no current persona while they own one: the current and default
// pointers re-point to a survivor, and a seat that wore the removed persona takes the owner's default.
// @subject packages/server/src/domain/persona/verbs/remove.ts
// @subject packages/server/src/entry/compose/services.ts
import { createPersonaSchema } from "@orb/contracts/persona";
import type { PersonaId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

const STEP_MS = 1000;

async function person(root: ServerTestHarness, name: string): Promise<PersonaId> {
  // The injected clock stamps one instant, so each persona is a moment apart for "newest" to mean something.
  root.clock.advance(STEP_MS);
  return await personaNow(root, name);
}

async function personaNow(root: ServerTestHarness, name: string): Promise<PersonaId> {
  const created = await root.services.persona.create({
    principal: await root.principalFor(root.ownerId),
    input: createPersonaSchema.parse({ name, description: `${name} description.` }),
  });
  return created.id;
}

async function pointers(root: ServerTestHarness): Promise<{ readonly current: unknown; readonly default: unknown }> {
  const { seeds } = (await root.services.settings.getUserSettings({ principal: await root.principalFor(root.ownerId) })).config;
  return { current: seeds.currentPersonaId, default: seeds.defaultPersonaId };
}

async function point(root: ServerTestHarness, patch: { readonly currentPersonaId?: PersonaId; readonly defaultPersonaId?: PersonaId }): Promise<void> {
  await root.services.settings.updateUserSettingsSection({ principal: await root.principalFor(root.ownerId), input: { section: "seeds", patch } });
}

async function remove(root: ServerTestHarness, personaId: PersonaId): Promise<Awaited<ReturnType<ServerTestHarness["services"]["persona"]["remove"]>>> {
  return await root.services.persona.remove({ principal: await root.principalFor(root.ownerId), personaId });
}

test("removing the current persona points current at the default, or at the newest survivor when there is no default", async () => {
  await using root = await createServerHarness();
  const keeper = await person(root, "Keeper");
  // A survivor newer than the default, so "the default" and "the newest" are different answers.
  await person(root, "Newer");
  const doomed = await person(root, "Doomed");
  await point(root, { currentPersonaId: doomed, defaultPersonaId: keeper });
  expect((await remove(root, doomed)).newDefaultPersonaId).toBeNull();
  expect(await pointers(root)).toEqual({ current: keeper, default: keeper });

  await using bare = await createServerHarness();
  await person(bare, "Older");
  const newer = await person(bare, "Newer");
  const gone = await person(bare, "Gone");
  await point(bare, { currentPersonaId: gone });
  await remove(bare, gone);
  expect((await pointers(bare)).current).toBe(newer);
});

test("removing the default persona points the default at the last-played persona over a newer one, and names it in the result", async () => {
  await using root = await createServerHarness();
  const lastPlayed = await person(root, "LastPlayed");
  await person(root, "Newer");
  const doomed = await person(root, "DoomedDefault");
  await point(root, { currentPersonaId: lastPlayed, defaultPersonaId: doomed });

  const removed = await remove(root, doomed);

  expect(removed.newDefaultPersonaId).toBe(lastPlayed);
  expect(await pointers(root)).toEqual({ current: lastPlayed, default: lastPlayed });
});

test("personas minted in one instant list newest-id first, and the first survivor is the persona a deleted default moves to", async () => {
  await using root = await createServerHarness();
  // No clock step between the mints, so only the tie-break orders them.
  await personaNow(root, "TiedA");
  await personaNow(root, "TiedB");
  const doomed = await personaNow(root, "TiedDoomed");
  await personaNow(root, "TiedC");
  await point(root, { defaultPersonaId: doomed });
  const principal = await root.principalFor(root.ownerId);
  const before = (await root.services.persona.list({ principal })).map((persona) => persona.id);
  expect(before).toEqual(before.toSorted().toReversed());
  const survivors = before.filter((id) => id !== doomed);

  const removed = await remove(root, doomed);

  expect(removed.newDefaultPersonaId).toBe(survivors[0]);
});

test("removing a persona that is not the default reports no default move", async () => {
  await using root = await createServerHarness();
  const keeper = await person(root, "Keeper");
  const doomed = await person(root, "Doomed");
  await point(root, { currentPersonaId: keeper, defaultPersonaId: keeper });

  expect((await remove(root, doomed)).newDefaultPersonaId).toBeNull();
  expect(await pointers(root)).toEqual({ current: keeper, default: keeper });
});

test("removing the persona a seat wears seats the owner's default there instead of leaving the seat empty", async () => {
  await using root = await createServerHarness();
  const seated = await person(root, "Seated");
  const fallback = await person(root, "Fallback");
  await point(root, { currentPersonaId: seated, defaultPersonaId: fallback });
  const caller = await root.internalCallerFor(root.ownerId);
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });
  await root.services.persona.setActivePersona({
    principal: await root.principalFor(root.ownerId),
    chatId: chat.id,
    targetUserId: root.ownerId,
    personaId: seated,
  });
  expect((await caller.chat.getChat({ chatId: chat.id })).viewerActivePersonaId).toBe(seated);

  await remove(root, seated);

  expect((await caller.chat.getChat({ chatId: chat.id })).viewerActivePersonaId).toBe(fallback);
});
