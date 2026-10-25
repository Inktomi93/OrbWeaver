import { AppShell } from "@orb/client/features/app-shell";
import { selectChatFromList } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect } from "react";

function SelectChatOnMount({ chatId }: { readonly chatId: ChatId }): null {
  useEffect(() => {
    selectChatFromList(chatId);
  }, [chatId]);
  return null;
}

/** The production shell with one room opened the way a Chats row opens it; mount it under the CT client providers. */
export function CtShellRoom({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <>
      <SelectChatOnMount chatId={chatId} />
      <AppShell />
    </>
  );
}
