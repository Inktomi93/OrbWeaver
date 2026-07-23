// infra/plugin-host/marshal — the guest↔host VALUE boundary (01 §1.2). `jsToHandle` is unit-tested directly
// against a REAL QuickJS context (dump the built handle back and assert): JSON-safe primitives / arrays / plain
// objects round-trip, undefined-valued object keys are DROPPED (JSON semantics), and — the SECURITY pin — every
// non-JSON typeof (function / symbol / bigint / undefined) collapses to guest `null`, even nested inside an
// object, so a live host reference can never cross the membrane as anything but inert data.

import { getPluginQuickJS } from "@orb/server/infra/plugin-host";
import type { QuickJSContext } from "quickjs-emscripten-core";
import { describe } from "vitest";
import { jsToHandle } from "../../../../packages/server/src/infra/plugin-host/marshal.ts";
import { expect, test } from "../../../support/fixtures";

/** Marshal `value` into a guest handle, dump it back to a JS value, and dispose the handle — the round-trip the
 *  membrane performs on every host-fn result. */
function roundTrip(ctx: QuickJSContext, value: unknown): unknown {
  const handle = jsToHandle(ctx, value);
  try {
    return ctx.dump(handle);
  } finally {
    handle.dispose();
  }
}

async function withContext(fn: (ctx: QuickJSContext) => void): Promise<void> {
  const mod = await getPluginQuickJS();
  const ctx = mod.newContext();
  try {
    fn(ctx);
  } finally {
    ctx.dispose();
  }
}

describe("jsToHandle — JSON-safe values round-trip", () => {
  test("primitives cross verbatim", async () => {
    await withContext((ctx) => {
      expect(roundTrip(ctx, true)).toBe(true);
      expect(roundTrip(ctx, false)).toBe(false);
      expect(roundTrip(ctx, 42)).toBe(42);
      expect(roundTrip(ctx, "hi")).toBe("hi");
    });
  });

  test("null and undefined both cross as guest null", async () => {
    await withContext((ctx) => {
      expect(roundTrip(ctx, null)).toBeNull();
      expect(roundTrip(ctx, undefined)).toBeNull();
    });
  });

  test("nested arrays + objects round-trip; undefined-valued keys are dropped (JSON semantics)", async () => {
    await withContext((ctx) => {
      expect(roundTrip(ctx, { a: 1, b: [2, 3], c: { d: "x" } })).toEqual({ a: 1, b: [2, 3], c: { d: "x" } });
      // A hole (undefined value) is omitted, never emitted as an explicit null.
      expect(roundTrip(ctx, { present: 1, gone: undefined })).toEqual({ present: 1 });
    });
  });
});

describe("jsToHandle — non-JSON typeofs collapse to inert null (the membrane security boundary)", () => {
  test("a function, symbol, and bigint each cross as guest null (never a live host ref)", async () => {
    await withContext((ctx) => {
      expect(roundTrip(ctx, () => "leak")).toBeNull();
      expect(roundTrip(ctx, Symbol("s"))).toBeNull();
      expect(roundTrip(ctx, 10n)).toBeNull();
    });
  });

  test("a non-JSON value nested inside an object collapses to null in place (no leak through a property)", async () => {
    await withContext((ctx) => {
      expect(roundTrip(ctx, { keep: 1, fn: () => "leak", big: 5n })).toEqual({ keep: 1, fn: null, big: null });
    });
  });
});
