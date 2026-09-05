// kit/like — the ONE escape for a user term interpolated into a SQL `LIKE` pattern. Load-bearing: BOTH
// metacharacters and the escape character itself are escaped, in one pass, and ordinary text is untouched.

import { escapeLikeTerm } from "@orb/db/kit";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

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
