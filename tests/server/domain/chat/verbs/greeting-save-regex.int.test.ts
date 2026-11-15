// A seeded greeting is a character reply no generation wrote, so the host's save scripts on that target rewrite it
// before it is stored, as they rewrite a generated reply: the opening greeting, a step to a card alternate, and the
// greeting of a character added while the greeting window is open. A display-only script changes none of them, and
// the pass runs on the card's text, so stepping back and forth never applies a script twice.
// @subject packages/server/src/domain/chat/substrate/greeting-regex.ts
// @subject packages/server/src/domain/chat/verbs/start-chat.ts
// @subject packages/server/src/domain/chat/verbs/participants.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts

import type { CharacterId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { harness, importThroughDialog } from "../../import/persistence/_st-tree-door.ts";

const ST_AI_OUTPUT = 2;
const TAIL = 10;

// SillyTavern wire text is snake_case and integer placements by spec, so the cards are raw JSON. Neither switch on
// the first script means it rewrites the saved reply; it is not idempotent, so a second application would show.
const ST_SCRIPT = {
  trimStrings: [],
  placement: [ST_AI_OUTPUT],
  disabled: false,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
};

function cardFile(name: string, greetings: readonly string[], scripts: readonly object[]): string {
  const [first, ...alternates] = greetings;
  return JSON.stringify({
    spec: "chara_card_v2",
    ["spec_version"]: "2.0",
    data: {
      name,
      description: `${name} keeps the lamp.`,
      ["first_mes"]: first,
      ["alternate_greetings"]: alternates,
      extensions: { ["regex_scripts"]: scripts },
    },
  });
}

const KEEPER_SCRIPTS = [
  { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000021", scriptName: "Old lamp", findRegex: "lamp", replaceString: "old lamp" },
  { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000022", scriptName: "Shown lamp", findRegex: "lamp", replaceString: "LAMP", markdownOnly: true },
];
const GUEST_SCRIPTS = [{ ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000023", scriptName: "Guest bell", findRegex: "bell", replaceString: "old bell" }];

test("the host's save scripts rewrite every seeded greeting once, and a display script rewrites none", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  await importThroughDialog(root, "keeper.json", cardFile("Keeper", ["The lamp is lit.", "A lamp gutters."], KEEPER_SCRIPTS));
  await importThroughDialog(root, "guest.json", cardFile("Guest", ["The bell rings."], GUEST_SCRIPTS));
  const idOf = async (name: string): Promise<CharacterId> => {
    const found = (await caller.character.list({})).items.find((item) => item.name === name);
    if (found === undefined) {
      throw new Error(`the card import landed no ${name}`);
    }
    return found.id;
  };
  const keeperId = await idOf("Keeper");

  const started = await caller.chat.startChat({ characterIds: [keeperId], opening: "first-message" });
  const chatId = started.chat.id;
  const greeting = started.opening?.messages[0];
  if (greeting === undefined) {
    throw new Error("the start seeded no greeting");
  }
  const stored = async (): Promise<readonly { readonly characterId: CharacterId | null; readonly content: string; readonly variantCount: number }[]> =>
    (await caller.chat.listMessages({ chatId, limit: TAIL })).messages.map(({ characterId, content, variantCount }) => ({
      characterId,
      content,
      variantCount,
    }));
  expect(await stored()).toEqual([{ characterId: keeperId, content: "The old lamp is lit.", variantCount: 1 }]);

  // Each step writes the card's alternate through the pass once, in place: back and forth leaves one variant.
  await caller.chat.setSeededGreeting({ chatId, messageId: greeting.id, greetingIndex: 1 });
  expect(await stored()).toEqual([{ characterId: keeperId, content: "A old lamp gutters.", variantCount: 1 }]);
  await caller.chat.setSeededGreeting({ chatId, messageId: greeting.id, greetingIndex: 0 });
  expect(await stored()).toEqual([{ characterId: keeperId, content: "The old lamp is lit.", variantCount: 1 }]);

  const guestId = await idOf("Guest");
  await caller.chat.addCharacterToChat({ chatId, characterId: guestId });
  expect(await stored()).toEqual([
    { characterId: keeperId, content: "The old lamp is lit.", variantCount: 1 },
    { characterId: guestId, content: "The old bell rings.", variantCount: 1 },
  ]);
});
