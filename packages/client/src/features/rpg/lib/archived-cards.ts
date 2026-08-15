// The ONE transcript→card projection ("chrome designed once,
// used in three homes"): tokenize the visible transcript's SELECTED-variant bodies and collect the
// immersive-card spans. Shared by the Scene "Cards" archive (newest-first title list) and the Journal
// chronicle (cards archived into the day they were born — the §4 "Journal" rule), so both lenses read the
// SAME projection of the same cache entry (`trpc.chat.listMessages` — lockdown §12 direct read).

import type { ParticipantView } from "@orb/contracts/chat";
import type { CardSpanOrigin } from "@orb/kit/content";
import { tokenizeContent } from "@orb/kit/content";
import type { CharacterId, MessageId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { resolveRowRenderPolicy } from "#lib";

/** One archived card projected from the visible transcript, stamped with its birth time (`createdAt` —
 *  the origin MESSAGE's wall time; Journal's day-grouping key). */
export interface ArchivedCard {
  readonly key: string;
  /** The origin message — the row's TurnRef anchor (§12.1.4 "only where the data really carries a ref"). */
  readonly messageId: MessageId;
  readonly title: string | null;
  readonly html: string;
  readonly origin: CardSpanOrigin;
  readonly createdAt: number;
  /** The ORIGIN ROW's resolved external-media verdict (`lib/render-trust`, the ONE trust authority the
   *  transcript's inline render uses). Carried per card because it is a per-AUTHOR fact: the archive shows
   *  cards from every speaker, so one blanket verdict for the surface would either over-block or — worse —
   *  paint an image the transcript blocked one panel away. Absent roster ⇒ false (fail closed). */
  readonly allowExternalMedia: boolean;
  /** The AUTHORING participant — the card-frame doorway POLICY SELECTOR the routed frame is minted with.
   *  Carried per card for the same per-AUTHOR reason `allowExternalMedia` is: the archive shows every
   *  speaker's cards, so a single surface-wide selector would mint one character's policy for another's
   *  bytes. `null` for a user/system-authored card ⇒ the server floor. */
  readonly characterId: CharacterId | null;
}

/** The transcript row fields the projection reads: the body + its birth time, plus the ATTRIBUTION the
 *  render policy resolves from (`chat.listMessages` carries all six). */
interface ArchivedCardSource {
  readonly id: MessageId;
  readonly content: string;
  readonly createdAt: number;
  readonly role: MessageRole;
  readonly authorUserId: UserId | null;
  readonly characterId: CharacterId | null;
}

/** The roster + viewer the per-row policy resolves against — the same `chat.getChat` read the takeover
 *  already holds. `participants` absent (still loading) resolves every card to the safe floor. */
interface ArchivedCardViewer {
  readonly participants: readonly ParticipantView[] | undefined;
  readonly viewerUserId: UserId | null;
}

const CARD_LABEL = "Immersive card";

/** Collect the card spans from the transcript's messages, TRANSCRIPT ORDER (oldest first — callers own
 *  their sort). The lenient arm is ON to match the game reading surface. */
export function collectArchivedCards(messages: readonly ArchivedCardSource[], viewer: ArchivedCardViewer): readonly ArchivedCard[] {
  // The by-character index the trust resolver reads. Built here rather than imported from chat's roster
  // helper — a cross-feature RUNTIME import is banned, and this is a lookup, not a second copy of the rule.
  const byCharacter = new Map<CharacterId, ParticipantView>();
  for (const participant of viewer.participants ?? []) {
    if (participant.characterId !== null) {
      byCharacter.set(participant.characterId, participant);
    }
  }
  const cards: ArchivedCard[] = [];
  for (const message of messages) {
    const policy = resolveRowRenderPolicy({
      role: message.role,
      authorUserId: message.authorUserId,
      characterId: message.characterId,
      viewerUserId: viewer.viewerUserId,
      participants: byCharacter,
    });
    tokenizeContent(message.content, { lenientHtml: true, committed: true }).forEach((span, index) => {
      if (span.kind === "card") {
        cards.push({
          key: `${message.id}-${index}`,
          messageId: message.id,
          title: span.title,
          html: span.body,
          origin: span.origin,
          createdAt: message.createdAt,
          allowExternalMedia: policy.allowExternal,
          characterId: message.characterId,
        });
      }
    });
  }
  return cards;
}

/** The label a card renders under — its title, or the untitled fallback. */
export function cardLabel(title: string | null): string {
  return title !== null && title !== "" ? title : CARD_LABEL;
}
