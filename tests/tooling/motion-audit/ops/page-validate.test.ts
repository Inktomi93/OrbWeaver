// motion-audit's `__orb` bridge seams refuse loudly (#1004).
//
// THE POLARITY THAT MAKES THIS TOOL'S SILENCE EXPENSIVE: every read here feeds a BUDGET, and a budget
// says "pass" to missing evidence by arithmetic — `undefined > budget` is false, `NaN > budget` is
// false. ops/drive.ts already carries a bridge-PRESENCE probe for exactly that reason (#409, "every
// __orb read below answers null/[] and each budget arm reads that as a clean zero"); these are the same
// defence for the case where the bridge is present and answers the wrong shape.

import { expect, test } from "@orb/testkit/tooling";
import { describe } from "vitest";
import { animationRecords, bridgePresence, flagRecords, motionSnapshot } from "../../../../tooling/src/motion-audit/ops/page-validate.ts";

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
    // The #1071 observed halves get the same treatment — they gate an INTERACTION cell, so a NaN there
    // compares false and reads as measured stability.
    expect(() => motionSnapshot({ ...SNAPSHOT, observedCls: Number.NaN })).toThrow(/field "observedCls".*finite/u);
    expect(() => motionSnapshot({ ...SNAPSHOT, observedNonVirtualizedCls: "0.2" })).toThrow(/field "observedNonVirtualizedCls" returned string/u);
    expect(() => motionSnapshot({ ...SNAPSHOT, shifts: { length: 0 } })).toThrow(/field "shifts".*not a list/u);
  });

  test("a non-object answer is refused", () => {
    expect(() => motionSnapshot("{}")).toThrow(/not an object/u);
  });

  describe("the long-animation-frame rows the budgets fold", () => {
    const loaf = {
      startTime: 120,
      duration: 90,
      blockingDuration: 40,
      styleAndLayoutStart: 0,
      scripts: [{ sourceURL: "http://localhost/src/app.ts", duration: 30 }],
    };

    test("a complete row passes, and the optional script and entrance members may be absent", () => {
      expect(motionSnapshot({ ...SNAPSHOT, loafs: [loaf] })?.loafs).toHaveLength(1);
      const entrance = { id: 1, startedAt: 100, firstForTrigger: true };
      expect(motionSnapshot({ ...SNAPSHOT, loafs: [{ ...loaf, selectEntrance: { ...entrance, confirmedAt: 110, endedAt: 130 } }] })?.loafs).toHaveLength(1);
      expect(
        motionSnapshot({ ...SNAPSHOT, loafs: [{ ...loaf, scripts: [{ sourceURL: "", duration: 1, forcedStyleAndLayoutDuration: 0 }] }] })?.loafs,
      ).toHaveLength(1);
    });

    test("a row with no blockingDuration is refused — Math.max would turn it into NaN and the budget would pass", () => {
      const { blockingDuration, ...without } = loaf;
      expect(blockingDuration).toBeDefined();
      expect(() => motionSnapshot({ ...SNAPSHOT, loafs: [loaf, without] })).toThrow(/loafs row 1 field "blockingDuration" returned nothing/u);
    });

    test("a non-finite timing is refused, naming its row and field", () => {
      expect(() => motionSnapshot({ ...SNAPSHOT, loafs: [{ ...loaf, styleAndLayoutStart: Number.NaN }] })).toThrow(
        /loafs row 0 field "styleAndLayoutStart".*finite/u,
      );
      expect(() => motionSnapshot({ ...SNAPSHOT, loafs: [{ ...loaf, duration: "90" }] })).toThrow(/loafs row 0 field "duration" returned string/u);
    });

    test("a row that is not an object, or whose scripts are not a list, is refused", () => {
      expect(() => motionSnapshot({ ...SNAPSHOT, loafs: ["x"] })).toThrow(/loafs row 0 returned string, not an object/u);
      expect(() => motionSnapshot({ ...SNAPSHOT, loafs: [{ ...loaf, scripts: undefined }] })).toThrow(/loafs row 0 field "scripts" returned nothing/u);
    });

    test("a malformed script is refused, naming its row, script index and field", () => {
      const scripts = [loaf.scripts[0], { sourceURL: "x", duration: Number.NaN }];
      expect(() => motionSnapshot({ ...SNAPSHOT, loafs: [{ ...loaf, scripts }] })).toThrow(/loafs row 0 script 1 field "duration".*finite/u);
      expect(() => motionSnapshot({ ...SNAPSHOT, loafs: [{ ...loaf, scripts: [{ duration: 3 }] }] })).toThrow(
        /loafs row 0 script 0 field "sourceURL" returned nothing/u,
      );
      expect(() =>
        motionSnapshot({ ...SNAPSHOT, loafs: [{ ...loaf, scripts: [{ sourceURL: "x", duration: 3, forcedStyleAndLayoutDuration: "0" }] }] }),
      ).toThrow(/loafs row 0 script 0 field "forcedStyleAndLayoutDuration" returned string/u);
    });

    test("a PRESENT select entrance at the wrong shape is refused", () => {
      expect(() => motionSnapshot({ ...SNAPSHOT, loafs: [{ ...loaf, selectEntrance: { id: 1, startedAt: 100, firstForTrigger: "yes" } }] })).toThrow(
        /loafs row 0 select entrance field "firstForTrigger" returned string/u,
      );
      expect(() =>
        motionSnapshot({ ...SNAPSHOT, loafs: [{ ...loaf, selectEntrance: { id: 1, startedAt: 100, firstForTrigger: true, confirmedAt: Number.NaN } }] }),
      ).toThrow(/loafs row 0 select entrance field "confirmedAt".*finite/u);
    });
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

describe("the __orb.flags() read", () => {
  const Anim = { tag: "anim", at: 40, offender: "#row", detail: "animating non-compositor height", overBudget: true };

  test("null is a REAL answer — the MEMBER is absent, which is not an empty ring", () => {
    // The distinction IS the #1070 finding: "nothing fired" and "the transient population cannot be
    // observed" are different facts, and lib/evidence.ts turns the second into a refusal.
    expect(flagRecords(null)).toBeNull();
    expect(flagRecords(undefined)).toBeNull();
    expect(flagRecords([])).toEqual([]);
  });

  test("a NON-list is refused — it folds to zero raises, i.e. 'nothing dirty fired'", () => {
    expect(() => flagRecords({ length: 0 })).toThrow(/INSTRUMENT ERROR.*not a list/u);
  });

  test("a malformed ROW is refused, naming its index and field", () => {
    expect(() => flagRecords([{ ...Anim, tag: 7 }])).toThrow(/row 0 field "tag" returned number/u);
    expect(() => flagRecords([Anim, { ...Anim, at: Number.NaN }])).toThrow(/row 1 field "at".*finite/u);
  });

  test("a PRESENT animation payload at the wrong shape is refused, not silently unsanctionable", () => {
    // Degrading a wrong-shaped payload to "unattributed" would be a FAILURE, not a pass — but it would
    // also hide a broken bridge behind a plausible red. The shape is the instrument's contract.
    expect(() => flagRecords([{ ...Anim, animation: { target: "#row", properties: "height", compositorClean: false } }])).toThrow(
      /row 0 animation field "properties" returned string/u,
    );
    expect(() => flagRecords([{ ...Anim, animation: "height" }])).toThrow(/row 0 field "animation" returned string, not an object/u);
    expect(flagRecords([{ ...Anim, animation: { target: "#row", properties: ["height"], compositorClean: false } }])).toHaveLength(1);
  });
});
