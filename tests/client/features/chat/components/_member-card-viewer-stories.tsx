import type { CharacterId, ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { MemberCardViewer } from "#client/features/chat/components/member-card-viewer.tsx";

/** The production member card viewer, open over a room's character. */
export function MemberCardViewerStory({ chatId, characterId }: { readonly chatId: ChatId; readonly characterId: CharacterId }): ReactElement {
  return (
    <CtClientProviders>
      <MemberCardViewer chatId={chatId} characterId={characterId} open={true} onOpenChange={(): void => undefined} />
    </CtClientProviders>
  );
}
