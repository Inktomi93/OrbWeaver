// The production AppShell under the client providers. Section and panel state arrive the way a boot has them, from
// storage the spec seeds before mount; a modal or a room opens through the store's own action.
import { useInvalidation, useOrbSocket, useTRPC, useUserBus } from "@orb/client/data";
import { AppShell } from "@orb/client/features/app-shell";
import { notify } from "@orb/client/lib";
import type { ModalSlotId } from "@orb/client/state";
import { dockListPanel, openModal, openNewChatPicker, selectCharacter, selectChatFromList } from "@orb/client/state";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/** The production shell and nothing else. */
export function AppShellStory(): ReactElement {
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}

function ShellWithBus(): ReactElement {
  const invalidation = useInvalidation();
  useOrbSocket();
  useUserBus({ invalidateUser: invalidation.invalidateUser, invalidateAllUserRoots: invalidation.invalidateAllUserRoots });
  return <AppShell />;
}

/** The production shell with the socket and the user bus the app root wires beside it, so a server event reaches the lists it changes. */
export function AppShellBusStory(): ReactElement {
  return (
    <CtClientProviders>
      <ShellWithBus />
    </CtClientProviders>
  );
}

function OpenModalOnMount({ modalId }: { readonly modalId: ModalSlotId }): null {
  useEffect(() => {
    openModal(modalId);
  }, [modalId]);
  return null;
}

/** The production shell with a control that raises a notice through the app's own `notify` facade. */
export function AppShellNoticeStory({ title, description }: { readonly title: string; readonly description: string }): ReactElement {
  return (
    <CtClientProviders>
      <AppShell />
      <Button className="fixed start-0 bottom-0 z-(--z-toast)" onClick={(): void => notify.info({ title, description })}>
        Raise a notice
      </Button>
    </CtClientProviders>
  );
}

/** The production shell with a control that docks the LIST from outside it, as a feature's own door does. */
export function AppShellListDockStory(): ReactElement {
  return (
    <CtClientProviders>
      <AppShell />
      <Button className="fixed start-0 bottom-0 z-(--z-toast)" onClick={dockListPanel}>
        Dock the list from outside
      </Button>
    </CtClientProviders>
  );
}

function SelectChatOnMount({ chatId }: { readonly chatId: ChatId }): null {
  useEffect(() => {
    selectChatFromList(chatId);
  }, [chatId]);
  return null;
}

function SelectCharacterOnMount({ characterId }: { readonly characterId: CharacterId }): null {
  useEffect(() => {
    selectCharacter(characterId);
  }, [characterId]);
  return null;
}

/** The production shell with one character opened the way a Characters row opens it. */
export function AppShellCharacterStory({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  return (
    <CtClientProviders>
      <SelectCharacterOnMount characterId={characterId} />
      <AppShell />
    </CtClientProviders>
  );
}

/** The production shell with one room opened the way a Chats row opens it. */
export function AppShellRoomStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <SelectChatOnMount chatId={chatId} />
      <AppShell />
    </CtClientProviders>
  );
}

function OpenTemporaryNewChatOnMount(): null {
  useEffect(() => {
    openNewChatPicker({ temporary: true });
  }, []);
  return null;
}

/** The production shell with New chat opened the way the Home temporary tile opens it. */
export function AppShellTemporaryNewChatStory(): ReactElement {
  return (
    <CtClientProviders>
      <OpenTemporaryNewChatOnMount />
      <AppShell />
    </CtClientProviders>
  );
}

function OpenNewChatOnceRostersAreCached(): null {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient
      .query(trpc.rosterPreset.list.queryOptions())
      .then(() => openModal("newChat"))
      .catch(() => undefined);
  }, [queryClient, trpc]);
  return null;
}

/** The production shell opening New chat on a device whose saved-roster list is already cached, as after a visit to the saved-roster picker. */
export function AppShellWarmRostersNewChatStory(): ReactElement {
  return (
    <CtClientProviders>
      <OpenNewChatOnceRostersAreCached />
      <AppShell />
    </CtClientProviders>
  );
}

/** The production shell with one registered modal opened through the store, as a content trigger opens it. */
export function AppShellModalStory({ modalId }: { readonly modalId: ModalSlotId }): ReactElement {
  return (
    <CtClientProviders>
      <OpenModalOnMount modalId={modalId} />
      <AppShell />
    </CtClientProviders>
  );
}

/** Finds the shell's themed portal root once the shell has committed it. */
function subscribeToDocument(changed: () => void): () => void {
  const observer = new MutationObserver(changed);
  observer.observe(document.body, { childList: true, subtree: true });
  return (): void => observer.disconnect();
}

function usePortalRoot(): Element | null {
  return useSyncExternalStore(
    subscribeToDocument,
    () => document.querySelector('[data-slot="portal-root"]'),
    () => null,
  );
}

/** The production shell with a modal open, and a ThemeScope of its own carried into the themed portal root beside it. */
export function AppShellNestedScopeStory({ modalId, tokens }: { readonly modalId: ModalSlotId; readonly tokens: ThemeScopeTokens }): ReactElement {
  const portalRoot = usePortalRoot();
  return (
    <CtClientProviders>
      <OpenModalOnMount modalId={modalId} />
      <AppShell />
      {portalRoot === null
        ? null
        : createPortal(
            <ThemeScope tokens={tokens}>
              <div className="border border-border" />
            </ThemeScope>,
            portalRoot,
          )}
    </CtClientProviders>
  );
}
