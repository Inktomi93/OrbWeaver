// Unit: `buildAgentSeed` (agent-seed/index.ts) — the `__orb.seed` dev game-seeder bridge. Proves every
// one of its 7 `rpg.*` wire verbs (createGame/updateConfig/patchSheet/editSnapshot/patchActor/upsertQuest/
// addJournalEntry) fires with the EXACT shape a real seed pass sends, over the SAME `TRPCClient` shape the
// composition root injects — a structural fake of the client (the same pattern `agent-nav`'s own
// `fakeTrpc` uses for the big generated tRPC proxy: there is no separate "real module" to `vi.spyOn` here,
// the client IS the seam). Also proves the seeder's hand-door refusal check (`assertHandWrote`) actually
// throws instead of silently swallowing an `{ok:false}` from `editSnapshot`/`patchActor` — the seeder's
// own "closed vocabulary" analogue (a legible refusal, never a silent no-op).

import { buildAgentSeed } from "@orb/client/agent-seed";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const CHARACTER_ID = castId<CharacterId>("character_seed_a");
const CHAT_ID = castId<ChatId>("chat_seed_a");
const USER_ID = castId<UserId>("user_seed_a");

const EDITSNAPSHOT_REFUSAL_MSG = /rpg\.editSnapshot refused — scene plane refused/;
const PATCHACTOR_REFUSAL_MSG = /rpg\.patchActor refused — actor plane refused/;

/** Minimal structural fake of the `TRPCClient<AppRouter>` surface `buildAgentSeed` actually calls — every
 *  method the seeder touches, nothing else, each a `vi.fn()` so a test can assert exact call args (the
 *  same shape `agent-nav`'s `fakeTrpc` uses for the generated proxy). `existingHandle` controls whether
 *  `ensurePlayer` reuses a card or creates one.
 // biome-ignore lint/suspicious/noExplicitAny: the return is a minimal structural fake of the full TRPCClient proxy — the seeder only touches the branches built below.
 */
function fakeClient(opts: { readonly existingHandle?: boolean; readonly editSnapshotOk?: boolean; readonly patchActorOk?: boolean } = {}): any {
  const editSnapshotOk = opts.editSnapshotOk ?? true;
  const patchActorOk = opts.patchActorOk ?? true;
  return {
    character: {
      list: { query: vi.fn().mockResolvedValue({ items: opts.existingHandle ? [{ id: CHARACTER_ID, handle: "orb-seed-hero" }] : [], totalCount: 0 }) },
      create: { mutate: vi.fn().mockResolvedValue({ id: CHARACTER_ID }) },
    },
    sessions: { me: { query: vi.fn().mockResolvedValue({ userId: USER_ID }) } },
    chat: { startChat: { mutate: vi.fn().mockResolvedValue({ chat: { id: CHAT_ID } }) } },
    rpg: {
      createGame: { mutate: vi.fn().mockResolvedValue(undefined) },
      updateConfig: { mutate: vi.fn().mockResolvedValue(undefined) },
      patchSheet: { mutate: vi.fn().mockResolvedValue(undefined) },
      editSnapshot: { mutate: vi.fn().mockResolvedValue({ ok: editSnapshotOk, reason: editSnapshotOk ? undefined : "scene plane refused" }) },
      patchActor: { mutate: vi.fn().mockResolvedValue({ ok: patchActorOk, reason: patchActorOk ? undefined : "actor plane refused" }) },
      upsertQuest: { mutate: vi.fn().mockResolvedValue(undefined) },
      addJournalEntry: { mutate: vi.fn().mockResolvedValue(undefined) },
      // biome-ignore lint/suspicious/noExplicitAny: structural fake of the full TRPCClient proxy — buildAgentSeed only touches the branches built above.
    } as any,
    // biome-ignore lint/suspicious/noExplicitAny: structural fake of the full TRPCClient proxy — buildAgentSeed only touches the branches built above.
  } as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("game({profile:'d20'}) drives createGame with the d20 stat profile and patchSheet WITH the attribute grid", async () => {
  const client = fakeClient();
  const seed = buildAgentSeed(client);

  const result = await seed.game({ profile: "d20" });

  expect(result).toEqual({ chatId: CHAT_ID });
  expect(client.rpg.createGame.mutate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ chatId: CHAT_ID, mode: "lite" }));
  const createGameArg = client.rpg.createGame.mutate.mock.calls[0][0];
  expect(createGameArg.profile.attributes).toBeDefined();
  const patchSheetArg = client.rpg.patchSheet.mutate.mock.calls[0][0];
  expect(patchSheetArg.patch.attributes).toEqual({ str: 15, dex: 13, con: 14, int: 12, wis: 11, cha: 16 });
});

