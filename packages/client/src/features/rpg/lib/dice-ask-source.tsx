// B8 — THE DICE-ASK CONTROL SOURCE (row B8): rpg's control source
// for chat's one above-composer band, and the GAME-ARM half of "checks". It imports NO chat module and chat
// imports none of it (the §6c residency rule): the door (`compose/authed-app.tsx`) appends it to the
// `chat-controls` registry beside automation's two sources, and chat renders it blind through the single
// mount. Chat owns the MOUNT, the stacking law, and the CLICK contract; this source owns only which controls
// are live and what an `execute` click does.
//
// IT IS A GAME ARM. The chips appear ONLY on an engaged rpg game chat — the ONE game-ness predicate every rpg
// context contribution gates on (`isRpgEngaged` off the CACHE-FIRST `chat.getChat.rpg` pointer, the
// `makeIsGameChat`/`rpg-game-chat.ts` read). On a plain chat (or a disengaged game) this publishes nothing and
// the band collapses (`empty:hidden`) — byte-identical to a build without the source. This is a SELF-CONTAINED
// cross-domain read: rpg reads chat's SERVER entity through the `#data` tRPC channel (lockdown §12), never by
// importing chat.
//
// WHY CHIPS, NOT A CARD (the standing-affordance decision): the ask is a STANDING entry point on every game
// turn, not a transient one-shot. A card competes for the band's ONE visible-card slot (`CARD_DISPLAY_CAP`,
// shared with automation's S4 suggestion cards), so a permanent dice card would mask every real ask behind a
// "+1 pending". Chips have their own capped row and are the right home for a standing affordance. Each chip is
// `execute`-mode (a front-door VERB, never a turn): its click calls `rpg.rollDice` (server CSPRNG, bake-once),
// and on the baked result it INSERTS the returned stamp (`[dice: d20 → 14]`) into THIS room's composer draft
// (the server verb's own contract — "the result returned for the composer stamp the client inserts") so the
// member sends it as their turn (result = CANON) and the narration reacts. Insert = APPEND (never replace): a
// member who typed "I attack —" keeps it, and the stamp rides after.
//
// THE DICE SET FOLLOWS THE GAME'S RULESET (#862 + the side-eye 2026-08-30 dead-toggle finding). It used to
// be a module constant gated only on `isRpgEngaged`, so a FREEFORM game — a table with no attributes and no
// dice, whose own start-door copy promised prose steering — published four d20-family chips above the
// composer anyway, eating ~110px of a 430px composer's budget. The set is now `RPG_RULESET_DICE[ruleset]`,
// read off `getGame`'s member-safe `publicConfig`: `d20` publishes its four, `freeform` publishes NONE and
// the band collapses (`empty:hidden`) exactly as on a plain chat. That is also what makes the host's ruleset
// setting VISIBLE to every member — without it the setting would have no consequence anyone can see.
//
// THE PUBLISH DEPENDS ON VALUES, NEVER CLOSURE IDENTITY (the `quick-reply-chip-mount`/`suggestion-card-mount`
// idiom, load-bearing): the band's publish guard is CONTENT-wise, so a publish that depended on the `run`
// closures' identity would re-run every host render and, with fresh closures each time, is one un-memoized
// render from a loop. The publish effect depends only on `[engaged, rolling]`; the `run` closure (and the
// `rollDice`/`chatId` it needs) rides a ref-box.

import { isRpgEngaged, RPG_RULESET_DICE } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { useEffect, useRef } from "react";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import type { ChatControl, ChatControlSource, ChatControlSourceMountProps } from "#lib";
import { readComposerDraft, requestComposerFocus, setComposerDraft } from "#state";
import { useRollDice } from "../hooks/use-rpg-mutations.ts";

/** The registry key — one source, one id; the band namespaces this source's chip ids under it. */
const RPG_DICE_ASK_SOURCE_ID = "rpg-dice-ask";

/** Append the baked stamp to the room's composer draft (never replace — a member's typed text is theirs) and
 *  focus the composer, so the roll rides after whatever they were writing and they send it as their turn. */
function insertStamp(chatId: ChatId, stamp: string): void {
  const current = readComposerDraft(chatId);
  setComposerDraft(chatId, current === "" ? stamp : `${current} ${stamp}`);
  requestComposerFocus(chatId);
}

/** The publish-only fiber (rendered as a component so its hooks — a cache-first read + a mutation — live in
 *  their own fiber, never a loop at the host). Renders `null`. */
function RpgDiceAskMount({ state, publish }: ChatControlSourceMountProps): null {
  const chatId = state.chatId;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const rollDice = useRollDice({ trpc, invalidation });
  // The ONE game-ness gate, cache-first off the pointer chat already holds (`makeIsGameChat`, verbatim read):
  // `undefined` while uncached ⇒ not engaged, re-evaluated when the query settles.
  const { data: detail } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const engaged = isRpgEngaged(detail?.rpg ?? null);
  // The RULESET read — gated on engagement, so a plain chat still issues nothing. `undefined` while the
  // game read is in flight publishes no chips: the row appears WITH the ruleset that justifies it, never a
  // guessed default that would flash the wrong set on a freeform table.
  const { data: game } = useGatedQuery(engaged ? chatId : null, (id) => trpc.rpg.getGame.queryOptions({ chatId: id }));
  const ruleset = game?.publicConfig.ruleset;
  const rolling = rollDice.isPending;

  // The ref-box: `rollDice.mutate` and `chatId` are read by the `run` closures the publish effect builds, but
  // depending on their identity would re-run that effect every render (the identity-driven loop the guard
  // cannot save us from). The effect depends on VALUES only (`engaged`/`rolling`); the box carries the rest.
  const latest = useRef({ publish, mutate: rollDice.mutate, chatId });
  useEffect(() => {
    latest.current = { publish, mutate: rollDice.mutate, chatId };
  });

  useEffect(() => {
    const box = latest.current;
    const notations = ruleset === undefined ? [] : RPG_RULESET_DICE[ruleset];
    if (!engaged || box.chatId === null || notations.length === 0) {
      box.publish([]);
      return;
    }
    const roomId = box.chatId;
    const controls: readonly ChatControl[] = notations.map(
      (notation): ChatControl => ({
        kind: "chip",
        id: `${RPG_DICE_ASK_SOURCE_ID}#${notation}`,
        action: {
          id: `${RPG_DICE_ASK_SOURCE_ID}#${notation}-action`,
          label: `Roll ${notation}`,
          mode: "execute",
          // The source owns the verb: the roll bakes once server-side, and its stamp lands in this room's
          // composer for the member to send (canon). `errorToast` on the mutation owns the failure arm.
          run: (): void => box.mutate({ chatId: roomId, notation }, { onSuccess: (result): void => insertStamp(roomId, result.stamp) }),
          // Only the source can say a verb is in flight — the band never invents a pending state. One mutation
          // backs every chip, so a live roll disables the whole set (a check is fast; no double-fire while it bakes).
          pending: rolling,
        },
      }),
    );
    box.publish(controls);
  }, [engaged, rolling, ruleset]);

  return null;
}

/** The B8 dice ask — a game-arm S1 control source. `mount` is rendered as a COMPONENT by the band, so its
 *  hooks live in their own fiber. */
export const rpgDiceAskSource: ChatControlSource = {
  id: RPG_DICE_ASK_SOURCE_ID,
  mount: RpgDiceAskMount,
};
