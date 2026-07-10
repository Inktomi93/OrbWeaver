// The display pipeline end-to-end (pure, node-safe): macro substitution (via `@orb/kit/macro`'s
// `resolveRowMacros` — the ONE shared atom server ASSEMBLE also calls, Chat-Macro-Resolution.md §2) →
// the D53 DISPLAY regex tier (markdownOnly runs, promptOnly is engine-skipped) → fixMarkdown repair;
// per-row `{{char}}`/`{{user}}` re-targeting via the row's OWN stamps; frozen clock injected
// (determinism).

import { renderMessageForDisplay } from "@orb/client/lib";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const KIRA = castId<CharacterId>("char_testrenderaaaa");
const NATE = castId<PersonaId>("persona_testrenderaaaa");
const NOW_MS = 1_783_080_000_000; // 2026-07-03T12:00:00Z — precomputed literal

const CTX = {
  characterNamesById: new Map<CharacterId, RowCharacterName>([
    [KIRA, { name: "Kira of the Vale" }],
  ]),
  personaNamesById: new Map<PersonaId, RowPersonaName>([
    [NATE, { name: "Nate", description: "a developer" }],
  ]),
  speakerCharName: "Kira",
  fallbackPersonaName: "Nate",
  nowMs: NOW_MS,
};

describe("renderMessageForDisplay", () => {
  test("substitutes macros with the ctx's default (null-stamp) subjects", () => {
    expect(renderMessageForDisplay("{{char}} waves at {{user}}.", CTX)).toBe("Kira waves at Nate.");
  });

  test("a row's own stamps retarget {{char}}/{{user}} to ITS speaker/author via the producer", () => {
    expect(renderMessageForDisplay("{{char}} nods at {{user}}.", CTX, KIRA, NATE)).toBe(
      "Kira of the Vale nods at Nate.",
    );
  });

  test("no producer entry + no ctx default floors to kit's own literal ('Character'/'User')", () => {
    const bareCtx = {
      characterNamesById: new Map<CharacterId, RowCharacterName>(),
      personaNamesById: new Map<PersonaId, RowPersonaName>(),
    };
    expect(renderMessageForDisplay("{{char}} greets {{user}}.", bareCtx)).toBe(
      "Character greets User.",
    );
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

  test("does NOT run fixMarkdown by default — a censoring lone asterisk survives as authored (#34)", () => {
    // The ST auto-fix is OPT-IN (autoFixMarkdown, default off): running it on a settled body auto-closes
    // a deliberate lone asterisk into a stray emphasis run (`f*ck` → italic). Off ⇒ render as-authored.
    expect(renderMessageForDisplay("you can't use a f*cking diagram.", CTX)).toBe(
      "you can't use a f*cking diagram.",
    );
  });

  test("runs fixMarkdown when autoFixMarkdown is ON (the ST auto_fix_generated_markdown opt-in)", () => {
    const out = renderMessageForDisplay("*She pauses", { ...CTX, autoFixMarkdown: true });
    // The exact repair belongs to kit/fix-markdown's own tests; here we pin that the opt-in APPLIES it:
    // the output is no longer the raw broken input.
    expect(out).not.toBe("*She pauses");
    expect(out).toContain("She pauses");
  });
});
