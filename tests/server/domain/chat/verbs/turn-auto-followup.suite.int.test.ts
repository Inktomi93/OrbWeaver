// @subject packages/server/src/domain/chat/verbs/turn.ts
// Native finish reasons and saved settings distinguish in-place continuation, reroll precedence and bounded spend.
import type { UserSettings } from "@orb/contracts/settings";
import { messageVariants } from "@orb/db";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { readRoomCanon, refuseWrites } from "@orb/testkit/node/composed";
import { z } from "zod";
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
      autoContinueRounds: 1,
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
      autoContinueRounds: 1,
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
      autoContinueRounds: 1,
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
      },
    },
    replies: [
      {
        text: "nope",
      },
      {
        text: "still short",
      },
    ],
    calls: 2,
    variants: 2,
    fragments: ["still short"],
    title: "autoSwipe rerolls a persistently rejected model only ONCE",
    comparison: "exact",
  },
  {
    patch: {
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
    ],
    calls: 3,
    variants: 1,
    fragments: ["a", "b", "c"],
    title: "autoContinue honors autoContinueRounds=2: a persistently length-capped model continues exactly TWICE",
    comparison: "contains",
  },
  {
    patch: {
      autoContinueRounds: 1,
      autoSwipe: {
        enabled: true,
        minLength: 20,
        blacklist: [],
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
      autoContinueRounds: 0,
      autoSwipe: {
        enabled: false,
        minLength: 0,
        blacklist: [],
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
  const canon = await readRoomCanon(h.root, h.owner, h.chatId);
  expect(canon.map(({ role }) => role)).toEqual(["user", "assistant"]);
  const assistant = canon[1];
  if (assistant === undefined) {
    throw new Error("the actual send produced no retained assistant slot");
  }
  const variants = await h.root.services.chat.listMessageVariants({ principal: h.owner, chatId: h.chatId, messageId: assistant.id });
  expect(variants).toHaveLength(scene.variants);
  expect(variants.map(({ idx }) => idx)).toEqual(Array.from({ length: scene.variants }, (_, index) => index));
  const selected = variants.at(-1);
  expect(assistant.selectedVariantId).toBe(selected?.variantId);
  COMPARE[scene.comparison](assistant.content, scene.fragments);
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

const CUT_REPLY = "the thought was";
const CONTINUATION = " finished at last";
const FOLLOWUP_FAULT = "controlled auto-continue commit fault";
const LOG_SCAN_LIMIT = 200;
const followUpLogSchema = z.looseObject({
  level: z.string(),
  followUp: z.string(),
  messageId: typeIdSchema(ID_PREFIX.message),
  err: z.looseObject({ message: z.string() }),
});

test("a fault in the auto-continue is logged at error and the send still answers with its committed reply", async () => {
  await using h = await followupRoom(
    [
      { text: CUT_REPLY, finishReason: "length" },
      { text: CONTINUATION, finishReason: "stop" },
    ],
    { group: { output: "per-speaker", policy: "natural" }, server: { logLevel: "error" } },
  );
  await h.caller.settings.updateUserSettingsSection({ section: "chat", patch: { autoContinueRounds: 1 } });
  // Only the continuation's commit carries the continued text, so the send's own reply commits untouched.
  await using _refusal = await refuseWrites(h.root.db, {
    table: messageVariants,
    event: "UPDATE",
    message: FOLLOWUP_FAULT,
    when: `NEW.content LIKE '%${CONTINUATION.trim()}%'`,
  });
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "go" });
  await h.root.settleBackground();
  expect(outcome.aborted).toBe(false);
  const replies = outcome.messages.filter(({ role }) => role === "assistant");
  expect(replies.map(({ content }) => content)).toEqual([CUT_REPLY]);
  const faults = h.root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => followUpLogSchema.safeParse(JSON.parse(line)))
    .flatMap((record) => (record.success ? [record.data] : []));
  expect(faults).toMatchObject([
    { level: "error", followUp: "auto-continue", messageId: replies[0]?.id, err: { message: expect.stringContaining(FOLLOWUP_FAULT) } },
  ]);
});

test("a follow-up past the script, which production swallows, still fails the room when it closes", async () => {
  await expect(async () => {
    await using h = await followupRoom([{ text: "cut off", finishReason: "length" }], { group: { output: "per-speaker", policy: "natural" } });
    await h.caller.settings.updateUserSettingsSection({ section: "chat", patch: { autoContinueRounds: 1 } });
    expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "go" })).aborted).toBe(false);
    await h.root.settleBackground();
    expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(2);
  }).rejects.toThrow("the explicit-terminal reply plan was asked for 1 reply beyond the 1 it scripted");
});
