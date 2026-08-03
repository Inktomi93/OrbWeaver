import type { ProcessMacroOptions } from "@orb/kit/macro";
import type { RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts, HISTORY_DEPTH_PLACEMENT, MAX_FIND_REGEX_LENGTH, REGEX_PLACEMENTS, SubstituteFindRegex } from "@orb/kit/regex";
import { vi } from "vitest";
import { expect, test } from "../../support/fixtures";

// Fixed macro context — no Date/random, per the determinism gate.
function macroOpts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return { char: "Alice", user: "Bob", persona: "Hero", scenario: "A quest", env: {}, ...extra };
}

// A script with sensible defaults; override per test.
function script(partial: Partial<RegexScriptInput> = {}): RegexScriptInput {
  return {
    enabled: true,
    placement: ["AI_OUTPUT"],
    findRegex: "",
    replaceString: "",
    ...partial,
  };
}

test("find/replace with capture groups reorders the match", () => {
  const out = executeRegexScripts({
    text: "Hello World",
    scripts: [script({ findRegex: "(\\w+) (\\w+)", replaceString: "$2 $1" })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
  });
  expect(out).toBe("World Hello");
});

test("macros run on the replacement TEMPLATE but NOT on captured text (ordering invariant)", () => {
  // Template macro `{{user}}` must resolve to "Bob"; the captured `{{char}}` must survive verbatim
  // (never re-evaluated to the context char "Alice").
  const out = executeRegexScripts({
    text: "keep {{char}} here",
    scripts: [script({ findRegex: "keep (.+?) here", replaceString: "{{user}} -> $1" })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
  });
  expect(out).toBe("Bob -> {{char}}");
  expect(out).toContain("Bob"); // template macro ran
  expect(out).not.toContain("Alice"); // captured macro did NOT run
});

test("{{match}} expands to the whole match without macro-evaluating it", () => {
  const out = executeRegexScripts({
    text: "say {{char}}",
    scripts: [script({ findRegex: "say .+", replaceString: "[{{match}}]" })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
  });
  expect(out).toBe("[say {{char}}]");
  expect(out).not.toContain("Alice");
});

test("placement filtering: a script only runs for a placement in its list", () => {
  const scripts = [script({ placement: ["AI_OUTPUT"], findRegex: "x", replaceString: "y" })];
  expect(executeRegexScripts({ text: "x", scripts, placement: "USER_INPUT", ctx: macroOpts() })).toBe("x");
  expect(executeRegexScripts({ text: "x", scripts, placement: "AI_OUTPUT", ctx: macroOpts() })).toBe("y");
});

test("markdownOnly runs on DISPLAY only; promptOnly skips DISPLAY", () => {
  const md = [
    script({
      placement: ["DISPLAY", "AI_OUTPUT"],
      markdownOnly: true,
      findRegex: "a",
      replaceString: "b",
    }),
  ];
  expect(executeRegexScripts({ text: "a", scripts: md, placement: "AI_OUTPUT", ctx: macroOpts() })).toBe("a");
  expect(executeRegexScripts({ text: "a", scripts: md, placement: "DISPLAY", ctx: macroOpts() })).toBe("b");

  const prompt = [
    script({
      placement: ["DISPLAY", "AI_OUTPUT"],
      promptOnly: true,
      findRegex: "a",
      replaceString: "b",
    }),
  ];
  expect(executeRegexScripts({ text: "a", scripts: prompt, placement: "DISPLAY", ctx: macroOpts() })).toBe("a");
  expect(executeRegexScripts({ text: "a", scripts: prompt, placement: "AI_OUTPUT", ctx: macroOpts() })).toBe("b");
});

test("disabled scripts are skipped", () => {
  const out = executeRegexScripts({
    text: "a",
    scripts: [script({ enabled: false, findRegex: "a", replaceString: "b" })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
  });
  expect(out).toBe("a");
});

test("MAX_FIND_REGEX_LENGTH guard: an over-long pattern is rejected and reported, text unchanged", () => {
  const onScriptFailure = vi.fn();
  const tooLong = "a".repeat(MAX_FIND_REGEX_LENGTH + 1);
  const out = executeRegexScripts({
    text: "aaaa",
    scripts: [script({ findRegex: tooLong, replaceString: "Z" })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
    onScriptFailure,
  });
  expect(out).toBe("aaaa");
  expect(onScriptFailure).toHaveBeenCalledTimes(1);
});

test("an invalid regex is caught and reported, not thrown", () => {
  const onScriptFailure = vi.fn();
  const out = executeRegexScripts({
    text: "hello",
    scripts: [script({ findRegex: "(", replaceString: "x" })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
    onScriptFailure,
  });
  expect(out).toBe("hello");
  expect(onScriptFailure).toHaveBeenCalledTimes(1);
});

test("default flags are global + multiline", () => {
  expect(
    executeRegexScripts({
      text: "banana",
      scripts: [script({ findRegex: "a", replaceString: "o" })],
      placement: "AI_OUTPUT",
      ctx: macroOpts(),
    }),
  ).toBe("bonono");
  expect(
    executeRegexScripts({
      text: "x\nx",
      scripts: [script({ findRegex: "^x", replaceString: "Y" })],
      placement: "AI_OUTPUT",
      ctx: macroOpts(),
    }),
  ).toBe("Y\nY");
});

test("/body/flags form: the i flag makes the match case-insensitive", () => {
  const out = executeRegexScripts({
    text: "HELLO there",
    scripts: [script({ findRegex: "/hello/i", replaceString: "hi" })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
  });
  expect(out).toBe("hi there");
});

test("$$ is the literal-dollar escape", () => {
  const out = executeRegexScripts({
    text: "b",
    scripts: [script({ findRegex: "(b)", replaceString: "$$1" })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
  });
  expect(out).toBe("$1");
});

test("an out-of-range $N is left as a literal (no offset/subject leak)", () => {
  const out = executeRegexScripts({
    text: "a",
    scripts: [script({ findRegex: "(a)", replaceString: "$2" })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
  });
  expect(out).toBe("$2");
});

test("named capture groups splice via $<name>", () => {
  const out = executeRegexScripts({
    text: "hi",
    scripts: [script({ findRegex: "(?<word>hi)", replaceString: "[$<word>]" })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
  });
  expect(out).toBe("[hi]");
});

test("trimStrings are stripped from spliced captures", () => {
  const out = executeRegexScripts({
    text: "aXb",
    scripts: [script({ findRegex: "(.+)", replaceString: "$1", trimStrings: ["X"] })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
  });
  expect(out).toBe("ab");
});

test("substituteRegex.raw substitutes a macro into the find pattern verbatim", () => {
  const out = executeRegexScripts({
    text: "Bob and Bob",
    scripts: [
      script({
        findRegex: "{{user}}",
        replaceString: "X",
        substituteRegex: SubstituteFindRegex.raw,
      }),
    ],
    placement: "AI_OUTPUT",
    ctx: macroOpts({ user: "Bob" }),
  });
  expect(out).toBe("X and X");
});

test("substituteRegex.escaped escapes the macro output so meta chars match literally", () => {
  // user = "a.b": in escaped mode the "." is escaped to "\." so it matches the literal "a.b" only,
  // NOT "axb" (which a raw "." wildcard would match).
  const out = executeRegexScripts({
    text: "a.b axb",
    scripts: [
      script({
        findRegex: "{{user}}",
        replaceString: "Z",
        substituteRegex: SubstituteFindRegex.escaped,
      }),
    ],
    placement: "AI_OUTPUT",
    ctx: macroOpts({ user: "a.b" }),
  });
  expect(out).toBe("Z axb");
});

test("multiple scripts run in order; one failure does not poison the rest", () => {
  const onScriptFailure = vi.fn();
  const out = executeRegexScripts({
    text: "abc",
    scripts: [
      script({ findRegex: "a", replaceString: "1" }),
      script({ findRegex: "(", replaceString: "boom" }), // invalid → reported, skipped
      script({ findRegex: "c", replaceString: "3" }),
    ],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
    onScriptFailure,
  });
  expect(out).toBe("1b3");
  expect(onScriptFailure).toHaveBeenCalledTimes(1);
});

test("the applyReplace seam is used in place of native replace", () => {
  // The server injects a sandboxed applyReplace; prove the seam is honored by swapping in one that
  // upper-cases the whole text and ignores the regex entirely.
  const out = executeRegexScripts({
    text: "abc",
    scripts: [script({ findRegex: "a", replaceString: "z" })],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
    applyReplace: (text) => text.toUpperCase(),
  });
  expect(out).toBe("ABC");
});

test("REGEX_PLACEMENTS is the canonical placement set", () => {
  expect(REGEX_PLACEMENTS).toContain("DISPLAY");
  expect(REGEX_PLACEMENTS).toContain("AI_OUTPUT");
  // The ephemeral prompt-build leg — the only placement `historyDepth` can scope.
  expect(REGEX_PLACEMENTS).toContain(HISTORY_DEPTH_PLACEMENT);
});

// ── The DEPTH GATE (`PROMPT_HISTORY` only) ───────────────────────────────────────────────────────────
// Semantics read off the ST source (`public/scripts/extensions/regex/engine.js:361-372` for the gate,
// `public/script.js:4478` for the frame — `depth = coreChat.length - index - 1`, so DEPTH 0 IS THE NEWEST
// MESSAGE and counts backwards). These pin the gate as SUBTRACTIVE: it can only ever remove a script from a
// leg `placement` already selected, and it is inert wherever the caller supplies no depth.

const historyScript = (historyDepth: RegexScriptInput["historyDepth"]): RegexScriptInput =>
  script({ placement: [HISTORY_DEPTH_PLACEMENT], findRegex: "secret", replaceString: "[redacted]", ...(historyDepth === undefined ? {} : { historyDepth }) });

function atDepth(depth: number, historyDepth: RegexScriptInput["historyDepth"]): string {
  return executeRegexScripts({
    text: "a secret",
    scripts: [historyScript(historyDepth)],
    placement: HISTORY_DEPTH_PLACEMENT,
    depth,
    ctx: macroOpts(),
  });
}

test("depth 0 is the NEWEST message: a {min:0,max:0} scope bites there and nowhere else (ST engine.js:361-372)", () => {
  expect(atDepth(0, { min: 0, max: 0 })).toBe("a [redacted]");
  expect(atDepth(1, { min: 0, max: 0 })).toBe("a secret");
  expect(atDepth(9, { min: 0, max: 0 })).toBe("a secret");
});

test("a floor skips everything NEWER than it; a null ceiling reaches the whole history", () => {
  expect(atDepth(2, { min: 3, max: null })).toBe("a secret");
  expect(atDepth(3, { min: 3, max: null })).toBe("a [redacted]");
  expect(atDepth(300, { min: 3, max: null })).toBe("a [redacted]");
});

test("an absent scope reaches every depth, and a scope is inert on a leg that supplies no depth", () => {
  expect(atDepth(0, undefined)).toBe("a [redacted]");
  expect(atDepth(7, undefined)).toBe("a [redacted]");
  // No `depth` argument: every persist-time leg. The gate cannot half-apply — it simply does not run.
  const out = executeRegexScripts({
    text: "a secret",
    scripts: [{ ...historyScript({ min: 5, max: 5 }), placement: ["AI_OUTPUT", HISTORY_DEPTH_PLACEMENT] }],
    placement: "AI_OUTPUT",
    ctx: macroOpts(),
  });
  expect(out).toBe("a [redacted]");
});

test("the depth gate only SUBTRACTS — it can never run a script the placement set excluded", () => {
  const out = executeRegexScripts({
    text: "a secret",
    scripts: [{ ...historyScript({ min: 0, max: null }), placement: ["USER_INPUT"] }],
    placement: HISTORY_DEPTH_PLACEMENT,
    depth: 0,
    ctx: macroOpts(),
  });
  expect(out).toBe("a secret");
});
