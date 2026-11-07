// A status chip's vocabulary is total over its union, and only a member of that union reaches the chip.
import type { StatusVocabulary } from "@orb/client/components";
import { StatusChip } from "@orb/client/components";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

type Phase = "up" | "down";

const PHASES: StatusVocabulary<Phase> = { up: { label: "Up", tone: "success" }, down: { label: "Down", tone: "destructive" } };

test("a member paints; a stray word, a bare string or an unmapped member does not compile", () => {
  createElement(StatusChip<Phase>, { status: "up", vocabulary: PHASES });
  // @ts-expect-error a word outside the union
  createElement(StatusChip<Phase>, { status: "restarting", vocabulary: PHASES });
  const wire: string = "up";
  // @ts-expect-error a wire string is not a member until it is parsed
  createElement(StatusChip<Phase>, { status: wire, vocabulary: PHASES });
  // @ts-expect-error a new member needs its tone and its word
  const partial: StatusVocabulary<Phase> = { up: { label: "Up", tone: "success" } };
  // @ts-expect-error a status tone is one of the pill's tones
  const offTone: StatusVocabulary<"up"> = { up: { label: "Up", tone: "accent" } };
  expectTypeOf(partial).toEqualTypeOf<StatusVocabulary<Phase>>();
  expectTypeOf(offTone).toEqualTypeOf<StatusVocabulary<"up">>();
});
