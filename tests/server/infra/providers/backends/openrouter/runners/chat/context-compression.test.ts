// backends/openrouter chat/context-compression — the middle-out lever. Default OFF (we trim
// deterministically; OR must not middle-out on top); user opt-in flips it to an enabled middle-out engine.

import { withContextCompressionPlugin } from "@orb/server/infra/providers/backends/openrouter";
import { describe } from "vitest";
import { expect, test } from "../../../../../../../support/fixtures.ts";

describe("withContextCompressionPlugin", () => {
  test("disables middle-out by default (an explicit enabled:false — transforms:[] does NOT disable it)", () => {
    expect(withContextCompressionPlugin({})).toEqual([{ id: "context-compression", enabled: false }]);
  });

  test("a user opt-in enables the middle-out engine", () => {
    expect(withContextCompressionPlugin({ providerContextCompression: true })).toEqual([{ id: "context-compression", enabled: true, engine: "middle-out" }]);
  });
});
