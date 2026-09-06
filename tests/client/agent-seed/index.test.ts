// Unit: `buildAgentSeed` (agent-seed/index.ts) — the `__orb.seed` dev game-seeder bridge. Proves every
// one of its 7 `rpg.*` wire verbs (createGame/updateConfig/patchSheet/editSnapshot/patchActor/upsertQuest/
// addJournalEntry) fires with the EXACT shape a real seed pass sends, over the SAME `TRPCClient` shape the
// composition root injects — a structural fake of the client (the same pattern `agent-nav`'s own
// `fakeTrpc` uses for the big generated tRPC proxy: there is no separate "real module" to `vi.spyOn` here,
// the client IS the seam). Also proves the seeder's hand-door refusal check (`assertHandWrote`) actually
// throws instead of silently swallowing an `{ok:false}` from `editSnapshot`/`patchActor` — the seeder's
// own "closed vocabulary" analogue (a legible refusal, never a silent no-op).

import { buildAgentSeed } from "@orb/client/agent-seed";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const CHARACTER_ID = castId<CharacterId>("character_seed_a");
const CHAT_ID = castId<ChatId>("chat_seed_a");
const RETRY_CHAT_ID = castId<ChatId>("chat_seed_b");
const USER_ID = castId<UserId>("user_seed_a");
const PLAYER_HANDLE = castId<Handle>("orb-seed-hero");

const EDITSNAPSHOT_REFUSAL_MSG = /rpg\.editSnapshot refused — scene plane refused/;
const PATCHACTOR_REFUSAL_MSG = /rpg\.patchActor refused — actor plane refused/;
const UNFINISHED_D20_MSG = /unfinished d20 seed/;

/** Minimal structural fake of the `TRPCClient<AppRouter>` surface `buildAgentSeed` actually calls — every
 *  method the seeder touches, nothing else, each a `vi.fn()` so a test can assert exact call args (the
 *  same shape `agent-nav`'s `fakeTrpc` uses for the generated proxy). `existingHandle` controls whether
 *  `ensurePlayer` reuses a card or creates one.
 */
// biome-ignore lint/suspicious/noExplicitAny: the return is a minimal structural fake of the full TRPCClient proxy — the seeder only touches the branches built below.
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

const SEED_WRITE_STEPS = [
  "createGame",
  "updateConfig",
  "patchSheet",
  "editSnapshot",
  "patchActor:user",
  "patchActor:mira",
  "patchActor:corvin",
  "upsertQuest:Claim the Vault",
  "upsertQuest:Earn Mira's Trust",
  "addJournalEntry:The Gilded Ember",
  "addJournalEntry:Corvin Ashe",
  "addJournalEntry:The key revealed",
  "addJournalEntry:The vault below",
] as const;

/** Stateful wire fake: successful calls apply one canonical step to the addressed chat; `failAt` rejects
 *  once BEFORE applying. It makes a retry that mints a second room observably leave the first partial. */
