// The Claude-subscription cost and terms notice, shown where the subscription is set up and on the saved
// connection, so the extra-usage and terms risk is stated before a long session rather than discovered on a bill.

import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CLAUDE_SUBSCRIPTION_NOTICE } from "../lib/add-connection-form-model.ts";

export function ClaudeSubscriptionNotice(): ReactElement {
  return (
    <Stack data-slot="claude-subscription-notice" gap="tight">
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        {CLAUDE_SUBSCRIPTION_NOTICE.runtime}
      </Text>
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        {CLAUDE_SUBSCRIPTION_NOTICE.extraUsage}
      </Text>
      <Text className="max-w-(--reading-measure-prose) text-warning" prose={true} voice="gloss">
        {CLAUDE_SUBSCRIPTION_NOTICE.terms}
      </Text>
    </Stack>
  );
}
