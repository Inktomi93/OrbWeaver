import { useInvalidation, useTRPC } from "@orb/client/data";
import { BUILTIN_PROVIDERS } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { ConnectionAccount } from "#client/features/credentials/components/connection-account.tsx";

function Account({ connectionId }: { readonly connectionId: UserConnectionId }): ReactElement {
  const provider = BUILTIN_PROVIDERS.find((candidate) => candidate.dialect === "openrouter");
  if (provider === undefined) {
    throw new Error("The built-in providers must include an OpenRouter-dialect provider");
  }
  return <ConnectionAccount connectionId={connectionId} invalidation={useInvalidation()} provider={provider} trpc={useTRPC()} />;
}

/** The Diagnostics ACCOUNT block of an OpenRouter-dialect connection. */
export function AccountCreditsStory({ connectionId }: { readonly connectionId: UserConnectionId }): ReactElement {
  return (
    <CtClientProviders>
      <Account connectionId={connectionId} />
    </CtClientProviders>
  );
}
