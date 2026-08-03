// The regex TESTER's engine seam (client/src/lib/regex-preview.ts). What these pin is the ONE property a
// tester has to have: it agrees with production, because it IS production — `executeRegexScripts` from
// `@orb/kit/regex`, the same call the DISPLAY tier and the server's five legs make. Every case below is a
// behaviour the shipped executor has and a hand-rolled `input.replace(new RegExp(p), r)` preview would get
// WRONG (macro pass on the template, verbatim capture splice, trim strings, macro-substituted patterns, the
// forced `g`, the complexity cap).

import { previewRegexScript, REGEX_PREVIEW_CHAR } from "@orb/client/lib";
import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import { SubstituteFindRegex } from "@orb/kit/regex";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

/** The executor's own complexity-cap wording (`@orb/kit/regex` `tooComplex`), matched loosely so the exact
 *  numbers in the message can change without this becoming a copy of that string. */
const TOO_COMPLEX = /too complex/;

function script(over: Partial<CreateRegexScriptInput>): CreateRegexScriptInput {
  return {
    name: "probe",
    findRegex: "",
    replaceString: "",
    placement: ["AI_OUTPUT"],
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: SubstituteFindRegex.none,
    ...over,
  };
}

describe("previewRegexScript", () => {
  test("replaces every match and reports the count the production replacer actually fired", () => {
    const preview = previewRegexScript(script({ findRegex: "cat", replaceString: "dog" }), "cat cat cat");
    expect(preview.output).toBe("dog dog dog");
    expect(preview.matchCount).toBe(3);
    expect(preview.error).toBeNull();
  });

  // `@orb/kit/regex` forces `g` and defaults a bare pattern to `gm`. Surfacing the COMPILED flags is the
  // whole reason the preview reads them off the executor's own RegExp instead of re-deriving them: a user
  // who wrote `^` needs to know it anchors a LINE here, and that a bare pattern is never first-match-only
  // (which is where orbweaver and ST genuinely differ — ST compiles a bare pattern with no flags at all).
  test("reports the flags the executor really compiled with — bare is gm, the slash form keeps its own plus g", () => {
    expect(previewRegexScript(script({ findRegex: "a" }), "a").flags).toBe("gm");
    expect(previewRegexScript(script({ findRegex: "/A/i" }), "a").flags).toBe("gi");
  });

  test("macros resolve in the REPLACEMENT template", () => {
    const preview = previewRegexScript(script({ findRegex: "NAME", replaceString: "{{char}}" }), "hello NAME");
    expect(preview.output).toBe(`hello ${REGEX_PREVIEW_CHAR}`);
  });

  // THE ORDERING GUARANTEE (kit/regex: template macro-pass FIRST, captures spliced verbatim after). A
  // preview that macro-evaluated the whole result would show `{{setvar}}` inside matched text being
  // executed — exactly the injection the executor is built to prevent — and would therefore be advertising
  // behaviour production does not have.
  test("captured text is spliced VERBATIM, never macro-evaluated", () => {
    const preview = previewRegexScript(script({ findRegex: "<(.+)>", replaceString: "[$1]" }), "<{{char}}>");
    expect(preview.output).toBe("[{{char}}]");
  });

  test("trimStrings are stripped from each capture before it is spliced", () => {
    const preview = previewRegexScript(script({ findRegex: "\\[(.+?)\\]", replaceString: "$1", trimStrings: ["ooc: "] }), "[ooc: be brief]");
    expect(preview.output).toBe("be brief");
  });

  test("substituteRegex resolves macros INSIDE the find pattern (and leaves them alone when off)", () => {
    const pattern = "{{char}}";
    expect(previewRegexScript(script({ findRegex: pattern, replaceString: "X" }), `${REGEX_PREVIEW_CHAR} waves`).matchCount).toBe(0);
    const substituted = previewRegexScript(
      script({ findRegex: pattern, replaceString: "X", substituteRegex: SubstituteFindRegex.raw }),
      `${REGEX_PREVIEW_CHAR} waves`,
    );
    expect(substituted.output).toBe("X waves");
  });

  test("an invalid pattern reports the executor's failure and leaves the sample untouched", () => {
    const preview = previewRegexScript(script({ findRegex: "(unclosed", replaceString: "x" }), "sample");
    expect(preview.output).toBe("sample");
    expect(preview.matchCount).toBe(0);
    expect(preview.flags).toBeNull();
    expect(preview.error).not.toBeNull();
  });

  // The executor refuses over-stacked quantifiers BEFORE `new RegExp` (its ReDoS heuristic). The tester
  // must show that refusal rather than quietly running the pattern in a browser that has no watchdog.
  test("the complexity cap surfaces as an error, not as a silent run", () => {
    const preview = previewRegexScript(script({ findRegex: "(a+)+(b+)+(c+)+", replaceString: "x" }), "aaabbbccc");
    expect(preview.error).toMatch(TOO_COMPLEX);
  });

  test("an empty sample is an empty result, not a failure", () => {
    const preview = previewRegexScript(script({ findRegex: "a", replaceString: "b" }), "");
    expect(preview.output).toBe("");
    expect(preview.matchCount).toBe(0);
    expect(preview.error).toBeNull();
  });
});
