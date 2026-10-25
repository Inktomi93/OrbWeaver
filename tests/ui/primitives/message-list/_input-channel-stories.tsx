import { CtIsolation } from "@orb/testkit/browser";
import { MessageList } from "@orb/ui/message-list";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export function MessageListInputChannelsStory({ ariaLabel }: { readonly ariaLabel: string }): ReactElement {
  return (
    <CtIsolation subject="MessageList" isolates="Native input subscriptions and their cleanup need no application services.">
      <div style={{ width: 400, height: 240, display: "flex" }}>
        <MessageList
          ariaLabel={ariaLabel}
          className="flex-1"
          items={[1, 2, 3]}
          getItemKey={(item): number => item}
          estimateSize={(): number => 32}
          renderItem={(item): ReactElement => <Text>Line {item}</Text>}
        />
      </div>
    </CtIsolation>
  );
}
