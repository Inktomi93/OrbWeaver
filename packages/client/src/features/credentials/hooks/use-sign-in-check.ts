// The save-time Claude sign-in check: a newly saved subscription connection is checked once, and the answer
// is a notice because the dialog that saved it has already closed. The editor's Diagnostics block re-runs it.

import type { ProviderDef } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import type { Invalidation, Trpc } from "#data";
import { notify } from "#lib";
import type { SignInVerdict } from "../lib/connection-account-model.ts";
import { servesSignInCheck, signInVerdict } from "../lib/connection-account-model.ts";
import { useVerifySignIn } from "./use-connections-mutations.ts";

/** Returns the call a save path makes after its create succeeds; it does nothing for a row with no sign-in. */
export function useSignInCheckAfterSave(deps: {
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}): (provider: Pick<ProviderDef, "wire">, connectionId: UserConnectionId) => void {
  const verify = useVerifySignIn(deps);
  return (provider, connectionId): void => {
    if (!servesSignInCheck(provider)) {
      return;
    }
    // A failed check is already a toast through the mutation's `errorToast`; nothing is left to handle here.
    verify.mutateAsync({ connectionId }).then(
      (result): void => announce(signInVerdict(result)),
      () => undefined,
    );
  };
}

function announce(verdict: SignInVerdict): void {
  const notice = { title: verdict.title, ...(verdict.detail === null ? {} : { description: verdict.detail }) };
  if (verdict.ok) {
    notify.success(notice);
  } else {
    notify.warn(notice);
  }
}
