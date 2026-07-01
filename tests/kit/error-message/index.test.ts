import { errorMessage } from "@orb/kit/error-message";
import { expect, test } from "../../support/fixtures";

test("errorMessage returns the message of an Error subclass", () => {
  expect(errorMessage(new Error("boom"))).toBe("boom");
  expect(errorMessage(new TypeError("bad type"))).toBe("bad type");
});

test("errorMessage stringifies non-Error throws", () => {
  expect(errorMessage("plain string throw")).toBe("plain string throw");
  expect(errorMessage(42)).toBe("42");
  expect(errorMessage(null)).toBe("null");
  expect(errorMessage(undefined)).toBe("undefined");
});
