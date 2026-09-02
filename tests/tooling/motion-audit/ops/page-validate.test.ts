// motion-audit's `__orb` bridge seams refuse loudly (#1004).
//
// THE POLARITY THAT MAKES THIS TOOL'S SILENCE EXPENSIVE: every read here feeds a BUDGET, and a budget
// says "pass" to missing evidence by arithmetic — `undefined > budget` is false, `NaN > budget` is
// false. ops/drive.ts already carries a bridge-PRESENCE probe for exactly that reason (#409, "every
// __orb read below answers null/[] and each budget arm reads that as a clean zero"); these are the same
// defence for the case where the bridge is present and answers the wrong shape.
import { describe } from "vitest";
import { animationRecords, bridgePresence, motionSnapshot } from "../../../../tooling/src/motion-audit/ops/page-validate.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SNAPSHOT = { loafs: [], cls: 0.01, worstBlocking: 12, worstShift: 0.004 };
const RECORD = { target: ".row", properties: ["opacity"], compositorClean: true };

describe("the bridge presence probe", () => {
  test("passes a real answer and refuses anything truthy-but-not-boolean", () => {
    expect(bridgePresence(false)).toBe(false);
    expect(() => bridgePresence("yes")).toThrow(/INSTRUMENT ERROR.*not a boolean/u);
    expect(() => bridgePresence(undefined)).toThrow(/returned nothing/u);
  });
});

describe("the __orb.motion() read", () => {
  test("null is a REAL answer (no bridge / an older bundle) and stays null", () => {
    expect(motionSnapshot(null)).toBeNull();
    expect(motionSnapshot(undefined)).toBeNull();
  });

  test("a complete snapshot passes, and the documented optional members may be absent", () => {
    expect(motionSnapshot(SNAPSHOT)).toMatchObject({ cls: 0.01 });
    expect(motionSnapshot({ ...SNAPSHOT, virtualizedCls: 0.002 })).toMatchObject({ virtualizedCls: 0.002 });
  });

  test("a MISSING budget input is refused — it would compare false and read as within budget", () => {
    const { cls, ...withoutCls } = SNAPSHOT;
    expect(cls).toBeDefined();
    expect(() => motionSnapshot(withoutCls)).toThrow(/field "cls" returned nothing/u);
    expect(() => motionSnapshot({ ...SNAPSHOT, worstBlocking: null })).toThrow(/field "worstBlocking" returned null/u);
  });

  test("a NaN budget input is refused for the same reason a missing one is", () => {
    expect(() => motionSnapshot({ ...SNAPSHOT, worstShift: Number.NaN })).toThrow(/field "worstShift".*finite/u);
  });

  test("an optional member PRESENT at the wrong kind is still refused", () => {
    expect(() => motionSnapshot({ ...SNAPSHOT, nonVirtualizedCls: "0.1" })).toThrow(/field "nonVirtualizedCls" returned string/u);
  });

  test("a non-object answer is refused", () => {
    expect(() => motionSnapshot("{}")).toThrow(/not an object/u);
  });
});

describe("the __orb.animations() read", () => {
  test("an empty list is a legitimate answer", () => {
    expect(animationRecords([])).toEqual([]);
    expect(animationRecords([RECORD])).toHaveLength(1);
  });

  test("a NON-list is refused — it folds to zero records, i.e. 'no dirty animations'", () => {
    expect(() => animationRecords({ length: 0 })).toThrow(/INSTRUMENT ERROR.*not a list/u);
    expect(() => animationRecords(null)).toThrow(/returned null, not a list/u);
  });

  test("a malformed ROW is refused, naming its index and field", () => {
    expect(() => animationRecords([{ ...RECORD, compositorClean: undefined }])).toThrow(/row 0 field "compositorClean" returned nothing/u);
    expect(() => animationRecords([RECORD, { ...RECORD, properties: "opacity" }])).toThrow(/row 1 field "properties" returned string/u);
    expect(() => animationRecords(["x"])).toThrow(/row 0 returned string, not an object/u);
  });
});