function retryClient(failAt: (typeof SEED_WRITE_STEPS)[number]): {
  readonly client: ReturnType<typeof fakeClient>;
  readonly applied: string[];
} {
  const client = fakeClient({ existingHandle: true });
  const applied: string[] = [];
  let failed = false;
  let starts = 0;
  const apply = (chatId: ChatId, step: string, result?: unknown): Promise<unknown> => {
    if (!failed && step === failAt) {
      failed = true;
      return Promise.reject(new Error(`injected failure at ${step}`));
    }
    applied.push(`${chatId}:${step}`);
    return Promise.resolve(result);
  };

  client.chat.startChat.mutate = vi.fn(() => {
    const chatId = starts === 0 ? CHAT_ID : RETRY_CHAT_ID;
    starts += 1;
    return Promise.resolve({ chat: { id: chatId } });
  });
  client.rpg.createGame.mutate = vi.fn(({ chatId }: { readonly chatId: ChatId }) => apply(chatId, "createGame"));
  client.rpg.updateConfig.mutate = vi.fn(({ chatId }: { readonly chatId: ChatId }) => apply(chatId, "updateConfig"));
  client.rpg.patchSheet.mutate = vi.fn(({ chatId }: { readonly chatId: ChatId }) => apply(chatId, "patchSheet"));
  client.rpg.editSnapshot.mutate = vi.fn(({ chatId }: { readonly chatId: ChatId }) => apply(chatId, "editSnapshot", { ok: true }));
  client.rpg.patchActor.mutate = vi.fn(
    ({ chatId, targetRef }: { readonly chatId: ChatId; readonly targetRef: { readonly kind: string; readonly npcKey?: string } }) =>
      apply(chatId, `patchActor:${targetRef.kind === "npc" ? targetRef.npcKey : targetRef.kind}`, { ok: true }),
  );
  client.rpg.upsertQuest.mutate = vi.fn(({ chatId, name }: { readonly chatId: ChatId; readonly name: string }) => apply(chatId, `upsertQuest:${name}`));
  client.rpg.addJournalEntry.mutate = vi.fn(({ chatId, title }: { readonly chatId: ChatId; readonly title: string }) =>
    apply(chatId, `addJournalEntry:${title}`),
  );
  return { client, applied };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("game({profile:'d20'}) maps the caller profile to the d20 ruleset and patchSheet WITH the attribute grid", async () => {
  const client = fakeClient();
  const seed = buildAgentSeed(client);

  const result = await seed.game({ profile: "d20" });

  expect(result).toEqual({ chatId: CHAT_ID });
  expect(client.rpg.createGame.mutate).toHaveBeenCalledExactlyOnceWith({ chatId: CHAT_ID, mode: "lite", ruleset: "d20" });
  const patchSheetArg = client.rpg.patchSheet.mutate.mock.calls[0][0];
  expect(patchSheetArg.patch.attributes).toEqual({ str: 15, dex: 13, con: 14, int: 12, wis: 11, cha: 16 });
});

test("game({profile:'freeform'}) maps the caller profile to the freeform ruleset and patchSheet WITHOUT attributes", async () => {
  const client = fakeClient();
  const seed = buildAgentSeed(client);

  await seed.game({ profile: "freeform" });

  expect(client.rpg.createGame.mutate).toHaveBeenCalledExactlyOnceWith({ chatId: CHAT_ID, mode: "lite", ruleset: "freeform" });
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
    { kind: "npc", npcKey: "mira" },
    { kind: "npc", npcKey: "corvin" },
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
  expect(client.rpg.createGame.mutate).toHaveBeenCalledExactlyOnceWith({ chatId: CHAT_ID, mode: "lite", ruleset: "freeform" });
});

test("concurrent first seeds with matching arguments join one chat creation and one seed sequence", async () => {
  const client = fakeClient({ existingHandle: true });
  const me = Promise.withResolvers<{ readonly userId: UserId }>();
  client.sessions.me.query = vi.fn(() => me.promise);
  const seed = buildAgentSeed(client);

  const first = seed.game({ profile: "d20" });
  const second = seed.game({ profile: "d20" });
  me.resolve({ userId: USER_ID });

  await expect(Promise.all([first, second])).resolves.toEqual([{ chatId: CHAT_ID }, { chatId: CHAT_ID }]);
  expect(client.chat.startChat.mutate).toHaveBeenCalledOnce();
  expect(client.rpg.createGame.mutate).toHaveBeenCalledOnce();
});

test("concurrent first-seed failures reject every waiter and later resume the same chat exactly once", async () => {
  const { client, applied } = retryClient("createGame");
  const seed = buildAgentSeed(client);

  const initial = await Promise.allSettled([seed.game({ profile: "d20" }), seed.game({ profile: "d20" })]);

  expect(initial.map((result) => result.status)).toEqual(["rejected", "rejected"]);
  expect(client.chat.startChat.mutate).toHaveBeenCalledOnce();
  expect(client.rpg.createGame.mutate).toHaveBeenCalledOnce();

  await expect(seed.game({ profile: "d20" })).resolves.toEqual({ chatId: CHAT_ID });
  expect(client.chat.startChat.mutate).toHaveBeenCalledOnce();
  expect(applied).toEqual(SEED_WRITE_STEPS.map((step) => `${CHAT_ID}:${step}`));
});

test("a different first-seed request is refused while the first prerequisite is still held", async () => {
  const client = fakeClient({ existingHandle: true });
  const characterPage = Promise.withResolvers<{
    readonly items: readonly { readonly id: CharacterId; readonly handle: Handle }[];
    readonly totalCount: number;
  }>();
  client.character.list.query = vi.fn(() => characterPage.promise);
  const seed = buildAgentSeed(client);

  const first = seed.game({ profile: "d20" });
  const second = seed.game({ profile: "freeform" });
  let secondOutcome: "pending" | "resolved" | "rejected" = "pending";
  void second.then(
    () => {
      secondOutcome = "resolved";
    },
    () => {
      secondOutcome = "rejected";
    },
  );

  await Promise.resolve();
  const outcomeBeforeRelease = secondOutcome;
  characterPage.resolve({ items: [{ id: CHARACTER_ID, handle: PLAYER_HANDLE }], totalCount: 1 });
  const settled = await Promise.allSettled([first, second]);

  expect(outcomeBeforeRelease).toBe("rejected");
  expect(settled[0]).toEqual({ status: "fulfilled", value: { chatId: CHAT_ID } });
  expect(settled[1]).toEqual({ status: "rejected", reason: expect.objectContaining({ message: expect.stringMatching(UNFINISHED_D20_MSG) }) });
  expect(client.chat.startChat.mutate).toHaveBeenCalledOnce();
});

test("a prerequisite failure releases first-flight ownership before any chat exists", async () => {
  const client = fakeClient({ existingHandle: true });
  client.character.list.query.mockRejectedValueOnce(new Error("character lookup failed"));
  const seed = buildAgentSeed(client);

  await expect(seed.game({ profile: "d20" })).rejects.toThrow("character lookup failed");
  await expect(seed.game({ profile: "freeform" })).resolves.toEqual({ chatId: CHAT_ID });

  expect(client.chat.startChat.mutate).toHaveBeenCalledOnce();
  expect(client.rpg.createGame.mutate).toHaveBeenCalledOnce();
});

test.each(SEED_WRITE_STEPS)("a partial failure at %s retries into the SAME complete game without duplicate canonical writes", async (failAt) => {
  const { client, applied } = retryClient(failAt);
  const seed = buildAgentSeed(client);

  await expect(seed.game({ profile: "d20" })).rejects.toThrow(`injected failure at ${failAt}`);
  await expect(seed.game({ profile: "d20" })).resolves.toEqual({ chatId: CHAT_ID });

  expect(client.chat.startChat.mutate).toHaveBeenCalledOnce();
  expect(applied).toEqual(SEED_WRITE_STEPS.map((step) => `${CHAT_ID}:${step}`));
});

test("concurrent retries join one in-flight finish without invoking the failed door twice", async () => {
  const { client, applied } = retryClient("createGame");
  const seed = buildAgentSeed(client);

  await expect(seed.game({ profile: "d20" })).rejects.toThrow("injected failure at createGame");

  let releaseRetry: (() => void) | undefined;
  const retryHeld = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  let markRetryStarted: (() => void) | undefined;
  const retryStarted = new Promise<void>((resolve) => {
    markRetryStarted = resolve;
  });
  const retryCreate = vi.fn(({ chatId }: { readonly chatId: ChatId }) => {
    markRetryStarted?.();
    return retryHeld.then(() => {
      applied.push(`${chatId}:createGame`);
    });
  });
  client.rpg.createGame.mutate = retryCreate;

  const firstRetry = seed.game({ profile: "d20" });
  const secondRetry = seed.game({ profile: "d20" });
  await retryStarted;
  releaseRetry?.();

  await expect(Promise.all([firstRetry, secondRetry])).resolves.toEqual([{ chatId: CHAT_ID }, { chatId: CHAT_ID }]);
  expect(retryCreate).toHaveBeenCalledOnce();
  expect(client.chat.startChat.mutate).toHaveBeenCalledOnce();
  expect(applied).toEqual(SEED_WRITE_STEPS.map((step) => `${CHAT_ID}:${step}`));
});

test("a joined retry failure rejects every waiter and releases the finish for a later resume", async () => {
  const { client, applied } = retryClient("createGame");
  const seed = buildAgentSeed(client);

  await expect(seed.game({ profile: "d20" })).rejects.toThrow("injected failure at createGame");

  let rejectRetry: ((reason: Error) => void) | undefined;
  const retryHeld = new Promise<void>((_resolve, reject) => {
    rejectRetry = reject;
  });
  let markRetryStarted: (() => void) | undefined;
  const retryStarted = new Promise<void>((resolve) => {
    markRetryStarted = resolve;
  });
  const retryCreate = vi
    .fn()
    .mockImplementationOnce(() => {
      markRetryStarted?.();
      return retryHeld;
    })
    .mockImplementation(({ chatId }: { readonly chatId: ChatId }) => {
      applied.push(`${chatId}:createGame`);
      return Promise.resolve();
    });
  client.rpg.createGame.mutate = retryCreate;

  const firstRetry = seed.game({ profile: "d20" });
  const secondRetry = seed.game({ profile: "d20" });
  await retryStarted;
  rejectRetry?.(new Error("joined retry failed"));

  const joined = await Promise.allSettled([firstRetry, secondRetry]);
  expect(joined.map((result) => result.status)).toEqual(["rejected", "rejected"]);
  expect(retryCreate).toHaveBeenCalledOnce();

  await expect(seed.game({ profile: "d20" })).resolves.toEqual({ chatId: CHAT_ID });
  expect(retryCreate).toHaveBeenCalledTimes(2);
  expect(client.chat.startChat.mutate).toHaveBeenCalledOnce();
  expect(applied).toEqual(SEED_WRITE_STEPS.map((step) => `${CHAT_ID}:${step}`));
});

test("an unfinished seed refuses different arguments instead of orphaning its partial game", async () => {
  const { client } = retryClient("createGame");
  const seed = buildAgentSeed(client);

  await expect(seed.game({ profile: "d20" })).rejects.toThrow("injected failure at createGame");
  await expect(seed.game({ profile: "freeform" })).rejects.toThrow(UNFINISHED_D20_MSG);

  expect(client.chat.startChat.mutate).toHaveBeenCalledOnce();
});
