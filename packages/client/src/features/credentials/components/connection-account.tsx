// The Diagnostics tier's ACCOUNT block (inference program §5.3a): the OpenRouter credit balance and the
// Claude-subscription sign-in check. Each mounts only on a row whose backend serves it
// (`connection-account-model.ts`), so no other row ever requests either.

import type { ProviderDef } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { UserConnectionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Invalidation, Trpc } from "#data";
import { useVerifySignIn } from "../hooks/use-connections-mutations.ts";
import type { SignInVerdict } from "../lib/connection-account-model.ts";
import { creditsLine, servesAccountCredits, servesSignInCheck, signInVerdict } from "../lib/connection-account-model.ts";

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
  // NON-suspense: the balance dials the provider, and a failed read is a line in this block, not an error
  // boundary over the whole editor.
  const credits = useQuery({ ...trpc.connection.accountCredits.queryOptions({ connectionId }), retry: false });
  return (
    <Stack data-slot="connection-credits" gap="tight">
      <Text voice="label">Account credits</Text>
      {credits.isPending ? <Text voice="gloss">Reading the balance…</Text> : null}
      {credits.isError ? (
        <>
          <Text className="text-warning" voice="gloss">
            Couldn't read the balance — {errorMessage(credits.error)}
          </Text>
          <Row gap="field">
            <Button
              disabled={credits.isFetching}
              intent="secondary"
              onClick={(): void => {
                credits.refetch().catch(() => undefined); // the query's own error state carries the failure
              }}
              size="sm"
            >
              Read it again
            </Button>
          </Row>
        </>
      ) : null}
      {credits.data === undefined ? null : (
        <Text data-slot="connection-credits-balance" voice="datum">
          {creditsLine(credits.data)}
        </Text>
      )}
    </Stack>
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
      <Text voice="gloss">Sends a one-word request on this subscription to confirm the sign-in works. It spends a little of the plan's allowance.</Text>
      {verdict === null ? null : <SignInVerdictLines verdict={verdict} />}
      <Row gap="field">
        <Button
          disabled={verify.isPending}
          intent="secondary"
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
      <Text className={verdict.ok ? "text-success" : "text-warning"} voice="gloss">
        {verdict.title}
      </Text>
      {verdict.detail === null ? null : <Text voice="datum">{verdict.detail}</Text>}
    </Stack>
  );
}
