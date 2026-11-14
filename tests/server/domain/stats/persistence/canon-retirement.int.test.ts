// Canon that leaves its owner's stats scope leaves the live rollups exactly as a rebuild from canon puts them: deleting
// the only character of a room, or a room whose characters sit nowhere else, takes the room's turns, words, tokens and
// counts out of every owner grain, while the spend already paid stays shown and moves into the owner's spend ledger,
// so a rebuild, a second rebuild and a restore of the same library onto itself all show the same totals.
// @subject packages/server/src/domain/stats/persistence/retire-canon.ts
// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
// @subject packages/server/src/domain/stats/persistence/spend-ledger-portability.ts
// @subject packages/server/src/domain/character/persistence/card.ts
// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
import type { CharacterDetail } from "@orb/contracts/character";
import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import type { ActivityBucket, CharacterStatsView, ModelStatRow, OwnerStatsView } from "@orb/contracts/stats";
import { RETIRED_CANON_KIND } from "@orb/contracts/stats";
import { spendLedger } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, exportLibrary, restoreBundle, SIGNED_IN_ROUTE } from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";
import { textRoom } from "../../chat/scenario-physical.ts";

const STEP_MS = 60_000;
// The scripted provider's usage (4 in, 2 out) at the connection's price (1 and 2 per million tokens).
const TURN_USD = (4 * 1 + 2 * 2) / 1_000_000;
const LOOPBACK = "127.0.0.1";
const HTTP_OK = 200;

type Unstamped<T> = Omit<T, "computedAt">;

interface Shown {
  readonly overview: Unstamped<OwnerStatsView> | null;
  readonly models: readonly ModelStatRow[];
  readonly timeline: readonly ActivityBucket[];
  readonly characters: readonly (Unstamped<CharacterStatsView> | null)[];
}

function unstamped<T extends { readonly computedAt: number }>(view: T | null): Unstamped<T> | null {
  if (view === null) {
    return null;
  }
  const { computedAt: _computedAt, ...rest } = view;
  return rest;
}

/** Every owner figure the dashboard reads, without the rebuild's own clock stamp. */
async function shown(h: ChatRoot, characters: readonly CharacterDetail[]): Promise<Shown> {
  const stats = h.root.services.stats;
  return {
    overview: unstamped(await stats.overview(h.owner.userId)),
    models: await stats.byModel(h.owner.userId),
    timeline: await stats.timeseries(h.owner.userId),
    characters: await Promise.all(characters.map(async (card) => unstamped(await stats.character(h.owner.userId, card.id)))),
  };
}

/** What the live writes left, then a rebuild from canon, then a second rebuild over the first. */
async function liveThenRebuiltTwice(h: ChatRoot, characters: readonly CharacterDetail[]): Promise<readonly [Shown, Shown, Shown]> {
  const live = await shown(h, characters);
  h.root.clock.advance(STEP_MS);
  await h.root.services.stats.reconcile(h.owner.userId);
  const rebuilt = await shown(h, characters);
  h.root.clock.advance(STEP_MS);
  await h.root.services.stats.reconcile(h.owner.userId);
  return [live, rebuilt, await shown(h, characters)];
}

/** A room for the default character and a second room for a second character, one priced turn in each. */
async function twoPaidRooms(options: Parameters<typeof textRoom>[1] = {}): Promise<{
  readonly h: ChatRoot;
  readonly leaving: CharacterDetail;
  readonly staying: CharacterDetail;
  readonly stayingRoom: ChatId;
}> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await textRoom(["The leaving answer.", "The staying answer."], options));
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 } },
      features: { detectServer: false, pricing: { inputPerMTok: 1, outputPerMTok: 2 } },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const [leaving] = h.characters;
  if (leaving === undefined) {
    throw new Error("the room seated no character");
  }
  const staying = await h.caller.character.create({
    input: createCharacterSchema.parse({ handle: "staying-voice", name: "Staying Voice", description: "Sits in a room of its own." }),
  });
  const stayingRoom = (await h.caller.chat.startChat({ characterIds: [staying.id], opening: "none" })).chat.id;
  for (const chatId of [h.chatId, stayingRoom]) {
    h.root.clock.advance(STEP_MS);
    expect((await h.root.services.chat.send({ principal: h.owner, chatId, content: "Speak." })).aborted).toBe(false);
  }
  await h.root.settleBackground();
  construction.move();
  return { h, leaving, staying, stayingRoom };
}

