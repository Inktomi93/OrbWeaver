// snap's `--scale` contract (tooling/src/snap/lib/shot-scale.ts) — the pure half: which spellings resolve,
// what each one produces, and where the image budget refuses.
//
// WHY THIS FILE EXISTS (#915). The `css` default is not an oversight, it is a measured token-cost choice
// (one image pixel per CSS pixel ≈ half the image tokens on a hi-dpi context), and it must stay
// byte-identical for every invocation that does not opt in. The first assertion below is therefore about
// the DEFAULT, not the new flag: a later reader "fixing" the default to `device` reds here.
import {
  CSS_SHOT_SCALE,
  parseShotScale,
  SHOT_PIXEL_BUDGET,
  shotScaleBudgetRefusal,
  shotScaleDimensions,
  shotScaleResultValue,
} from "../../../../tooling/src/snap/lib/shot-scale.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 430, height: 932 };

test("the default is css — one image pixel per CSS pixel, whatever the context's DPR", () => {
  expect(CSS_SHOT_SCALE).toEqual({ mode: "css", deviceScaleFactor: null });
  expect(parseShotScale("css")).toEqual(CSS_SHOT_SCALE);
  // The load-bearing property: on a DPR-3 context (--mobile) the css arm still produces CSS pixels.
  expect(shotScaleDimensions(CSS_SHOT_SCALE, MOBILE, 3)).toEqual(MOBILE);
  expect(shotScaleResultValue(CSS_SHOT_SCALE, DESKTOP, 1)).toBe("css/1280x800");
});

test("`device` defers to the CONTEXT's DPR; a number overrides it", () => {
  const device = parseShotScale("device");
  expect(device).toEqual({ mode: "device", deviceScaleFactor: null });
  // --mobile's descriptor carries DPR3, so `--mobile --scale device` is where the mobile boards get
  // their true density — the device arm composes with a descriptor, which is why it is not just `--scale 3`.
  expect(shotScaleDimensions(device ?? CSS_SHOT_SCALE, MOBILE, 3)).toEqual({ width: 1290, height: 2796 });
  expect(shotScaleDimensions(device ?? CSS_SHOT_SCALE, DESKTOP, 1)).toEqual(DESKTOP);

  const two = parseShotScale("2");
  expect(two).toEqual({ mode: "device", deviceScaleFactor: 2 });
  // The issue's own receipt: exactly 2x the pixel dimensions.
  expect(shotScaleDimensions(two ?? CSS_SHOT_SCALE, DESKTOP, 1)).toEqual({ width: 2560, height: 1600 });
  expect(shotScaleResultValue(two ?? CSS_SHOT_SCALE, DESKTOP, 1)).toBe("2/2560x1600");
  expect(parseShotScale("1.5")).toEqual({ mode: "device", deviceScaleFactor: 1.5 });
});

test("an unusable --scale value resolves to NOTHING, so the caller refuses instead of defaulting", () => {
  // A silent fall-back to css is the defect this returns null to prevent: a run that asked for device
  // pixels and produced CSS pixels is a false receipt, the same class as a dropped --cpu-throttle.
  for (const raw of ["", "0", "0.5", "-2", "2x", "two", "device2", "1e3", "NaN", "Infinity"]) {
    expect(parseShotScale(raw)).toBeNull();
  }
});

test("the image budget REFUSES a huge render instead of silently writing it", () => {
  const two = parseShotScale("2") ?? CSS_SHOT_SCALE;
  // 1920x1080 at 2x = 8.3 MP: the largest committed mock board, deliberately inside the budget.
  expect(shotScaleBudgetRefusal(two, { width: 1920, height: 1080 })).toBeNull();

  const refusal = shotScaleBudgetRefusal(two, { width: 4000, height: 4000 });
  expect(refusal).not.toBeNull();
  // The refusal is an instruction: what it would produce, the limit, and the two ways out.
  expect(refusal).toContain("8000x8000");
  expect(refusal).toContain(String(SHOT_PIXEL_BUDGET));
  expect(refusal).toContain("lower the scale");

  // The css default can never trip the budget on its own — the multiplicand is always 1.
  expect(shotScaleBudgetRefusal(CSS_SHOT_SCALE, { width: 4000, height: 4000 })).toBeNull();
});
