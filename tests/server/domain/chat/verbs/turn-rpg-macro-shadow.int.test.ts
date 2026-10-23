// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/rpg/chat-ops/index.ts
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { messageVariants } from "@orb/db";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { GAME_MOOD } from "./turn-rpg-macro-data.ts";
import { turnRpgReply, turnRpgRoom, turnWireBody } from "./turn-rpg-physical.ts";

const TONES = ["grim", "warm", "tense", "wry"] as const;
const ROWS = [
  { label: "the game definition shadows the preset random pick", game: true, pick: null },
  { label: "the stored named pick survives the game's shadow", game: true, pick: "hopeful" },
  { label: "an empty game definition set preserves the preset random pick", game: false, pick: null },
] as const;

test.for(ROWS)("public SEND macro delivery: $label", async (row) => {
  const wires: string[] = [];
  await using h = await turnRpgRoom(
    [
      async (request): Promise<Response> => {
        wires.push(JSON.stringify(await turnWireBody(request)));
        return turnRpgReply("The keeper answers the traveller.");
      },
    ],
    {
      promptConfig: makePromptConfig({
        userMacros: [
          {
            name: "mood",
            description: "the preset's scene tone",
            args: [],
            body: "{{tone}}",
            strict: false,
            inputs: [
              {
                kind: "random-pick",
                name: "tone",
                label: "Tone",
                options: TONES.map((value) => ({ label: value, value })),
                separator: ", ",
                onValue: "",
                offValue: "",
                defaultValue: "",
              },
            ],
          },
        ],
        sections: [
          { type: "literal", id: "game-mood", name: "Game mood", role: "system", content: "Scene tone: {{mood}}.", enabled: true },
          ...DEFAULT_PROMPT_CONFIG.sections,
        ],
      }),
    },
  );
  await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, patch: { userMacros: row.game ? [GAME_MOOD] : [] } });
  if (row.pick !== null) {
    await h.root.services.chat.setUserMacroValues({ principal: h.owner, chatId: h.chatId, values: { mood: { tone: row.pick } } });
  }
  const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Hello, keeper." });
  expect(sent.aborted).toBe(false);
  const assistant = sent.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the macro SEND has no selected assistant variant");
  }
  await h.root.settleBackground();
  expect(wires).toHaveLength(1);
  const tone = /Scene tone: (\w+)\./u.exec(wires[0] ?? "")?.[1];
  expect(row.game ? [row.pick ?? "doomed"] : TONES).toContain(tone);
  const [variant] = await h.root.db
    .select({ macroDraws: messageVariants.macroDraws })
    .from(messageVariants)
    .where(eq(messageVariants.id, assistant.selectedVariantId));
  expect(variant?.macroDraws).toEqual(row.game ? {} : { mood: { tone } });
});
