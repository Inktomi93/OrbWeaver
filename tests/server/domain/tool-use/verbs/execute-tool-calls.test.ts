// executeToolCalls — the ONE pipeline (01 §5): every per-call failure is errors-as-data and the batch
// CONTINUES; the six steps each pinned. `result` is ALWAYS a JSON document (the ONE-stringify-site
// pin); records are provenance-faithful; durationMs rides the injected clock; execution is sequential
// in emission order.

import { z } from "zod";
import { createToolUseService } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { defOf, execOf, makeHarness } from "../_support.ts";

const NOOP_SCHEMA = z.object({});

test("unknown tool (model hallucination) → errors-as-data; the batch CONTINUES", async () => {
  const h = makeHarness();
  const svc = createToolUseService(h.ctx);
  svc.register(
    defOf({
      name: "real",
      schema: NOOP_SCHEMA,
      handler: () => Promise.resolve({ ok: true, value: { ran: true } }),
    }),
  );
  const records = await svc.executeToolCalls(
    svc.resolveTools(["real"]),
    [
      { toolCallId: "c1", name: "ghost", arguments: "{}" },
      { toolCallId: "c2", name: "real", arguments: "{}" },
    ],
    execOf(),
  );
  expect(records.map((r) => r.isError)).toEqual([true, false]);
  expect(JSON.parse(records[0]?.result ?? "")).toEqual({ error: "unknown tool: ghost" });
  expect(JSON.parse(records[1]?.result ?? "")).toEqual({ ran: true });
});

test("malformed JSON and zod-invalid args each carry a readable correction surface", async () => {
  const h = makeHarness();
  const svc = createToolUseService(h.ctx);
  svc.register(
    defOf({
      name: "typed",
      schema: z.object({ minutes: z.number() }),
      handler: () => Promise.resolve({ ok: true, value: null }),
    }),
  );
  const set = svc.resolveTools(["typed"]);
  const records = await svc.executeToolCalls(
    set,
    [
      { toolCallId: "c1", name: "typed", arguments: "{not json" },
      { toolCallId: "c2", name: "typed", arguments: '{"minutes":"thirty"}' },
    ],
    execOf(),
  );
  expect(records[0]?.isError).toBe(true);
  expect(records[0]?.result).toContain("malformed arguments");
  expect(records[1]?.isError).toBe(true);
  // The zod issue summary names the path — the model corrects against its own schema.
  expect(records[1]?.result).toContain("minutes");
  // Provenance-faithful: the raw arguments survive verbatim even when parse failed.
  expect(records[0]?.arguments).toBe("{not json");
});

test("capability denial + chat-scope-without-roster are data, never a dead turn; the gate HELD", async () => {
  const h = makeHarness();
  h.denied.add("host");
  const svc = createToolUseService(h.ctx);
  let invoked = 0;
  svc.register(
    defOf({
      name: "gated",
      schema: NOOP_SCHEMA,
      capability: { scope: "chat", action: "host" },
      handler: () => {
        invoked += 1;
        return Promise.resolve({ ok: true, value: null });
      },
    }),
  );
  const set = svc.resolveTools(["gated"]);
  // Null roster (non-chat consumer) → denial before can() is even consulted.
  const noRoster = await svc.executeToolCalls(set, [{ toolCallId: "c1", name: "gated", arguments: "{}" }], execOf({ chatId: null, roster: null }));
  expect(noRoster[0]?.isError).toBe(true);
  expect(noRoster[0]?.result).toContain("not permitted");
  expect(invoked).toBe(0);
});

test("a throwing handler becomes data (message only, no stack) and the batch continues", async () => {
  const h = makeHarness();
  const svc = createToolUseService(h.ctx);
  svc.register(
    defOf({
      name: "boom",
      schema: NOOP_SCHEMA,
      handler: () => Promise.reject(new Error("null deref")),
    }),
  );
  svc.register(
    defOf({
      name: "after",
      schema: NOOP_SCHEMA,
      handler: () => Promise.resolve({ ok: true, value: "fine" }),
    }),
  );
  const records = await svc.executeToolCalls(
    svc.resolveTools(["boom", "after"]),
    [
      { toolCallId: "c1", name: "boom", arguments: "{}" },
      { toolCallId: "c2", name: "after", arguments: "{}" },
    ],
    execOf(),
  );
  expect(JSON.parse(records[0]?.result ?? "")).toEqual({ error: "null deref" });
  expect(records[0]?.result).not.toContain("at "); // no stack frames reach the model
  expect(records[1]?.isError).toBe(false);
});

test("the ONE stringify site: ok:false is a legality result; a string-returning handler still yields a JSON document", async () => {
  const h = makeHarness();
  const svc = createToolUseService(h.ctx);
  svc.register(
    defOf({
      name: "misses",
      schema: NOOP_SCHEMA,
      handler: () => Promise.resolve({ ok: false, error: "the attack misses" }),
    }),
  );
  svc.register(
    defOf({
      name: "stringy",
      schema: NOOP_SCHEMA,
      handler: () => Promise.resolve({ ok: true, value: "plain text answer" }),
    }),
  );
  const records = await svc.executeToolCalls(
    svc.resolveTools(["misses", "stringy"]),
    [
      { toolCallId: "c1", name: "misses", arguments: "{}" },
      { toolCallId: "c2", name: "stringy", arguments: "{}" },
    ],
    execOf(),
  );
  // Every non-null result JSON.parses unconditionally — the client-chip contract (03 §4).
  expect(JSON.parse(records[0]?.result ?? "")).toEqual({ error: "the attack misses" });
  expect(records[0]?.isError).toBe(true);
  expect(JSON.parse(records[1]?.result ?? "")).toBe("plain text answer");
  expect(records[1]?.isError).toBe(false);
});

test("sequential in emission order; durationMs rides the injected clock", async () => {
  const h = makeHarness();
  const svc = createToolUseService(h.ctx);
  const order: string[] = [];
  svc.register(
    defOf({
      name: "slow_first",
      schema: NOOP_SCHEMA,
      handler: async () => {
        h.advance(25);
        await Promise.resolve(); // a genuinely async handler — sequencing must not depend on sync-ness
        order.push("slow_first");
        return { ok: true, value: null };
      },
    }),
  );
  svc.register(
    defOf({
      name: "fast_second",
      schema: NOOP_SCHEMA,
      handler: () => {
        order.push("fast_second");
        return Promise.resolve({ ok: true, value: null });
      },
    }),
  );
  const records = await svc.executeToolCalls(
    svc.resolveTools(["slow_first", "fast_second"]),
    [
      { toolCallId: "c1", name: "slow_first", arguments: "{}" },
      { toolCallId: "c2", name: "fast_second", arguments: "{}" },
    ],
    execOf(),
  );
  expect(order).toEqual(["slow_first", "fast_second"]);
  expect(records[0]?.durationMs).toBe(25);
  expect(records[1]?.durationMs).toBe(0);
});
