// The production error ring behind "Report a bug". It ships, so its reductions are the boundary: these drive
// `recordSafeError` and the two reducers with hostile values and prove that no message, argument, host, path
// outside this origin, query or deep path segment survives into a record.

import { beforeEach, describe } from "vitest";
import { __resetSafeErrorRing, recordSafeError, safeErrorRing, safeStackFrames, sectionOfPathname } from "../../../packages/client/src/lib/safe-error-ring.ts";
import { expect, test } from "../../support/fixtures.ts";

const ORIGIN = "http://192.0.2.10:8788";
const AT = 1_790_000_000_000;
const CONTEXT = { at: AT, origin: ORIGIN, pathname: "/chats" } as const;

const CHAT_CANARY = "the lantern-keeper whispered canarychatline";
const HOST_CANARY = "canary-host.example";
const HOME_CANARY = "/home/canaryuser/orbweaver/x.ts";
const TOKEN_CANARY = "canarytoken0123456789";

beforeEach(() => {
  __resetSafeErrorRing();
});

describe("recordSafeError", () => {
  test("keeps the class and the same-origin frames of an Error, and never its message", () => {
    const error = new TypeError(CHAT_CANARY);
    error.stack = [
      `TypeError: ${CHAT_CANARY}`,
      `    at renderRow (${ORIGIN}/assets/index-abc123.js:12:345)`,
      `    at ${ORIGIN}/assets/vendor-def456.js:1:2`,
    ].join("\n");
    recordSafeError("uncaught", [error], CONTEXT);
    const [record] = safeErrorRing().records;
    expect(record).toEqual({
      source: "uncaught",
      at: AT,
      errorType: "TypeError",
      frames: ["renderRow@/assets/index-abc123.js:12:345", "?@/assets/vendor-def456.js:1:2"],
      section: "chats",
    });
    expect(JSON.stringify(record)).not.toContain("canarychatline");
  });

  test("console arguments that are not Errors contribute nothing but the fact that an error was logged", () => {
    recordSafeError("console", [CHAT_CANARY, { persona: CHAT_CANARY, apiKey: TOKEN_CANARY }, 42], CONTEXT);
    expect(safeErrorRing().records).toEqual([{ source: "console", at: AT, errorType: null, frames: [], section: "chats" }]);
  });

  test("a class name that is not an identifier is dropped, not shortened", () => {
    const error = new Error("x");
    error.name = `Error ${CHAT_CANARY}`;
    recordSafeError("rejection", [error], CONTEXT);
    expect(safeErrorRing().records[0]?.errorType).toBeNull();
  });

  test("the ring caps itself and counts what it evicted", () => {
    for (let index = 0; index < 40; index += 1) {
      recordSafeError("console", [], CONTEXT);
    }
    const read = safeErrorRing();
    expect(read.records).toHaveLength(32);
    expect(read.dropped).toBe(8);
  });
});

describe("safeStackFrames", () => {
  test("a frame from another origin, an extension or a blob is left out whole", () => {
    const stack = [
      "Error: x",
      `    at evil (https://${HOST_CANARY}/track.js:1:1)`,
      "    at ext (chrome-extension://abcdefghijklmnop/content.js:2:2)",
      `    at worker (blob:${ORIGIN}/3f1c0e7a-0000-4000-8000-000000000000:3:3)`,
      `    at file (file://${HOME_CANARY}:4:4)`,
      `    at kept (${ORIGIN}/assets/index-abc123.js:5:5)`,
    ].join("\n");
    const frames = safeStackFrames(stack, ORIGIN);
    expect(frames).toEqual(["kept@/assets/index-abc123.js:5:5"]);
    expect(JSON.stringify(frames)).not.toContain(HOST_CANARY);
    expect(JSON.stringify(frames)).not.toContain("canaryuser");
  });

  test("a same-origin frame keeps its path but never its query", () => {
    const frames = safeStackFrames(`    at f (${ORIGIN}/assets/index-abc123.js?token=${TOKEN_CANARY}:1:2)`, ORIGIN);
    expect(frames).toEqual(["f@/assets/index-abc123.js:1:2"]);
  });

  test("the `fn@url:line:col` frame shape (Firefox, Safari) is read too", () => {
    expect(safeStackFrames(`renderRow@${ORIGIN}/assets/index-abc123.js:7:8\n@${ORIGIN}/assets/x.js:9:10`, ORIGIN)).toEqual([
      "renderRow@/assets/index-abc123.js:7:8",
      "?@/assets/x.js:9:10",
    ]);
  });

  test("keeps at most the top five frames", () => {
    const stack = Array.from({ length: 9 }, (_, index) => `    at f${index} (${ORIGIN}/assets/a.js:${index}:1)`).join("\n");
    expect(safeStackFrames(stack, ORIGIN)).toHaveLength(5);
  });
});

describe("sectionOfPathname", () => {
  test("reads only a plain first segment", () => {
    expect(sectionOfPathname("/chats")).toBe("chats");
    expect(sectionOfPathname(`/chats/${TOKEN_CANARY}`)).toBe("chats");
    expect(sectionOfPathname("/")).toBeNull();
    expect(sectionOfPathname("/Chats")).toBeNull();
    expect(sectionOfPathname("/a%20b")).toBeNull();
    expect(sectionOfPathname(`/${"x".repeat(40)}`)).toBeNull();
  });
});
