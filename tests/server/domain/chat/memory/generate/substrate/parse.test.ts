import { describe } from "vitest";
import { parseDigest } from "../../../../../../../packages/server/src/domain/chat/memory/generate/substrate/parse.ts";
import { expect, test } from "../../../../../../support/fixtures.ts";

describe("memory/generate/substrate/parse", () => {
  test("parses the three-part digest (anchor · facts · keywords)", () => {
    const raw = "[Aria — the docks]\nAria found the ledger.\nShe lied to Cole.\nkeywords: Aria, ledger, Cole";
    const d = parseDigest(raw);
    expect(d.topicAnchor).toBe("[Aria — the docks]");
    expect(d.facts).toBe("Aria found the ledger.\nShe lied to Cole.");
    expect(d.keywords).toEqual(["Aria", "ledger", "Cole"]);
  });

  test("missing keywords line → empty keyword list (robust to a sloppy model)", () => {
    const d = parseDigest("[scene]\nsome facts");
    expect(d.topicAnchor).toBe("[scene]");
    expect(d.keywords).toEqual([]);
  });

  test("keywords are trimmed, de-duped, empties dropped", () => {
    const d = parseDigest("[x]\nf\nkeywords: a , b, , a,c");
    expect(d.keywords).toEqual(["a", "b", "c"]);
  });

  test("leading blank lines → the first non-empty line is the anchor", () => {
    expect(parseDigest("\n\n[anchor]\nfacts").topicAnchor).toBe("[anchor]");
  });

  test("a blank input (empty or all-whitespace) parses to an empty result", () => {
    expect(parseDigest("")).toEqual({ topicAnchor: "", facts: "", keywords: [] });
    expect(parseDigest("   ")).toEqual({ topicAnchor: "", facts: "", keywords: [] });
    expect(parseDigest("\n\n\n")).toEqual({ topicAnchor: "", facts: "", keywords: [] });
  });

  // #330 P5 — the real corpus row: the model appended `Keywords:` INLINE after the final fact sentence rather
  // than on its own line, and the old `^\s*keywords:` anchor lost the whole block's keywords (1 in 26 measured).
  test("an INLINE `Keywords:` after a fact sentence still yields the keyword list, keeping the fact prefix", () => {
    const d = parseDigest("[Mara — the kitchen]\nBess wraps a gift for Sam. Keywords: Mara, Sam, gift");
    expect(d.topicAnchor).toBe("[Mara — the kitchen]");
    expect(d.facts).toBe("Mara wraps a gift for Sam.");
    expect(d.keywords).toEqual(["Mara", "Sam", "gift"]);
  });

  test("a fact that merely MENTIONS `keywords:` mid-body does not steal the real trailing keyword list", () => {
    const d = parseDigest("[x]\nThey argued about the keywords: draft.\nMore fallout followed.\nKeywords: argument, draft");
    expect(d.facts).toBe("They argued about the keywords: draft.\nMore fallout followed.");
    expect(d.keywords).toEqual(["argument", "draft"]);
  });
});
