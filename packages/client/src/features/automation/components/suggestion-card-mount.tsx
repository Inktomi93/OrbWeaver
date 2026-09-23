// S4 — THE SUGGESTION CARD SOURCE: automation's control source
// for chat's one above-composer band. It is the FIRST client consumer the automation bus has ever had.
//
// It imports NO chat module and chat imports none of it — the §6c residency rule. Chat owns the MOUNT, the
// stacking law and the click contract; this source owns only "which controls are live right now", published
// from its OWN fiber (`ChatControlSource.mount` is rendered as a component precisely so this file's hooks —
// a room subscription, two mutations, a timer — never run in a loop at the host).
//
// WHY THE ASKS LIVE IN THIS FIBER'S `useState` AND NOT IN A STORE: a pending ask is per-room, host-only, and
// has no query and no durable row (RULED F1 — the server's map is in RAM). It exists exactly as long as this
// room is open and this tab is attached, which is exactly the lifetime of this mount. A store would outlive
// the subscription that feeds it and start lying on the next room.
//
// THE RECONNECT RULE — the one place a live-only room forces a decision. The automation room is
// `resumable: false`: no cursor, no replay, no gap-heal read (there is nothing to re-read). So on every
// transition into a live socket the list is CLEARED rather than kept: during a disconnect the server may
// have swept, voided (a host handoff), or replaced any ask, and a card that survives a gap is a card whose
// confirm can only refuse. Losing a still-valid ask costs one re-fire; keeping a dead one costs the host a
// click that fails.
//
// CARD SHAPE, per §3-S1 + authoring law 5: one `execute`-mode action (a front-door verb, never a turn — so
// it is disabled ONLY while its own mutation pends, never by the room's turn phase), plus the REQUIRED
// explicit dismiss. Neutral/outline buttons; the composer's Send stays the room's one primary. The band
// renders the newest card and discloses the rest as "+N pending" — this source publishes oldest-first and
// lets the band own that law.

import type { StreamRoomRef } from "@orb/contracts/stream";
import type { AutomationSuggestionId } from "@orb/kit/ids";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { DiffView } from "@orb/ui/diff";
import { ScrollArea } from "@orb/ui/scroll-area";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useBusRoom, useInvalidation, useTRPC } from "#data";
import type { ChatControl, ChatControlSourceMountProps } from "#lib";
import { timeLib } from "#lib";
import type { PendingAsk } from "../lib/apply-automation-bus-event.ts";
import { applyAutomationBusEvent, pruneExpiredAsks } from "../lib/apply-automation-bus-event.ts";
import { useConfirmSuggestion, useDismissSuggestion } from "../lib/suggestion-mutations.ts";

/** The button that answers each class. A confirm-first card asks about a CONCRETE act the summary already
 *  named, so its verb is the plain yes; an invitation asks about a rate-capped rule, so its verb names what
 *  the confirm actually does — one fresh run, now. */
const CONFIRM_LABEL = { confirm: "Do it", invitation: "Run now" } as const;

/** Publish an empty list once when the source has nothing live (retiring anything it had raised). */
const NO_ASKS: readonly PendingAsk[] = [];

/** ARM A's error gate: on a take that REJECTED, is the ask provably gone from the server's store? A
 *  `SuggestionNotFoundError` maps to NOT_FOUND (`transport/error-mapping.ts`) and collapses every way an ask
 *  can be already-gone — never existed, already taken, TTL-swept, voided — so retiring the local card is
 *  correct and a second click would only earn the "no longer available" toast on an answered card. A FORBIDDEN
 *  (a demoted host) leaves the ask ALIVE server-side, so that card must STAY; the errorToast still speaks. The
 *  structured `data.code` is the discriminator, never message text (the `use-recompute-stats`/`stale-session`
 *  precedent). */
function isSuggestionGone(error: unknown): boolean {
  return (error as { data?: { code?: string } } | null | undefined)?.data?.code === "NOT_FOUND";
}

/** C3's card BODY — the rewrite behind a disclosure, closed by default.
 *
 *  WHY COLLAPSED: the band sits above the composer in the room's reading column, and a rewrite is a whole
 *  reply's worth of text. Expanded by default it would push the transcript off-screen to ask a question the
 *  title already asks ("Fix the last reply — repeats itself?"), which is the one-visible-card attention budget
 *  spent on a body most hosts answer without reading. Open it and the diff is exact.
 *
 *  The diff is the SEALED `@orb/ui/diff` primitive at word granularity: a prose repair moves words, and the
 *  char mode renders a single-letter tense fix as confetti inside otherwise-identical sentences. */
function RewriteDetail({ before, after }: { readonly before: string; readonly after: string }): ReactNode {
  return (
    <Collapsible>
      <CollapsibleTrigger>Show the change</CollapsibleTrigger>
      <CollapsiblePanel>
        {/* Capped and scrolled: a rewrite may be a whole long reply, and an uncapped panel would push the
            transcript out of the room to show it. `wrapContent` because the diff is a prose column whose
            width is the viewport's — without it Base UI's fit-content Content lays it out at max-content and
            the paragraphs never wrap. */}
        <ScrollArea viewportClassName="max-h-48" wrapContent={true}>
          <DiffView before={before} after={after} mode="words" />
        </ScrollArea>
      </CollapsiblePanel>
    </Collapsible>
  );
}

