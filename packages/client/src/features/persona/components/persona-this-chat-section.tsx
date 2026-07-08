// PersonaThisChatSection (FINAL-Persona §A.6 "This chat" — the per-chat picker's ONE home, folded into
// the rail-foot persona panel per the owner's consolidated-panel design; there is NO separate
// features/chat picker). Renders ONLY when a chat is active (`state/active-chat-store`, `#state` — a
// draft has no server chat row yet, so it's absent, not a dead skeleton). Three controls:
//   • "Playing as" — sets the CALLER's Chat persona (#3) via `persona.setActivePersona` (targetUserId
//     omitted — self; the verb defaults it).
//   • Anchor row — read-only "card sees you as: X"; a re-pin control gated behind `viewerIsHost`
//     (`chat.setChatAnchorPersona`, host-only server + client-hidden otherwise).
//   • Reattribute — restamps the caller's own USER slots to the current Chat persona
//     (`chat.reattributePersona`). SCOPED to the most-recently-loaded window (`REATTRIBUTE_WINDOW`
//     messages) — there is no server "restamp everything" bulk resolver, and paging a whole chat's
//     history from a rail popover is out of scope here. The control's tooltip states the scope so this
//     reads as a deliberate limit, not a silently-broken "restamp all" promise.

import type { MessageId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the add-member-popover precedent).
import { Anchor, Check, ChevronDown, History, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { isCommitted, useActiveChatHandle } from "#state";
import {
  useReattributePersona,
  useSetChatActivePersona,
  useSetChatAnchorPersona,
} from "../hooks/use-chat-persona";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

/** The most-recent-turns window `reattribute` restamps (server `MAX_LIMIT`, `domain/chat/verbs/read.ts`)
 *  — see the file header's scoping note. */
const REATTRIBUTE_WINDOW = 100;

function personaLabel(personas: readonly PersonaListItem[], id: string | null): string {
  if (id === null) {
    return "None";
  }
  return personas.find((p) => p.id === id)?.name ?? "Unknown persona";
}

/** The "This chat" section — absent (returns `null`) when no chat is active or its detail hasn't loaded. */
export function PersonaThisChatSection(): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const handle = useActiveChatHandle();
  const chatId = isCommitted(handle) ? handle.id : null;

  const { data: chat } = useGatedQuery(chatId, (id) =>
    trpc.chat.getChat.queryOptions({ chatId: id }),
  );
  const { data: personas } = useSuspenseQuery(trpc.persona.list.queryOptions());

  const setActive = useSetChatActivePersona({ trpc, invalidation });
  const setAnchor = useSetChatAnchorPersona({ trpc, invalidation });
  const reattribute = useReattributePersona({ trpc, invalidation });

  if (chatId === null || chat === undefined) {
    return null;
  }

  const onReattribute = async (): Promise<void> => {
    const targetPersonaId = chat.viewerActivePersonaId;
    if (targetPersonaId === null) {
      return;
    }
    // Own-authored USER slots in the most-recent window — see REATTRIBUTE_WINDOW's header note.
    const page = await queryClient.fetchQuery(
      trpc.chat.listMessages.queryOptions({ chatId, limit: REATTRIBUTE_WINDOW }),
    );
    const messageIds: MessageId[] = page.messages
      .filter((m) => m.role === "user" && m.authorUserId === chat.viewerUserId)
      .map((m) => m.id);
    if (messageIds.length === 0) {
      notify.info("No messages of yours in the recent window to restamp.");
      return;
    }
    reattribute.mutate({ chatId, messageIds, personaId: targetPersonaId });
  };

  return (
    <Section heading="This chat">
      <Row gap="row" align="center" className="justify-between">
        <Text size="label">Playing as</Text>
        <Menu>
          <MenuTrigger
            render={
              <Button intent="secondary" size="sm">
                {personaLabel(personas, chat.viewerActivePersonaId)}
                <Icon icon={ChevronDown} size="xs" />
              </Button>
            }
          />
          <MenuPopup>
            {personas.map((p) => (
              <MenuItem
                key={p.id}
                onClick={(): void => setActive.mutate({ chatId, personaId: p.id })}
              >
                <Row gap="field" align="center" className="justify-between w-full">
                  {p.name}
                  {p.id === chat.viewerActivePersonaId ? <Icon icon={Check} size="xs" /> : null}
                </Row>
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      </Row>

      <Row gap="row" align="center" className="justify-between">
        <Row gap="field" align="center">
          <Icon icon={Anchor} size="xs" />
          <Text size="label" tone="muted">
            Card sees you as {personaLabel(personas, chat.anchorPersonaId)}
          </Text>
        </Row>
        {chat.viewerIsHost ? (
          <Menu>
            <MenuTrigger
              render={
                <Button intent="ghost" size="sm">
                  Re-pin
                </Button>
              }
            />
            <MenuPopup>
              {personas.map((p) => (
                <MenuItem
                  key={p.id}
                  onClick={(): void => setAnchor.mutate({ chatId, personaId: p.id })}
                >
                  {p.name}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
        ) : null}
      </Row>

      <Stack gap="field">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                intent="ghost"
                size="sm"
                disabled={chat.viewerActivePersonaId === null || reattribute.isPending}
                onClick={(): void => {
                  void onReattribute();
                }}
              >
                <Icon icon={History} size="xs" />
                Restamp my messages to this persona
              </Button>
            }
          />
          <TooltipPopup side="top">
            Restamps your own lines from the last {REATTRIBUTE_WINDOW} messages in this chat to "
            {personaLabel(personas, chat.viewerActivePersonaId)}". Older history is untouched.
          </TooltipPopup>
        </Tooltip>
      </Stack>
    </Section>
  );
}
