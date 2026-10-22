// @subject packages/server/src/domain/plugin/substrate/consent-prompt.ts
// @subject packages/server/src/domain/rpg/snapshot-edit.ts
import "@orb/testkit/node/composed-real.ts";
import { setTimeout as physicalDeadline } from "node:timers/promises";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { closeDb } from "@orb/db";
import type { ChatId, RpgGameId } from "@orb/kit/ids";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { makePluginBundle, seedInstalledPlugin } from "@orb/testkit/node/factories/plugin.ts";
import { seedRpgGame } from "@orb/testkit/node/factories/rpg.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { sql } from "drizzle-orm";

const PROGRESS_OBSERVATION_MS = 1000;

async function observedProgress(work: Promise<void>): Promise<"completed" | "waiting"> {
  const timer = new AbortController();
  try {
    return await Promise.race([work.then(() => "completed" as const), physicalDeadline(PROGRESS_OBSERVATION_MS, "waiting" as const, { signal: timer.signal })]);
  } finally {
    timer.abort();
  }
}

async function installConsentSubject(root: ServerTestHarness, slug: string): Promise<Parameters<ServerTestHarness["services"]["plugin"]["setGrant"]>[0]> {
  const caller = await root.principalFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: slug,
    name: "Consent lifetime subject",
    description: "Requests an explicit storage grant.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["storage.kv"],
  });
  const installed = await seedInstalledPlugin(root, {
    caller,
    bundle: makePluginBundle(manifest, "orb.host(1);", root.clock.now()),
    grant: [],
  });
  return { caller, pluginId: installed.plugin.id, grant: [], acknowledgedNetHosts: [] } as const;
}

async function consentCount(root: ServerTestHarness): Promise<number | undefined> {
  const principal = await root.principalFor(root.ownerId);
  const inbox = await root.services.notifications.list({ principal });
  const prompt = inbox.items.find((row) => row.payload.type === "plugins-awaiting-consent");
  return prompt?.payload.type === "plugins-awaiting-consent" ? prompt.payload.pendingCount : undefined;
}

async function createGameSubject(root: ServerTestHarness): Promise<{
  readonly principal: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly chatId: ChatId;
  readonly gameId: RpgGameId;
}> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const game = await seedRpgGame(root, { principal, chatId: chat.id, mode: "lite" });
  return { principal, chatId: chat.id, gameId: game.id };
}

test("one plugin service serializes consent across installed rows and publishes the final committed count", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const root = ownership.use(await createServerHarness({ db: held.db }));
  const first = await installConsentSubject(root, "consent-first");
  const second = await installConsentSubject(root, "consent-second");
  const gate = held.hold(/^insert into "notifications"/u);
  const pending: Promise<void>[] = [];
  try {
    const firstWrite = root.services.plugin.setGrant(first).then(() => undefined);
    pending.push(firstWrite);
    await gate.reached;
    gate.disarm();
    const secondWrite = root.services.plugin.setGrant(second).then(() => undefined);
    pending.push(secondWrite);
    expect(await observedProgress(secondWrite)).toBe("waiting");
    gate.release();
    await Promise.all(pending);
    expect(await consentCount(root)).toBe(2);
    await root.services.plugin.uninstall({ caller: first.caller, pluginId: first.pluginId });
    expect(await consentCount(root)).toBe(1);
    await root.services.plugin.setGrant({ ...second, grant: ["storage.kv"] });
    expect(await consentCount(root)).toBeUndefined();
  } finally {
    gate.release();
    await Promise.allSettled(pending);
  }
});

test("same-recipient independent plugin roots publish and dispose without waiting for another root's consent", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const firstRoot = ownership.use(await createServerHarness({ db: held.db }));
  const secondRoot = ownership.use(await createServerHarness());
  const first = await installConsentSubject(firstRoot, "consent-root");
  const second = await installConsentSubject(secondRoot, "consent-root");
  expect(first.caller.userId).toBe(second.caller.userId);
  expect(first.pluginId).toBe(second.pluginId);
  const gate = held.hold(/^insert into "notifications"/u);
  const pending: Promise<void>[] = [];
  try {
    const firstWrite = firstRoot.services.plugin.setGrant(first).then(() => undefined);
    pending.push(firstWrite);
    await gate.reached;
    const secondWrite = secondRoot.services.plugin.setGrant(second).then(() => undefined);
    pending.push(secondWrite);
    expect(await observedProgress(secondWrite)).toBe("completed");
    expect(await consentCount(secondRoot)).toBe(1);
    expect(await consentCount(firstRoot)).toBeUndefined();
    const secondDisposal = Promise.resolve(secondRoot[Symbol.asyncDispose]());
    pending.push(secondDisposal);
    expect(await observedProgress(secondDisposal)).toBe("completed");
    const firstDisposal = Promise.resolve(firstRoot[Symbol.asyncDispose]());
    pending.push(firstDisposal);
    expect(await observedProgress(firstDisposal)).toBe("waiting");
    gate.release();
    await Promise.all(pending);
  } finally {
    gate.release();
    await Promise.allSettled(pending);
  }
});