test("deleting the only character of a room leaves the live stats equal to a rebuild, with the paid spend still shown", async () => {
  const { h, leaving, staying } = await twoPaidRooms();
  await using _room = h;
  const before = await shown(h, [staying]);
  expect(before.overview).toMatchObject({ characters: 2, chats: 2, userTurns: 2, assistantTurns: 2 });
  expect(before.overview?.costUsd).toBeCloseTo(2 * TURN_USD, 12);

  h.root.clock.advance(STEP_MS);
  await h.root.services.character.remove({ principal: h.owner, characterId: leaving.id });

  const [live, rebuilt, again] = await liveThenRebuiltTwice(h, [staying]);
  expect(live.overview).toMatchObject({ characters: 1, chats: 1, userTurns: 1, assistantTurns: 1 });
  expect(live.overview?.costUsd).toBe(before.overview?.costUsd);
  expect(live.models.map((row) => row.costUsd)).toEqual(before.models.map((row) => row.costUsd));
  expect(live.characters).toEqual(before.characters);
  expect(rebuilt).toEqual(live);
  expect(again).toEqual(live);
});

test("deleting a room whose characters sit nowhere else leaves the live stats equal to a rebuild, with the paid spend still shown", async () => {
  const { h, leaving, staying } = await twoPaidRooms();
  await using _room = h;
  const before = await shown(h, [leaving, staying]);

  h.root.clock.advance(STEP_MS);
  await h.root.services.chat.delete({ principal: h.owner, chatId: h.chatId });

  const [live, rebuilt, again] = await liveThenRebuiltTwice(h, [leaving, staying]);
  expect(live.overview).toMatchObject({ characters: 1, chats: 1, userTurns: 1, assistantTurns: 1 });
  expect(live.overview?.costUsd).toBe(before.overview?.costUsd);
  expect(live.models.map((row) => row.costUsd)).toEqual(before.models.map((row) => row.costUsd));
  // The library card lost its only room, so it holds no rollup on either path; the other card is untouched.
  expect(live.characters).toEqual([null, before.characters[1]]);
  expect(rebuilt).toEqual(live);
  expect(again).toEqual(live);
});

test("restoring a library onto itself after a room delete adds no retired spend and shows the same totals", async () => {
  const { h, staying } = await twoPaidRooms({ server: { physicalPeer: () => LOOPBACK, env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" } } });
  await using _room = h;
  expect((await h.root.http.request(SIGNED_IN_ROUTE, { headers: { [CSRF_HEADER]: "1" } })).status).toBe(HTTP_OK);
  h.root.clock.advance(STEP_MS);
  await h.root.services.chat.delete({ principal: h.owner, chatId: h.chatId });
  const retired = async (): Promise<readonly string[]> =>
    (
      await h.root.db
        .select({ id: spendLedger.id })
        .from(spendLedger)
        .where(and(eq(spendLedger.ownerId, h.owner.userId), eq(spendLedger.kind, RETIRED_CANON_KIND)))
    )
      .map((row) => row.id)
      .toSorted();
  const held = await retired();
  expect(held).toHaveLength(1);
  const before = await shown(h, [staying]);

  const bundle = await exportLibrary(h.root);
  expect(await restoreBundle(h.root, bundle)).toMatchObject({ status: "succeeded", failed: 0 });

  expect(await retired()).toEqual(held);
  const [live, rebuilt] = await liveThenRebuiltTwice(h, [staying]);
  expect(live).toEqual(before);
  expect(rebuilt).toEqual(before);
});
