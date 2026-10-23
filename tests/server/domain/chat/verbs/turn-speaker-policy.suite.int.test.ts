// @subject packages/server/src/domain/chat/verbs/turn.ts
// Actual persisted speaker order distinguishes policy, mention, ban-last and self-response behavior.
import { createCharacterSchema } from "@orb/contracts/character";
import type { GroupConfig } from "@orb/contracts/chat";
import { messages } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { and, eq, gt, max } from "drizzle-orm";
import { openingOf, openingText, textRoom, wireBodies } from "../scenario-physical.ts";

interface SpeakerCase {
  readonly title: string;
  readonly names: readonly string[];
  readonly group: Partial<GroupConfig>;
  readonly prior?: number;
  readonly content: string;
  readonly expected: readonly number[];
}

const CASES: readonly SpeakerCase[] = [
  {
    names: ["aria", "bryn"],
    group: {
      policy: "list",
    },
    content: "hi all",
    expected: [0, 1],
    title: "a list-policy 2-character room commits one assistant per speaker, in order",
  },
  {
    names: ["aria", "bryn"],
    group: {
      policy: "list",
    },
    content: "@bryn hello",
    expected: [1],
    title: "a human @mention hard-overrides the policy to the named character only",
  },
  {
    names: ["aria", "bryn", "cara"],
    group: {
      policy: "natural",
    },
    content: "hello, everyone",
    expected: [2],
    title: "a natural room answers with the ONE fallback speaker when nobody is named and every roll fails",
  },
  {
    names: ["aria", "bryn", "cara"],
    group: {
      policy: "natural",
    },
    content: "Bryn, what do you make of this?",
    expected: [1],
    title: "a natural room answers the character the human names as a plain word (no @)",
  },
  {
    names: ["aria", "bryn", "cara"],
    group: {
      policy: "natural",
    },
    prior: 0,
    content: "Aria, say more.",
    expected: [0],
    title: "a natural send naming the character who just spoke gets that character",
  },
  {
    names: ["aria", "bryn"],
    group: {
      policy: "list",
      allowSelfResponses: true,
    },
    prior: 0,
    content: "again",
    expected: [0, 1],
    title: "with self-responses on, a list send includes the character who just spoke, in roster order",
  },
  {
    names: ["aria", "bryn"],
    group: {
      policy: "pooled",
      allowSelfResponses: true,
    },
    prior: 0,
    content: "again",
    expected: [1, 0],
    title: "with self-responses on, a Round-robin send includes the character who just spoke, last in the rotation",
  },
  {
    names: ["aria", "bryn"],
    group: {
      policy: "natural",
      autoMode: true,
      autoModeMaxTurns: 1,
      autoModeDelayMs: 0,
    },
    content: "hello",
    expected: [1, 0],
    title: "a natural auto-chain beat still bans the character who just spoke",
  },
  {
    names: ["aria", "bryn"],
    group: {
      policy: "natural",
      autoMode: true,
      autoModeMaxTurns: 1,
      autoModeDelayMs: 0,
      allowSelfResponses: true,
    },
    content: "hello",
    expected: [1, 1],
    title: "allowSelfResponses lifts the ban on a natural auto-chain beat",
  },
];

test.for(CASES)("$title", async (scene) => {
  const prior = scene.prior === undefined ? undefined : scene.names[scene.prior];
  await using h = await textRoom(
    scene.expected.map((_, index) => `Reply ${String(index)}`),
    {
      server: { random: () => 0.99 },
      characters: scene.names.map((name) => createCharacterSchema.parse({ handle: name, name, description: `${name} has a distinct public card.` })),
      group: { output: "per-speaker", ...scene.group },
      ...(prior === undefined
        ? {}
        : {
            transcript: [
              { role: "user", content: "hello" },
              { role: "assistant", speakerHandle: prior, content: `${prior} answers` },
            ],
          }),
    },
  );
  // Production numbers the canon; the turn under test appends after whatever head the room was born with.
  const [head] = await h.root.db
    .select({ seq: max(messages.seq) })
    .from(messages)
    .where(eq(messages.chatId, h.chatId));
  const priorSeq = head?.seq ?? 0;
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: scene.content });
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();
  const canon = await h.root.db
    .select()
    .from(messages)
    .where(and(eq(messages.chatId, h.chatId), gt(messages.seq, priorSeq)))
    .orderBy(messages.seq);
  expect(canon.map(({ seq }) => seq)).toEqual(Array.from({ length: scene.expected.length + 1 }, (_, index) => priorSeq + index + 1));
  expect(canon.filter(({ role }) => role === "assistant").map(({ characterId }) => characterId)).toEqual(
    scene.expected.map((index) => h.characters[index]?.id),
  );
  expect(canon[0]).toMatchObject({ role: "user", authorUserId: h.owner.userId });
  // A seeded room opens on its imported owner line; an empty room opens on the live send, which may carry a nudge.
  const bodies = await wireBodies(h);
  expect(bodies).toHaveLength(scene.expected.length);
  for (const body of bodies) {
    expect(openingText(body).startsWith(openingOf(prior === undefined ? scene.content : "hello"))).toBe(true);
  }
});
