// A turn stores the size of the system prompt it sent on its variant's metadata; with that recorded,
// pre-turn and post-turn compaction thresholds agree. The stored metadata is a column no view projects.
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/verbs/compaction.ts
import { parseVariantMetadata } from "@orb/contracts/chat";
import { messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { and, desc, eq } from "drizzle-orm";
import type { RecordedSystemProbe } from "../engine/managed-compaction.fixtures.ts";
import { firstCompactingRows } from "../engine/managed-compaction.fixtures.ts";

const recordSystemPrompt: RecordedSystemProbe = async (fixture, count, heavy) => {
  const bootstrap = await fixture.turn({ compaction: { mode: "auto" } });
  expect(bootstrap.aborted).toBe(false);
  expect(bootstrap.messages).toHaveLength(1);
  const newest = await fixture.h.root.db
    .select({ seq: messages.seq, variantId: messageVariants.id, metadata: messageVariants.metadata })
    .from(messages)
    .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
    .where(and(eq(messages.chatId, fixture.h.chatId), eq(messages.role, "assistant")))
    .orderBy(desc(messages.seq))
    .get();
  expect(newest).toMatchObject({ seq: await fixture.seqOfRow(count), variantId: bootstrap.messages[0]?.selectedVariantId });
  expect(parseVariantMetadata(newest?.metadata).systemTokens).toBeGreaterThan(heavy ? 2000 : 0);
  expect((await fixture.marker()).compactSummary).toBeNull();
};

test("a production-recorded heavy system prompt makes pre-turn and post-turn thresholds agree within one row", { tags: "slow" }, async ({ annotate }) => {
  const samples: number[] = [];
  const observe = (exchanges: number): void => {
    samples.push(exchanges);
  };
  // The two searches share no room, so they run side by side; each probe still runs strictly in order.
  const [postRows, preRows] = await Promise.all([
    firstCompactingRows({ foregroundFails: false, heavy: true, observe }),
    firstCompactingRows({ foregroundFails: true, heavy: true, record: recordSystemPrompt, observe }),
  ]);
  await annotate(
    JSON.stringify({ postRows, preRows, probes: samples.length, nativeExchanges: samples.reduce((sum, count) => sum + count, 0) }),
    "native-compaction-search",
  );
  expect(Math.abs(preRows - postRows)).toBeLessThanOrEqual(1);
});
