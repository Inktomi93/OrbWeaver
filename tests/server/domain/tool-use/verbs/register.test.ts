// register — compose-time insertion: collision is BOOT-FATAL (thrown, never last-write-wins), a name
// outside the OpenAI∩MCP charset refuses, and the JSON-schema projection is computed once and cached
// on the entry (read back through resolveTools).

import { z } from "zod";
import { createToolUseService, ToolNameCollisionError } from "../../../../../packages/server/src/domain/tool-use";
import { expect, test } from "../../../../support/fixtures";
import { defOf, makeHarness } from "../_support";

const okHandler = (): Promise<{ ok: true; value: unknown }> => Promise.resolve({ ok: true, value: null });

test("a duplicate name throws ToolNameCollisionError (boot-fatal; never last-write-wins)", () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(defOf({ name: "tick_clock", schema: z.object({}), handler: okHandler }));
  expect(() => svc.register(defOf({ name: "tick_clock", schema: z.object({}), handler: okHandler }))).toThrow(ToolNameCollisionError);
});

test("a name outside the OpenAI∩MCP charset refuses at registration", () => {
  const svc = createToolUseService(makeHarness().ctx);
  for (const bad of ["Tick", "9start", "has-dash", "has space", ""]) {
    expect(() => svc.register(defOf({ name: bad, schema: z.object({}), handler: okHandler }))).toThrow(ToolNameCollisionError);
  }
});

test("the JSON-schema projection is cached at registration and served by resolveTools", () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(
    defOf({
      name: "tick_clock",
      schema: z.object({ minutes: z.number().describe("how far to advance") }),
      handler: okHandler,
    }),
  );
  const set = svc.resolveTools(["tick_clock"]);
  const params = set.entries[0]?.parameters;
  expect(params?.["additionalProperties"]).toBe(false);
  expect(JSON.stringify(params)).toContain("how far to advance");
});
