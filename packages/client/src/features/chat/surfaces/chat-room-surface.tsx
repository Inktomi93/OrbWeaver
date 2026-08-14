// The chat room surface: composes the message-thread anchor + message-list surface with the composer
// into one pane: [ thread (grows) | composer (pinned) ]. The handle is local to this pane; the composer
// DRAFT lives in the #state commons (composer-draft-store), keyed by this room's ChatId — so it survives a
// surface remount (draft-loss on remount is a real papercut). The tail-role read for continue-on-empty uses
// a separate query on the same listMessages key MessageListSurface already suspends on internally — one
// shared cache entry, not a second round-trip.
//
// COMMITTED-ONLY (chat-creation-draft-mode-replacement.md §4.1, R1). This pane used to hold a `ChatHandle`
// in local state so it could flip draft→committed mid-first-turn without remounting, and every child took a
// phase branch. A chat row exists from the creation click, so the handle is a prop, the id is stable for the
// pane's life, and the twin surfaces (`DraftCastBar`, `DraftChatHeader`, `DraftGreetingThread`, the draft
// context tabs) are gone — the committed arms they shadowed now serve the room from frame one.

import type { ChatId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Container, Row, Stack, Surface } from "@orb/ui/layout";
import { ThemeScope } from "@orb/ui/theme-scope";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useRef } from "react";
import type { ChatBusDeps } from "#data";
import { useCarriedAppearanceCast, useTRPC } from "#data";
import type { ChatRoomSurfaceState, ChatSurfaceContribution, ContributorRegistry, ToolRenderer } from "#lib";
import { deriveChatTitle, useFocusOnMount } from "#lib";
import type { ActiveChatHandle } from "#state";
import { MessageThreadAnchor } from "../anchors/message-thread-anchor.tsx";
import { ChatCastBar } from "../components/chat-cast-bar.tsx";
import { ChoiceSendProvider } from "../components/choice-send-provider.tsx";
import { Composer } from "../components/composer.tsx";
import { MessageSelectionBar } from "../components/message-selection-bar.tsx";
import { resolveRoomTheme } from "../lib/attribution.ts";
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
  const carriedCast = useCarriedAppearanceCast(chatId);
  const roomTheme = resolveRoomTheme(carriedCast);
  // Names the room's focus target (finding #2): the chat title, else "Chat room" (a not-yet-resolved room).
  // Without this explicit label the tabindex=-1 focus DIV's name falls to name-from-content — concatenating
  // the whole toolbar (Cast · Jump to latest · Attach · Send…) into one string.
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

  const thread = (
    <Stack className="min-h-0 flex-1">
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
      {/* DENSITY S6 (density-pass-spec.md §3.1): the chat transcript AND the composer are both the
          INSTRUMENT tier, so the room declares it ONCE for the whole pane — the two are one continuous
          reading surface, and a second declaration would be the same-tier nesting the spec calls RED.
          `<Surface>` is display:contents, so nothing in this pane's height chain moves. */}
      <Surface tier="instrument">
        <Stack aria-label={roomLabel} className="h-full px-block pb-block outline-none" gap="block" ref={surfaceRef} role="group" tabIndex={-1}>
          {/* The cast strip is presence-at-a-glance for the room's roster — size-gated inside. */}
          <ChatCastBar chatId={chatId} />
          {/* Zero flank contributions ⇒ the thread renders alone (today's exact layout, no visual
           *  change); ≥1 ⇒ a flank column appears beside it (§17 M8). The `Container` + `@max-lg`
           *  (a CONTAINER query on the chat-content region's own inline size, never the viewport —
           *  the shell's docked panels can narrow this pane even on a wide screen) makes the beside
           *  layout responsive-correct BY CONSTRUCTION: below 32rem/512px the flank stacks below the
           *  thread instead of crushing its reading column (the settings-shell-surface.tsx /
           *  role-slot-row.tsx `@max-md`/`@2xl` precedent, mirrored here at the `lg` step since a
           *  thread+flank split needs more room than a nav+content split before beside is comfortable). */}
          {flankContributions.length === 0 ? (
            thread
          ) : (
            <Container className="min-h-0 flex-1">
              <Row gap="block" className="h-full @max-lg:flex-col" data-slot="chat-room-flank-row">
                {thread}
                <Stack gap="block" data-slot="chat-thread-flank">
                  {flankContributions.map((c) => (
                    <Fragment key={c.id}>{c.node}</Fragment>
                  ))}
                </Stack>
              </Row>
            </Container>
          )}
          <MessageSelectionBar chatId={chatId} />
          {aboveComposerContributions.map((c) => (
            <Fragment key={c.id}>{c.node}</Fragment>
          ))}
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
