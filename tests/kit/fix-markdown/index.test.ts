import { fixMarkdown, repairStreamingTail } from "@orb/kit/fix-markdown";
import { expect, test } from "vitest";

test("strips whitespace adjacent to paired emphasis markers", () => {
  expect(fixMarkdown("* text *", false)).toBe("*text*");
  expect(fixMarkdown("** bold **", false)).toBe("**bold**");
  expect(fixMarkdown("_ em _", false)).toBe("_em_");
});

test("strips a non-breaking space inside a marker pair (any Unicode space, not just ASCII)", () => {
  expect(fixMarkdown("* hi *", false)).toBe("*hi*");
});

test("leaves a balanced pair with no inner padding untouched", () => {
  expect(fixMarkdown("*ok*", true)).toBe("*ok*");
});

test("the settled path (forDisplay=false) does NOT close unpaired markers", () => {
  // continue verbs need the marker left open so the next chunk continues the same span.
  expect(fixMarkdown("*unclosed", false)).toBe("*unclosed");
  expect(fixMarkdown('say "hi', false)).toBe('say "hi');
});

test("the display path closes an unpaired single star and quote at end of line", () => {
  expect(fixMarkdown("*unclosed", true)).toBe("*unclosed*");
  expect(fixMarkdown('say "hi', true)).toBe('say "hi"');
});

test("the display path closes an unpaired bold run counted as a ** unit (the remend-audit case)", () => {
  // "**bold start" has an EVEN raw `*` count; the single-star counter alone would miss it.
  expect(fixMarkdown("**bold start", true)).toBe("**bold start**");
});

test("the display path closes per line", () => {
  expect(fixMarkdown("*a\n*b", true)).toBe("*a*\n*b*");
});

test("repairStreamingTail holds a torn <speaker> open tag with no close yet", () => {
  expect(repairStreamingTail("Hello <speaker>Bob")).toBe("Hello ");
});

test("repairStreamingTail leaves a complete <speaker>…</speaker> intact", () => {
  expect(repairStreamingTail("<speaker>Bob</speaker> hi")).toBe("<speaker>Bob</speaker> hi");
});

test("repairStreamingTail holds only from the LAST unclosed open tag", () => {
  expect(repairStreamingTail("<speaker>A</speaker> said <speaker>B")).toBe(
    "<speaker>A</speaker> said ",
  );
});

test("repairStreamingTail matches the open tag case-insensitively", () => {
  expect(repairStreamingTail("x <SPEAKER>")).toBe("x ");
});

test("repairStreamingTail is a no-op when no <speaker> is present", () => {
  expect(repairStreamingTail("plain text")).toBe("plain text");
});

test("repairStreamingTail is deterministic across calls (no leaked regex lastIndex)", () => {
  const input = "a <speaker>B";
  const first = repairStreamingTail(input);
  const second = repairStreamingTail(input);
  expect(first).toBe(second);
  expect(first).toBe("a ");
});
