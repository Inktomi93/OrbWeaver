// @subject packages/server/src/domain/chat/verbs/turn.ts
// Native finish reasons and saved settings distinguish in-place continuation, reroll precedence and bounded spend.
import type { UserSettings } from "@orb/contracts/settings";
import { messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import type { PhysicalReply } from "./followup-physical.ts";
import { followupRoom } from "./followup-physical.ts";

interface FollowupCase {
  readonly title: string;
  readonly patch: Partial<UserSettings["chat"]>;
  readonly replies: readonly PhysicalReply[];
  readonly calls: number;
  readonly variants: number;
  readonly fragments: readonly string[];
  readonly comparison: (typeof COMPARISONS)[number];
}
const CASES: readonly FollowupCase[] = [
  {
    patch: {
      autoContinue: true,
    },
    replies: [
      {
        text: "the thought was",
        finishReason: "length",
      },
      {
        text: " finished at last",
        finishReason: "stop",
      },
    ],
    calls: 2,
    variants: 1,
    fragments: ["the thought was", "finished at last"],
    title: "autoContinue fires ONE continue on a length-capped reply; the slot extends in place",
    comparison: "contains",
  },
  {
    patch: {
      autoContinue: true,
    },
    replies: [
      {
        text: "all done here",
        finishReason: "stop",
      },
    ],
    calls: 1,
    variants: 1,
    fragments: ["all done here"],
    title: "autoContinue does NOT fire when the reply finished cleanly (finishReason ≠ length)",
    comparison: "contains",
  },
  {
    patch: {
      autoContinue: true,
    },
    replies: [
      {
        text: "a",
        finishReason: "length",
      },
      {
        text: "b",
        finishReason: "length",
      },
      {
        text: "c",
        finishReason: "length",
      },
    ],
    calls: 2,
    variants: 1,
    fragments: ["a", "b"],
    title: "autoContinue respects its bound: a persistently length-capped model continues only ONCE",
    comparison: "contains",
  },
  {
    patch: {
      autoSwipe: {
        enabled: true,
        minLength: 12,
        blacklist: [],
        maxRetries: 1,
      },
    },
    replies: [
      {
        text: "too short",
      },
      {
        text: "a comfortably long reply that clears the bar",
      },
    ],
    calls: 2,
    variants: 2,
    fragments: ["a comfortably long reply that clears the bar"],
    title: "autoSwipe regenerates a too-short reply as a new selected variant",
    comparison: "exact",
  },
  {
    patch: {
      autoSwipe: {
        enabled: true,
        minLength: 0,
        blacklist: ["Sorry"],
        maxRetries: 1,
      },
    },
    replies: [
      {
        text: "i'm sorry, i can't help with that",
      },
      {
        text: "sure, here is the scene",
      },
    ],
    calls: 2,
    variants: 2,
    fragments: ["sure, here is the scene"],
    title: "autoSwipe fires on a blacklist hit (case-insensitive)",
    comparison: "exact",
  },
  {
    patch: {
      autoSwipe: {
        enabled: true,
        minLength: 100,
        blacklist: [],
        maxRetries: 1,
      },
    },
    replies: [
      {
        text: "nope",
      },
      {
        text: "still short",
      },
      {
        text: "again short",
      },
    ],
    calls: 2,
    variants: 2,
    fragments: ["still short"],
    title: "autoSwipe respects its bound: a persistently rejected model rerolls only ONCE",
    comparison: "exact",
  },
  {
    patch: {
      autoSwipe: {
        enabled: true,
        minLength: 100,
        blacklist: [],
        maxRetries: 2,
      },
    },
    replies: [
      {
        text: "nope",
      },
      {
        text: "still short",
      },
      {
        text: "again short",
      },
    ],
    calls: 3,
    variants: 3,
    fragments: ["again short"],
    title: "autoSwipe honors maxRetries=2: a persistently rejected model rerolls exactly TWICE (the knob, not a const)",
    comparison: "exact",
  },
  {
    patch: {
      autoContinue: true,
      autoContinueRounds: 2,
    },
    replies: [
      {
        text: "a",
        finishReason: "length",
      },
      {
        text: "b",
        finishReason: "length",
      },
      {
        text: "c",
        finishReason: "length",
      },
      {
        text: "d",
        finishReason: "length",
      },
    ],
    calls: 3,
    variants: 1,
    fragments: ["a", "b", "c"],
    title: "autoContinue honors autoContinueRounds=2: a persistently length-capped model continues exactly TWICE",
    comparison: "contains",
  },
  {
    patch: {
      autoContinue: true,
      autoSwipe: {
        enabled: true,
        minLength: 20,
        blacklist: [],
        maxRetries: 1,
      },
    },
    replies: [
      {
        text: "cut off",
        finishReason: "length",
      },
      {
        text: "a full, comfortably long swiped reply",
      },
    ],
    calls: 2,
    variants: 2,
    fragments: ["a full, comfortably long swiped reply"],
    title: "auto-swipe takes precedence over auto-continue on a reply that is both short AND length-capped",
    comparison: "exact",
  },
  {
    patch: {
      autoContinue: false,
      autoSwipe: {
        enabled: false,
        minLength: 0,
        blacklist: [],
        maxRetries: 1,
      },
    },
    replies: [
      {
        text: "x",
        finishReason: "length",
      },
    ],
    calls: 1,
    variants: 1,
    fragments: ["x"],
    title: "defaults (all-off): a short, length-capped reply triggers NO follow-up (byte-identical)",
    comparison: "contains",
  },
];

test.for(CASES)("$title", async (scene) => {
  await using h = await followupRoom(scene.replies, { group: { output: "per-speaker", policy: "natural" } });
  await h.caller.settings.updateUserSettingsSection({ section: "chat", patch: scene.patch });
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "go" });
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();
  expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(scene.calls);
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(canon.map(({ role }) => role)).toEqual(["user", "assistant"]);
  const assistant = canon[1];
  if (assistant === undefined) {
    throw new Error("the actual send produced no retained assistant slot");
  }
  const variants = await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, assistant.id)).orderBy(messageVariants.idx);
  expect(variants).toHaveLength(scene.variants);
  expect(variants.map(({ idx }) => idx)).toEqual(Array.from({ length: scene.variants }, (_, index) => index));
  const selected = variants.at(-1);
  expect(assistant.selectedVariantId).toBe(selected?.id);
  COMPARE[scene.comparison](selected?.content, scene.fragments);
  expect(outcome.messages.filter(({ role }) => role === "assistant").map(({ id }) => id)).toEqual(Array.from({ length: scene.calls }, () => assistant.id));
});
const COMPARISONS = ["contains", "exact"] as const;
const COMPARE: Record<(typeof COMPARISONS)[number], (content: string | undefined, fragments: readonly string[]) => void> = {
  contains: (content, fragments) => {
    for (const fragment of fragments) {
      expect(content).toContain(fragment);
    }
  },
  exact: (content, fragments) => {
    expect(content).toBe(fragments[0]);
  },
};
