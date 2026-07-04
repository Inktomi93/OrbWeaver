// The display pipeline end-to-end (pure, node-safe): macro substitution → the D53 DISPLAY regex
// tier (markdownOnly runs, promptOnly is engine-skipped) → fixMarkdown repair; per-row {{char}}
// re-targeting for group rows; frozen clock injected (determinism).

import { renderMessageForDisplay } from "@orb/client/lib";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const KIRA = castId<CharacterId>("char_testrenderaaaa");
const NOW_MS = 1_783_080_000_000; // 2026-07-03T12:00:00Z — precomputed literal

const CTX = {
  characterName: "Kira",
  characterNamesById: new Map<CharacterId, string>([[KIRA, "Kira of the Vale"]]),
  userName: "Nate",
  personaDescription: "a developer",
  nowMs: NOW_MS,
};

describe("renderMessageForDisplay", () => {
  test("substitutes macros with the ctx values", () => {
    expect(renderMessageForDisplay("{{char}} waves at {{user}}.", CTX)).toBe("Kira waves at Nate.");
  });

  test("a group row re-targets {{char}} to the row's voiced speaker", () => {
    expect(renderMessageForDisplay("{{char}} nods.", CTX, KIRA)).toBe("Kira of the Vale nods.");
  });

  test("runs markdownOnly display scripts; the engine skips promptOnly on DISPLAY", () => {
    const out = renderMessageForDisplay("The sword gleams.", {
      ...CTX,
      displayScripts: [
        {
          // sword→blade — display-leg script: runs here
          enabled: true,
          findRegex: "/sword/g",
          replaceString: "blade",
          placement: ["AI_OUTPUT", "DISPLAY"],
          markdownOnly: true,
          promptOnly: false,
        },
        {
          // gleams→GLOWS — prompt-only: the engine must SKIP it on DISPLAY
          enabled: true,
          findRegex: "/gleams/g",
          replaceString: "GLOWS",
          placement: ["AI_OUTPUT", "DISPLAY"],
          markdownOnly: false,
          promptOnly: true,
        },
      ],
    });
    expect(out).toBe("The blade gleams.");
  });

  test("repairs LLM markdown artifacts (unclosed emphasis) via fixMarkdown", () => {
    const out = renderMessageForDisplay("*She pauses", CTX);
    // The exact repair belongs to kit/fix-markdown's own tests; here we pin that the display
    // pipeline APPLIES it: the output is not the raw broken input.
    expect(out).not.toBe("*She pauses");
    expect(out).toContain("She pauses");
  });
});
