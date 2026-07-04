// projectArgSchema — the ONE zod → JSON-Schema rule (01 §2), golden-pinned: additionalProperties:false
// on EVERY object node (nested included), descriptions survive, output deterministic. The same rule
// serves ResponseFormat.schema (04 §1) — these goldens are that axis's too.

import { z } from "zod";
import { projectArgSchema } from "../../../../../packages/server/src/domain/tool-use";
import { expect, test } from "../../../../support/fixtures";

test("pins additionalProperties:false on every object node, nested objects + array items included", () => {
  const projected = projectArgSchema(
    z.object({
      target: z.object({ id: z.string() }),
      waypoints: z.array(z.object({ x: z.number(), y: z.number() })),
    }),
  );
  const text = JSON.stringify(projected);
  // Every `"type":"object"` in the projection carries the pin — count them equal.
  const objectNodes = text.split('"type":"object"').length - 1;
  const pinned = text.split('"additionalProperties":false').length - 1;
  expect(objectNodes).toBeGreaterThanOrEqual(3);
  expect(pinned).toBe(objectNodes);
});

test("descriptions survive (they ARE prompt surface) and the projection is deterministic", () => {
  const schema = z.object({
    minutes: z.number().describe("how far to advance the clock"),
  });
  const a = projectArgSchema(schema);
  const b = projectArgSchema(schema);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(JSON.stringify(a)).toContain("how far to advance the clock");
});
