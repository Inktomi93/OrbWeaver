// The forced-state pass's PAGE→NODE seams, each proven to refuse LOUDLY (#1004). The pass's founding
// defect was a silent `JSON.parse(raw) as number[]` over selector strings, which turned restoration
// withholding off without a single error line; these are the pins that keep every seam beside it honest.
import { describe } from "vitest";
import { attrRestored, candidateIndices, groupReadResult, hoverCensusResult, pageJsonString } from "../../../../tooling/src/ui-audit/ops/hover-validate.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CENSUS = { rest: [], groups: [], attrGroups: [], census: { textCandidates: 0, subjects: 0 } };
const GROUP_READ = JSON.stringify({ reads: [], shadows: [], radials: [] });

describe("pageJsonString", () => {
  test("passes the JSON text through", () => {
    expect(pageJsonString("[]", "read")).toBe("[]");
  });

  test("refuses a non-string — a vanished in-page object would otherwise surface as a force failure", () => {
    expect(() => pageJsonString(undefined, "hover verify")).toThrow(/INSTRUMENT ERROR: hover verify returned undefined/u);
    expect(() => pageJsonString(null, "hover verify")).toThrow(/INSTRUMENT ERROR: hover verify returned null/u);
    expect(() => pageJsonString({ reads: [] }, "hover verify")).toThrow(/INSTRUMENT ERROR: hover verify returned object/u);
  });
});

describe("hoverCensusResult", () => {
  test("a complete census passes", () => {
    expect(hoverCensusResult(CENSUS, "the hover census")).toBe(CENSUS);
  });

  test("a missing candidate list is refused — it IS the space every index is bounded by", () => {
    expect(() => hoverCensusResult({ ...CENSUS, rest: undefined }, "the hover census")).toThrow(/INSTRUMENT ERROR.*"rest".*not a list/u);
    expect(() => hoverCensusResult({ ...CENSUS, groups: {} }, "the hover census")).toThrow(/INSTRUMENT ERROR.*"groups".*not a list/u);
    expect(() => hoverCensusResult({ ...CENSUS, attrGroups: 0 }, "the hover census")).toThrow(/INSTRUMENT ERROR.*"attrGroups".*not a list/u);
  });

  test("absent counters are refused — the withheld population would read as a clean zero", () => {
    expect(() => hoverCensusResult({ ...CENSUS, census: undefined }, "the hover census")).toThrow(/INSTRUMENT ERROR.*no counters/u);
  });

  test("ANY non-number counter is named, not just the ones the runner happens to read today", () => {
    expect(() => hoverCensusResult({ ...CENSUS, census: { textCandidates: 0, overBudget: null } }, "the hover census")).toThrow(
      /INSTRUMENT ERROR.*"overBudget" counter/u,
    );
    expect(() => hoverCensusResult({ ...CENSUS, census: { subjects: Number.NaN } }, "the hover census")).toThrow(/INSTRUMENT ERROR.*"subjects" counter/u);
  });

  test("a census that is not an object at all is refused", () => {
    expect(() => hoverCensusResult(null, "the hover census")).toThrow(/INSTRUMENT ERROR.*not a hover census/u);
  });
});

describe("attrRestored", () => {
  test("reads the same-task restore proof", () => {
    expect(attrRestored(JSON.stringify({ restored: false }), "state-attr")).toBe(false);
    expect(attrRestored(JSON.stringify({ restored: true }), "state-attr")).toBe(true);
  });

  test("an ABSENT flag is refused instead of reading falsy — that would withhold the whole group silently", () => {
    expect(() => attrRestored(JSON.stringify({ reads: [] }), "state-attr")).toThrow(/INSTRUMENT ERROR.*"restored".*restore proof/u);
    expect(() => attrRestored(JSON.stringify({ restored: "yes" }), "state-attr")).toThrow(/INSTRUMENT ERROR.*string.*"restored"/u);
  });
});

describe("the seams that already existed keep their refusals (the founding defect's own pins)", () => {
  test("a selector STRING where a candidate index belongs is refused, not silently accepted", () => {
    expect(() => candidateIndices(JSON.stringify(["div.row"]), 4, "hover verify")).toThrow(/INSTRUMENT ERROR.*not a candidate index below 4/u);
    expect(candidateIndices(JSON.stringify([0, 3]), 4, "hover verify")).toEqual([0, 3]);
  });

  test("a group read missing its glow lists is refused", () => {
    expect(groupReadResult(GROUP_READ, 1, "hover group read").reads).toEqual([]);
    expect(() => groupReadResult(JSON.stringify({ reads: [] }), 1, "hover group read")).toThrow(/INSTRUMENT ERROR.*no glow row lists/u);
  });
});
