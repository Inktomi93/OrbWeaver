// @subject packages/server/src/domain/discovery/verbs/browse.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCharacterDistillations,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";

const DISTILLATION_REPLY = "character_distillation";
const LOOM_SETTING = "An orbital loom";
const CASTLE_SETTING = "A feudal castle";

function distillation(setting: string): string {
  return JSON.stringify({
    genre: "fantasy",
    subGenres: [],
    tone: "gritty",
    setting,
    tags: ["keep", "siege", "oath"],
    elevatorPitch: "A keeper holds the walls.",
    overview: "The keeper holds the walls against every siege.",
  });
}

test("a distilled setting reaches the browse rows, the facet and the filter, for the owner only", async () => {
  const replies = new Map(CORPUS_STRUCTURED_REPLIES);
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    structuredReplies: replies,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const [loom, castle, plain] = await Promise.all(
    ["loom-keeper", "castle-keeper", "plain-keeper"].map((handle) =>
      root.services.character.create({ principal, input: createCharacterSchema.parse({ handle, name: handle, description: `${handle} keeps watch.` }) }),
    ),
  );
  if (loom === undefined || castle === undefined || plain === undefined) {
    throw new Error("the production character verb returned no card");
  }
  // One scripted reply per pass: the setting each card stores is whatever its own distill call received.
  replies.set(DISTILLATION_REPLY, distillation(LOOM_SETTING));
  await seedCharacterDistillations(root, { ownerId: root.ownerId, funderUserId: root.ownerId, characterId: loom.id });
  replies.set(DISTILLATION_REPLY, distillation(CASTLE_SETTING));
  await seedCharacterDistillations(root, { ownerId: root.ownerId, funderUserId: root.ownerId, characterId: castle.id });

  const { discovery } = root.services;
  const page = await discovery.browseCharacters(root.ownerId, { sort: "name" });
  expect(page.items.map(({ name, setting }) => ({ name, setting }))).toEqual([
    { name: "castle-keeper", setting: CASTLE_SETTING },
    { name: "loom-keeper", setting: LOOM_SETTING },
    // Never distilled: absent like its genre and tone, not an empty string.
    { name: "plain-keeper", setting: null },
  ]);
  const facets = await discovery.characterFacets(root.ownerId);
  expect(facets.settings).toHaveLength(2);
  expect(facets.settings).toEqual(
    expect.arrayContaining([
      { value: LOOM_SETTING, count: 1 },
      { value: CASTLE_SETTING, count: 1 },
    ]),
  );

  // The filter narrows the page and its census alike, the way genre and tone do.
  const castles = await discovery.browseCharacters(root.ownerId, { setting: CASTLE_SETTING });
  expect(castles.items.map(({ name }) => name)).toEqual(["castle-keeper"]);
  expect(castles.totalCount).toBe(1);
  const none = await discovery.browseCharacters(root.ownerId, { setting: "A setting nobody has" });
  expect(none.items).toEqual([]);
  expect(none.totalCount).toBe(0);

  // Another account's catalog is its own: the owner's settings do not reach it.
  const stranger = await root.actor();
  expect((await discovery.browseCharacters(stranger.id, { setting: CASTLE_SETTING })).items).toEqual([]);
  expect((await discovery.characterFacets(stranger.id)).settings).toEqual([]);
});
