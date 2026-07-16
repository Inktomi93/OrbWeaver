import { describe } from "vitest";
import { parseDigest, renderDigestFacets } from "../../../../../../../packages/server/src/domain/chat/memory/build/substrate/parse";
import { expect, test } from "../../../../../../support/fixtures";

describe("memory/build/substrate/parse", () => {
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

  test("renderDigestFacets composes anchor + keywords; handles each absent", () => {
    expect(renderDigestFacets({ topicAnchor: "[a]", keywords: ["k1", "k2"] })).toBe("[a]\nkeywords: k1, k2");
    expect(renderDigestFacets({ topicAnchor: "[a]", keywords: [] })).toBe("[a]");
    expect(renderDigestFacets({ topicAnchor: null, keywords: ["k"] })).toBe("keywords: k");
    expect(renderDigestFacets({ topicAnchor: null, keywords: [] })).toBe("");
  });
});
