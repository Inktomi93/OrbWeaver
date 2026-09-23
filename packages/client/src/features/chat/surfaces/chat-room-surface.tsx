// The chat room surface: composes the message-thread anchor + message-list surface with the composer
// into one pane: [ thread (grows) | composer (pinned) ]. The handle is local to this pane; the composer
// DRAFT lives in the #state commons (composer-draft-store), keyed by this room's ChatId — so it survives a
// surface remount (draft-loss on remount is a real papercut). The tail-role read for continue-on-empty uses
// a separate query on the same listMessages key MessageListSurface already suspends on internally — one
// shared cache entry, not a second round-trip.
//
// COMMITTED-ONLY (D166). This pane used to hold a `ChatHandle`
// in local state so it could flip draft→committed mid-first-turn without remounting, and every child took a
// phase branch. A chat row exists from the creation click, so the handle is a prop, the id is stable for the
// pane's life, and the twin surfaces (`DraftChatHeader`, `DraftGreetingThread`, the draft
// context tabs) are gone — the committed arms they shadowed now serve the room from frame one.

import type { ChatId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Container, Row, Stack, Surface } from "@orb/ui/layout";
import { ThemeScope } from "@orb/ui/theme-scope";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useRef } from "react";
import type { ChatBusDeps } from "#data";
import { useCarriedAppearance, useTRPC } from "#data";
import type { ChatRoomSurfaceState, ChatSurfaceContribution, ContributorRegistry, ToolRenderer } from "#lib";
import { cn, deriveChatTitle, useFocusOnMount } from "#lib";
import type { ActiveChatHandle } from "#state";
import { MessageThreadAnchor } from "../anchors/message-thread-anchor.tsx";
import { ChatCharacterBar } from "../components/chat-character-bar.tsx";
import { ChoiceSendProvider } from "../components/choice-send-provider.tsx";
import { Composer } from "../components/composer.tsx";
import { MessageSelectionBar } from "../components/message-selection-bar.tsx";
import { resolveRoomTheme } from "../lib/attribution.ts";
import { CHAT_TRACK } from "../lib/chat-track.ts";
import { MessageListSurface } from "./message-list-surface.tsx";

export interface ChatRoomSurfaceProps {
  readonly handle: ActiveChatHandle;
  readonly busDeps: ChatBusDeps;
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
  readonly surfaceContributors: ContributorRegistry<ChatSurfaceContribution>;
  readonly toolRenderers: ContributorRegistry<ToolRenderer>;
}

/** Resolves the `when`-filtered, in-declared-order body nodes for one room anchor — zero contributions
 *  ⇒ an empty array, so callers can gate layout on `.length` (the thread-flank conditional, §17 M8). */
function resolveRoomAnchor(
  registry: ContributorRegistry<ChatSurfaceContribution>,
  anchor: "thread-flank" | "above-composer",
  state: ChatRoomSurfaceState,
): readonly { readonly id: string; readonly node: ReactNode }[] {
  return registry
    .list()
    .filter((c): c is Extract<ChatSurfaceContribution, { anchor: typeof anchor }> => c.anchor === anchor)
    .filter((c) => c.when?.(state) ?? true)
    .map((c) => ({ id: c.id, node: c.body(state) }));
}

