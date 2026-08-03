// Unit: token estimation (features/preset/components/prompt-assembly/estimate-tokens). PURE, node lane,
// DEEP import. Proves the per-section-type text selection (literal content, templated marker
// template-or-default, plain marker 0) over the ONE `@orb/kit/tokens` estimator (tested in its own suite).
// A UI HINT only — never a server/macro call (BUILD-SPEC §2.1).

import type { PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES } from "@orb/contracts/preset";
import { estimateSectionTokens } from "../../../../../../packages/client/src/features/preset/components/prompt-assembly/estimate-tokens.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

test("literal section estimates over its content", () => {
  const section: PromptSection = {
    type: "literal",
    id: "a",
    name: "a",
    role: "system",
    content: "abcdefgh", // 8 chars ⇒ 2
    enabled: true,
  };
  expect(estimateSectionTokens(section)).toBe(2);
});

test("templated marker with no custom template falls back to the factory default", () => {
  const section: PromptSection = {
    type: "marker",
    id: "d",
    name: "d",
    marker: "char_description",
    role: "system",
    enabled: true,
  };
  const defaultLen = DEFAULT_MARKER_TEMPLATES.char_description.length;
  expect(estimateSectionTokens(section)).toBe(Math.ceil(defaultLen / 4));
});

test("templated marker with a custom template estimates over the custom text", () => {
  const section: PromptSection = {
    type: "marker",
    id: "m",
    name: "m",
    marker: "main_prompt",
    role: "system",
    enabled: true,
    template: "abcdefghijkl", // 12 chars ⇒ 3, ignores the empty main_prompt default
  };
  expect(estimateSectionTokens(section)).toBe(3);
});

test("plain marker (chat_history) contributes 0 — no author text of its own", () => {
  const section: PromptSection = {
    type: "marker",
    id: "h",
    name: "h",
    marker: "chat_history",
    role: "system",
    enabled: true,
  };
  expect(estimateSectionTokens(section)).toBe(0);
});