test("game({profile:'freeform'}) drives createGame with the freeform profile and patchSheet WITHOUT attributes", async () => {
  const client = fakeClient();
  const seed = buildAgentSeed(client);

  await seed.game({ profile: "freeform" });

  const createGameArg = client.rpg.createGame.mutate.mock.calls[0][0];
  expect(createGameArg.profile.attributes).toEqual([]);
  const patchSheetArg = client.rpg.patchSheet.mutate.mock.calls[0][0];
  expect(patchSheetArg.patch).not.toHaveProperty("attributes");
});

test("game() fires updateConfig with the tracker defs + relationship hints, keyed to the seeded chat", async () => {
  const client = fakeClient();
  const seed = buildAgentSeed(client);

  await seed.game({ profile: "d20" });

  expect(client.rpg.updateConfig.mutate).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      chatId: CHAT_ID,
      patch: expect.objectContaining({
        trackers: expect.arrayContaining([expect.objectContaining({ key: "hp" })]),
        relationshipHints: { "sworn rival": "a bitter but respectful competitor; never an outright enemy" },
      }),
    }),
  );
});

test("game() fires editSnapshot for the scene half + patchActor for player and both cast members, sequentially by chat", async () => {
  const client = fakeClient();
  const seed = buildAgentSeed(client);

  await seed.game({ profile: "d20" });

  expect(client.rpg.editSnapshot.mutate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ chatId: CHAT_ID }));
  expect(client.rpg.patchActor.mutate).toHaveBeenCalledTimes(3);
  const targets = client.rpg.patchActor.mutate.mock.calls.map((c: readonly [{ readonly targetRef: unknown }]) => c[0].targetRef);
  expect(targets).toEqual([
    { kind: "user", userId: USER_ID },
    { kind: "cast", castKey: "mira" },
    { kind: "cast", castKey: "corvin" },
  ]);
});

test("game() fires upsertQuest once per quest and addJournalEntry once per entry, all against the seeded chat", async () => {
  const client = fakeClient();
  const seed = buildAgentSeed(client);

  await seed.game({ profile: "d20" });

  expect(client.rpg.upsertQuest.mutate).toHaveBeenCalledTimes(2);
  expect(client.rpg.addJournalEntry.mutate).toHaveBeenCalledTimes(4);
  for (const call of [...client.rpg.upsertQuest.mutate.mock.calls, ...client.rpg.addJournalEntry.mutate.mock.calls]) {
    expect(call[0].chatId).toBe(CHAT_ID);
  }
});

test("ensurePlayer REUSES an existing card by handle — no character.create call", async () => {
  const client = fakeClient({ existingHandle: true });
  const seed = buildAgentSeed(client);

  await seed.game({ profile: "d20" });

  expect(client.character.list.query).toHaveBeenCalledOnce();
  expect(client.character.create.mutate).not.toHaveBeenCalled();
});

test("ensurePlayer CREATES the card when no existing handle match — character.create fires", async () => {
  const client = fakeClient({ existingHandle: false });
  const seed = buildAgentSeed(client);

  await seed.game({ profile: "d20" });

  expect(client.character.create.mutate).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ input: expect.objectContaining({ handle: "orb-seed-hero" }) }),
  );
});

test("an editSnapshot refusal ({ok:false}) THROWS naming the door and reason — never a silent no-op", async () => {
  const client = fakeClient({ editSnapshotOk: false });
  const seed = buildAgentSeed(client);

  await expect(seed.game({ profile: "d20" })).rejects.toThrow(EDITSNAPSHOT_REFUSAL_MSG);
  // A refused scene write means the actor-op door never gets a turn — it reads/rewrites the SAME snapshot head.
  expect(client.rpg.patchActor.mutate).not.toHaveBeenCalled();
});

test("a patchActor refusal ({ok:false}) on the player's own write THROWS naming the door and reason", async () => {
  const client = fakeClient({ patchActorOk: false });
  const seed = buildAgentSeed(client);

  await expect(seed.game({ profile: "d20" })).rejects.toThrow(PATCHACTOR_REFUSAL_MSG);
  // The player write is FIRST in the sequential chain — the two cast writes never get a turn after it throws.
  expect(client.rpg.patchActor.mutate).toHaveBeenCalledTimes(1);
});

test("richGame() defaults to the freeform profile and returns the seeded chatId", async () => {
  const client = fakeClient();
  const seed = buildAgentSeed(client);

  const result = await seed.richGame();

  expect(result).toEqual({ chatId: CHAT_ID });
  const createGameArg = client.rpg.createGame.mutate.mock.calls[0][0];
  expect(createGameArg.profile.attributes).toEqual([]);
});
