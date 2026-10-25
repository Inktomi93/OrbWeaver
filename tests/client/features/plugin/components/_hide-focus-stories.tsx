import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtShellRoom } from "@orb/testkit/browser";
import type { ReactElement } from "react";

export function PluginHideFocusStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <CtShellRoom chatId={chatId} />
    </CtClientProviders>
  );
}
