// toWireTools — the OpenAI-wire projection: name/description verbatim, the CACHED JSON schema as
// `parameters`, order = resolve order.

import { z } from "zod";
import { createToolUseService } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { defOf, makeHarness } from "../_support.ts";

test("projects name/description + the cached schema, in resolve order", () => {
  const svc = createToolUseService(makeHarness().ctx);
  const okHandler = (): Promise<{ ok: true; value: unknown }> => Promise.resolve({ ok: true, value: null });
  svc.register(defOf({ name: "second", schema: z.object({}), handler: okHandler }));
  svc.register(defOf({ name: "first", schema: z.object({ x: z.string() }), handler: okHandler }));
  const wire = svc.toWireTools(svc.resolveTools(["first", "second"]));
  expect(wire.map((tool) => tool.name)).toEqual(["first", "second"]);
  expect(wire[0]?.description).toBe("test tool first");
  expect(wire[0]?.parameters["additionalProperties"]).toBe(false);
});
