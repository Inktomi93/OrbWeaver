// The author scope's words and its set operations. A selector names who wrote a row by the row's own stamps
// (`@orb/kit/regex` `RegexAuthorSelector`); the editor lists the chosen ones and offers the rest.
//
// THE WORDS. "People" and "Characters" are the room's names for its two kinds of seat (`docs/law/vocabulary-map.md`,
// the members panel's `People` and `Characters` lists). "Narration" names group narration, whose speaker the
// transcript calls "Narrator" (`packages/client/src/features/chat/lib/attribution.ts`). The other two message
// kinds have no user-facing word anywhere in the app, so the editor never offers them; the labels below only name
// a stored selector that arrived in a file. "The host" and "Other players" name room standing, read as the room is
// now by the kit's `standingOf`.

import type { MessageKind, ParticipantKind, ParticipantRole } from "@orb/kit/message-author";
import type { RegexAuthorScope, RegexAuthorSelector } from "@orb/kit/regex";
import { REGEX_STANDING_HOST_NAME, REGEX_STANDING_MEMBER_NAME } from "./regex-names.ts";

export const REGEX_PARTICIPANT_LABELS: Record<ParticipantKind, string> = {
  human: "People",
  character: "Characters",
};

export const REGEX_STANDING_LABELS: Record<ParticipantRole, string> = {
  host: REGEX_STANDING_HOST_NAME,
  member: REGEX_STANDING_MEMBER_NAME,
};

/** How a standing selector reads, said once under the lists. */
export const REGEX_STANDING_NOTE =
  "The host and other players are read from who is seated now. A character's message, or one by someone who has left, is neither.";

export const REGEX_MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  narrator: "Narration",
  standard: "Messages that are not narration or comments",
  comment: "Comments",
};

/** The message kinds the add menu offers. */
export const REGEX_OFFERED_MESSAGE_KINDS: readonly MessageKind[] = ["narrator"];

/** The scope an absent field reads as: everyone. */
export const REGEX_EVERY_AUTHOR: RegexAuthorScope = { include: [], exclude: [] };

/** A stable identity for one selector, for React keys and for "already chosen". */
export function regexSelectorKey(selector: RegexAuthorSelector): string {
  switch (selector.by) {
    case "participant":
      return `participant:${selector.participant}`;
    case "standing":
      return `standing:${selector.standing}`;
    case "kind":
      return `kind:${selector.kind}`;
    case "character":
      return `character:${selector.characterId}`;
    case "persona":
      return `persona:${selector.personaId}`;
    case "user":
      return `user:${selector.userId}`;
    default:
      return assertNeverSelector(selector);
  }
}

function assertNeverSelector(selector: never): never {
  throw new Error(`unhandled regex author selector ${JSON.stringify(selector)}`);
}

/** The list with `selector` added, unless it is already there. */
export function withSelector(list: readonly RegexAuthorSelector[], selector: RegexAuthorSelector): RegexAuthorSelector[] {
  const key = regexSelectorKey(selector);
  return list.some((member) => regexSelectorKey(member) === key) ? [...list] : [...list, selector];
}

/** The list without `selector`. */
export function withoutSelector(list: readonly RegexAuthorSelector[], selector: RegexAuthorSelector): RegexAuthorSelector[] {
  const key = regexSelectorKey(selector);
  return list.filter((member) => regexSelectorKey(member) !== key);
}
