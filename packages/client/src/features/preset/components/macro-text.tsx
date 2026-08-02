// MacroText — THE ONE way the preset surface prints a template as a template (side-eye F-1 ruling 1,
// 2026-08-03: "braces + chip wins"). Literal prose renders as text; a `{{macro}}` reference renders as an
// inline chip that PRINTS ITS BRACES.
//
// WHY THIS FILE EXISTS. Three spellings of one thing shipped side by side:
//   · `{{char}}` raw mono in the editor textarea — correct, it is the editable SOURCE;
//   · `{{input}}` as a braced chip in the Actions readout — correct;
//   · `char` / `description` / `guided_instruction` BARE in the Prompt view's assembled preview — wrong,
//     and wrong in the one place whose entire job is "here is what the model actually receives". The
//     preview rendered `You are char in an immersive, ongoing roleplay with user.` — broken English in
//     which nothing distinguishes the macro `description` from the word "description", and which leaked
//     the snake_case internal key `guided_instruction` into user-facing copy as if it were prose.
// The braced chip wins because the braces are the vocabulary the user TYPES (so a preview must echo the
// string they would search for), and because the chip is the only thing that makes a placeholder visually
// distinct from the sentence around it. The bare form is unrecoverable — there is nothing to recover FROM.
//
// So the spelling is homed HERE, once, and both readers import it. A renderer is a sanctioned home for
// macro DISPLAY (the tokenizer `scanMacroRuns` is explicitly not a resolver — see
// scripts/check/gates/macro-resolution-home.ts): this file chips a template AS a template and resolves
// nothing.
//
// THE CHIP IS `size="inline"` (side-eye F-6): a run of prose is a LINE BOX, and an `inline-flex` chip with
// vertical padding and its own line-height builds a 28px box inside a 20px line — every line carrying a
// macro shoved its neighbours apart, and the chip's side padding detached the following punctuation
// (`{{user}} 's voice`). The inline arm inherits the run's type metrics and prints no padding, so the
// rhythm of a paragraph is arithmetically identical with and without macros in it.

import type { MacroRun } from "@orb/kit/macro";
import { Badge } from "@orb/ui/badge";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

export interface MacroTextProps {
  readonly tokens: readonly MacroRun[];
  /**
   * `quoted` (default) frames the run as the bordered mono block the surface uses whenever it QUOTES the
   * wire — what the model receives is an artifact, and dropping the box let it read as one more paragraph
   * of the panel's own copy, which is the one thing a preview must never be mistaken for.
   * `bare` is for a run that already sits inside a box of its own (the assembled preview's click-through
   * block button); a second frame there would be the box-in-box CD2 defect.
   */
  readonly frame?: "quoted" | "bare";
}

/** The quoted frame's chrome — a bordered, tinted mono block. Spelled once; the `bare` arm drops it. */
const QUOTED_FRAME = "rounded-base border border-border bg-muted/40 p-row";
/** Both arms preserve authored whitespace and break long unbroken tokens rather than overflowing. */
const RUN_FLOW = "whitespace-pre-wrap break-words";

/** A template rendered as a template: prose as text, `{{macro}}` references as braced inline chips. */
export function MacroText({ tokens, frame = "quoted" }: MacroTextProps): ReactElement {
  return (
    <Text className={frame === "quoted" ? `${RUN_FLOW} ${QUOTED_FRAME}` : RUN_FLOW} prose={true} voice="datum">
      {tokens.map(
        (token, i): ReactNode =>
          token.kind === "macro" ? (
            // A text token stays a bare string child — strings in a `ReactNode[]` need no key, only
            // elements do. The key is index+value because the run is render-stable per template.
            <Badge intent="info" key={`${String(i)}-${token.value}`} size="inline">
              {`{{${token.value}}}`}
            </Badge>
          ) : (
            token.value
          ),
      )}
    </Text>
  );
}
