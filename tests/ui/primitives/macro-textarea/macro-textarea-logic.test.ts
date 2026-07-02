// Pins the caret-walk + insert arithmetic that <MacroTextarea> relies on. The off-by-one in either
// helper is invisible in the component (it just inserts the wrong text or drops the caret in the
// wrong place), so test them directly. Ported nearly verbatim from neo-tavern's
// macro-textarea-logic.test.ts — these functions never touched the macro catalog, so the port is a
// straight copy.
import {
  computeMacroInsertion,
  detectTrigger,
} from "../../../../packages/ui/src/primitives/macro-textarea/macro-textarea-logic";
import { expect, test } from "../../../support/fixtures";

test("detectTrigger: returns null when there is no `{{` before the caret", () => {
  expect(detectTrigger("hello world", 11)).toBeNull();
});

test("detectTrigger: captures the partial typed after `{{`", () => {
  const t = detectTrigger("hi {{ch", 7);
  expect(t).toEqual({ start: 3, partial: "ch" });
});

test("detectTrigger: empty partial right after `{{` (open with no chars typed yet)", () => {
  const t = detectTrigger("hi {{", 5);
  expect(t).toEqual({ start: 3, partial: "" });
});

test("detectTrigger: uses the LAST `{{` before the caret", () => {
  const t = detectTrigger("{{char}} and {{us", 17);
  expect(t).toEqual({ start: 13, partial: "us" });
});

test("detectTrigger: closed macro (`}}` between open and caret) is not a trigger", () => {
  expect(detectTrigger("{{char}}", 8)).toBeNull();
});

test("detectTrigger: a newline between `{{` and the caret breaks the context", () => {
  expect(detectTrigger("{{ch\nar", 7)).toBeNull();
});

test("detectTrigger: non-name chars (space) between `{{` and caret break the context", () => {
  expect(detectTrigger("{{ch ar", 7)).toBeNull();
});

test("detectTrigger: allows `:` and `.` in the partial (getvar::pov, env.tense)", () => {
  expect(detectTrigger("{{getvar::po", 12)).toEqual({ start: 0, partial: "getvar::po" });
  expect(detectTrigger("{{env.ten", 9)).toEqual({ start: 0, partial: "env.ten" });
});

test("detectTrigger: only the head up to the caret is considered, not trailing text", () => {
  const t = detectTrigger("{{ch}} trailing", 4);
  expect(t).toEqual({ start: 0, partial: "ch" });
});

test("computeMacroInsertion: non-parameterized macro inserts `{{name}}`, caret after the braces", () => {
  const { next, caret } = computeMacroInsertion("hi {{ch", { start: 3, partial: "ch" }, "char");
  expect(next).toBe("hi {{char}}");
  expect(caret).toBe("hi {{char}}".length);
});

test("computeMacroInsertion: preserves text after the trigger span", () => {
  const value = "{{ch rest";
  // partial is "ch" (the detector would stop at the space, but exercise the span math directly):
  // start 0, partial "ch" → replaces `{{ch`.
  const { next } = computeMacroInsertion(value, { start: 0, partial: "ch" }, "char");
  expect(next).toBe("{{char}} rest");
});

test("computeMacroInsertion: parameterized macro inserts `{{base::}}`, caret just inside closing braces", () => {
  const { next, caret } = computeMacroInsertion(
    "{{getv",
    { start: 0, partial: "getv" },
    "getvar::name",
  );
  expect(next).toBe("{{getvar::}}");
  // caret sits before the closing `}}`
  expect(caret).toBe("{{getvar::}}".length - 2);
  expect(next.slice(caret)).toBe("}}");
});

test("computeMacroInsertion: empty partial inserts the macro at the `{{` with no chars to replace", () => {
  const { next, caret } = computeMacroInsertion("a {{", { start: 2, partial: "" }, "user");
  expect(next).toBe("a {{user}}");
  expect(caret).toBe("a {{user}}".length);
});
