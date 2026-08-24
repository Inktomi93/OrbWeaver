// parseImagineArgs — the /imagine argument grammar. A leading MODE_TRIGGER word (you/face/scene/background,
// the ONE contracts map) selects an extraction mode + the rest is a refinement; anything else is a verbatim
// free-mode prompt. Pins the case-fold, the whitespace trim, and the free-mode fallthrough.

import { parseImagineArgs } from "../../../../../packages/client/src/features/imagery/lib/imagine-command.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("parseImagineArgs: a bare invocation is free mode with an empty prompt", () => {
  expect(parseImagineArgs("")).toEqual({ mode: "free", prompt: "" });
  expect(parseImagineArgs("   ")).toEqual({ mode: "free", prompt: "" });
});

test("parseImagineArgs: a non-trigger remainder is a verbatim free-mode prompt", () => {
  expect(parseImagineArgs("a dragon over the castle")).toEqual({ mode: "free", prompt: "a dragon over the castle" });
  // A word that is not a trigger stays part of the free prompt (never silently dropped).
  expect(parseImagineArgs("dragon")).toEqual({ mode: "free", prompt: "dragon" });
});

test("parseImagineArgs: a leading trigger word selects its extraction mode", () => {
  expect(parseImagineArgs("you")).toEqual({ mode: "character", prompt: "" });
  expect(parseImagineArgs("face")).toEqual({ mode: "face", prompt: "" });
  expect(parseImagineArgs("scene")).toEqual({ mode: "scenario", prompt: "" });
  expect(parseImagineArgs("background")).toEqual({ mode: "background", prompt: "" });
});

test("parseImagineArgs: a trigger's remainder becomes the refinement prompt", () => {
  expect(parseImagineArgs("scene the tavern at dusk")).toEqual({ mode: "scenario", prompt: "the tavern at dusk" });
});

test("parseImagineArgs: the trigger match is case-insensitive and whitespace-trimmed", () => {
  expect(parseImagineArgs("You")).toEqual({ mode: "character", prompt: "" });
  expect(parseImagineArgs("  background  ")).toEqual({ mode: "background", prompt: "" });
});
