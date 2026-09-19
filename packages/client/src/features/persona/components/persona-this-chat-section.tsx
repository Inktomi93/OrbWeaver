// The per-chat picker's ONE home, folded into the rail-foot persona panel. Renders only when a chat is
// active. Three controls: "Playing as" (sets the caller's chat persona), Anchor row (read-only,
// re-pin gated behind viewerIsHost), Reattribute (restamps the caller's own user slots to the current
// chat persona — EVERY one of them, via the server-resolved `{kind:"mine"}` scope).
//
// The restamp used to page the last 100 messages here and send the ids it found: a wrong-persona stretch
// older than that window was simply unreachable, and the tooltip had to say so (FINAL-Persona §A.7 named the
// limitation and pre-authorized the server arm). The client now names the SCOPE and the server resolves the
// rows — no window, no read before the write, and a chat of any length is covered.

import type { PersonaId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Anchor, Check, ChevronDown, History, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import type { Trpc } from "#data";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useActiveChatId } from "#state";
import { useReattributePersona, useSetChatActivePersona, useSetChatAnchorPersona } from "../hooks/use-chat-persona.ts";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];
type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

/** A persona id → its display name. The chat's MEMBER-GATED identity producer (`identities`, D137 /
 *  Chat-Macro-Resolution §1) is consulted FIRST because it covers every persona the ROOM references —
 *  including another member's, which the viewer's own `persona.list` can never contain. Reading only the
 *  viewer's list rendered a host-pinned member-owned anchor as "Unknown persona" while the correct name was
 *  already on the same chat read. The viewer's list is the second rung (a persona of theirs the room does not
 *  reference yet), then the honest floor. */
function personaLabel(chat: ChatDetail, personas: readonly PersonaListItem[], id: string | null): string {
  if (id === null) {
    return "None";
  }
  return chat.identities.find((e) => e.kind === "persona" && e.id === id)?.name ?? personas.find((p) => p.id === id)?.name ?? "Unknown persona";
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

export interface PersonaThisChatSectionProps {
  /** The Config mount's `this-chat` anchor (config-revamp-design §6.8.2 — the contribution passes it; the
   *  "pinned" part is a search LEAF under this section, not a second id) — absent in the rail popover and
   *  the You sheet, so the shared component never duplicates an id across its three mounts. */
  readonly anchorId?: string;
  /** What the Config mount shows when NO chat is active, so its LIST row never scrolls to nothing. Absent
   *  (the rail popover, the You sheet) = the section unmounts, byte-identical to before. */
  readonly idle?: ReactNode;
}

/** The "This chat" section — absent (returns `null`) when no chat is active or its detail hasn't loaded,
 *  unless the mount hands it an `idle` body to say so in words. */
export function PersonaThisChatSection({ anchorId, idle }: PersonaThisChatSectionProps = {}): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
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
  const scopeId = useId();

  if (chatId === null) {
    return idle === undefined ? null : (
      <Section heading="This chat" id={anchorId}>
        {idle}
      </Section>
    );
  }
  if (chat === undefined) {
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

  // One call, no pre-read: the server resolves "every user row I authored in this chat" itself. The
  // confirming notify honors the same `persona.showNotifications` opt-out the switch does (one setting, one
  // meaning) and fires on the server's ACK, so it never claims a restamp the write didn't land.
  const onReattribute = (): void => {
    const targetPersonaId = chat.viewerActivePersonaId;
    if (targetPersonaId === null) {
      return;
    }
    reattribute.mutate(
      { chatId, scope: { kind: "mine" }, personaId: targetPersonaId },
      {
        onSuccess: (): void => {
          if (notifyOnChange) {
            notify.info(`Your messages in this chat now read as ${personaLabel(chat, personas, targetPersonaId)}.`);
          }
        },
      },
    );
  };

  return (
    <Section heading="This chat" id={anchorId}>
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

      {/* THE BLAST RADIUS IS ON THE SURFACE, NOT IN A TOOLTIP (#2443, side-eye 2026-09-19). This button
          rewrites EVERY one of the viewer's own lines in the chat, however far back they go — a bulk
          history edit — and its scope/safety sentence used to live only in a Base UI tooltip, which is
          `mouseOnly: true` with a `:focus-visible`-gated focus fallback (`TooltipTrigger.js:147`,
          `useFocus.js:104`). On a phone the button was pressable and its consequence was unreadable. A
          hover-gated disclosure is the wrong carrier for a consequence the user is about to accept at all;
          it is visible copy, and `aria-describedby` binds it to the control so AT reads it as the button's
          description rather than as loose prose after it. */}
      <Stack gap="field">
        <Button
          aria-describedby={scopeId}
          disabled={chat.viewerActivePersonaId === null || reattribute.isPending}
          intent="ghost"
          onClick={onReattribute}
          size="sm"
        >
          <Icon icon={History} size="xs" />
          Restamp my messages to this persona
        </Button>
        <Text as="span" data-slot="restamp-scope" id={scopeId} voice="gloss">
          Restamps every one of your own lines in this chat to "{personaLabel(chat, personas, chat.viewerActivePersonaId)}" — however far back they go. What you
          wrote is untouched; replies keep the names they were written with.
        </Text>
      </Stack>
    </Section>
  );
}
