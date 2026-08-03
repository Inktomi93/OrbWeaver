// resolveTools — the per-turn read surface: unknown name THROWS (attach-time = OUR wiring bug — the
// deliberate contrast with execute's errors-as-data unknown), and order = caller order (byte-stable
// request bodies).

import { z } from "zod";
import { createToolUseService, ToolNotFoundError } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { defOf, makeHarness } from "../_support.ts";

const okHandler = (): Promise<{ ok: true; value: unknown }> => Promise.resolve({ ok: true, value: null });

test("an unknown name THROWS ToolNotFoundError (attach-time wiring bug, not model data)", () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(defOf({ name: "known", schema: z.object({}), handler: okHandler }));
  expect(() => svc.resolveTools(["known", "ghost"])).toThrow(ToolNotFoundError);
});

test("set order = caller order, independent of registration order", () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(defOf({ name: "b_tool", schema: z.object({}), handler: okHandler }));
  svc.register(defOf({ name: "a_tool", schema: z.object({}), handler: okHandler }));
  const set = svc.resolveTools(["a_tool", "b_tool"]);
  expect(set.entries.map((entry) => entry.name)).toEqual(["a_tool", "b_tool"]);
});
