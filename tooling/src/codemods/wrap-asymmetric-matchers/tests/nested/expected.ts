import { expect, test } from "vitest";
import { asymmetric } from "@orb/testkit/iso";

test("nested matchers", () => {
  const seen = { id: "a", at: 1, tags: ["x"] };
  expect(seen).toEqual({ id: asymmetric(expect.any(String)), at: asymmetric(expect.any(Number)), tags: [asymmetric(expect.stringContaining("x"))] });
  const shape = asymmetric(expect.objectContaining({ id: asymmetric(expect.any(String)) }));
  expect(seen).toEqual(shape);
});
