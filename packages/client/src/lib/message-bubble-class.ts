// The transcript and theme preview share this value; cross-feature runtime imports are forbidden.
import type { MessageRole } from "@orb/kit/message-role";
import { cn } from "@orb/ui/lib";

/** The per-role fill + ink. Themeable: every token here is a ThemeScope-overridable custom property. */
const BUBBLE_TOKENS: Record<MessageRole, string> = {
  user: "bg-user-bubble text-user-bubble-foreground",
  assistant: "bg-ai-bubble text-ai-bubble-foreground",
  system: "bg-system-bubble text-system-bubble-foreground",
};

/** The bubble box for a role. `w-fit` (D66 N3) so a short reply hugs its text instead of stretching the
 *  whole reading column; `max-w-prose` still caps the long-form line length.
 *
 *  `max-w-prose` STAYS HERE, AND IT IS THE ONE PLACE IT DOES (#1175, refused with a receipt). Everywhere
 *  else in the client the utility was a third, un-derived width and was re-pointed at a token. Not the
 *  TRANSCRIPT: the owner ruled #1145 (2026-09-02) "SPLIT the token, do not narrow the transcript" —
 *  `--reading-measure` (75ch) stays the transcript's and `--reading-measure-prose` (47ch) is the
 *  TEACHING/BODY measure, so re-pointing a message bubble at the prose token would narrow the transcript
 *  against that ruling. And the two tokens whose VALUE matches 65ch are not spellable here either:
 *  `--reading-measure-min` is a MIN-WIDTH floor (globals.css consumes it as `min-width`), so using it as a
 *  ceiling would invert the token's own contract. A transcript bubble cap is therefore an OPEN ruling
 *  question, not a mechanical re-point — filed, not guessed. */
export function messageBubbleClass(role: MessageRole): string {
  // `cn` is typed `string | undefined` (never undefined at runtime) — coalesce so callers get a `string`.
  // eslint-disable-next-line orb/no-banned-tw-utility -- The shrink-to-fit transcript cap is not the teaching/prose measure; remove when a transcript cap is ruled and gets its own token.
  return cn("w-fit min-w-0 max-w-prose rounded-card px-block py-row", BUBBLE_TOKENS[role]) ?? "";
}
