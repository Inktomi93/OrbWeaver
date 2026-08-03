import { errorMessage } from "@orb/kit/error-message";
import { expect, test } from "../../support/fixtures.ts";

test("errorMessage returns the message of an Error subclass", () => {
  expect(errorMessage(new Error("boom"))).toBe("boom");
  expect(errorMessage(new TypeError("bad type"))).toBe("bad type");
});

test("errorMessage returns the empty string for a message-less Error", () => {
  // biome-ignore lint/suspicious/useErrorMessage: the whole point of this test is the no-message case.
  expect(errorMessage(new Error())).toBe("");
});

test("errorMessage stringifies non-Error throws", () => {
  expect(errorMessage("plain string throw")).toBe("plain string throw");
  expect(errorMessage(42)).toBe("42");
  expect(errorMessage(null)).toBe("null");
  expect(errorMessage(undefined)).toBe("undefined");
});
