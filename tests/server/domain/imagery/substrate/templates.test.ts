// substrate: templates — the load-bearing "Begin your reply with: <prefix>," instructions + the ensurePrefix
// drift belt. The prefixes are load-bearing: the size defaults assume the composition
// they set, and ensurePrefix re-asserts them when the LLM drops its instruction.

import { DEFAULT_CAPTION_INSTRUCTIONS, DEFAULT_PROMPT_TEMPLATES, IMAGERY_NEGATIVE_SLOT_ID } from "@orb/contracts/imagery";
import { PROSE_SLOTS, resolveProseText } from "@orb/contracts/prose";
import { describe } from "vitest";
import { composeNegative, ensurePrefix } from "../../../../../packages/server/src/domain/imagery/substrate/templates.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("canonical prompt and caption defaults", () => {
  test("every extraction template resolves {{char}} for chat's shaper + ends with its required prefix", () => {
    expect(DEFAULT_PROMPT_TEMPLATES.character).toContain("{{char}}");
    expect(DEFAULT_PROMPT_TEMPLATES.character).toContain("Begin your reply with: full body portrait,");
    expect(DEFAULT_PROMPT_TEMPLATES.face).toContain("Begin your reply with: close up facial portrait,");
    expect(DEFAULT_PROMPT_TEMPLATES.scenario).toContain("Begin your reply with: scene,");
    expect(DEFAULT_PROMPT_TEMPLATES.background).toContain("Begin your reply with: background,");
    // The background template forbids figures (environment only).
    expect(DEFAULT_PROMPT_TEMPLATES.background.toLowerCase()).toContain("no people");
  });

  test("caption instructions carry no macros (the image IS the subject) + their opening prefix", () => {
    expect(DEFAULT_CAPTION_INSTRUCTIONS.character_multimodal).not.toContain("{{");
    expect(DEFAULT_CAPTION_INSTRUCTIONS.character_multimodal).toContain("full body portrait,");
    expect(DEFAULT_CAPTION_INSTRUCTIONS.face_multimodal).toContain("close up facial portrait,");
  });

  test("the shipped negative base (via composeNegative, no user extra) suppresses the generic defects (text, watermark, bad anatomy)", () => {
    // PROSE-1 census 88 — the base is the `imagery.negative.base` slot; `composeNegative` only appends.
    const base = PROSE_SLOTS[IMAGERY_NEGATIVE_SLOT_ID].text;
    const negative = composeNegative(base, undefined);
    expect(negative).toBe(base);
    expect(negative).toContain("watermark");
    expect(negative).toContain("bad anatomy");
  });

  test("a user's per-request negative APPENDS to the base, never replaces it", () => {
    const base = PROSE_SLOTS[IMAGERY_NEGATIVE_SLOT_ID].text;
    expect(composeNegative(base, "  blurry  ")).toBe(`${base}, blurry`);
  });

  test("a host override of the negative-base slot reaches the composed negative", () => {
    const resolved = resolveProseText(IMAGERY_NEGATIVE_SLOT_ID, { [IMAGERY_NEGATIVE_SLOT_ID]: { text: "mine", baseVersion: 1 } });
    expect(composeNegative(resolved, "extra")).toBe("mine, extra");
  });
});

describe("ensurePrefix (the drift belt)", () => {
  test("prepends the mode prefix when the LLM dropped it", () => {
    expect(ensurePrefix("red hair, blue eyes", "character")).toBe("full body portrait, red hair, blue eyes");
    expect(ensurePrefix("a stormy cliff", "background")).toBe("background, a stormy cliff");
  });

  test("does not double-prepend when the prefix is already present (case-insensitive)", () => {
    expect(ensurePrefix("full body portrait, tall", "character")).toBe("full body portrait, tall");
    expect(ensurePrefix("Full Body Portrait, tall", "character")).toBe("Full Body Portrait, tall");
  });

  test('"free" mode passes through verbatim (no prefix)', () => {
    expect(ensurePrefix("a dragon over a castle", "free")).toBe("a dragon over a castle");
  });
});
