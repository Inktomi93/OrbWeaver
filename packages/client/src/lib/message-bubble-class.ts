// THE bubble box — one home for the class string that paints a message bubble, read by both the live
// transcript (the bubble-family row skins in features/chat) and the theme editor's live preview. They are
// the same box BY CONSTRUCTION, so a retune cannot drift the preview off the real thing: the 2026-08-01
// side-eye caught the preview shipping `rounded-base p-block` (r=6, pad 12) against the transcript's
// `rounded-card px-block py-row` (r=10, py=8) — a theme author was judging colours in a box the app never
// paints.
//
// It lives in lib/, not features/chat/, because a RUNTIME cross-feature import is dep-cruiser RED
// (.dependency-cruiser.cjs "Client features stay independent: … TYPE-ONLY imports across features ARE
// allowed"), and settings needs the VALUE. lib/ is the tier both features may read (the `message-render` /
// `message-role-labels` precedent).
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
 *  question, not a mechanical re-point — filed, not guessed. Same refusal at
 *  `features/chat/lib/message-row-variants.ts`'s `document` skin. */
export function messageBubbleClass(role: MessageRole): string {
  // `cn` is typed `string | undefined` (never undefined at runtime) — coalesce so callers get a `string`.
  return cn("w-fit max-w-prose rounded-card px-block py-row", BUBBLE_TOKENS[role]) ?? "";
}
