// @subject packages/server/src/domain/character/persistence/refinery-ops.ts
// @subject packages/server/src/domain/refinery/substrate/refine-prompt.ts
// @subject packages/server/src/domain/refinery/verbs/score-sweep.ts
// @subject packages/server/src/domain/refinery/workload-contributions.ts
// @subject packages/server/src/entry/compose/refinery.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { characters, refineryRuns, refinerySessions, workloads } from "@orb/db";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { seedCorpusConnections } from "@orb/testkit/node/corpus-seed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";
import { executeAdmitted, physicalWire, WORKLOAD_FUNDER_HEADER } from "../../workloads/funding.fixtures.ts";

const FILL = { kind: "refine-score-sweep", params: {} } satisfies StartWorkloadInput;
const REFRESH = { kind: "refine-score-sweep", params: { rescoreAll: true } } satisfies StartWorkloadInput;

async function fund(root: ServerTestHarness, principal: Principal): Promise<void> {
  const rows = await seedCorpusConnections(root, principal);
  await root.services.connection.update({
    principal,
    connectionId: rows.text.id,
    patch: { transport: { headers: { [WORKLOAD_FUNDER_HEADER]: principal.userId } } },
  });
}

async function card(
  root: ServerTestHarness,
  principal: Principal,
  handle: CharacterHandle,
  fields: Partial<Omit<Parameters<ServerTestHarness["services"]["character"]["create"]>[0]["input"], "handle" | "name">> = {},
): ReturnType<ServerTestHarness["services"]["character"]["create"]> {
  return await root.services.character.create({ principal, input: createCharacterSchema.parse({ description: "", ...fields, handle, name: handle }) });
}

async function snapshot(root: ServerTestHarness): Promise<{
  readonly cards: readonly (typeof characters.$inferSelect)[];
  readonly jobs: readonly (typeof workloads.$inferSelect)[];
}> {
  return {
    cards: await root.db.select().from(characters).orderBy(characters.id),
    jobs: await root.db.select().from(workloads).where(eq(workloads.kind, FILL.kind)).orderBy(workloads.id),
  };
}

