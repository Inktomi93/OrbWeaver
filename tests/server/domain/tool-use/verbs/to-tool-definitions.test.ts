// toToolDefinitions — the ONE backend-neutral projection: name/description verbatim, the CACHED JSON schema as
// `parameters`, the zod raw shape it was projected from as `inputShape`, order = resolve order. `@orb/inference`
// turns the same definitions into an array wire's `tools[]` or the Agent SDK's MCP server
// (tests/inference/roles/chat-request.test.ts), so both wires describe one tool from one schema.

import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { createToolUseService } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { ANY_DRIVER, defOf, makeHarness } from "../_support.ts";

const okHandler = (): Promise<{ ok: true; value: unknown }> => Promise.resolve({ ok: true, value: null });

test("projects name/description + the cached schema, in resolve order", () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(defOf({ name: "second", schema: z.object({}), handler: okHandler }));
  svc.register(defOf({ name: "first", schema: z.object({ x: z.string() }), handler: okHandler }));
  const definitions = svc.toToolDefinitions(svc.resolveTools(ANY_DRIVER, ["first", "second"]));
  expect(definitions.map((tool) => tool.name)).toEqual(["first", "second"]);
  expect(definitions[0]?.description).toBe("test tool first");
  expect(definitions[0]?.parameters["additionalProperties"]).toBe(false);
});

test("the MCP shape is the SAME schema the JSON declaration was projected from — never a re-lift", () => {
  const schema = z.object({ minutes: z.number().int(), note: z.string().optional() });
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(defOf({ name: "tick_clock", schema, handler: okHandler }));
  const [definition] = svc.toToolDefinitions(svc.resolveTools(ANY_DRIVER, ["tick_clock"]));
  // The registered object schema's own `.shape` — identity, so the SDK validates exactly what the registry does.
  expect(definition?.inputShape).toBe(schema.shape);
  // …and the JSON declaration is that same object schema's projection: rebuilding the object from the shape and
  // running the registry's own projector yields the declared `parameters`, key for key.
  expect(definition?.parameters).toEqual(projectJsonSchema(z.object(definition?.inputShape ?? {})));
});