export function AutomationSuggestionMount({ state, publish }: ChatControlSourceMountProps): ReactNode {
  const chatId = state.chatId;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const confirm = useConfirmSuggestion({ trpc, invalidation });
  const dismiss = useDismissSuggestion({ trpc, invalidation });
  const [asks, setAsks] = useState<readonly PendingAsk[]>(NO_ASKS);

  // ARM A — THE ACTING TAB'S OWN RETIREMENT (#700). The confirm/dismiss verbs delete the ask from the server's
  // in-RAM store, but nothing on this tab drops the card for it: the mutations are `busDriven` with NO query to
  // refetch (RULED F1), the client fold only hears `suggestionRaised`, and this room is live-only. So the card
  // sat rendered and re-enabled until TTL (30 min) / reconnect / a same-source re-raise — and as the band's
  // `cards.at(-1)` it MASKED every older pending card behind a lying "+N pending". The take is the transition
  // `suggestion-mutations.ts` documents, so we make it real here: on the mutation's own resolution the source
  // retires its row. This is the OPTIMISTIC, immediate half; the `suggestionResolved` bus member is what retires
  // the same card on the host's OTHER tabs/devices (which have no query/replay to catch up on).
  const retire = (id: AutomationSuggestionId): void => setAsks((prev) => prev.filter((a) => a.id !== id));

  const ref: Extract<StreamRoomRef, { channel: "automation" }> | null = chatId === null ? null : { channel: "automation", chatId };
  useBusRoom<"automation">(ref, {
    onEvent: (frame) => setAsks((prev) => applyAutomationBusEvent(pruneExpiredAsks(prev, timeLib.now()), frame.event)),
    // A live-only room's reconnect: nothing to replay, so nothing may be trusted (see the header).
    onSocketLive: () => setAsks(NO_ASKS),
  });

  // The TTL edge. The server sweeps on its own injected clock; this timer is the client half of the SAME
  // deadline, so an unanswered card leaves the band instead of sitting there until the next event happens
  // to prune it. ONE timer for the EARLIEST expiry — not one per ask — re-armed as the list changes.
  const nextExpiry = asks.reduce<number | null>((soonest, ask) => (soonest === null || ask.expiresAt < soonest ? ask.expiresAt : soonest), null);
  useEffect(() => {
    if (nextExpiry === null) {
      return;
    }
    const delay = Math.max(0, nextExpiry - timeLib.now());
    const timer = setTimeout(() => setAsks((prev) => pruneExpiredAsks(prev, timeLib.now())), delay);
    return (): void => clearTimeout(timer);
  }, [nextExpiry]);

  // THE PUBLISH, through a REF-BOX — the `useBusRoom` idiom, and here it is load-bearing rather than tidy.
  // The band's publish guard is ELEMENT-WISE (`use-chat-controls.tsx`): a published list whose controls are
  // fresh OBJECTS counts as changed, sets state, re-renders the band, re-renders this source… so a publish
  // effect that depends on the built array's IDENTITY — or on `publish`'s — is one un-memoized render away
  // from a render loop whose only symptom is a pegged CPU. Depending on VALUES only (the asks, the pending
  // flag) makes that structurally impossible: the effect re-runs when the ANSWER changes and at no other
  // time, whatever the compiler does with the closures around it.
  // `retire` rides the box too: it is a fresh closure each render (it must be — it closes over nothing but the
  // stable `setAsks`), and the publish effect below reads it, so listing it as a dep would re-run that effect
  // every render — the exact identity-driven loop this ref-box exists to prevent.
  const latest = useRef({ publish, confirm, dismiss, retire });
  useEffect(() => {
    latest.current = { publish, confirm, dismiss, retire };
  });

  const confirmPending = confirm.isPending;
  useEffect(() => {
    const box = latest.current;
    const controls: readonly ChatControl[] = asks.map((ask) => ({
      kind: "card" as const,
      id: ask.id,
      title: ask.summary,
      // The band does NOT compare `detail` across publishes (it compares kind/id/title/actions), which is
      // safe here for the reason the contract names: a card's detail is a pure function of its ask, and an
      // ask that changes gets a new `id` from the server.
      ...(ask.detail === undefined ? {} : { detail: <RewriteDetail before={ask.detail.before} after={ask.detail.after} /> }),
      actions: [
        {
          id: ask.id,
          label: CONFIRM_LABEL[ask.kind],
          mode: "execute" as const,
          // The per-call `MutateOptions` the factory forwards (create-entity-mutation.ts) run IN ADDITION to
          // the baked recipe + global errorToast: retire this card the moment the take resolves, or on a
          // NOT_FOUND refusal (the ask is already gone — see `isSuggestionGone`). A FORBIDDEN leaves the card.
          run: (): void =>
            box.confirm.mutate(
              { suggestionId: ask.id },
              {
                onSuccess: (): void => box.retire(ask.id),
                onError: (error): void => {
                  if (isSuggestionGone(error)) {
                    box.retire(ask.id);
                  }
                },
              },
            ),
          // The source owns the mutation, so only the source can say whether it is in flight — the band
          // never invents a pending state it cannot observe.
          pending: confirmPending,
        },
      ],
      dismiss: (): void =>
        box.dismiss.mutate(
          { suggestionId: ask.id },
          {
            onSuccess: (): void => box.retire(ask.id),
            onError: (error): void => {
              if (isSuggestionGone(error)) {
                box.retire(ask.id);
              }
            },
          },
        ),
    }));
    box.publish(controls);
  }, [asks, confirmPending]);

  return null;
}
