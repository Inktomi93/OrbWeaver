// A signed-out signup refusal reveals no invite facts; an existing account can still try authenticated joining.

import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { DEAD_INVITE_SENTENCE, testId } from "#lib";

export function InviteUnavailable({ onBack, onUseSignIn }: { readonly onBack: () => void; readonly onUseSignIn?: () => void }): ReactElement {
  return (
    <Stack gap="block" data-testid={testId("inviteUnavailable")}>
      <Heading level={1}>{onUseSignIn === undefined ? "This invite isn't available" : "This link can't create an account"}</Heading>
      <Text voice="quiet">
        {onUseSignIn === undefined ? DEAD_INVITE_SENTENCE : "Sign in with an existing account to try joining, or ask the host for a new link."}
      </Text>
      {onUseSignIn === undefined ? (
        <Button intent="primary" onClick={onBack}>
          Back to sign in
        </Button>
      ) : (
        <>
          <Button intent="primary" onClick={onUseSignIn}>
            Sign in to join
          </Button>
          <Button intent="ghost" onClick={onBack}>
            Not now
          </Button>
        </>
      )}
    </Stack>
  );
}
