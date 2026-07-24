// The chat room surface: composes the message-thread anchor + message-list surface with the composer
// into one pane: [ thread (grows) | composer (pinned) ]. ChatHandle and draft text are local to this
// pane, not lifted further than they need to be. The tail-role read for continue-on-empty uses a
// separate useSuspenseQuery on the same listMessages key MessageListSurface already suspends on
// internally — one shared cache entry, not a second round-trip.

import type { ChatId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Container, Row, Stack } from "@orb/ui/layout";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useRef, useState } from "react";
import type { ChatBusDeps } from "#data";
import { useGatedQuery, useTRPC } from "#data";
import type { ChatRoomSurfaceState, ChatSurfaceContribution, ContributorRegistry } from "#lib";
import { useFocusOnMount } from "#lib";
import type { ActiveChatHandle, ChatHandle } from "#state";
import { committedChat, isCommitted } from "#state";
import { MessageThreadAnchor } from "../anchors/message-thread-anchor";
import { ChatCastBar } from "../components/chat-cast-bar";
import { Composer } from "../components/composer";
import { MessageSelectionBar } from "../components/message-selection-bar";
import type { DraftSeed } from "../hooks/use-send-message";
import { resolveRoomTheme } from "../lib/attribution";
import { MessageListSurface } from "./message-list-surface";

export interface ChatRoomSurfaceProps {
  readonly initialHandle: ActiveChatHandle;
  readonly busDeps: ChatBusDeps;
  readonly draftSeed?: DraftSeed | undefined;
  /** The second arg is the originating draft's key, so a late resolve after the user moved on can't
   *  hijack the ancestor's active slot. */
  readonly onChatStarted?: ((chatId: ChatId, draftKey: string) => void) | undefined;
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
  readonly surfaceContributors: ContributorRegistry<ChatSurfaceContribution>;
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

export function ChatRoomSurface({ initialHandle, busDeps, draftSeed, onChatStarted, onChatForked, surfaceContributors }: ChatRoomSurfaceProps): ReactElement {
  const [handle, setHandle] = useState<ChatHandle>(initialHandle);
  const [draftText, setDraftText] = useState("");
  const trpc = useTRPC();

  const onCommitted = (chatId: ChatId): void => {
    setHandle(committedChat(chatId));
    if (initialHandle.kind === "draft") {
      onChatStarted?.(chatId, initialHandle.draftKey);
    }
  };

  // Sole-character chrome takeover: in a true-solo room, that character's theme override wins at the
  // chat root; multi-human/group keeps the viewer's own theme (undefined here).
  const roomChatId = isCommitted(handle) ? handle.id : null;
  const { data: roomChat } = useGatedQuery(roomChatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const roomTheme = resolveRoomTheme(roomChat?.participants);

  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const roomState: ChatRoomSurfaceState = { chatId: roomChatId };
  const flankContributions = resolveRoomAnchor(surfaceContributors, "thread-flank", roomState);
  const aboveComposerContributions = resolveRoomAnchor(surfaceContributors, "above-composer", roomState);

  const thread = (
    <Stack className="min-h-0 flex-1">
      <MessageThreadAnchor>
        <MessageListSurface busDeps={busDeps} handle={handle} draftSeed={draftSeed} onChatForked={onChatForked} surfaceContributors={surfaceContributors} />
      </MessageThreadAnchor>
    </Stack>
  );

  return (
    <ThemeScope tokens={roomTheme ?? {}} className="contents">
      <Stack gap="block" className="h-full px-block pb-block outline-none" ref={surfaceRef} tabIndex={-1}>
        {isCommitted(handle) ? <ChatCastBar chatId={handle.id} /> : null}
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
        {isCommitted(handle) ? <MessageSelectionBar chatId={handle.id} /> : null}
        {aboveComposerContributions.map((c) => (
          <Fragment key={c.id}>{c.node}</Fragment>
        ))}
        <ComposerSlot handle={handle} value={draftText} onChange={setDraftText} draftSeed={draftSeed} onCommitted={onCommitted} />
      </Stack>
    </ThemeScope>
  );
}

interface ComposerSlotProps {
  readonly handle: ChatHandle;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly draftSeed: DraftSeed | undefined;
  readonly onCommitted: (chatId: ChatId) => void;
}

// ONE stable <Composer> element across every room-lifecycle transition (draft→committed promotion,
// listMessages settling, an SSE event landing). The tail is read via a NON-suspending gated query, not
// a <Suspense> child + fallback pair: a Suspense boundary here would swap the fallback <Composer> for the
// resolved-child <Composer> at settle — two different tree positions → React remounts the <textarea>,
// dropping focus and every keystroke typed before the query resolved (the #13 "eats keystrokes on fast
// room entry" bug). MessageListSurface already suspends on this exact listMessages key, so this read hits
// the same warm cache entry (no second round-trip); it reports `undefined` until warm, mapping to
// tailRole=null — identical to the old fallback state, but WITHOUT a remount when it fills in. A DIFFERENT
// chat still fully resets the composer: chat-content.tsx keys ChatRoomSurface by sessionKey, so an entity
// switch remounts this whole subtree deliberately.
function ComposerSlot(props: ComposerSlotProps): ReactElement {
  const chatId = isCommitted(props.handle) ? props.handle.id : null;
  const trpc = useTRPC();
  const { data: messagesPage } = useGatedQuery(chatId, (id) => trpc.chat.listMessages.queryOptions({ chatId: id }));
  const tail = messagesPage?.messages.at(-1);
  const tailRole: MessageRole | null = tail?.role ?? null;
  // continue-on-empty's target: only meaningful when the tail is an assistant turn.
  const tailAssistantMessageId = tail !== undefined && tail.role === "assistant" ? tail.id : null;
  return <Composer {...props} tailRole={tailRole} tailAssistantMessageId={tailAssistantMessageId} />;
}
