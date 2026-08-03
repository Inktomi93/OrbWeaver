import { fixMarkdown } from "@orb/kit/fix-markdown";
import { expect, test } from "../../support/fixtures.ts";

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

test("a lone tilde in a numeric range is left untouched (not a paired marker)", () => {
  expect(fixMarkdown("range 10~20°C", false)).toBe("range 10~20°C");
});

test("a snake_case identifier's single underscores are not treated as whitespace-padded pairs", () => {
  // stripInnerWhitespace only rewrites markers with whitespace to strip; an identifier with no
  // whitespace between its underscores round-trips unchanged even though it's technically a
  // matched `_..._` pair (the false-italic risk lives in the renderer, not here).
  expect(fixMarkdown("my_variable_name is set", false)).toBe("my_variable_name is set");
});
