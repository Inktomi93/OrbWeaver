import { QueryBoundary, RegexScriptPicker } from "@orb/client/components";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The production regex picker over one room's scope, with the owner's whole library under it. */
export function RegexScriptPickerStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <Container>
        <QueryBoundary resetKeys={[]} fallback={<output>Loading scripts</output>}>
          <RegexScriptPicker scope={{ kind: "chat", chatId }} helperText="Scripts for this room." />
        </QueryBoundary>
      </Container>
    </CtClientProviders>
  );
}
