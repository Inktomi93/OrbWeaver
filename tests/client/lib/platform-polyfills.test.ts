// Runs the production entry main.tsx imports first (platform-polyfills.ts) and the production kit/time functions the client calls.
import { runInNewContext } from "node:vm";
import { calendarPositionIn, createTimeLib, isoToMs, parseIanaTimeZone } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { vi } from "vitest";
import { isError, regExpEscape } from "#client/lib/platform-shims.ts";

const ESCAPE_CORPUS = ["", "a.b", "1abc", "hello world", "-x", "a-b", "\n\t", " ", "﻿", "😀x", "\uD800", "/path?q=1&r=[2]", ",;:<>=#%@~'\"`", "ünï", "{{name}}"];

test.for(ESCAPE_CORPUS)("regExpEscape(%j) matches the builtin", (input) => {
  expect(regExpEscape(input)).toBe(RegExp.escape(input));
});

test("regExpEscape refuses a non-string like the builtin", () => {
  expect(() => regExpEscape(1 as never)).toThrow(TypeError);
  expect(() => RegExp.escape(1 as never)).toThrow(TypeError);
});

test("isError agrees with the builtin on real errors, foreign-realm errors and look-alikes", () => {
  const spoof = Object.assign(Object.create(null) as object, { [Symbol.toStringTag]: "Error" });
  const values = [
    new Error("x"),
    new TypeError("x"),
    new DOMException("x"),
    runInNewContext("new Error('x')"),
    Object.create(Error.prototype),
    spoof,
    Object.assign(new Error("x"), { [Symbol.toStringTag]: "Renamed" }),
    Object.assign(new Error("x"), { cause: () => 1, [Symbol.toStringTag]: "Renamed" }),
    Object.assign(new Error("x"), { cause: Symbol("why"), [Symbol.toStringTag]: "Renamed" }),
    Object.defineProperty(new Error("x"), "message", {
      get: (): string => {
        throw new Error("boom");
      },
    }),
    Object.defineProperty(Object.assign(new Error("x"), { [Symbol.toStringTag]: "Renamed" }), "message", {
      get: (): string => {
        throw new Error("boom");
      },
    }),
    Object.assign(Object.create(null) as object, { [Symbol.toStringTag]: "DOMException" }),
    structuredClone(new DOMException("x")),
    { message: "x" },
    "Error",
    null,
    undefined,
  ];
  expect(values.map(isError)).toEqual(values.map((value) => Error.isError(value)));
});

// What the polyfill entry installs when Temporal is missing: the global plus the two platform hooks it patches.
const TEMPORAL_SURFACE = [
  [globalThis, "Temporal"],
  [Intl, "DateTimeFormat"],
  [Date.prototype, "toTemporalInstant"],
] as const;

// The Node project shares one module registry and one set of globals, so the removal is scoped and put back whole.
async function withoutTemporal<T>(run: () => Promise<T>): Promise<T> {
  const saved = TEMPORAL_SURFACE.map(([target, name]) => [target, name, Object.getOwnPropertyDescriptor(target, name)] as const);
  Reflect.deleteProperty(globalThis, "Temporal");
  try {
    return await run();
  } finally {
    for (const [target, name, descriptor] of saved) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(target, name);
      } else {
        Object.defineProperty(target, name, descriptor);
      }
    }
  }
}

// Every kit/time function the client calls Temporal through, on pinned inputs.
function readTime(): unknown {
  const zone = parseIanaTimeZone("America/New_York");
  const lib = createTimeLib({ locale: "en-US", timeZone: "America/New_York", now: () => Date.UTC(2026, 6, 3) });
  return {
    zoned: isoToMs("2026-07-03T12:00:00-04:00"),
    utc: isoToMs("2026-07-03T12:00:00Z"),
    naive: isoToMs("2026-07-03T12:00:00"),
    impossible: isoToMs("2026-02-30T00:00:00"),
    position: zone === null ? null : calendarPositionIn(0, zone),
    libPosition: lib.calendarPosition(Date.UTC(2026, 6, 3, 3)),
    monthStart: lib.monthStart(2026, 7),
  };
}

test("kit/time gives the same answers on the polyfill entry's Temporal as on the native one", async () => {
  // Positive control: the native read, which every assertion below must equal and which must not be empty.
  const native = readTime();
  expect(native).toMatchObject({ utc: Date.UTC(2026, 6, 3, 12), impossible: null, position: { day: "1969-12-31", weekday: 3, hour: 19 } });
  const nativeTemporal = globalThis.Temporal;

  await withoutTemporal(async () => {
    // Non-vacuity: with no Temporal the position read throws, the failure a floor browser would hit.
    expect(() => readTime()).toThrow(ReferenceError);
    vi.resetModules();
    await import("#client/lib/platform-polyfills.ts");
    expect(globalThis.Temporal).toBeDefined();
    expect(globalThis.Temporal).not.toBe(nativeTemporal);
    expect(readTime()).toEqual(native);
  });
  expect(globalThis.Temporal).toBe(nativeTemporal);
});
