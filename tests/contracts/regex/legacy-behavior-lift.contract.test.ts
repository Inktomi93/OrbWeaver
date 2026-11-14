// @subject packages/contracts/src/regex/schemas.ts
// A script file exported in the placement-set shape (one `placement` list holding `DISPLAY` and `PROMPT_HISTORY`
// beside the save-time members, with `markdownOnly`, `promptOnly` and `historyDepth`) imports onto the two axes by the
// mapping the numbered migration also applies to stored rows: an editor-written row maps member by member, any other
// row reads its flags with SillyTavern's meaning.
import { portableRegexScriptSchema } from "@orb/contracts/regex";
import type { RegexDepth, RegexPass, RegexTarget } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";

interface Axes {
  readonly targets: readonly RegexTarget[];
  readonly passes: readonly RegexPass[];
  readonly depth?: RegexDepth;
}

function axesOf(behavior: Readonly<Record<string, unknown>>): Axes {
  const { targets, passes, depth } = portableRegexScriptSchema.parse({ name: "old", findRegex: "a", replaceString: "b", ...behavior });
  return { targets, passes, ...(depth === undefined ? {} : { depth }) };
}

const CASES: readonly { readonly shape: string; readonly old: Readonly<Record<string, unknown>>; readonly axes: Axes }[] = [
  {
    shape: "an AI-output row with neither flag is the save pass",
    old: { placement: ["AI_OUTPUT"], markdownOnly: false, promptOnly: false },
    axes: { targets: ["AI_OUTPUT"], passes: ["save"] },
  },
  {
    shape: "a prompt-only row is the prompt pass, whoever wrote it",
    old: { placement: ["AI_OUTPUT"], markdownOnly: false, promptOnly: true },
    axes: { targets: ["AI_OUTPUT"], passes: ["prompt"] },
  },
  {
    shape: "a display-only row with no display member is the display pass on its own targets",
    old: { placement: ["AI_OUTPUT"], markdownOnly: true, promptOnly: false },
    axes: { targets: ["AI_OUTPUT"], passes: ["display"] },
  },
  {
    shape: "both flags are the display and the prompt pass",
    old: { placement: ["USER_INPUT", "AI_OUTPUT"], markdownOnly: true, promptOnly: true },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT"], passes: ["display", "prompt"] },
  },
  {
    shape: "an editor-written world-info row is the prompt pass on world info",
    old: { placement: ["WORLD_INFO"], markdownOnly: false, promptOnly: true },
    axes: { targets: ["WORLD_INFO"], passes: ["prompt"] },
  },
  {
    shape: "a display member alone is the display pass on every row's text",
    old: { placement: ["DISPLAY"], markdownOnly: true, promptOnly: false },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT", "REASONING"], passes: ["display"] },
  },
  {
    shape: "a history member is the prompt pass on user and AI rows, and an old floor of 0 is no floor",
    old: { placement: ["PROMPT_HISTORY"], markdownOnly: false, promptOnly: true, historyDepth: { min: 0, max: 3 } },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT"], passes: ["prompt"], depth: { min: -1, max: 3 } },
  },
  {
    shape: "a history member over the whole history carries no depth",
    old: { placement: ["PROMPT_HISTORY"], markdownOnly: false, promptOnly: true, historyDepth: { min: 0, max: null } },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT"], passes: ["prompt"] },
  },
  {
    shape: "a history member beside world info keeps both on the prompt pass, with a floor kept as written",
    old: { placement: ["WORLD_INFO", "PROMPT_HISTORY"], markdownOnly: false, promptOnly: true, historyDepth: { min: 2, max: null } },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT", "WORLD_INFO"], passes: ["prompt"], depth: { min: 2, max: null } },
  },
  {
    shape: "a two-axis behavior passes through unchanged",
    old: { targets: ["REASONING"], passes: ["save"] },
    axes: { targets: ["REASONING"], passes: ["save"] },
  },
];

test.each(CASES)("$shape", ({ old, axes }) => {
  expect(axesOf(old)).toEqual(axes);
});

test("a display member beside a save member lifts to the save and display pass, which a file may not write", () => {
  const parsed = portableRegexScriptSchema.safeParse({ name: "old", findRegex: "a", replaceString: "b", placement: ["AI_OUTPUT", "DISPLAY"] });

  expect(parsed.error?.issues.map(({ path }) => path)).toEqual([["passes"]]);
});