export function ChatRoomSurface({ handle, busDeps, onChatForked, surfaceContributors, toolRenderers }: ChatRoomSurfaceProps): ReactElement {
  const chatId = handle.id;
  const trpc = useTRPC();

  // Sole-character chrome takeover: in a true-solo room, that character's theme override wins at the chat
  // root; multi-human/group keeps the viewer's own theme (undefined here). The room's roster is warm on the
  // FIRST frame — `useStartChat` seeds this exact `getChat` key from `startChat`'s own response — so a
  // brand-new room wears its card's theme immediately instead of re-skinning itself later (the 2026-08-06
  // owner dogfood, now fixed by the row existing rather than by a second card-reading resolver).
  const { data: roomChat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const carried = useCarriedAppearance(chatId);
  const roomTheme = resolveRoomTheme(carried);
  // Names the room's focus target (finding #2): the chat title, else "Chat room" (a not-yet-resolved room).
  // Without this explicit label the tabindex=-1 focus DIV's name falls to name-from-content — concatenating
  // the whole toolbar (Characters · Jump to latest · Attach · Send…) into one string.
  const roomLabel =
    roomChat === undefined
      ? "Chat room"
      : deriveChatTitle(
          roomChat.title,
          roomChat.participants.map((participant) => participant.displayName),
        );

  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const roomState: ChatRoomSurfaceState = { chatId };
  const flankContributions = resolveRoomAnchor(surfaceContributors, "thread-flank", roomState);
  const aboveComposerContributions = resolveRoomAnchor(surfaceContributors, "above-composer", roomState);

  // `min-w-0` beside `min-h-0`: inside the flank ROW the thread is a horizontal flex child, and without it
  // a long unbreakable line in the transcript would push the column past its share instead of scrolling.
  const thread = (
    <Stack className="min-h-0 min-w-0 flex-1">
      <MessageThreadAnchor>
        {/* P5 CYOA (§5.3): the thread's choice buttons send through the room's own send capability —
            a separate useSendMessage instance from the composer's, so a pick never clears the draft. */}
        <ChoiceSendProvider chatId={chatId}>
          <MessageListSurface
            busDeps={busDeps}
            chatId={chatId}
            onChatForked={onChatForked}
            surfaceContributors={surfaceContributors}
            toolRenderers={toolRenderers}
          />
        </ChoiceSendProvider>
      </MessageThreadAnchor>
    </Stack>
  );

  return (
    <ThemeScope tokens={roomTheme ?? {}} className="contents">
      {/* DENSITY S6 (UI-Density-Law.md §3.1): the chat transcript AND the composer are both the
          INSTRUMENT tier, so the room declares it ONCE for the whole pane — the two are one continuous
          reading surface, and a second declaration would be the same-tier nesting the spec calls RED.
          `<Surface>` is display:contents, so nothing in this pane's height chain moves. */}
      <Surface tier="instrument">
        <Stack
          aria-label={roomLabel}
          // A carried theme that picks a BASE SURFACE paints it (#204 derive law: a surface cannot exist
          // outside the palette — without this the carried scope re-derived every ink against a base the
          // reader never saw, dark carried inks over the app's dark page). Gated to the carried case (the
          // viewer's own theme already paints `.shell-grid`, and elevation=ramp deliberately re-fills
          // `.shell-main` with card — this must not override that) and to the no-wallpaper arm (over art
          // the wallpaper IS the page and the reading plates carry the text).
          className={cn("h-full px-block pb-block outline-none", roomTheme?.background !== undefined && "not-in-data-[has-bg-image]:bg-background")}
          gap="block"
          ref={surfaceRef}
          role="group"
          tabIndex={-1}
        >
          {/* The character strip is presence-at-a-glance for the room's roster — size-gated inside. */}
          <ChatCharacterBar chatId={chatId} />
          {/* THE FLANK ROW IS UNCONDITIONAL, AND THAT IS THE #680 FIX — the fork it replaces was the P0.
           *  A `flankContributions.length === 0 ? thread : <wrapper>` fork made the room's HEIGHT CHAIN a
           *  function of whether any contributor happened to be REGISTERED, and the wrapper arm severed it:
           *  ONE ROOT CAUSE, TWO DEFECTS — `Row` BAKES `items-center` (@orb/ui layout variants) and
           *  `@max-lg:flex-col` flips DIRECTION but not ALIGNMENT, so the baked cross-axis rule meant a
           *  different thing on each arm (the axis-disagreement family):
           *    · BESIDE (row): the transcript is a content-height child ⇒ `MessageList`'s bounded-height
           *      tripwire throws (`@orb/ui/lib/virtual-gap.ts` — thrown, not warned) ⇒ the room renders
           *      "Couldn't load this conversation." with zero messages. LOUD.
           *    · STACKED (column): `items-center` becomes a horizontal shrink-to-content ⇒ the transcript
           *      computes to WIDTH 0, its rows parked off-screen ⇒ an empty room, no error, no retry.
           *      SILENT, and therefore the worse of the two.
           *
           *  So the wrapper is now LAYOUT-NEUTRAL BY CONSTRUCTION rather than conditionally present, and it
           *  REPLACES the baked alignment instead of overriding it at one breakpoint — one declaration
           *  answering both arms: `align="stretch"` gives the thread the row's full height AND the column's
           *  full width, and `min-h-0` on both the Row and the thread keeps the flex chain able to SHRINK,
           *  which is what gives the virtualizer a real scroll window. With no flank content the row has
           *  exactly one laid-out child at full size, so it renders byte-identically to the bare thread it
           *  replaced (pinned on BOTH axes at BOTH arms by the #680 CT loop — a desktop-width-only pin is
           *  exactly how both defects went green).
           *
           *  The `Container` + `@max-lg` is a CONTAINER query on this pane's own inline size, never the
           *  viewport (the shell's docked panels can narrow it on a wide screen): below 32rem/512px the
           *  flank stacks BELOW the thread instead of crushing its reading column (the
           *  settings-shell-surface.tsx / role-slot-row.tsx `@max-md`/`@2xl` precedent, at the `lg` step
           *  since a thread+flank split needs more room than a nav+content split before beside is comfy). */}
          <Container className="min-h-0 flex-1">
            <Row gap="block" align="stretch" className="h-full min-h-0 @max-lg:flex-col" data-slot="chat-room-flank-row">
              {thread}
              {/* `empty:hidden` is the SILENT-CONTRIBUTOR collapse, the same property (and the same
                  reason) the above-composer band carries below: a contributor whose applicability is DATA
                  (automation's needle meter: is there a tension score in this room?) cannot answer in the
                  seam's SYNC `when`, so it mounts everywhere and paints nothing where it does not apply.
                  Without this, every room without a score paid a flex child and its `gap="block"` step
                  beside the transcript. `:empty` takes the stack out of layout entirely, so "mounted but
                  silent" and "not mounted" render identically; it cannot hide a live contribution, since
                  any rendered node makes the stack non-empty. */}
              {/* …and `max-w-(--width-sidebar-sm)` is the COLUMN'S OWN BOUND (#776), the other half of the
                  same seam-owns-flank-layout law. Every tenant the anchor had until #679 U2 was
                  content-small by construction (a meter card), so the column never needed a ceiling — and
                  then the anchor opened to PLUGIN surfaces, whose text a third party writes. Measured
                  red-first on the pre-clamp source: one long unwrapped caption took the whole row and
                  shrank the transcript to a ZERO box — the #680 silent arm (an empty room, no error, no
                  retry), reachable by any wordy contributor. The bound is the house's narrow side-column
                  token, the same one the settings nav and the role-slot rows stand in, so a flank widget
                  reads as the room's side column rather than as a second content column; wide content
                  wraps inside it instead of eating the reading column. `@max-lg:max-w-none` RELEASES it on
                  the stacked arm, where the flank is a full-width block under the thread and a 220px
                  island would be the clamp leaking into the arm it was never for. A contributor bounding
                  only ITSELF was the rejected arm: it leaves the house's own future widgets unprotected
                  and puts layout in a contribution, which is exactly what §6c forbids. */}
              <Stack gap="block" className="empty:hidden max-w-(--width-sidebar-sm) @max-lg:max-w-none" data-slot="chat-thread-flank">
                {flankContributions.map((c) => (
                  <Fragment key={c.id}>{c.node}</Fragment>
                ))}
              </Stack>
            </Row>
          </Container>
          <MessageSelectionBar chatId={chatId} />
          {/* THE ROOM'S ONE TRACK (#213): a band between the transcript and the composer is part of the same
              vertical stack, so it takes the same centred box — otherwise a contribution renders at its own
              content width against the left edge of the pane while the two things it sits between centre. */}
          {aboveComposerContributions.length === 0 ? null : (
            // `empty:hidden` is the SILENT-CONTRIBUTOR collapse (S1, interaction-direction-spec §3-S1): a
            // contribution that is mounted but currently paints nothing (the control band with no live
            // control — its source fibers render null) leaves this wrapper with zero child NODES, and an
            // empty flex child still costs the column one `gap="block"` step between the transcript and the
            // composer. `:empty` takes it out of layout entirely, so "mounted but silent" and "not mounted"
            // read identically. It cannot hide a live contribution: any rendered node makes the wrapper
            // non-empty.
            <Stack gap="row" className={cn(CHAT_TRACK, "empty:hidden")} data-slot="chat-above-composer">
              {aboveComposerContributions.map((c) => (
                <Fragment key={c.id}>{c.node}</Fragment>
              ))}
            </Stack>
          )}
          <ComposerSlot chatId={chatId} />
        </Stack>
      </Surface>
    </ThemeScope>
  );
}

// ONE stable <Composer> element across every room-lifecycle transition (listMessages settling, an SSE event
// landing). The tail is read via a NON-suspending query, not a <Suspense> child + fallback pair: a Suspense
// boundary here would swap the fallback <Composer> for the resolved-child <Composer> at settle — two
// different tree positions → React remounts the <textarea>, dropping focus and every keystroke typed before
// the query resolved (the #13 "eats keystrokes on fast room entry" bug). MessageListSurface already suspends
// on this exact listMessages key, so this read hits the same warm cache entry (no second round-trip); it
// reports `undefined` until warm, mapping to tailRole=null — identical to the old fallback state, but
// WITHOUT a remount when it fills in. A DIFFERENT chat still fully resets the composer: chat-content.tsx
// keys ChatRoomSurface by the chat id, so an entity switch remounts this whole subtree deliberately.
function ComposerSlot({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data: messagesPage } = useQuery(trpc.chat.listMessages.queryOptions({ chatId }));
  // The raw tail IS the tail a reader means (D124: every canon row is a real message now).
  const tail = messagesPage?.messages.at(-1);
  const tailRole: MessageRole | null = tail?.role ?? null;
  // continue-on-empty's target: only meaningful when the tail is an assistant turn.
  const tailAssistantMessageId = tail !== undefined && tail.role === "assistant" ? tail.id : null;
  return <Composer chatId={chatId} tailRole={tailRole} tailAssistantMessageId={tailAssistantMessageId} />;
}