test("a failed consent publication leaves the grant committed and releases the same service's next refresh", async () => {
  await using root = await createServerHarness();
  const subject = await installConsentSubject(root, "consent-retry");
  const nextSubject = await installConsentSubject(root, "consent-next");
  await root.db.run(sql`CREATE TRIGGER refuse_consent BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'consent publication refused'); END`);
  try {
    expect(await root.services.plugin.setGrant(subject)).toMatchObject({ id: subject.pluginId, reconsentPending: true });
    expect(await consentCount(root)).toBeUndefined();
  } finally {
    await root.db.run(sql`DROP TRIGGER refuse_consent`);
  }
  await root.services.plugin.setGrant(nextSubject);
  expect(await consentCount(root)).toBe(2);
});

test("one RPG graph serializes hand edits so both read-modify-write gestures survive", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const root = ownership.use(await createServerHarness({ db: held.db }));
  const params = await createGameSubject(root);
  const targetRef = { kind: "user", userId: params.principal.userId } as const;
  const gate = held.hold(/^insert into "rpg_snapshots"/u);
  const pending: Promise<void>[] = [];
  try {
    const first = root.services.rpg.patchActor({ ...params, targetRef, ops: [{ op: "addItem", item: { name: "First key" } }] }).then(() => undefined);
    pending.push(first);
    await gate.reached;
    gate.disarm();
    const second = root.services.rpg.patchActor({ ...params, targetRef, ops: [{ op: "addItem", item: { name: "Second key" } }] }).then(() => undefined);
    pending.push(second);
    expect(await observedProgress(second)).toBe("waiting");
    gate.release();
    await Promise.all(pending);
    const tracker = await root.services.rpg.getTrackerView(params);
    expect(tracker.actors.find((actor) => actor.actorRef.kind === "user")?.volatile?.inventory.map((item) => item.name)).toEqual(["First key", "Second key"]);
  } finally {
    gate.release();
    await Promise.allSettled(pending);
  }
});

test("same-game independent RPG roots write and dispose while another root's hand write remains held", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const firstRoot = ownership.use(await createServerHarness({ db: held.db }));
  const secondRoot = ownership.use(await createServerHarness());
  const first = await createGameSubject(firstRoot);
  const second = await createGameSubject(secondRoot);
  expect(first.gameId).toBe(second.gameId);
  expect(first.chatId).toBe(second.chatId);
  const gate = held.hold(/^insert into "rpg_snapshots"/u);
  const pending: Promise<void>[] = [];
  try {
    const firstWrite = firstRoot.services.rpg.editSnapshot({ ...first, patch: { location: "First root" } }).then(() => undefined);
    pending.push(firstWrite);
    await gate.reached;
    const secondWrite = secondRoot.services.rpg.editSnapshot({ ...second, patch: { location: "Second root" } }).then(() => undefined);
    pending.push(secondWrite);
    expect(await observedProgress(secondWrite)).toBe("completed");
    expect((await secondRoot.services.rpg.getTrackerView(second)).ambient?.location).toBe("Second root");
    const secondDisposal = Promise.resolve(secondRoot[Symbol.asyncDispose]());
    pending.push(secondDisposal);
    expect(await observedProgress(secondDisposal)).toBe("completed");
  } finally {
    gate.release();
    await Promise.allSettled(pending);
  }
});

test("RPG root disposal joins an accepted hand write before its dependencies close", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const root = ownership.use(await createServerHarness({ db: held.db }));
  const params = await createGameSubject(root);
  const gate = held.hold(/^insert into "rpg_snapshots"/u);
  const pending: Promise<void>[] = [];
  try {
    const write = root.services.rpg.editSnapshot({ ...params, patch: { location: "Accepted before closing" } }).then((result) => {
      expect(result).toEqual({ ok: true });
    });
    pending.push(write);
    await gate.reached;
    const disposal = Promise.resolve(root[Symbol.asyncDispose]());
    pending.push(disposal);
    expect(await observedProgress(disposal)).toBe("waiting");
    gate.release();
    await Promise.all(pending);
  } finally {
    gate.release();
    await Promise.allSettled(pending);
  }
});
