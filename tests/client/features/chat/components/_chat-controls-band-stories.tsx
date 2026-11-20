import { useOrbSocket } from "@orb/client/data";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, chatSurfaceContributors } from "@orb/testkit/browser";
import type { ReactElement, ReactNode } from "react";

// The room's one above-composer contribution, the production band over the production control sources.
function AboveComposer({ chatId }: { readonly chatId: ChatId }): ReactNode {
  useOrbSocket();
  const band = chatSurfaceContributors.list().find((contribution) => contribution.anchor === "above-composer");
  if (band === undefined || band.anchor !== "above-composer") {
    throw new Error("the chat surface registry has no above-composer contribution");
  }
  return band.body({ chatId });
}

export function ChatControlsBandStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <AboveComposer chatId={chatId} />
    </CtClientProviders>
  );
}
