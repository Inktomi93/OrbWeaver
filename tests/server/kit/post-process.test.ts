// @orb/server/kit/post-process — the RECEIVE/ASSEMBLE text munging (D53 step 2). Pins each transform + the
// `applyReceivePostProcess` orchestrator reading a `PromptConfig.postProcess` block: each flag in isolation,
// the all-off no-op, and the combined order (single-line FIRST, then drop-incomplete, then trim).

import type { PostProcessConfig } from "@orb/server/kit/post-process";
import {
  applyAssemblePostProcess,
  applyReceivePostProcess,
  collapseNewlines,
  collapseToSingleLine,
  dropIncompleteSentence,
  trimTrailingWhitespace,
} from "@orb/server/kit/post-process";
import { describe, expect, test } from "vitest";

function cfg(over: Partial<PostProcessConfig> = {}): PostProcessConfig {
  return {
    collapseNewlines: false,
    trimTrailingWhitespace: false,
    dropIncompleteSentence: false,
    singleLine: false,
    ...over,
  };
}

describe("post-process — individual transforms", () => {
  test("collapseNewlines: 3+ newlines → exactly 2 (idempotent)", () => {
    expect(collapseNewlines("a\n\n\n\nb")).toBe("a\n\nb");
    expect(collapseNewlines("a\n\nb")).toBe("a\n\nb");
  });

  test("trimTrailingWhitespace: strips trailing spaces/tabs/newlines", () => {
    expect(trimTrailingWhitespace("hi there  \n\t ")).toBe("hi there");
  });

  test("dropIncompleteSentence: cuts a trailing fragment after the last sentence end", () => {
    expect(dropIncompleteSentence("A full sentence. And a half")).toBe("A full sentence.");
  });

  test("dropIncompleteSentence: no-op when already ending cleanly (incl. a closing quote)", () => {
    expect(dropIncompleteSentence('She said "hello."')).toBe('She said "hello."');
    expect(dropIncompleteSentence("Done!")).toBe("Done!");
  });

  test("dropIncompleteSentence: no-op on a single punctuation-free fragment (don't nuke it)", () => {
    expect(dropIncompleteSentence("just a fragment")).toBe("just a fragment");
  });

  test("collapseToSingleLine: keeps the first line, skipping leading blank lines", () => {
    expect(collapseToSingleLine("\n\nfirst line\nsecond line")).toBe("first line");
    expect(collapseToSingleLine("only line  ")).toBe("only line");
  });
});

describe("applyReceivePostProcess — orchestrator", () => {
  test("undefined config → identity no-op", () => {
    expect(applyReceivePostProcess("a\n\n\nb  ", undefined)).toBe("a\n\n\nb  ");
  });

  test("all flags off → no-op", () => {
    expect(applyReceivePostProcess("a\n\n\nb. tail  ", cfg())).toBe("a\n\n\nb. tail  ");
  });

  test("singleLine flag alone keeps the first line", () => {
    expect(applyReceivePostProcess("line1\nline2", cfg({ singleLine: true }))).toBe("line1");
  });

  test("trim flag alone strips trailing whitespace", () => {
    expect(applyReceivePostProcess("text  \n", cfg({ trimTrailingWhitespace: true }))).toBe("text");
  });

  test("dropIncompleteSentence flag alone cuts the trailing fragment", () => {
    expect(
      applyReceivePostProcess("Sentence one. half two", cfg({ dropIncompleteSentence: true })),
    ).toBe("Sentence one.");
  });

  test("combined: single-line FIRST, then drop-incomplete, then trim", () => {
    // single-line cuts to "First. then more" (drops line 2); drop-incomplete cuts to "First."; trim is a no-op.
    const out = applyReceivePostProcess("First. then more\nsecond line  ", {
      collapseNewlines: false,
      trimTrailingWhitespace: true,
      dropIncompleteSentence: true,
      singleLine: true,
    });
    expect(out).toBe("First.");
  });
});

describe("applyAssemblePostProcess — orchestrator", () => {
  test("collapseNewlines flag collapses; off (or undefined) is a no-op", () => {
    expect(applyAssemblePostProcess("a\n\n\n\nb", cfg({ collapseNewlines: true }))).toBe("a\n\nb");
    expect(applyAssemblePostProcess("a\n\n\n\nb", cfg())).toBe("a\n\n\n\nb");
    expect(applyAssemblePostProcess("a\n\n\n\nb", undefined)).toBe("a\n\n\n\nb");
  });
});
