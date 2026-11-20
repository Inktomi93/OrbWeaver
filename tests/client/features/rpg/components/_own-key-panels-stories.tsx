import { useHuskReaper } from "@orb/client/data";
import { rpgDiceComposerMediaSurface, rpgTurnToolCallsSurface } from "@orb/client/features/rpg";
import type { ResolvedContextTabs } from "@orb/client/lib";
import { MESSAGE_TOOLS_LABEL } from "@orb/client/lib";
import { enterCreatedChat, goToLanding, selectChat, useSectionRegistry } from "@orb/client/state";
import type { MessageView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtShellRoom } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Menu, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement, ReactNode } from "react";
import { Suspense, useState } from "react";

/** The rpg context tabs the stories mount, by their production contribution id. */
const RPG_TAB_IDS = ["rpg.status", "rpg.scene", "rpg.quests", "rpg.journal", "rpg.game"] as const;
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

function Reaper(): null {
  useHuskReaper();
  return null;
}

/** The Scene tab for a room entered as just created, under the app root's husk reaper, with the store actions that
 *  enter a room as just created and leave it. */
export function RpgSceneReapStory({ chatId, otherChatId }: { readonly chatId: ChatId; readonly otherChatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <Reaper />
      <Button onClick={(): void => enterCreatedChat(chatId)}>Enter the new room</Button>
      <Button onClick={(): void => enterCreatedChat(otherChatId)}>Enter another new room</Button>
      <Button onClick={goToLanding}>Go to the landing</Button>
      <Suspense>
        <ChatsContextTab chatId={chatId} tab="rpg.scene" />
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
        <MenuTrigger>{MESSAGE_TOOLS_LABEL}</MenuTrigger>
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
