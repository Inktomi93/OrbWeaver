// A signed-out signup refusal reveals no invite facts; an existing account can still try authenticated joining.

import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { DEAD_INVITE_SENTENCE, testId } from "#lib";
import { BACK_TO_SIGN_IN_NAME, INVITE_UNAVAILABLE_TITLE, PENDING_JOIN_NOT_NOW_NAME, SIGN_IN_TO_JOIN_NAME } from "../lib/pending-join-names.ts";

export function InviteUnavailable({ onBack, onUseSignIn }: { readonly onBack: () => void; readonly onUseSignIn?: () => void }): ReactElement {
  return (
    <Stack gap="block" data-testid={testId("inviteUnavailable")}>
      <Heading level={1}>{onUseSignIn === undefined ? INVITE_UNAVAILABLE_TITLE : "This link can't create an account"}</Heading>
      <Text voice="quiet">
        {onUseSignIn === undefined ? DEAD_INVITE_SENTENCE : "Sign in with an existing account to try joining, or ask the host for a new link."}
      </Text>
      {onUseSignIn === undefined ? (
        <Button onClick={onBack}>{BACK_TO_SIGN_IN_NAME}</Button>
      ) : (
        <>
          <Button onClick={onUseSignIn}>{SIGN_IN_TO_JOIN_NAME}</Button>
          <Button variant="ghost" onClick={onBack}>
            {PENDING_JOIN_NOT_NOW_NAME}
          </Button>
        </>
      )}
    </Stack>
  );
}
