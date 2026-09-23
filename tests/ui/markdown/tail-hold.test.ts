// The M1 tail-hold pre-pass. What matters here is
// not "does it hold" in the abstract — it is the STREAM: feeding every prefix of a real message and
// proving (a) the held output is always a prefix of the input, so nothing can ever be corrupted, and
// (b) the sequence of outputs never produces the block-type flip the doc measured. Deep-imports src
// (browser package; @orb/ui is not node-resolvable), like dialogue.test.ts / policy.test.ts.

import { describe } from "vitest";
import { holdAmbiguousTail } from "../../../packages/ui/src/markdown/tail-hold.ts";
import { expect, test } from "../../support/fixtures.ts";

/** Every prefix of `message`, as a stream would commit it one character at a time. */
function prefixes(message: string): string[] {
  return [...message].map((_, index) => message.slice(0, index + 1));
}

describe("holdAmbiguousTail — the ambiguous trailing constructs", () => {
  test("a lone pipe row is withheld until its second line is complete", () => {
    expect(holdAmbiguousTail("Intro.\n\n| a | b |")).toBe("Intro.\n\n");
    expect(holdAmbiguousTail("Intro.\n\n| a | b |\n")).toBe("Intro.\n\n");
    expect(holdAmbiguousTail("Intro.\n\n| a | b |\n| --- |")).toBe("Intro.\n\n");
    // The delimiter row is newline-terminated: the block is a table forever now, so it paints.
    expect(holdAmbiguousTail("Intro.\n\n| a | b |\n| --- | --- |\n")).toBe("Intro.\n\n| a | b |\n| --- | --- |\n");
  });

  test("a pipe row that merely FOLLOWS prose (no blank line) is held too", () => {
    // The run walk stops at the first non-pipe line, so the candidate row is a run of one.
    expect(holdAmbiguousTail("Here it is:\n| a | b |")).toBe("Here it is:\n");
  });

  test("an ESTABLISHED table keeps painting — later rows are never delayed", () => {
    const settled = "| a | b |\n| --- | --- |\n| 1 | 2 |\n";
    expect(holdAmbiguousTail(settled)).toBe(settled);
    expect(holdAmbiguousTail(`${settled}| 3 | 4`)).toBe(`${settled}| 3 | 4`);
  });

  test("a pipe row whose second line is NOT a delimiter is released as prose, not held forever", () => {
    // Line two decides the block; GFM only accepts a delimiter there, so this is a paragraph for good.
    expect(holdAmbiguousTail("| a | b |\nplain follower\n")).toBe("| a | b |\nplain follower\n");
  });

  test("a bare block marker is withheld until one more character decides it", () => {
    expect(holdAmbiguousTail("Intro.\n\n*")).toBe("Intro.\n\n");
    expect(holdAmbiguousTail("Intro.\n\n**")).toBe("Intro.\n\n");
    expect(holdAmbiguousTail("Intro.\n\n-")).toBe("Intro.\n\n");
    expect(holdAmbiguousTail("Intro.\n\n1.")).toBe("Intro.\n\n");
    expect(holdAmbiguousTail("Intro.\n\n1)")).toBe("Intro.\n\n");
  });

  test("a DECIDED marker paints immediately — no latency for the unambiguous cases", () => {
    expect(holdAmbiguousTail("Intro.\n\n- item")).toBe("Intro.\n\n- item");
    expect(holdAmbiguousTail("Intro.\n\n- ")).toBe("Intro.\n\n- ");
    expect(holdAmbiguousTail("Intro.\n\n**bold")).toBe("Intro.\n\n**bold");
    expect(holdAmbiguousTail("Intro.\n\n1. item")).toBe("Intro.\n\n1. item");
    expect(holdAmbiguousTail("-- an em dash line")).toBe("-- an em dash line");
  });

  test("a setext-underline candidate is withheld, so the paragraph never flashes through a list", () => {
    // `Title\n-` parses as a paragraph + an empty UL; `Title\n---` is an <h2>. Holding the run removes
    // the intermediate UL entirely — the paragraph promotes straight to the heading when the line ends.
    expect(holdAmbiguousTail("Title\n-")).toBe("Title\n");
    expect(holdAmbiguousTail("Title\n---")).toBe("Title\n");
    expect(holdAmbiguousTail("Title\n---\n")).toBe("Title\n---\n");
  });
});

describe("holdAmbiguousTail — the hard floors", () => {
  test("it stands down INSIDE an open fence (code must never flicker)", () => {
    const open = "```js\nconst rows = [\n  1,\n";
    expect(holdAmbiguousTail(`${open}| a |`)).toBe(`${open}| a |`);
    expect(holdAmbiguousTail(`${open}-`)).toBe(`${open}-`);
    // A CLOSED fence restores the pre-pass.
    expect(holdAmbiguousTail("```js\nconst x = 1;\n```\n\n| a | b |")).toBe("```js\nconst x = 1;\n```\n\n");
  });

  test("it never returns a blank body (the ghost bubble must not collapse, the caret must land)", () => {
    expect(holdAmbiguousTail("*")).toBe("*");
    expect(holdAmbiguousTail("| a | b |")).toBe("| a | b |");
    expect(holdAmbiguousTail("")).toBe("");
  });

  test("it is a TRUNCATION, never a rewrite — every output is a prefix of its input", () => {
    const message = "Intro.\n\n| Name | Role |\n| --- | --- |\n| Ada | lead |\n\n- one\n- two\n\n```js\nconst x = 1;\n```\n\nDone.";
    for (const prefix of prefixes(message)) {
      expect(prefix.startsWith(holdAmbiguousTail(prefix))).toBe(true);
    }
  });

  test("a settled message is returned untouched (the last commit of a stream is never ambiguous)", () => {
    const settled = "Intro.\n\n| Name | Role |\n| --- | --- |\n| Ada | lead |\n\n- one\n- two\n\nDone.";
    expect(holdAmbiguousTail(settled)).toBe(settled);
  });

  test("repeated calls are stable — no `/g` lastIndex state leaks between invocations", () => {
    // A global regex driven by `.test()` alternates true/false across calls; the fence scan reads through
    // `String.match` for exactly this reason. Same input, same answer, ten times running.
    const open = "```js\nconst a = 1;\n|";
    for (let i = 0; i < 10; i += 1) {
      expect(holdAmbiguousTail(open)).toBe(open);
      expect(holdAmbiguousTail("Intro.\n\n| a |")).toBe("Intro.\n\n");
    }
  });
});

describe("holdAmbiguousTail — the flip the doc measured", () => {
  test("streaming the measured table prefix-by-prefix, the tail NEVER paints a pipe row as prose", () => {
    // The M1 symptom in one assertion: across the whole stream there is no commit whose OUTPUT ends in a
    // pipe row that is not already part of a decided (2+ complete lines) table block.
    const message = "Intro line.\n\n| Name | Role |\n| --- | --- |\n| Ada | lead |\n";
    const undecided = prefixes(message).filter((prefix) => {
      const held = holdAmbiguousTail(prefix);
      const tail = held.slice(held.lastIndexOf("\n", held.trimEnd().length - 1) + 1).trimEnd();
      if (!tail.startsWith("|")) {
        return false;
      }
      // A pipe tail is only legitimate once the block above it already contains a delimiter row.
      return !held.includes("| --- |");
    });
    expect(undecided).toStrictEqual([]);
  });
});
