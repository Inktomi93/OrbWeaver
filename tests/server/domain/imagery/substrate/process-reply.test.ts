// substrate: processReply — the pure LLM-reply→keyword-prompt normalizer (imagery-design/02 §7). One golden
// row per numbered step; case is PRESERVED; the caller owns empty-is-error.

import { describe } from "vitest";
import { processReply } from "../../../../../packages/server/src/domain/imagery/substrate/process-reply.ts";
import { expect, test } from "../../../../support/fixtures";

const TRAILING_COMMA = /,\s*$/;

describe("processReply", () => {
  test("step 1: strips ONE pair of wrapping quotes (straight, single, curly) — inner quotes survive", () => {
    expect(processReply('"red hair, blue eyes"')).toBe("red hair, blue eyes");
    expect(processReply("'a portrait'")).toBe("a portrait");
    expect(processReply("“curly wrapped”")).toBe("curly wrapped");
    // Only a WHOLE-string wrap is stripped — an unbalanced leading quote is filtered by step 4, not unwrapped.
    expect(processReply('"leading only')).toBe("leading only");
  });

  test("step 2: newline runs collapse to a comma list", () => {
    expect(processReply("red hair\nblue eyes\n\ntall")).toBe("red hair, blue eyes, tall");
  });

  test("step 3: NFD-normalize then strip combining marks (é → e)", () => {
    expect(processReply("café, naïve, résumé")).toBe("cafe, naive, resume");
  });

  test("step 4: whitelist drops SD attention syntax + markdown; keeps a-z A-Z 0-9 space , . ' -", () => {
    expect(processReply("(masterpiece:1.2), [detailed], {ornate}")).toBe("masterpiece1.2, detailed, ornate");
    // `*` bullets are dropped; hyphen is whitelisted (hyphenated keywords like "close-up" survive).
    expect(processReply("* bullet\n* list")).toBe("bullet, list");
    expect(processReply("close-up, wide-angle")).toBe("close-up, wide-angle");
  });

  test("step 5: collapses comma debris + whitespace; trims leading/trailing commas", () => {
    expect(processReply(",,  red  ,, ,  blue  ,,")).toBe("red, blue");
  });

  test("step 6: length cap cuts at the last full comma-term before 2000, never mid-word", () => {
    const term = "keyword, ";
    const many = term.repeat(300); // ~2700 chars of "keyword, "
    const out = processReply(many);
    expect(out.length).toBeLessThanOrEqual(2000);
    expect(out.endsWith("keyword")).toBe(true);
    expect(out).not.toMatch(TRAILING_COMMA);
  });

  test("case is preserved (proper nouns carry signal)", () => {
    expect(processReply("Victorian, Red, gothic")).toBe("Victorian, Red, gothic");
  });

  test("an all-noise reply normalizes to empty (the caller raises PromptExtractionFailedError)", () => {
    expect(processReply("()[]{}::|")).toBe("");
    expect(processReply("   \n\n  ")).toBe("");
  });
});
