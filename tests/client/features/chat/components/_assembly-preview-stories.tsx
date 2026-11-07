import type { ResolvedContextTabs } from "@orb/client/lib";
import { selectChat, useSectionRegistry } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement, ReactNode } from "react";
import { Suspense, useState } from "react";

function RegisteredPreviewTab({ useResolved }: { readonly useResolved: () => ResolvedContextTabs | null }): ReactNode {
  return useResolved()?.tabs.find((tab) => tab.id === "preview")?.node ?? null;
}

function PreviewBody({ chatId }: { readonly chatId: ChatId }): ReactNode {
  useState(() => selectChat(chatId));
  const { context } = useSectionRegistry().get("chats");
  return context.kind === "tabs" ? <RegisteredPreviewTab useResolved={context.useResolved} /> : null;
}

/** The host's Preview tab as the Chats section's context panel resolves it for the open room. */
export function AssemblyPreviewTabStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <Suspense>
        <PreviewBody chatId={chatId} />
      </Suspense>
    </CtClientProviders>
  );
}