test("admitted singular and bulk estimates exactly match FILL/refresh execution without estimate effects", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  await fund(root, owner);
  await fund(root, member);
  const scored = await card(root, member, castId<CharacterHandle>("previously-scored"), { description: "A previously scored private member paragraph." });
  await root.settleBackground();
  const warm = await root.services.workloads.start({ caller: member, ownerId: null, mode: "singular", input: FILL });
  await executeAdmitted(root, warm.id);
  expect(await root.services.workloads.get({ caller: member, id: warm.id })).toMatchObject({ status: "succeeded", result: { scanned: 1, scored: 1 } });
  const own = await card(root, owner, castId<CharacterHandle>("owner-description"), {
    description: "Only the owner reads this private description in a singular pass.",
  });
  const depth = await card(root, owner, castId<CharacterHandle>("owner-depth"), {
    depthPrompt: { prompt: "A populated depth note alone is refinable.", depth: 4, role: "system" },
  });
  await card(root, owner, castId<CharacterHandle>("owner-name-only"));
  const greeting = await card(root, member, castId<CharacterHandle>("member-greeting"), {
    greetings: [{ text: "The member's private greeting is refinable without a description." }],
  });
  await card(root, member, castId<CharacterHandle>("member-name-only"));
  const room = await root.services.chat.startChat({ principal: owner, characterIds: [own.id], opening: "none" });
  const group = await root.services.character.mintSyntheticGroupCharacter({ ownerId: owner.userId, chatId: room.chat.id });
  const synthetic = await root.db.select().from(characters).where(eq(characters.id, group.characterId)).get();
  expect(synthetic?.synthetic).toBe(true);
  expect(synthetic?.description?.length).toBeGreaterThan(0);
  await root.settleBackground();

  const before = await snapshot(root);
  const requests = [...wire.requests];
  expect(await root.services.workloads.estimateModelCalls({ caller: member, mode: "singular", input: FILL })).toEqual({ calls: 1 });
  expect(await root.services.workloads.estimateModelCalls({ caller: owner, mode: "singular", input: FILL })).toEqual({ calls: 2 });
  expect(await root.services.workloads.estimateModelCalls({ caller: owner, mode: "bulk", input: FILL })).toEqual({ calls: 3 });
  expect(await root.services.workloads.estimateModelCalls({ caller: owner, mode: "bulk", input: REFRESH })).toEqual({ calls: 4 });
  expect(wire.requests).toEqual(requests);
  expect(await snapshot(root)).toEqual(before);
  expect(await root.db.select().from(refinerySessions)).toEqual([]);
  expect(await root.db.select().from(refineryRuns)).toEqual([]);

  const memberRequests = wire.bodies.length;
  const singular = await root.services.workloads.start({ caller: member, ownerId: null, mode: "singular", input: FILL });
  await executeAdmitted(root, singular.id);
  expect(await root.services.workloads.get({ caller: member, id: singular.id })).toMatchObject({
    status: "succeeded",
    result: { scanned: 3, scored: 1, skipped: 2, failed: 0 },
  });
  expect(wire.bodies.slice(memberRequests).join("\n")).toContain(greeting.greetings[0]?.text);
  expect(wire.bodies.slice(memberRequests).join("\n")).not.toContain(own.description);

  const stopped = new AbortController();
  const events: { readonly userId: Principal["userId"]; readonly event: UserBusEvent }[] = [];
  const collect = async (principal: Principal): Promise<void> => {
    for await (const event of root.app.liveBuses.user.subscribeUserEvents(principal.userId, stopped.signal)) {
      events.push({ userId: principal.userId, event });
    }
  };
  const collectors = [collect(owner), collect(member)];
  try {
    expect(await root.services.workloads.estimateModelCalls({ caller: owner, mode: "bulk", input: FILL })).toEqual({ calls: 2 });
    const fundingStart = wire.funders.length;
    const bulk = await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "bulk", input: FILL });
    await executeAdmitted(root, bulk.id);
    expect(await root.services.workloads.get({ caller: owner, id: bulk.id })).toMatchObject({
      status: "succeeded",
      result: { scanned: 6, scored: 2, skipped: 4, failed: 0 },
    });
    expect(wire.funders.slice(fundingStart)).toEqual([owner.userId, owner.userId]);
    expect(events.filter(({ event }) => event.type === "charactersChanged")).toEqual([{ userId: owner.userId, event: { type: "charactersChanged" } }]);

    events.length = 0;
    const refreshQuote = await root.services.workloads.estimateModelCalls({ caller: owner, mode: "bulk", input: REFRESH });
    expect(refreshQuote).toEqual({ calls: 4 });
    expect(events).toEqual([]);
    const refreshFunding = wire.funders.length;
    const refreshed = await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "bulk", input: REFRESH });
    await executeAdmitted(root, refreshed.id);
    expect(await root.services.workloads.get({ caller: owner, id: refreshed.id })).toMatchObject({
      status: "succeeded",
      result: { scanned: 6, scored: refreshQuote.calls, skipped: 2, failed: 0 },
    });
    expect(wire.funders.slice(refreshFunding)).toEqual([owner.userId, owner.userId, owner.userId, owner.userId]);
    expect(
      events
        .filter(({ event }) => event.type === "charactersChanged")
        .map(({ userId }) => userId)
        .sort(),
    ).toEqual([owner.userId, member.userId].sort());

    const countBeforeRetry = wire.requests.length;
    expect(await root.services.workloads.estimateRetryModelCalls({ caller: owner, id: bulk.id })).toEqual({ calls: 0 });
    expect(wire.requests).toHaveLength(countBeforeRetry);
    const retried = await root.services.workloads.retry({ caller: owner, id: bulk.id });
    await executeAdmitted(root, retried.id);
    expect(await root.services.workloads.get({ caller: owner, id: retried.id })).toMatchObject({
      status: "succeeded",
      funderUserId: owner.userId,
      result: { scanned: 6, scored: 0, skipped: 6, failed: 0 },
    });
    expect(wire.requests).toHaveLength(countBeforeRetry);
  } finally {
    const reason = new Error("refinery event collector completed");
    stopped.abort(reason);
    await Promise.all(
      collectors.map((collector) =>
        collector.catch((error) => {
          if (error !== reason && !(error instanceof Error && error.name === "AbortError" && error.cause === reason)) {
            throw error;
          }
        }),
      ),
    );
  }
  for (const [source, principal] of [
    [own, owner],
    [depth, owner],
    [scored, member],
    [greeting, member],
  ] as const) {
    const row = await root.db.select().from(characters).where(eq(characters.id, source.id)).get();
    expect(row?.ownerId).toBe(principal.userId);
    expect(row?.description).toBe(source.description);
    expect(row?.greetings).toEqual(source.greetings);
    expect(row?.refinery?.score).toBe(7);
  }
  expect((await root.db.select().from(characters).where(eq(characters.id, group.characterId)).get())?.refinery).toBeNull();
});

test("real members and non-owner admins cannot start, estimate or clone a bulk refinery sweep", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const admin = await root.principalFor((await root.actor({ role: "admin" })).id);
  const bulk = await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "bulk", input: FILL });
  await root.services.workloads.cancel({ caller: owner, id: bulk.id });
  await root.settleBackground();
  const before = await snapshot(root);
  const requests = [...wire.requests];
  for (const principal of [member, admin]) {
    await expect(root.services.workloads.estimateModelCalls({ caller: principal, mode: "bulk", input: FILL })).rejects.toThrow();
    await expect(root.services.workloads.start({ caller: principal, ownerId: principal.userId, mode: "bulk", input: FILL })).rejects.toThrow();
    await expect(root.services.workloads.estimateRetryModelCalls({ caller: principal, id: bulk.id })).rejects.toThrow();
    await expect(root.services.workloads.retry({ caller: principal, id: bulk.id })).rejects.toThrow();
  }
  expect(await snapshot(root)).toEqual(before);
  expect(wire.requests).toEqual(requests);
});
