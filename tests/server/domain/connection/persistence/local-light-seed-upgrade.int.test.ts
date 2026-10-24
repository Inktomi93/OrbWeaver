// The reranker seed upgrades rows an earlier release left, and a user's own pick survives every later seed run.
// The earlier rows are written directly: the current product can no longer produce them.
// @subject packages/server/src/domain/connection/persistence/local-light-seed.ts

import type { DeclaredCapability, LocalLightSeedSlot } from "@orb/contracts/inference";
import { builtinProvider, LOCAL_LIGHT_SEED_ROWS, modelIdSchema } from "@orb/contracts/inference";
import { connectionBindings, userConnections } from "@orb/db";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";

const [ENCODER_SEED, RERANK_SEED] = LOCAL_LIGHT_SEED_ROWS;
const [EARLIER_RERANK_MODEL] = RERANK_SEED.earlierModels;
const [EARLIER_RERANK_LABEL] = RERANK_SEED.earlierLabels;
const LOCAL_LIGHT = builtinProvider("local-light");
/** The window the earlier model's row stated for itself; it described that model, not today's. */
const EARLIER_DECLARED_WINDOW = 512;
const EARLIER_DECLARED: DeclaredCapability = {
  kind: "rerank",
  rerank: { maxInputTokens: EARLIER_DECLARED_WINDOW, input: ["text"], instructionAware: false },
};

type Db = ServerTestHarness["db"];
type Harness = ServerTestHarness;
type App = ServerTestHarness["app"];

interface EarlierRow {
  readonly label: string;
  readonly seedSlot: LocalLightSeedSlot | null;
  readonly model: string;
  readonly declared?: DeclaredCapability;
}

/** An account as an earlier release left it: these rows only, `seed_model` unwritten, each bound to its task. */
async function earlierRelease(
  db: Db,
  harness: Harness,
  ownerId: UserId,
  rows: readonly (EarlierRow & { readonly task: LocalLightSeedSlot })[],
): Promise<UserConnectionId[]> {
  if (LOCAL_LIGHT === undefined) {
    throw new Error("the local-light provider has no built-in registry row");
  }
  await db.delete(connectionBindings).where(eq(connectionBindings.userId, ownerId));
  await db.delete(userConnections).where(eq(userConnections.ownerId, ownerId));
  const ids: UserConnectionId[] = [];
  for (const row of rows) {
    const id = harness.idSource.typeId(ID_PREFIX.userConnection);
    const at = harness.clock.now();
    await db.insert(userConnections).values({
      id,
      ownerId,
      label: row.label,
      seedSlot: row.seedSlot,
      providerId: LOCAL_LIGHT.id,
      credentialId: null,
      baseUrl: null,
      model: modelIdSchema.parse(row.model),
      seedModel: null,
      api: "auto",
      declared: row.declared ?? null,
      extras: null,
      transport: null,
      modelCheck: "listed",
      allowBackground: true,
      createdAt: at,
      updatedAt: at,
    });
    await db.insert(connectionBindings).values({
      id: harness.idSource.typeId(ID_PREFIX.connectionBinding),
      actorKind: "user",
      userId: ownerId,
      ruleId: null,
      pluginId: null,
      task: row.task,
      connectionId: id,
    });
    ids.push(id);
  }
  return ids;
}

interface StoredRerankRow {
  readonly id: UserConnectionId;
  readonly label: string;
  readonly seedSlot: string | null;
  readonly model: string;
  readonly seedModel: string | null;
}

interface RerankState {
  readonly rerankRows: readonly StoredRerankRow[];
  readonly slot: StoredRerankRow | undefined;
  readonly boundTo: UserConnectionId | null;
  readonly servedModel: string | null;
  readonly window: number | null;
}

/** The stored rerank rows, the rerank binding and what the role resolves to now. */
async function rerankState(db: Db, app: App, ownerId: UserId): Promise<RerankState> {
  const rows = await db
    .select({
      id: userConnections.id,
      label: userConnections.label,
      seedSlot: userConnections.seedSlot,
      model: userConnections.model,
      seedModel: userConnections.seedModel,
    })
    .from(userConnections)
    .where(eq(userConnections.ownerId, ownerId));
  const [binding] = await db
    .select({ connectionId: connectionBindings.connectionId })
    .from(connectionBindings)
    .where(and(eq(connectionBindings.userId, ownerId), eq(connectionBindings.task, "rerank")));
  const resolved = await (await app.roleClientsFor(ownerId)).resolved("rerank");
  return {
    rerankRows: rows.filter((row) => row.label !== ENCODER_SEED.label && row.model !== ENCODER_SEED.model),
    slot: rows.find((row) => row.seedSlot === "rerank"),
    boundTo: binding?.connectionId ?? null,
    servedModel: resolved?.model ?? null,
    window: resolved?.capability.kind === "rerank" ? resolved.capability.rerank.maxInputTokens : null,
  };
}

