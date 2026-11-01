import { expect, test, vi } from "vitest";

test("direct arguments", () => {
  const spy = vi.fn();
  spy("a", 1);
  expect(spy).toHaveBeenCalledWith(expect.any(String), expect.any(Number));
  expect(spy.mock.calls[0]).toEqual(expect.arrayContaining(["a"]));
});
