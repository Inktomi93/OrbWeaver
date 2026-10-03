// Reading one line out of the pino ring (#1095 extracted this from `routes.ts` when the bug-report capture
// became a second reader). The pins are the ones the extraction exists to protect: `ringLineLevel` must accept
// BOTH the string LABEL our formatter emits and pino's own numeric level, because the string arm is what a
// `Number(record.level)` read turned into NaN — and NaN made `/api/_debug/errors` structurally incapable of
// ever reporting an error while `?level=` silently filtered nothing. Two readers now share this function; a
// regression in it would blind both at once.

import { describe } from "vitest";
import {
  ERROR_LEVEL,
  levelValue,
  parseLogRingLine,
  ringLineLevel,
  ringLineTime,
} from "../../../../../packages/server/src/foundation/observability/debug/log-ring-read.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("ringLineLevel", () => {
  test("reads the STRING LABEL our formatter emits — the arm whose Number() coercion was NaN", () => {
    expect(ringLineLevel({ level: "error" })).toBe(ERROR_LEVEL);
    expect(ringLineLevel({ level: "error" })).toBeGreaterThanOrEqual(ERROR_LEVEL);
    expect(ringLineLevel({ level: "info" })).toBeLessThan(ERROR_LEVEL);
  });

  test("reads pino's NUMERIC level too, so removing our formatter cannot flip which half is broken", () => {
    expect(ringLineLevel({ level: 50 })).toBe(ERROR_LEVEL);
    expect(ringLineLevel({ level: 30 })).toBeLessThan(ERROR_LEVEL);
  });

  test("an absent or unknown level is 0 — it never passes a `>= ERROR` floor by accident", () => {
    expect(ringLineLevel({})).toBe(0);
    expect(ringLineLevel({ level: "not-a-level" })).toBe(0);
    expect(ringLineLevel({ level: { nested: true } })).toBe(0);
  });
});

describe("levelValue", () => {
  test("orders the six pino levels and answers 0 for an unknown or absent name", () => {
    expect(levelValue("trace")).toBeLessThan(levelValue("debug"));
    expect(levelValue("debug")).toBeLessThan(levelValue("info"));
    expect(levelValue("info")).toBeLessThan(levelValue("warn"));
    expect(levelValue("warn")).toBeLessThan(levelValue("error"));
    expect(levelValue("error")).toBeLessThan(levelValue("fatal"));
    expect(levelValue(undefined)).toBe(0);
    expect(levelValue("nonsense")).toBe(0);
  });
});

describe("parseLogRingLine", () => {
  test("parses a JSON object line", () => {
    expect(parseLogRingLine('{"level":"error","msg":"boom"}')).toEqual({ level: "error", msg: "boom" });
  });

  test("a non-JSON, non-object or null line is SKIPPED (null), never thrown", () => {
    expect(parseLogRingLine("not json at all")).toBeNull();
    expect(parseLogRingLine("[1,2,3]")).toEqual([1, 2, 3]);
    expect(parseLogRingLine('"a bare string"')).toBeNull();
    expect(parseLogRingLine("null")).toBeNull();
  });
});

describe("ringLineTime", () => {
  test("reads pino's default `time` (epoch ms)", () => {
    expect(ringLineTime({ time: 1_760_000_000_000 })).toBe(1_760_000_000_000);
  });

  test("reads the ISO-8601 `time` our logger actually writes — the one clock a capture window is compared against", () => {
    // `logger.ts` sets `timestamp: pino.stdTimeFunctions.isoTime`, so this string arm is the one every REAL
    // ring line takes. Earlier pins seeded the ring with a numeric `time`, so nothing noticed that every real
    // line read 0 — which filtered every logged error out of a windowed bug-report read.
    expect(ringLineTime({ time: "2026-09-02T00:00:00.000Z" })).toBe(Date.UTC(2026, 8, 2));
  });

  test("a line with no usable `time` reads 0, so a windowed read EXCLUDES it rather than smuggling it in", () => {
    expect(ringLineTime({})).toBe(0);
    expect(ringLineTime({ time: "not a time" })).toBe(0);
    expect(ringLineTime({ time: { nested: true } })).toBe(0);
  });
});
