// The display pipeline end-to-end (pure, node-safe): macro substitution (via `@orb/kit/macro`'s
// `resolveRowMacros` — the ONE shared atom server ASSEMBLE also calls, Chat-Macro-Resolution.md §2) →
// the D53 DISPLAY regex tier (markdownOnly runs, promptOnly is engine-skipped) → fixMarkdown repair;
// per-row `{{char}}`/`{{user}}` re-targeting via the row's OWN stamps; frozen clock injected
// (determinism).

import { isDisplayRegexTooComplex, renderMessageForDisplay } from "@orb/client/lib";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const KIRA = castId<CharacterId>("char_testrenderaaaa");
const ALEX = castId<PersonaId>("persona_testrenderaaaa");
const NOW_MS = 1_783_080_000_000; // 2026-07-03T12:00:00Z — precomputed literal

const CTX = {
  characterNamesById: new Map<CharacterId, RowCharacterName>([[KIRA, { name: "Kira of the Vale" }]]),
  personaNamesById: new Map<PersonaId, RowPersonaName>([[ALEX, { name: "Alex", description: "a developer" }]]),
  speakerCharName: "Kira",
  fallbackPersonaName: "Alex",
  nowMs: NOW_MS,
};

describe("renderMessageForDisplay", () => {
  test("substitutes macros with the ctx's default (null-stamp) subjects", () => {
    expect(renderMessageForDisplay("{{char}} waves at {{user}}.", CTX)).toBe("Kira waves at Alex.");
  });

  test("a row's own stamps retarget {{char}}/{{user}} to ITS speaker/author via the producer", () => {
    expect(renderMessageForDisplay("{{char}} nods at {{user}}.", CTX, KIRA, ALEX)).toBe("Kira of the Vale nods at Alex.");
  });

  // The `{{user}}` floor is the ONE unresolved-persona name (`DEFAULT_PERSONA_NAME`, @orb/kit/persona) —
  // the same word the row attribution renders and the server stamps on the wire. `{{char}}` keeps its own
  // "Character" literal: a nameless CHARACTER is a different question from a nameless human.
  test("no producer entry + no ctx default floors to kit's own literals", () => {
    const bareCtx = {
      characterNamesById: new Map<CharacterId, RowCharacterName>(),
      personaNamesById: new Map<PersonaId, RowPersonaName>(),
    };
    expect(renderMessageForDisplay("{{char}} greets {{user}}.", bareCtx)).toBe(`Character greets ${DEFAULT_PERSONA_NAME}.`);
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
    expect(renderMessageForDisplay("you can't use a f*cking diagram.", CTX)).toBe("you can't use a f*cking diagram.");
  });

  test("runs fixMarkdown when autoFixMarkdown is ON (the ST auto_fix_generated_markdown opt-in)", () => {
    const out = renderMessageForDisplay("*She pauses", { ...CTX, autoFixMarkdown: true });
    // The exact repair belongs to kit/fix-markdown's own tests; here we pin that the opt-in APPLIES it:
    // the output is no longer the raw broken input.
    expect(out).not.toBe("*She pauses");
    expect(out).toContain("She pauses");
  });
});

// ── DISPLAY-tier ReDoS guard (2026-08-09 DoS audit, finding #3) ────────────────────────────────────────
// The browser DISPLAY tier runs regex UNWATCHED (no node:vm). The shared `tooComplex` pre-filter admits the
// canonical `(a+)+` catastrophic shape, so a shared/imported character's DISPLAY regex could freeze a
// co-member's tab. `renderMessageForDisplay` now injects an applyReplace that rejects the nested-quantifier
// family before it runs; the executor skips the failing script silently.
describe("DISPLAY-tier ReDoS guard", () => {
  test("isDisplayRegexTooComplex flags the nested-quantifier family and spares benign groups", () => {
    // Exponential-backtracking family — a quantifier applied to a group already carrying one.
    for (const evil of ["(a+)+", "(a*)*", "(a+)*", "(a+){2,}", "([a-z]+)+", "(\\w+)+$"]) {
      expect(isDisplayRegexTooComplex(evil)).toBe(true);
    }
    // Benign: a group with no INNER quantifier, alternation, or a plain pattern — must NOT be rejected.
    for (const ok of ["(abc)+", "(a|b)+", "sword", "\\d+", "a+b+", "(foo)?"]) {
      expect(isDisplayRegexTooComplex(ok)).toBe(false);
    }
  });

  test("a catastrophic `(a+)+$` DISPLAY script over a long subject is SKIPPED, not run — never hangs", () => {
    // Without the guard, native `String.replace` backtracks effectively forever on this input (40 000
    // `a`s that can never satisfy the trailing `$` because of the `!`) — the test would blow the timeout.
    // The guard rejects the pattern pre-run, so the script is skipped and the text returns unchanged, fast.
    // The BOUND is the vitest timeout (2 s), not an ambient-clock reading (the test-determinism gate
    // bans ambient clocks in test source): the O(n) guarded path clears it by orders of magnitude.
    const subject = `${"a".repeat(40_000)}!`;
    const out = renderMessageForDisplay(subject, {
      ...CTX,
      displayScripts: [
        {
          enabled: true,
          findRegex: "(a+)+$",
          replaceString: "X",
          placement: ["DISPLAY"],
          markdownOnly: true,
          promptOnly: false,
        },
      ],
    });
    // Script skipped ⇒ the (macro-free) subject is unchanged; and it never hung.
    expect(out).toBe(subject);
  }, 2000);

  test("a benign DISPLAY regex with a quantifier still runs (the guard is not over-broad)", () => {
    const out = renderMessageForDisplay("The sword gleams.", {
      ...CTX,
      displayScripts: [
        {
          enabled: true,
          findRegex: "(sword)+", // group, no inner quantifier — safe, must still fire
          replaceString: "blade",
          placement: ["DISPLAY"],
          markdownOnly: true,
          promptOnly: false,
        },
      ],
    });
    expect(out).toBe("The blade gleams.");
  });
});
