// The executor bounds what a script may add, on every pass, the browser's display pass included: raw substitution may
// add only a name's worth of pattern source, and a replacement may not grow the text past the pass's output bound. Each
// refusal names its own code through `onScriptFailure`, leaves the text as it was, and the next script still runs.
// @subject packages/kit/src/regex/index.ts

import type { RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts, REGEX_OUTPUT_TOO_LONG, REGEX_SUBSTITUTION_TOO_LONG, SubstituteFindRegex } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";

const DISPLAY = ["DISPLAY"] as const;
const PROSE = "The rain had not stopped since morning. She pulled her coat tighter. ";
const FOLLOWER: RegexScriptInput = { enabled: true, placement: DISPLAY, findRegex: "/rain/g", replaceString: "snow" };
// The real file's largest replacement is 24,648 characters; a panel that size, spliced once, is ordinary use.
const PANEL_LENGTH = 24_648;
// Splices of the whole text in one template: 10,000 copies of a 3,000-character text is 30 million characters, past
// any output bound a pass could carry and inside the stored replacement cap. The composed suite uses that cap itself.
const AMPLIFYING_SPLICES = 10_000;

function codesOf(failures: readonly unknown[]): unknown[] {
  return failures.map((err) => (typeof err === "object" && err !== null && "code" in err ? err.code : err));
}

const CTX = { char: "Aria", user: "Bob", persona: "", scenario: "", env: {} };

interface Displayed {
  readonly out: string;
  readonly codes: readonly unknown[];
}

function display(text: string, scripts: readonly RegexScriptInput[], ctx: Parameters<typeof executeRegexScripts>[0]["ctx"] = CTX): Displayed {
  const failures: unknown[] = [];
  const out = executeRegexScripts({ text, scripts, placement: "DISPLAY", ctx, onScriptFailure: (err) => failures.push(err) });
  return { out, codes: codesOf(failures) };
}

test("a replacement that splices its capture past the output bound is refused before the text is built", () => {
  const text = PROSE.repeat(45);
  const amplifier: RegexScriptInput = { enabled: true, placement: DISPLAY, findRegex: "/([\\s\\S]+)/", replaceString: "$1".repeat(AMPLIFYING_SPLICES) };

  const { out, codes } = display(text, [amplifier, FOLLOWER]);

  expect(codes).toEqual([REGEX_OUTPUT_TOO_LONG]);
  expect(out).toBe(text.replaceAll("rain", "snow"));
});

test("a panel-sized replacement on a long reply is applied", () => {
  const text = `${PROSE.repeat(600)}<hud></hud>`;
  const panel: RegexScriptInput = { enabled: true, placement: DISPLAY, findRegex: "/<hud><\\/hud>/", replaceString: "P".repeat(PANEL_LENGTH) };

  const { out, codes } = display(text, [panel]);

  expect(codes).toEqual([]);
  expect(out).toHaveLength(text.length - "<hud></hud>".length + PANEL_LENGTH);
});

test("raw substitution of a prose field into the find pattern is refused; a substituted name is not", () => {
  const ctx = { ...CTX, description: "(a|b)".repeat(600) };
  const prose: RegexScriptInput = {
    enabled: true,
    placement: DISPLAY,
    findRegex: "/{{description}}/g",
    replaceString: "X",
    substituteRegex: SubstituteFindRegex.raw,
  };
  const name: RegexScriptInput = {
    enabled: true,
    placement: DISPLAY,
    findRegex: "/{{char}}/g",
    replaceString: "she",
    substituteRegex: SubstituteFindRegex.raw,
  };

  const { out, codes } = display("Aria looked up at the rain.", [prose, name], ctx);

  expect(codes).toEqual([REGEX_SUBSTITUTION_TOO_LONG]);
  expect(out).toBe("she looked up at the rain.");
});
