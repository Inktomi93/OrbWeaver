// The state both signed-out invite doors show for a link that names no invite still admitting anyone: never the sign-up
// fields, which could only end in the same refusal.

import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { DEAD_INVITE_SENTENCE, testId } from "#lib";

export function InviteUnavailable({ onBack }: { readonly onBack: () => void }): ReactElement {
  return (
    <Stack gap="block" data-testid={testId("inviteUnavailable")}>
      <Heading level={1}>This invite isn't available</Heading>
      <Text voice="quiet">{DEAD_INVITE_SENTENCE}</Text>
      <Button intent="primary" onClick={onBack}>
        Back to sign in
      </Button>
    </Stack>
  );
}
