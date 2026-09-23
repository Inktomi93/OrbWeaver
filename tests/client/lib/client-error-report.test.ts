// `buildClientErrorPayload` — the pure wire-payload builder. `url` is injected (never read from
// `globalThis.location` internally — see the file header), so this is plain-data-in/plain-data-out and
// needs no DOM/jsdom to test under the node unit lane.

import { buildClientErrorPayload } from "@orb/client/lib";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("buildClientErrorPayload", () => {
  test("carries the error's message + stack + the injected url", () => {
    const error = new Error("boom");
    const payload = buildClientErrorPayload(error, null, "/chats/abc?x=1");
    expect(payload.message).toBe("boom");
    expect(payload.stack).toBe(error.stack);
    expect(payload.url).toBe("/chats/abc?x=1");
  });

  test("a null ownerStack (prod, or unavailable) is omitted from the payload entirely", () => {
    const payload = buildClientErrorPayload(new Error("boom"), null, "/");
    expect(payload).not.toHaveProperty("ownerStack");
  });

  test("a non-null ownerStack (DEV) is carried through", () => {
    const payload = buildClientErrorPayload(new Error("boom"), "at <Foo>\nat <Bar>", "/");
    expect(payload.ownerStack).toBe("at <Foo>\nat <Bar>");
  });

  test("an error with no stack (a hand-thrown value coerced upstream) omits stack, not undefined-as-string", () => {
    const error = new Error("boom");
    // `Error.stack` is engine-provided, not always present (some environments/constructions omit it) —
    // `defineProperty` (not a plain assignment) is the way to force that shape under
    // `exactOptionalPropertyTypes` without a biome-banned `delete`.
    Object.defineProperty(error, "stack", { value: undefined });
    const payload = buildClientErrorPayload(error, null, "/");
    expect(payload).not.toHaveProperty("stack");
  });
});
