// domain/chat/substrate/participant-actor — the pure chat_participants kind-shape parser and the seat predicates
// every roster-derived read narrows through. No row access: callers pass the rows they loaded.

import type { ParticipantKind } from "@orb/contracts/chat";
import { isUserBacked } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { ParticipantActor } from "../contract/participant-row.ts";

/** The row shape {@link classifyParticipant} discriminates. */
interface ParticipantRowShape {
  readonly kind: ParticipantKind;
  readonly userId: UserId | null;
  readonly characterId: CharacterId | null;
}

/** Discriminate a `chat_participants` row's actor — the pure, non-throwing classify (owner-ruled
 *  one-home consolidation). `null` on an XOR violation (the DB CHECK should already guarantee
 *  `userId`/`characterId` are exclusive — a `null` here is the corrupt-row case) or an unrecognized kind.
 *  `default` is `never`-exhaustive against {@link ParticipantKind}'s today's two live kinds
 *  (`human`/`character`; `agent` was purged with the rollback and has no live row shape — see
 *  `contracts/chat/participants.ts`'s header), so a reintroduced kind fails to compile here until handled.
 *
 *  THE ONE HOME for the `kind === "human" && userId !== null`-shaped narrowing every roster-derived read
 *  needs — 29 call sites across the domain would otherwise re-spell this inline
 *  (`loadParticipants`'s hot read never throws on a corrupt row; a `.filter`/`.flatMap`/`.find` site's silent-skip
 *  semantics are preserved by discarding a `null` classification exactly the way the inline guard already
 *  discarded a failed condition). */
export function classifyParticipant(row: ParticipantRowShape): ParticipantActor | null {
  switch (row.kind) {
    case "human":
      return row.userId !== null && row.characterId === null ? { kind: "human", userId: row.userId } : null;
    case "character":
      return row.characterId !== null && row.userId === null ? { kind: "character", characterId: row.characterId } : null;
    default:
      return classifyUnrecognizedKind(row.kind);
  }
}

/** The `default:` arm's fail-CLOSED verdict, and the reason it is a function rather than a `never` binding
 *  returned inline. The old spelling assigned `row.kind` to a `never`-typed local and
 *  RETURNED that local: compile-time exhaustive, but the raw runtime string at runtime. A row whose `kind`
 *  is neither live kind therefore classified as that STRING, which is not `null` — so
 *  `classifyParticipant(row)?.kind === "human"` readers saw a truthy actor carrying no `userId`. Reaching
 *  this arm needs a row that bypassed the
 *  `chat_participants_kind_check` DB CHECK (a hand-written row, a restored dump, a future kind added to the
 *  CHECK before this switch) -- exactly the corrupt-row case this classifier exists to absorb. The `never`
 *  parameter keeps the compile-time half intact: a reintroduced {@link ParticipantKind} member fails `tsc`
 *  HERE until it has its own `case`. (Shape precedent: `infra/providers/backends/agent-sdk/verify.ts`'s
 *  `assertNeverClassification` -- exhaustive at compile time, total and non-throwing at runtime.) */
function classifyUnrecognizedKind(_kind: never): null {
  return null;
}

/** Every character seat's id, in roster order, each once (a corrupt row is skipped, as {@link classifyParticipant} does). */
export function characterIdsOf(rows: readonly ParticipantRowShape[]): CharacterId[] {
  const ids: CharacterId[] = [];
  for (const row of rows) {
    const actor = classifyParticipant(row);
    if (actor?.kind === "character" && !ids.includes(actor.characterId)) {
      ids.push(actor.characterId);
    }
  }
  return ids;
}

/** The room's subject character when a request names none: the first character seat in roster order. The
 *  imagery shaper resolves `{{char}}` to it, so a chat-generated picture was generated for it and joins its
 *  gallery. `null` for a room with no character seat. */
export function firstCharacterIdOf(rows: readonly ParticipantRowShape[]): CharacterId | null {
  return characterIdsOf(rows)[0] ?? null;
}

/** The PRINCIPAL kill-switch arm of the present-and-contributing predicate. Wired for `human` (owner-ruled)
 *  through `substrate/participants-humans.ts::presentAndEnabledHumanUserIdsOf` — the ONE async
 *  narrowing every consent-set consumer (`verbs/turn.ts`'s `loadRoom`, `setChatAnchorPersona`'s pin
 *  validation, `edit.ts`'s runOnEdit re-apply + greeting re-bake) routes through, so a disabled human's
 *  backing `users.enabled` drops their persona from EVERY reader of the room's foreign-input consent set the
 *  round after the flip, not just the one a lone-symbol wiring pass happened to touch (containment is a
 *  one-row flip, read fresh per round via the injected `ctx.resolveUserEnabled`). Today's only
 *  USER_BACKED_KINDS member is `human` (`character` has no backing user, so `enabled` never gates it —
 *  returns `true` regardless); an `agent` kind, if it ever re-lands (D60),
 *  extends automatically — this predicate's mechanism was never kind-specific. Consumes
 *  {@link isUserBacked} so a 5th kind is caught upstream. */
export function isBackingUserEnabled(kind: ParticipantKind, enabled: boolean): boolean {
  return isUserBacked(kind) ? enabled : true;
}
