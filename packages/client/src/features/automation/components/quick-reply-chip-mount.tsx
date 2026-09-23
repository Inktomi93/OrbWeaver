// B3 — THE QUICK-REPLY CHIP SOURCE: automation's SECOND
// control source for chat's one above-composer band, and the first MEMBER-visible one. The S4 card source
// (`suggestion-card-mount.tsx`) is its sibling; this is the chips half the card fold's header reserves.
//
// It imports NO chat module and chat imports none of it — the §6c residency rule. Chat owns the MOUNT, the
// stacking law and the CLICK contract (send posts the text as the member's turn, compose seeds their composer
// — `chat-controls-band.tsx` `runControlAction`); this source owns ONLY which chips are live right now,
// published from its OWN fiber (`ChatControlSource.mount` is rendered as a component precisely so this file's
// hook — a room subscription — never runs in a loop at the host).
//
// WHY THE CHIP SETS LIVE IN THIS FIBER'S `useState` AND NOT A STORE: a surfaced chip is per-room, transient,
// and has no query and no durable row — it exists exactly as long as this room is open and this tab is
// attached, which is exactly this mount's lifetime. A store would outlive the subscription that feeds it and
// start lying on the next room. (The card source's own header, verbatim — the two sources share the shape.)
//
// THE RECONNECT RULE — the one place a live-only room forces a decision, and the SAME one the card source
// takes. The automation room is `resumable: false`: no cursor, no replay, no gap-heal read. So on every
// transition into a live socket the list is CLEARED rather than kept: during a disconnect the server may have
// surfaced or replaced chips this tab never saw, and a stale chip set is a lie about what the room is offering
// now. Losing a still-valid set costs one re-fire; keeping a dead one shows a member the wrong choices.
//
// CHIP SHAPE, per §3-S1 + the arm (`surface_quick_reply`): each choice becomes ONE `chip`-kind control whose
// action is a TEXT arm carrying the rendered `sendText` and the per-choice `mode` (`send` | `compose` — the
// arm's own axis; no `execute`, which is the card's front-door verb, never a chip's). The band caps the row
// and discloses the remainder; this source just flattens every live set in arrival order and lets the band
// own the cap.

import type { StreamRoomRef } from "@orb/contracts/stream";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useBusRoom } from "#data";
import type { ChatControl, ChatControlSourceMountProps } from "#lib";
import { sourceKey } from "../lib/apply-automation-bus-event.ts";
import type { SurfacedChipSet } from "../lib/apply-quick-reply-event.ts";
import { applyQuickReplyEvent } from "../lib/apply-quick-reply-event.ts";

/** Publish an empty list once when the source has nothing live (retiring anything it had raised). */
const NO_CHIPS: readonly SurfacedChipSet[] = [];

export function AutomationQuickReplyMount({ state, publish }: ChatControlSourceMountProps): ReactNode {
  const chatId = state.chatId;
  const [chipSets, setChipSets] = useState<readonly SurfacedChipSet[]>(NO_CHIPS);

  const ref: Extract<StreamRoomRef, { channel: "automation" }> | null = chatId === null ? null : { channel: "automation", chatId };
  useBusRoom<"automation">(ref, {
    onEvent: (frame) => setChipSets((prev) => applyQuickReplyEvent(prev, frame.event)),
    // A live-only room's reconnect: nothing to replay, so nothing may be trusted (see the header).
    onSocketLive: () => setChipSets(NO_CHIPS),
  });

  // THE PUBLISH, through a REF-BOX — the `useBusRoom`/card-source idiom, load-bearing here. The band's publish
  // guard is CONTENT-wise (`use-chat-controls.tsx`), so a publish that depends on `publish`'s IDENTITY would
  // re-run on every host render and, with a fresh array each time, is one un-memoized render from a loop.
  // Depending on the chip-set VALUE only makes that structurally impossible: the effect re-runs when the
  // surfaced chips change and at no other time. (No pending flag rides a chip — a click is a turn or a draft,
  // not a mutation this source owns — so the value axis is just `chipSets`.)
  const latest = useRef(publish);
  useEffect(() => {
    latest.current = publish;
  });

  useEffect(() => {
    const controls: readonly ChatControl[] = chipSets.flatMap((set) => {
      const key = sourceKey(set.source);
      return set.choices.map(
        (choice, index): ChatControl => ({
          kind: "chip",
          // Namespaced by origin + position: unique across the flattened list even when two rules surface a
          // same-labelled choice, and stable across a same-content re-fire so the band's guard can ignore it.
          id: `${key}#${index}`,
          action: { id: `${key}#${index}-action`, label: choice.label, mode: choice.mode, text: choice.sendText },
        }),
      );
    });
    latest.current(controls);
  }, [chipSets]);

  return null;
}
