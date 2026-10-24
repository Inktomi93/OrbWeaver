// @subject packages/server/src/domain/chat/engine/engine.ts
// Physical SQLite refusals exercise the real memory supervisor and total durable warning emitter.
import process from "node:process";
import { chatEvents, chatSegments } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { processObservability, refuseWrites } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { LOG_SCAN_LIMIT, room } from "./memory-build.fixtures.ts";

test("the memory build throwing emits warning(memory_build_failed) but the turn itself still completes", async () => {
  await using fixture = await room();
  await using _segments = await refuseWrites(fixture.h.root.db, { table: chatSegments, event: "INSERT", message: "controlled memory segment refusal" });
  const { outcome, canon } = await fixture.turn();
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ role: "assistant", content: "The real memory turn commits." }]);
  expect(canon).toHaveLength(4);
  expect(canon.map(({ id }) => id)).toContain(outcome.messages[0]?.id);
  expect(await fixture.warnings()).toMatchObject([{ type: "warning", chatId: fixture.h.chatId, code: "memory_build_failed" }]);
  expect(
    processObservability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(fixture.h.chatId) && line.includes("memory: post-turn build failed")),
  ).toHaveLength(1);
});

test("a failing warning append neither fails the turn nor leaves an unhandled rejection", async () => {
  await using fixture = await room();
  await using _segments = await refuseWrites(fixture.h.root.db, { table: chatSegments, event: "INSERT", message: "controlled memory segment refusal" });
  await using _warnings = await refuseWrites(fixture.h.root.db, {
    table: chatEvents,
    event: "INSERT",
    when: `NEW."type" = 'warning' AND json_extract(NEW."payload", '$.code') = 'memory_build_failed'`,
    message: "controlled memory warning append refusal",
  });
  const unhandled = vi.fn();
  process.on("unhandledRejection", unhandled);
  try {
    const { outcome, canon } = await fixture.turn();
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toMatchObject([{ role: "assistant", content: "The real memory turn commits." }]);
    expect(canon).toHaveLength(4);
    expect(canon.map(({ id }) => id)).toContain(outcome.messages[0]?.id);
    expect(await fixture.warnings()).toEqual([]);
    const logged = processObservability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(fixture.h.chatId));
    expect(logged.filter((line) => line.includes("memory: post-turn build failed"))).toHaveLength(1);
    expect(logged.filter((line) => line.includes("durable append failed on a live chat — retrying"))).toHaveLength(1);
    expect(logged.filter((line) => line.includes("DURABLE APPEND FAILED on a live chat — event dropped, its replay slot is permanently missing"))).toHaveLength(
      1,
    );
    expect(unhandled.mock.calls).toEqual([]);
  } finally {
    process.off("unhandledRejection", unhandled);
  }
});
