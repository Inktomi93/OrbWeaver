// kit/like — the ONE escape for a user term interpolated into a SQL `LIKE` pattern. Load-bearing: BOTH
// metacharacters and the escape character itself are escaped, in one pass, and ordinary text is untouched.

import { escapeLikeTerm } from "@orb/db/query";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";

describe("escapeLikeTerm", () => {
  test("escapes both LIKE metacharacters and the escape character itself", () => {
    expect(escapeLikeTerm("100%")).toBe("100\\%");
    expect(escapeLikeTerm("a_b")).toBe("a\\_b");
    // The backslash must be escaped too, and NOT re-scanned: `\%` is a literal backslash then a literal
    // percent, so it becomes `\\` + `\%` — four characters, never a doubled escape of the escape.
    expect(escapeLikeTerm("\\%")).toBe("\\\\\\%");
  });

  test("leaves ordinary text — including regex metacharacters — alone", () => {
    expect(escapeLikeTerm("Aria Nightshade")).toBe("Aria Nightshade");
    expect(escapeLikeTerm("a.*b[c]")).toBe("a.*b[c]");
    expect(escapeLikeTerm("")).toBe("");
  });
});
