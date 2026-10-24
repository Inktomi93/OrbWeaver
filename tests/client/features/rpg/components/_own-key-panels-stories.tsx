import { rpgDiceComposerMediaSurface } from "@orb/client/features/rpg";
import type { ResolvedContextTabs } from "@orb/client/lib";
import { selectChat, useSectionRegistry } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Menu, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement, ReactNode } from "react";
import { Suspense, useState } from "react";

/** The rpg context tabs the stories mount, by their production contribution id. */
type RpgTabId = "rpg.status" | "rpg.scene";

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