/** The curated window of a built-in reranker, read through a fresh account the seed binds to it. */
async function seededWindow(db: Db, app: App, harness: Harness): Promise<number | null> {
  const fresh = await harness.actor();
  return (await rerankState(db, app, fresh.id)).window;
}

test("a fresh account gets the seed's reranker in its slot, bound, with the seed model recorded", async ({ db, app, harness }) => {
  const account = await harness.actor();
  const state = await rerankState(db, app, account.id);
  expect(state.slot).toMatchObject({ label: RERANK_SEED.label, model: RERANK_SEED.model, seedModel: RERANK_SEED.model });
  expect(state.boundTo).toBe(state.slot?.id);
  expect(state.servedModel).toBe(RERANK_SEED.model);
  expect(state.window).not.toBeNull();
});

test("an earlier release's seed-slot row moves to today's model in place, dropping the facts it stated for the old one", async ({ db, app, harness }) => {
  const expectedWindow = await seededWindow(db, app, harness);
  const account = await harness.actor();
  const [, slotted] = await earlierRelease(db, harness, account.id, [
    { task: "embed", label: ENCODER_SEED.label, seedSlot: "embed", model: ENCODER_SEED.model },
    { task: "rerank", label: RERANK_SEED.label, seedSlot: "rerank", model: EARLIER_RERANK_MODEL, declared: EARLIER_DECLARED },
  ]);
  await app.seedUserConnections(account.id);
  const state = await rerankState(db, app, account.id);
  expect(state.rerankRows).toEqual([{ id: slotted, label: RERANK_SEED.label, seedSlot: "rerank", model: RERANK_SEED.model, seedModel: RERANK_SEED.model }]);
  expect(state.boundTo).toBe(slotted);
  expect(state.servedModel).toBe(RERANK_SEED.model);
  expect(state.window).toBe(expectedWindow);
  expect(state.window).not.toBe(EARLIER_DECLARED_WINDOW);
});

test("an earlier release's unslotted row under the seed's old label is adopted into the slot and relabelled", async ({ db, app, harness }) => {
  const account = await harness.actor();
  const [preSlot] = await earlierRelease(db, harness, account.id, [
    { task: "rerank", label: EARLIER_RERANK_LABEL, seedSlot: null, model: EARLIER_RERANK_MODEL },
  ]);
  await app.seedUserConnections(account.id);
  const state = await rerankState(db, app, account.id);
  expect(state.rerankRows).toEqual([{ id: preSlot, label: RERANK_SEED.label, seedSlot: "rerank", model: RERANK_SEED.model, seedModel: RERANK_SEED.model }]);
  expect(state.boundTo).toBe(preSlot);
  expect(state.servedModel).toBe(RERANK_SEED.model);
});

test("a reranker the user made on the earlier model is never adopted or moved, and stays bound", async ({ db, app, harness }) => {
  const account = await harness.actor();
  // A release before seed slots: the user's own row is the only reranker, so the empty slot cannot block adoption.
  const [own] = await earlierRelease(db, harness, account.id, [{ task: "rerank", label: "My reranker", seedSlot: null, model: EARLIER_RERANK_MODEL }]);
  await app.seedUserConnections(account.id);
  const state = await rerankState(db, app, account.id);
  expect(state.rerankRows.find((row) => row.id === own)).toEqual({
    id: own,
    label: "My reranker",
    seedSlot: null,
    model: EARLIER_RERANK_MODEL,
    seedModel: null,
  });
  expect(state.slot).toMatchObject({ label: RERANK_SEED.label, model: RERANK_SEED.model });
  expect(state.slot?.id).not.toBe(own);
  expect(state.boundTo).toBe(own);
  expect(state.servedModel).toBe(EARLIER_RERANK_MODEL);
});

test("the user's later pick of the earlier model on the seeded row survives the next seed run", async ({ db, app, harness }) => {
  const freshAccount = await harness.actor();
  const upgradedAccount = await harness.actor();
  await earlierRelease(db, harness, upgradedAccount.id, [{ task: "rerank", label: RERANK_SEED.label, seedSlot: "rerank", model: EARLIER_RERANK_MODEL }]);
  await app.seedUserConnections(upgradedAccount.id);
  for (const account of [freshAccount, upgradedAccount]) {
    const principal = await harness.principalFor(account.id);
    const before = await rerankState(db, app, account.id);
    if (before.slot === undefined) {
      throw new Error("the seed left no rerank slot row");
    }
    await app.services.connection.update({ principal, connectionId: before.slot.id, patch: { model: EARLIER_RERANK_MODEL } });
    const picked = await rerankState(db, app, account.id);
    await app.seedUserConnections(account.id);
    const after = await rerankState(db, app, account.id);
    expect(after.slot).toEqual({ ...before.slot, model: EARLIER_RERANK_MODEL });
    expect(after.slot?.seedModel).toBe(RERANK_SEED.model);
    expect(after.boundTo).toBe(before.slot.id);
    expect(after.servedModel).toBe(EARLIER_RERANK_MODEL);
    expect(after.window).toBe(picked.window);
    expect(after.window).not.toBe(before.window);
  }
});
