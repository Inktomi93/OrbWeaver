// The per-chat picker's ONE home, folded into the rail-foot persona panel. Renders only when a chat is
// active. Three controls: "Playing as" (sets the caller's chat persona), Anchor row (read-only,
// re-pin gated behind viewerIsHost), Reattribute (restamps the caller's own user slots to the current
// chat persona, scoped to REATTRIBUTE_WINDOW messages — no server bulk resolver exists).

import type { MessageId, PersonaId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Anchor, Check, ChevronDown, History, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useActiveChatId } from "#state";
import { useReattributePersona, useSetChatActivePersona, useSetChatAnchorPersona } from "../hooks/use-chat-persona";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];
type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

/** The most-recent-turns window `reattribute` restamps. */
const REATTRIBUTE_WINDOW = 100;

/** A persona id → its display name. The chat's MEMBER-GATED name producer (`macroNames`,
 *  Chat-Macro-Resolution §1) is consulted FIRST because it covers every persona the ROOM references —
 *  including another member's, which the viewer's own `persona.list` can never contain. Reading only the
 *  viewer's list rendered a host-pinned member-owned anchor as "Unknown persona" while the correct name was
 *  already on the same chat read. The viewer's list is the second rung (a persona of theirs the room does not
 *  reference yet), then the honest floor. */
function personaLabel(chat: ChatDetail, personas: readonly PersonaListItem[], id: string | null): string {
  if (id === null) {
    return "None";
  }
  return chat.macroNames.personaNames.find((p) => p.id === id)?.name ?? personas.find((p) => p.id === id)?.name ?? "Unknown persona";
}

/** The OTHER present humans' pinnable personas — each member's own active persona, labeled with the member.
 *  `setChatAnchorPersona` accepts any PRESENT human participant's persona (host-only), and since the resolver
 *  widened, such a pin actually resolves — so the host's control can finally express what the verb permits.
 *  The viewer's own seat is excluded (their personas are the menu's first group). */
function memberAnchorOptions(chat: ChatDetail): readonly { readonly personaId: PersonaId; readonly member: string; readonly name: string }[] {
  return chat.participants.flatMap((p) =>
    p.kind === "human" && p.userId !== chat.viewerUserId && p.activePersonaId !== null && p.leftSeq === null
      ? [{ personaId: p.activePersonaId, member: p.displayName, name: personaLabel(chat, [], p.activePersonaId) }]
      : [],
  );
}

/** The "This chat" section — absent (returns `null`) when no chat is active or its detail hasn't loaded. */
export function PersonaThisChatSection(): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const chatId = useActiveChatId();

  const { data: chat } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const { data: personas } = useSuspenseQuery(trpc.persona.list.queryOptions());
  // The per-user opt-out (PD — persona.showNotifications). Cache-first (the persona panel already loaded
  // settings); a confirming toast fires on a persona switch ONLY when this is on. `?? true` matches the
  // schema default so a not-yet-resolved read behaves as the on-by-default setting.
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const notifyOnChange = settings.config.persona.showNotifications;

  const setActive = useSetChatActivePersona({ trpc, invalidation });
  const setAnchor = useSetChatAnchorPersona({ trpc, invalidation });
  const reattribute = useReattributePersona({ trpc, invalidation });

  if (chatId === null || chat === undefined) {
    return null;
  }

  const memberAnchors = memberAnchorOptions(chat);

  // Switch the caller's chat persona; on success fire a confirming toast ONLY when the user opted in via
  // persona.showNotifications (HONORING the previously-stored-but-ignored setting). A no-op switch (already
  // this persona) is skipped so the toast marks a real change.
  const onSwitchPersona = (persona: PersonaListItem): void => {
    if (persona.id === chat.viewerActivePersonaId) {
      return;
    }
    setActive.mutate(
      { chatId, personaId: persona.id },
      {
        onSuccess: (): void => {
          if (notifyOnChange) {
            notify.info(`Now playing as ${persona.name} in this chat.`);
          }
        },
      },
    );
  };

  const onReattribute = async (): Promise<void> => {
    const targetPersonaId = chat.viewerActivePersonaId;
    if (targetPersonaId === null) {
      return;
    }
    // The fetchQuery read carries no mutation errorToast of its own, so catch its rejection here.
    try {
      const page = await queryClient.fetchQuery(trpc.chat.listMessages.queryOptions({ chatId, limit: REATTRIBUTE_WINDOW }));
      const messageIds: MessageId[] = page.messages.filter((m) => m.role === "user" && m.authorUserId === chat.viewerUserId).map((m) => m.id);
      if (messageIds.length === 0) {
        notify.info("No messages of yours in the recent window to restamp.");
        return;
      }
      reattribute.mutate({ chatId, messageIds, personaId: targetPersonaId });
    } catch {
      notify.error("Couldn't load recent messages to restamp.");
    }
  };

  return (
    <Section heading="This chat">
      <Row gap="row" align="center" className="justify-between">
        <Text size="label">Playing as</Text>
        <Menu>
          <MenuTrigger
            render={
              <Button intent="secondary" size="sm">
                {personaLabel(chat, personas, chat.viewerActivePersonaId)}
                <Icon icon={ChevronDown} size="xs" />
              </Button>
            }
          />
          <MenuPopup>
            {personas.map((p) => (
              <MenuItem key={p.id} onClick={(): void => onSwitchPersona(p)}>
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
            Card sees you as {personaLabel(chat, personas, chat.anchorPersonaId)}
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
              <MenuGroup>
                <MenuGroupLabel>Your personas</MenuGroupLabel>
                {personas.map((p) => (
                  <MenuItem key={p.id} onClick={(): void => setAnchor.mutate({ chatId, personaId: p.id })}>
                    {p.name}
                  </MenuItem>
                ))}
              </MenuGroup>
              {/* The verb permits ANY present human's persona; grouping by member is what makes that
                  expressible without implying the host owns it. Empty in a solo room ⇒ no group renders. */}
              {memberAnchors.length > 0 ? (
                <MenuGroup>
                  <MenuGroupLabel>Members' personas</MenuGroupLabel>
                  {memberAnchors.map((option) => (
                    <MenuItem key={option.personaId} onClick={(): void => setAnchor.mutate({ chatId, personaId: option.personaId })}>
                      {option.name} ({option.member})
                    </MenuItem>
                  ))}
                </MenuGroup>
              ) : null}
              <MenuSeparator />
              {/* The verb's `personaId: null` arm had no affordance at all — a pin could be moved but never
                  removed, though clearing it is what falls card {{user}} back to the live speaker. */}
              <MenuItem onClick={(): void => setAnchor.mutate({ chatId, personaId: null })}>Clear pin</MenuItem>
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
            Restamps your own lines from the last {REATTRIBUTE_WINDOW} messages in this chat to "{personaLabel(chat, personas, chat.viewerActivePersonaId)}".
            Older history is untouched.
          </TooltipPopup>
        </Tooltip>
      </Stack>
    </Section>
  );
}
