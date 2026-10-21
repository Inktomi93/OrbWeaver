import { impersonateStreamDeltaSchema } from "@orb/contracts/chat";
import { expect, test } from "vitest";

test("impersonation deltas round-trip partial text and reject non-text output", () => {
  const delta = impersonateStreamDeltaSchema.parse({ delta: "Partial \nreply" });
  expect(impersonateStreamDeltaSchema.parse(JSON.parse(JSON.stringify(delta)))).toEqual(delta);
  expect(impersonateStreamDeltaSchema.safeParse({ delta: 42 }).success).toBe(false);
});
