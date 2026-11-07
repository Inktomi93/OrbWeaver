import { rpgDiceComposerMediaSurface, rpgTurnToolCallsSurface } from "@orb/client/features/rpg";
import type { ResolvedContextTabs } from "@orb/client/lib";
import { selectChat, useContextTab, useSectionRegistry } from "@orb/client/state";
import type { MessageView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtShellRoom } from "@orb/testkit/browser";
import { Menu, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement, ReactNode } from "react";
import { Suspense, useState } from "react";

/** The rpg context tabs the stories mount, by their production contribution id. */
const RPG_TAB_IDS = ["rpg.status", "rpg.scene", "rpg.journal", "rpg.game"] as const;
type RpgTabId = (typeof RPG_TAB_IDS)[number];

// Calls the section's resolver the way the shell's context host does: as a hook handed in by the definition.
function ResolvedTab({ useResolved, tab }: { readonly useResolved: () => ResolvedContextTabs | null; readonly tab: RpgTabId }): ReactNode {
  return useResolved()?.tabs.find((candidate) => candidate.id === tab)?.node ?? null;
}

function ChatsContextTab({ chatId, tab }: { readonly chatId: ChatId; readonly tab: RpgTabId }): ReactNode {
  // Open the room before the first resolve, as selecting it from the chat list does.
  useState(() => selectChat(chatId));
  const { context } = useSectionRegistry().get("chats");
  return context.kind === "tabs" ? <ResolvedTab useResolved={context.useResolved} tab={tab} /> : null;
}

/** One rpg game tab as the Chats section's context panel resolves it for the open room. */
export function RpgContextTabStory({ chatId, tab }: { readonly chatId: ChatId; readonly tab: RpgTabId }): ReactElement {
  return (
    <CtClientProviders>
      <Suspense>
        <ChatsContextTab chatId={chatId} tab={tab} />
      </Suspense>
    </CtClientProviders>
  );
}

function isRpgTabId(candidate: string | null): candidate is RpgTabId {
  return RPG_TAB_IDS.some((id) => id === candidate);
}

function FollowedTab({ chatId, from }: { readonly chatId: ChatId; readonly from: RpgTabId }): ReactNode {
  const requested = useContextTab();
  return <ChatsContextTab chatId={chatId} tab={isRpgTabId(requested) ? requested : from} />;
}

/** The room's context tab that follows the shell's requested tab, as the context host does, so a door in one tab lands in the next. */
export function RpgFollowedTabStory({ chatId, from }: { readonly chatId: ChatId; readonly from: RpgTabId }): ReactElement {
  return (
    <CtClientProviders>
      <Suspense>
        <FollowedTab chatId={chatId} from={from} />
      </Suspense>
    </CtClientProviders>
  );
}

/** The game tab beside the Presets section's own content, so a link in the tab lands where the section would show it. */
export function RpgContextTabBesidePresetsStory({ chatId, tab }: { readonly chatId: ChatId; readonly tab: RpgTabId }): ReactElement {
  return (
    <CtClientProviders>
      <Suspense>
        <ChatsContextTab chatId={chatId} tab={tab} />
        <PresetsContent />
      </Suspense>
    </CtClientProviders>
  );
}

function PresetsContent(): ReactNode {
  const { content } = useSectionRegistry().get("presets");
  if (typeof content !== "function") {
    throw new Error("Presets has no content contribution");
  }
  return content();
}

/** The rpg dice group as contributed to the composer's Message tools menu, inside a story-owned menu host. */
export function RpgDiceComposerStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <Menu>
        <MenuTrigger>Message tools</MenuTrigger>
        <MenuPopup>{rpgDiceComposerMediaSurface.anchor === "message-footer" ? null : rpgDiceComposerMediaSurface.body({ chatId })}</MenuPopup>
      </Menu>
    </CtClientProviders>
  );
}

/** The production per-message contribution; the story supplies only its published message input. */
export function RpgTurnFooterStory({ message }: { readonly message: MessageView }): ReactElement {
  const contribution = rpgTurnToolCallsSurface;
  if (contribution.anchor !== "message-footer") {
    throw new Error("Game actions must remain a per-message contribution");
  }
  const state = { message };
  return <CtClientProviders>{contribution.when?.(state) === false ? null : contribution.body(state)}</CtClientProviders>;
}

/** The production room keeps the game's band mounted when its Context tab changes. */
export function RpgRoomStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <CtShellRoom chatId={chatId} />
    </CtClientProviders>
  );
}
