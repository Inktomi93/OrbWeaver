// The Diagnostics tier's ACCOUNT block (inference program §5.3a): the OpenRouter credit balance and the
// Claude-subscription sign-in check. Each mounts only on a row whose backend serves it
// (`connection-account-model.ts`), so no other row ever requests either.

import type { ProviderDef } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { UserConnectionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import type { Invalidation, Trpc } from "#data";
import { QueryErrorState, useSuspenseQuery } from "#data";
import { useVerifySignIn } from "../hooks/use-connections-mutations.ts";
import type { SignInVerdict } from "../lib/connection-account-model.ts";
import { creditsLine, servesAccountCredits, servesSignInCheck, signInVerdict } from "../lib/connection-account-model.ts";
import { ACCOUNT_CREDITS_LABEL, ACCOUNT_CREDITS_READING } from "../lib/credentials-names.ts";

export interface ConnectionAccountProps {
  readonly connectionId: UserConnectionId;
  readonly provider: ProviderDef;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

export function ConnectionAccount({ connectionId, provider, trpc, invalidation }: ConnectionAccountProps): ReactElement | null {
  if (servesAccountCredits(provider)) {
    return <AccountCreditsBlock connectionId={connectionId} trpc={trpc} />;
  }
  if (servesSignInCheck(provider)) {
    return <SignInCheckBlock connectionId={connectionId} invalidation={invalidation} trpc={trpc} />;
  }
  return null;
}

function AccountCreditsBlock({ connectionId, trpc }: { readonly connectionId: UserConnectionId; readonly trpc: Trpc }): ReactElement {
  // The balance dials the provider, so only the balance line sits under the boundary: a failed read is a block here that
  // keeps the provider's own message, not an error over the whole editor.
  return (
    <Stack data-slot="connection-credits" gap="tight">
      <Text voice="label">{ACCOUNT_CREDITS_LABEL}</Text>
      <QueryBoundary
        resetKeys={[connectionId]}
        fallback={<Text voice="gloss">{ACCOUNT_CREDITS_READING}</Text>}
        renderError={(error, retry): ReactElement => (
          <>
            <QueryErrorState label="the balance" onRetry={retry} />
            <Text tone="warning" voice="gloss">
              {errorMessage(error)}
            </Text>
          </>
        )}
      >
        <AccountCreditsBalance connectionId={connectionId} trpc={trpc} />
      </QueryBoundary>
    </Stack>
  );
}

function AccountCreditsBalance({ connectionId, trpc }: { readonly connectionId: UserConnectionId; readonly trpc: Trpc }): ReactElement {
  const { data } = useSuspenseQuery({ ...trpc.connection.accountCredits.queryOptions({ connectionId }), retry: false });
  return (
    <Text data-slot="connection-credits-balance" voice="datum">
      {creditsLine(data)}
    </Text>
  );
}

function SignInCheckBlock({
  connectionId,
  trpc,
  invalidation,
}: {
  readonly connectionId: UserConnectionId;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}): ReactElement {
  const verify = useVerifySignIn({ trpc, invalidation });
  const [verdict, setVerdict] = useState<SignInVerdict | null>(null);
  return (
    <Stack data-slot="connection-sign-in" gap="tight">
      <Text voice="label">Claude sign-in</Text>
      <Text voice="gloss">
        Sends a one-word request on this subscription to confirm the sign-in works. It counts a little against your plan's usage limits, like any request here.
      </Text>
      {verdict === null ? null : <SignInVerdictLines verdict={verdict} />}
      <Row gap="field">
        <Button
          disabled={verify.isPending}
          variant="outline"
          onClick={(): void => verify.mutate({ connectionId }, { onSuccess: (result): void => setVerdict(signInVerdict(result)) })}
          size="sm"
        >
          Check sign-in
        </Button>
      </Row>
    </Stack>
  );
}

function SignInVerdictLines({ verdict }: { readonly verdict: SignInVerdict }): ReactElement {
  return (
    <Stack data-slot="connection-sign-in-verdict" data-ok={verdict.ok} gap="tight">
      <Text tone={verdict.ok ? "success" : "warning"} voice="gloss">
        {verdict.title}
      </Text>
      {verdict.detail === null ? null : <Text voice="datum">{verdict.detail}</Text>}
    </Stack>
  );
}
