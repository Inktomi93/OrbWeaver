import { expect, test } from "vitest";

test("nested matchers", () => {
  const seen = { id: "a", at: 1, tags: ["x"] };
  expect(seen).toEqual({ id: expect.any(String), at: expect.any(Number), tags: [expect.stringContaining("x")] });
  const shape = expect.objectContaining({ id: expect.any(String) });
  expect(seen).toEqual(shape);
});
